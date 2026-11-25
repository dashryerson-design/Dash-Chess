import crypto from 'node:crypto';
import {
  TIME_PRESETS,
  validTimeControl,
  type FriendEntry,
  type MatchSettings,
  type PartyState,
} from '@dc/shared';
import type { DB } from './db';
import { equippedOf, getPresence, getUser, getUserByName, notify, overallFor } from './users';

// ------------------------------------------------------------------------------------ friends

export function friendIds(db: DB, userId: string): string[] {
  return (
    db
      .prepare(
        `SELECT friend_id AS id FROM friends WHERE user_id = ? AND status = 'accepted'
         UNION SELECT user_id AS id FROM friends WHERE friend_id = ? AND status = 'accepted'`,
      )
      .all(userId, userId) as { id: string }[]
  ).map((r) => r.id);
}

export function areFriends(db: DB, a: string, b: string): boolean {
  return !!db
    .prepare(`SELECT 1 FROM friends WHERE status = 'accepted' AND ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))`)
    .get(a, b, b, a);
}

export type StatusFn = (userId: string) => FriendEntry['status'];

export function friendEntry(db: DB, id: string, status: StatusFn): FriendEntry | null {
  const u = getUser(db, id);
  if (!u) return null;
  const eq = equippedOf(u);
  const privacy = JSON.parse(u.privacy || '{}');
  const st = privacy.showOnline === false ? 'offline' : status(id);
  return {
    id,
    username: u.username,
    icon: eq.icon,
    card: eq.card,
    level: u.level,
    rating: overallFor(db, id).rating,
    status: st,
    gameId: st === 'playing' ? getPresence().playing(id) : null,
  };
}

export function listFriends(db: DB, userId: string, status: StatusFn) {
  const friends = friendIds(db, userId)
    .map((id) => friendEntry(db, id, status))
    .filter(Boolean) as FriendEntry[];
  const incoming = (db.prepare(`SELECT user_id FROM friends WHERE friend_id = ? AND status = 'pending'`).all(userId) as { user_id: string }[])
    .map((r) => friendEntry(db, r.user_id, () => 'offline'))
    .filter(Boolean) as FriendEntry[];
  const outgoing = (db.prepare(`SELECT friend_id FROM friends WHERE user_id = ? AND status = 'pending'`).all(userId) as { friend_id: string }[])
    .map((r) => friendEntry(db, r.friend_id, () => 'offline'))
    .filter(Boolean) as FriendEntry[];
  const order = { playing: 0, searching: 1, online: 2, offline: 3 };
  friends.sort((a, b) => order[a.status] - order[b.status] || a.username.localeCompare(b.username));
  return { friends, incoming, outgoing };
}

export function sendFriendRequest(db: DB, from: string, username: string): { ok: true; accepted: boolean } | { ok: false; error: string } {
  const target = getUserByName(db, username);
  if (!target) return { ok: false, error: 'No player with that username.' };
  if (target.id === from) return { ok: false, error: 'You cannot add yourself.' };
  if (areFriends(db, from, target.id)) return { ok: false, error: 'You are already friends.' };
  const reverse = db.prepare(`SELECT status FROM friends WHERE user_id = ? AND friend_id = ?`).get(target.id, from) as { status: string } | undefined;
  if (reverse?.status === 'pending') {
    acceptFriend(db, from, target.id);
    return { ok: true, accepted: true };
  }
  const outCount = (db.prepare(`SELECT COUNT(*) n FROM friends WHERE user_id = ? AND status = 'pending'`).get(from) as { n: number }).n;
  if (outCount >= 50) return { ok: false, error: 'Too many pending requests.' };
  const r = db.prepare(`INSERT OR IGNORE INTO friends (user_id, friend_id, status, created_at) VALUES (?, ?, 'pending', ?)`).run(from, target.id, Date.now());
  if (r.changes === 0) return { ok: false, error: 'Request already sent.' };
  const me = getUser(db, from)!;
  notify(db, target.id, 'friend_request', { fromId: from, from: me.username });
  return { ok: true, accepted: false };
}

export function acceptFriend(db: DB, userId: string, requesterId: string): boolean {
  const r = db.prepare(`UPDATE friends SET status = 'accepted' WHERE user_id = ? AND friend_id = ? AND status = 'pending'`).run(requesterId, userId);
  if (r.changes === 0) return false;
  db.prepare(`DELETE FROM friends WHERE user_id = ? AND friend_id = ?`).run(userId, requesterId);
  const me = getUser(db, userId)!;
  notify(db, requesterId, 'friend_accepted', { fromId: userId, from: me.username });
  return true;
}

export function declineFriend(db: DB, userId: string, requesterId: string): boolean {
  return db.prepare(`DELETE FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'pending'`).run(requesterId, userId).changes > 0;
}

export function removeFriend(db: DB, userId: string, otherId: string): boolean {
  return db.prepare(`DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`).run(userId, otherId, otherId, userId).changes > 0;
}

// ------------------------------------------------------------------------------------ settings validation

export const DEFAULT_SETTINGS: MatchSettings = {
  tc: { initial: 300, increment: 0 },
  rated: false,
  takebacks: false,
  assistance: false,
  spectators: true,
  color: 'random',
};

/** Validates and normalises client-provided match settings. Rated requires an approved preset and no assistance. */
export function sanitizeSettings(input: unknown, opts: { allowUntimed: boolean; allowRated: boolean }): MatchSettings | string {
  const s = (input ?? {}) as Partial<MatchSettings>;
  const tc = { initial: Number(s.tc?.initial ?? 300), increment: Number(s.tc?.increment ?? 0) };
  if (!validTimeControl(tc, opts.allowUntimed)) return 'Invalid time control.';
  const color = s.color === 'white' || s.color === 'black' ? s.color : 'random';
  let rated = opts.allowRated && s.rated === true;
  const isPreset = TIME_PRESETS.some((p) => p.initial === tc.initial && p.increment === tc.increment);
  if (rated && !isPreset) return 'Rated games must use a standard time control.';
  const out: MatchSettings = {
    tc,
    rated,
    takebacks: !rated && s.takebacks === true,
    assistance: !rated && s.assistance === true,
    spectators: s.spectators !== false,
    color: rated ? 'random' : color,
  };
  return out;
}

// ------------------------------------------------------------------------------------ parties

interface Party {
  id: string;
  code: string;
  leaderId: string;
  members: string[];
  ready: Set<string>;
  settings: MatchSettings;
  players: [string, string] | null;
  gameId: string | null;
  invites: Set<string>;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function code(len = 6) {
  const b = crypto.randomBytes(len);
  return [...b].map((x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
}

export class PartyService {
  parties = new Map<string, Party>();
  byUser = new Map<string, string>();
  byCode = new Map<string, string>();
  static MAX = 6;
  onChange: (party: PartyState | null, memberIds: string[]) => void = () => {};

  constructor(private db: DB) {}

  partyOf(userId: string): Party | null {
    const id = this.byUser.get(userId);
    return id ? this.parties.get(id) ?? null : null;
  }

  state(p: Party): PartyState {
    return {
      id: p.id,
      code: p.code,
      leaderId: p.leaderId,
      members: p.members.map((id) => {
        const u = getUser(this.db, id)!;
        return {
          id,
          username: u.username,
          icon: equippedOf(u).icon,
          level: u.level,
          rating: overallFor(this.db, id).rating,
          ready: p.ready.has(id),
          leader: id === p.leaderId,
        };
      }),
      settings: p.settings,
      players: p.players,
      gameId: p.gameId,
    };
  }

  private changed(p: Party | null, extra: string[] = []) {
    this.onChange(p ? this.state(p) : null, [...(p?.members ?? []), ...extra]);
  }

  create(userId: string): Party {
    this.leave(userId);
    let c = code();
    while (this.byCode.has(c)) c = code();
    const p: Party = {
      id: 'p_' + code(10),
      code: c,
      leaderId: userId,
      members: [userId],
      ready: new Set(),
      settings: { ...DEFAULT_SETTINGS },
      players: null,
      gameId: null,
      invites: new Set(),
    };
    this.parties.set(p.id, p);
    this.byUser.set(userId, p.id);
    this.byCode.set(c, p.id);
    this.changed(p);
    return p;
  }

  join(userId: string, codeOrId: string): Party | string {
    const id = this.byCode.get(codeOrId.toUpperCase()) ?? (this.parties.has(codeOrId) ? codeOrId : null);
    const p = id ? this.parties.get(id) : null;
    if (!p) return 'Party not found. Check the code.';
    if (p.members.includes(userId)) return p;
    if (p.members.length >= PartyService.MAX) return 'That party is full.';
    this.leave(userId);
    p.members.push(userId);
    p.invites.delete(userId);
    this.byUser.set(userId, p.id);
    this.autoPlayers(p);
    this.changed(p);
    return p;
  }

  leave(userId: string) {
    const p = this.partyOf(userId);
    if (!p) return;
    p.members = p.members.filter((m) => m !== userId);
    p.ready.delete(userId);
    this.byUser.delete(userId);
    if (p.members.length === 0) {
      this.parties.delete(p.id);
      this.byCode.delete(p.code);
      this.changed(null, [userId]);
      return;
    }
    if (p.leaderId === userId) p.leaderId = p.members[0];
    if (p.players?.includes(userId)) p.players = null;
    this.autoPlayers(p);
    this.changed(p, [userId]);
  }

  kick(leaderId: string, target: string): string | null {
    const p = this.partyOf(leaderId);
    if (!p || p.leaderId !== leaderId) return 'Only the party leader can do that.';
    if (!p.members.includes(target) || target === leaderId) return 'Invalid member.';
    this.leave(target);
    return null;
  }

  invite(fromId: string, toId: string): string | null {
    const p = this.partyOf(fromId) ?? this.create(fromId);
    if (p.members.includes(toId)) return 'Already in your party.';
    p.invites.add(toId);
    const u = getUser(this.db, fromId)!;
    notify(this.db, toId, 'party_invite', { partyId: p.id, code: p.code, from: u.username, fromId });
    this.changed(p);
    return null;
  }

  setReady(userId: string, ready: boolean) {
    const p = this.partyOf(userId);
    if (!p) return 'You are not in a party.';
    if (ready) p.ready.add(userId);
    else p.ready.delete(userId);
    this.changed(p);
    return null;
  }

  setSettings(userId: string, input: unknown): string | null {
    const p = this.partyOf(userId);
    if (!p || p.leaderId !== userId) return 'Only the party leader can change settings.';
    const s = sanitizeSettings(input, { allowUntimed: false, allowRated: false });
    if (typeof s === 'string') return s;
    p.settings = s;
    p.ready.clear();
    this.changed(p);
    return null;
  }

  setPlayers(userId: string, players: [string, string]): string | null {
    const p = this.partyOf(userId);
    if (!p || p.leaderId !== userId) return 'Only the party leader can choose players.';
    if (!Array.isArray(players) || players.length !== 2 || players[0] === players[1] || !players.every((x) => p.members.includes(x)))
      return 'Choose two different party members.';
    p.players = [players[0], players[1]];
    this.changed(p);
    return null;
  }

  private autoPlayers(p: Party) {
    if (p.players && p.players.every((x) => p.members.includes(x))) return;
    p.players = p.members.length >= 2 ? [p.members[0], p.members[1]] : null;
  }

  /** Validates that the party can start; returns the two players or an error. */
  canStart(userId: string): { party: Party; players: [string, string] } | string {
    const p = this.partyOf(userId);
    if (!p || p.leaderId !== userId) return 'Only the party leader can start the match.';
    if (!p.players) return 'You need at least two members to start a match.';
    const notReady = p.players.filter((id) => id !== p.leaderId && !p.ready.has(id));
    if (notReady.length) {
      const names = notReady.map((id) => getUser(this.db, id)!.username).join(', ');
      return `Waiting for ${names} to ready up.`;
    }
    return { party: p, players: p.players };
  }

  setGame(p: Party, gameId: string | null) {
    p.gameId = gameId;
    p.ready.clear();
    this.changed(p);
  }
}

// ------------------------------------------------------------------------------------ private challenges / rooms

export interface Challenge {
  id: string;
  code: string;
  from: string;
  to: string | null; // null => open room joinable by code
  settings: MatchSettings;
  createdAt: number;
}

export class ChallengeService {
  byId = new Map<string, Challenge>();
  byCode = new Map<string, string>();

  constructor() {
    setInterval(() => this.expire(), 30_000).unref();
  }

  create(from: string, to: string | null, settings: MatchSettings): Challenge {
    // one outstanding challenge per (from,to)
    for (const c of this.byId.values()) if (c.from === from && c.to === to) this.remove(c.id);
    let c = code();
    while (this.byCode.has(c)) c = code();
    const ch: Challenge = { id: 'c_' + code(10), code: c, from, to, settings, createdAt: Date.now() };
    this.byId.set(ch.id, ch);
    this.byCode.set(c, ch.id);
    return ch;
  }

  find(idOrCode: string): Challenge | null {
    const id = this.byId.has(idOrCode) ? idOrCode : this.byCode.get(idOrCode.toUpperCase());
    return id ? this.byId.get(id) ?? null : null;
  }

  remove(id: string) {
    const c = this.byId.get(id);
    if (!c) return;
    this.byId.delete(id);
    this.byCode.delete(c.code);
  }

  mine(userId: string): Challenge[] {
    return [...this.byId.values()].filter((c) => c.from === userId || c.to === userId);
  }

  private expire() {
    const cutoff = Date.now() - 15 * 60_000;
    for (const c of this.byId.values()) if (c.createdAt < cutoff) this.remove(c.id);
  }
}
