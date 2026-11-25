/**
 * Serverless online play.
 *
 * Every browser runs its own copy of the DC Chess server (see ./server.ts). Players meet in a global
 * lobby (WebRTC via trystero; signalling over free public Nostr relays, no server of ours). When two
 * players are paired, one browser HOSTS the game: its in-page server runs the authoritative GameRoom
 * and the other player connects to it over the WebRTC data channel using the normal socket protocol.
 * When the game ends, the guest records it in its own database and computes its own rewards.
 */
import { joinRoom, getRelaySockets, defaultRelayUrls } from 'trystero';
import { Chess } from 'chess.js';
import { presetById, type GameState, type MatchSettings, type TimeCategory, TIME_CATEGORIES, categoryOf, PLACEMENT_GAMES } from '@dc/shared';
import { ClientSocket, type Server, type ServerSocket } from './io';
import { localDb, localRt, localApi } from './server';
import { createSession } from './auth';
import { getUser, equippedOf, getRatings, overallFor, notify, setPresence, getPresence } from '../../../server/src/users';
import { sanitizeSettings } from '../../../server/src/social';
import { persistGame } from '../../../server/src/game/finish';
import type { GameRoom } from '../../../server/src/game/room';

const APP_ID = 'dash-chess-p2p-v1';
const PREFERRED_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.snort.social',
  'wss://relay.nostr.net',
  'wss://nostr.mom',
];
const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: ['turn:freestun.net:3478'], username: 'free', credential: 'free' },
];

/** Live connection diagnostics for the UI. */
export function lobbyStatus() {
  let open = 0;
  let total = 0;
  try {
    for (const ws of Object.values(getRelaySockets() as Record<string, WebSocket>)) {
      total++;
      if (ws.readyState === 1) open++;
    }
  } catch {
    /* not started */
  }
  return { started: !!room, relaysOpen: open, relaysTotal: total, players: room ? lobbyPlayers().length : 0, peers: room ? Object.keys(room.getPeers()).length : 0 };
}

// ------------------------------------------------------------------------------------------------ types

export interface Presence {
  pid: string;
  name: string;
  icon: string;
  card: string;
  level: number;
  xp: number;
  rating: number;
  ratings: Record<TimeCategory, { rating: number; games: number }>;
  status: 'online' | 'playing' | 'searching';
  seek: { mode: 'ranked' | 'casual' | 'quick'; tc: string; rating: number; since: number } | null;
  room: { code: string; settings: MatchSettings } | null;
  party: string | null;
  games: { id: string; mode: string; white: unknown; black: unknown; fen: string; moves: number; tc: unknown; spectators: number }[];
  t: number;
}

type Wire =
  | { t: 'open'; sid: string; profile: Presence }
  | { t: 'opened'; sid: string; ok: boolean; error?: string }
  | { t: 'rpc'; sid: string; ev: string; payload: unknown; ack?: number }
  | { t: 'ack'; sid: string; ack: number; r: unknown }
  | { t: 'ev'; sid: string; ev: string; payload: unknown }
  | { t: 'close'; sid: string }
  | { t: 'match-offer'; mode: string; tc: string; profile: Presence }
  | { t: 'match-decline' }
  | { t: 'room-join'; code: string; profile: Presence }
  | { t: 'room-joined'; ok: boolean; gameId?: string; error?: string }
  | { t: 'challenge'; id: string; settings: MatchSettings; profile: Presence }
  | { t: 'challenge-accept'; id: string; profile: Presence }
  | { t: 'challenge-removed'; id: string; declined?: boolean }
  | { t: 'friend-req'; profile: Presence }
  | { t: 'friend-acc'; profile: Presence }
  | { t: 'party-invite'; code: string; from: string }
  | { t: 'api'; id: number; method: string; url: string }
  | { t: 'api-r'; id: number; status: number; json: unknown };

// ------------------------------------------------------------------------------------------------ state

let room: ReturnType<typeof joinRoom> | null = null;
let profileState: { set: (v: Presence) => Promise<void>; getAll: () => Readonly<Record<string, Presence>> } | null = null;
let sendWire: ((w: Wire, peerId: string) => void) | null = null;
const me = () => localRt && getUserSafe(currentUserId());
let currentUid: string | null = null;
const currentUserId = () => currentUid ?? '';
const getUserSafe = (id: string) => (id ? getUser(localDb, id) : undefined);
let facade: RouterSocket | null = null;
let mySeek: Presence['seek'] = null;
let myRoom: Presence['room'] = null;
const outgoingChallenges = new Map<string, { to: string; settings: MatchSettings }>();
const incomingChallenges = new Map<string, { from: string; settings: MatchSettings }>();
const apiWaiters = new Map<number, (r: { status: number; json: any }) => void>();
let apiSeq = 0;

/** gameId -> pid of the player whose browser hosts it */
const remoteGames = new Map<string, string>(JSON.parse(sessionStorage.getItem('dc.remoteGames') ?? '[]'));
const saveRemote = () => sessionStorage.setItem('dc.remoteGames', JSON.stringify([...remoteGames]));

// ------------------------------------------------------------------------------------------------ lobby helpers

export function lobbyPlayers(): Presence[] {
  if (!profileState) return [];
  const all = profileState.getAll();
  // no timestamp filtering: players' computer clocks can disagree; presence disappears when the peer leaves
  const live = new Set(Object.keys(room?.getUsers() ?? {}));
  return Object.entries(all).filter(([uid, p]) => p && p.pid && p.pid !== currentUid && live.has(uid)).map(([, p]) => p);
}

function peerOf(pid: string): string | null {
  if (!room || !profileState) return null;
  const all = profileState.getAll();
  const users = room.getUsers();
  for (const [userId, prof] of Object.entries(all)) if (prof?.pid === pid && users[userId]?.peerIds?.length) return users[userId].peerIds[0];
  return null;
}
function pidOfPeer(peerId: string): string | null {
  if (!room || !profileState) return null;
  const userId = room.getPeers()[peerId]?.userId;
  return (userId && profileState.getAll()[userId]?.pid) || null;
}

function myPresence(): Presence | null {
  const u = me();
  if (!u) return null;
  const r = getRatings(localDb, u.id);
  const eq = equippedOf(u);
  const active = localRt.games.activeGameOf(u.id);
  const games = [...localRt.games.rooms.values()]
    .filter((g) => g.status === 'active' && g.settings.spectators && g.humanSides().length === 2)
    .map((g) => ({ id: g.id, mode: g.mode, white: g.seatInfo('w'), black: g.seatInfo('b'), fen: g.chess.fen(), moves: g.moves.length, tc: g.settings.tc, spectators: g.spectators.size }));
  return {
    pid: u.id,
    name: u.username,
    icon: eq.icon,
    card: eq.card,
    level: u.level,
    xp: u.xp,
    rating: overallFor(localDb, u.id).rating,
    ratings: Object.fromEntries(TIME_CATEGORIES.map((c) => [c, { rating: r[c].rating, games: r[c].games }])) as Presence['ratings'],
    status: active || remoteActive() ? 'playing' : mySeek ? 'searching' : 'online',
    seek: mySeek,
    room: myRoom,
    party: localRt.parties.partyOf(u.id)?.code ?? null,
    games,
    t: Date.now(),
  };
}
function remoteActive() {
  for (const [gid] of remoteGames) if (!finishedRemote.has(gid)) return true;
  return false;
}
let publishTimer: number | null = null;
export function publish() {
  if (publishTimer) return;
  publishTimer = window.setTimeout(() => {
    publishTimer = null;
    const p = myPresence();
    if (p && profileState) void profileState.set(p);
  }, 150);
}

/** Creates or refreshes a local "shadow" account representing a remote player. */
function ensureShadow(p: Presence): string {
  const db = localDb;
  const existing = getUser(db, p.pid);
  const nameTaken = (n: string) => {
    const u = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(n) as { id: string } | undefined;
    return u && u.id !== p.pid;
  };
  let name = p.name;
  if (nameTaken(name)) name = `${p.name.slice(0, 11)}_${p.pid.slice(-4)}`.replace(/[^A-Za-z0-9_]/g, '_');
  const eq = JSON.stringify({ icon: p.icon, card: p.card });
  if (!existing) {
    db.transaction(() => {
      db.prepare('INSERT INTO users (id, username, password_hash, created_at, xp, level, equipped, settings) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(p.pid, name, 'remote', Date.now(), p.xp, p.level, eq, '{"remote":true}');
      for (const c of TIME_CATEGORIES) db.prepare('INSERT INTO ratings (user_id, category, rating, peak) VALUES (?, ?, ?, ?)').run(p.pid, c, p.ratings[c].rating, p.ratings[c].rating);
      db.prepare('INSERT INTO user_stats (user_id) VALUES (?)').run(p.pid);
    })();
  } else {
    db.prepare('UPDATE users SET username = ?, xp = ?, level = ?, equipped = ? WHERE id = ?').run(name, p.xp, p.level, eq, p.pid);
    for (const c of TIME_CATEGORIES) db.prepare('UPDATE ratings SET rating = ?, games = MAX(games, ?) WHERE user_id = ? AND category = ?').run(p.ratings[c].rating, Math.min(p.ratings[c].games, PLACEMENT_GAMES), p.pid, c);
  }
  return p.pid;
}
const isShadow = (id: string) => getUser(localDb, id)?.password_hash === 'remote';

// ------------------------------------------------------------------------------------------------ hosting (server side of remote sessions)

const hosted = new Map<string, { peerId: string; sock: ServerSocket }>(); // sid -> session

function hostOpen(w: Extract<Wire, { t: 'open' }>, peerId: string) {
  const uid = ensureShadow(w.profile);
  const token = createSession(localDb, uid, 'p2p');
  const io = localRt.io as unknown as Server;
  const s = io.connect({ headers: { cookie: `dc_session=${encodeURIComponent(token)}` }, address: `p2p:${w.profile.pid}`, auth: {} }, (ev, payload) => sendWire?.({ t: 'ev', sid: w.sid, ev, payload }, peerId));
  if (s instanceof Error) return sendWire?.({ t: 'opened', sid: w.sid, ok: false, error: s.message }, peerId);
  hosted.set(w.sid, { peerId, sock: s });
  sendWire?.({ t: 'opened', sid: w.sid, ok: true }, peerId);
}
function hostRpc(w: Extract<Wire, { t: 'rpc' }>, peerId: string) {
  const h = hosted.get(w.sid);
  if (!h) return w.ack !== undefined && sendWire?.({ t: 'ack', sid: w.sid, ack: w.ack, r: { ok: false, error: 'Session closed.' } }, peerId);
  h.sock.receive(w.ev, w.payload, w.ack !== undefined ? (r) => sendWire?.({ t: 'ack', sid: w.sid, ack: w.ack!, r }, peerId) : undefined);
}

// ------------------------------------------------------------------------------------------------ guest sessions (client side)

interface Session {
  sid: string;
  hostPid: string;
  sock: ClientSocket;
  opened: Promise<boolean>;
  acks: Map<number, (r: unknown) => void>;
}
const sessions = new Map<string, Session>(); // hostPid -> session
const sessionsBySid = new Map<string, Session>();
const openWaiters = new Map<string, (ok: boolean) => void>();
let ackSeq = 0;

function sessionTo(hostPid: string): Session | null {
  const existing = sessions.get(hostPid);
  if (existing && existing.sock.connected) return existing;
  const peerId = peerOf(hostPid);
  const prof = myPresence();
  if (!peerId || !prof) return null;
  const sid = `${currentUid}-${Math.random().toString(36).slice(2, 9)}`;
  let resolveOpen!: (ok: boolean) => void;
  const opened = new Promise<boolean>((r) => (resolveOpen = r));
  openWaiters.set(sid, resolveOpen);
  const acks = new Map<number, (r: unknown) => void>();
  let deliverRef: ((ev: string, p: unknown) => void) | null = null;
  const sock = new ClientSocket((deliver) => {
    deliverRef = deliver;
    return {
      send: (ev, payload, ack) => {
        void opened.then((ok) => {
          if (!ok) return ack?.({ ok: false, error: 'Could not reach that player.' });
          const target = peerOf(hostPid);
          if (!target) return ack?.({ ok: false, error: 'That player is offline.' });
          let id: number | undefined;
          if (ack) {
            id = ++ackSeq;
            acks.set(id, ack);
          }
          sendWire?.({ t: 'rpc', sid, ev, payload, ack: id }, target);
        });
      },
      close: () => {
        const target = peerOf(hostPid);
        if (target) sendWire?.({ t: 'close', sid }, target);
      },
    };
  });
  const sess: Session = { sid, hostPid, sock, opened, acks };
  (sess as any).deliver = (ev: string, p: unknown) => deliverRef?.(ev, p);
  sessions.set(hostPid, sess);
  sessionsBySid.set(sid, sess);
  sendWire?.({ t: 'open', sid, profile: prof }, peerId);
  setTimeout(() => openWaiters.get(sid)?.(false), 15000);
  sock.on('game:state', (st: GameState) => onRemoteState(hostPid, st));
  for (const ev of ['game:state', 'game:rating', 'game:analysis', 'game:bot', 'party:state', 'party:game', 'match:found']) {
    sock.on(ev, (payload: any) => {
      if (ev === 'match:found' || ev === 'party:game') {
        remoteGames.set(payload.gameId, hostPid);
        saveRemote();
        publish();
      }
      if (ev === 'party:state') partyHost = payload ? hostPid : null;
      facade?.fire(ev, payload);
    });
  }
  return sess;
}

// ------------------------------------------------------------------------------------------------ finishing remote games on the guest

const finishedRemote = new Set<string>();
function onRemoteState(hostPid: string, st: GameState) {
  if (st.status !== 'ended' || finishedRemote.has(st.id) || !st.yourColor || !st.result) return;
  finishedRemote.add(st.id);
  publish();
  const host = lobbyPlayers().find((p) => p.pid === hostPid);
  if (host) ensureShadow(host);
  if (localDb.prepare('SELECT 1 FROM games WHERE id = ?').get(st.id)) return;
  // Re-create the finished game locally so it is stored in this player's history and rewarded here.
  const chess = new Chess();
  for (const m of st.moves) chess.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci[4] });
  const seat = (side: 'w' | 'b') => {
    const s = side === 'w' ? st.white : st.black;
    const uid = side === st.yourColor ? currentUid! : hostPid;
    const r = getRatings(localDb, uid)[categoryOf(st.settings.tc)];
    return { kind: 'human' as const, userId: uid, username: s.name, icon: s.icon, card: s.card, level: s.level ?? 1, rating: r?.rating ?? 1000, ratingGames: r?.games ?? 0, provisional: (r?.games ?? 0) < PLACEMENT_GAMES, ip: side === st.yourColor ? 'self' : `p2p:${hostPid}` };
  };
  const seats = { w: seat('w'), b: seat('b') };
  const fake = {
    id: st.id,
    mode: st.mode,
    settings: st.settings,
    category: st.category,
    seats,
    moves: st.moves,
    startFen: new Chess().fen(),
    result: { winner: st.result.winner, reason: st.result.reason },
    startedAt: st.startedAt,
    endedAt: Date.now(),
    clock: st.clock,
    hintsUsed: { w: 0, b: 0 },
    takebacksUsed: 0,
    seatInfo: (side: 'w' | 'b') => ({ ...(side === 'w' ? st.white : st.black), rating: seats[side].rating }),
  } as unknown as GameRoom;
  try {
    if (persistGame(localDb, fake)) {
      const p = localRt.games.runPipeline(st.id).catch((e) => console.error(e));
      localRt.games.pipelines.set(st.id, p);
    }
  } catch (e) {
    console.error('[p2p] could not record remote game', e);
  }
}

// ------------------------------------------------------------------------------------------------ matchmaking

function compatible(a: NonNullable<Presence['seek']>, b: NonNullable<Presence['seek']>) {
  const ranked = a.mode === 'ranked' || b.mode === 'ranked';
  if (ranked && (a.mode !== 'ranked' || b.mode !== 'ranked')) return false;
  if (a.mode !== 'quick' && b.mode !== 'quick' && a.tc !== b.tc) return false;
  const waited = (Date.now() - Math.max(a.since, b.since)) / 1000;
  const range = ranked ? Math.min(450, 80 + waited * 12) : waited > 20 ? Infinity : 250 + waited * 30;
  return Math.abs(a.rating - b.rating) <= range;
}
let pendingOffer: string | null = null;
function matchTick() {
  if (!mySeek || pendingOffer) return;
  const candidates = lobbyPlayers().filter((p) => p.seek && p.status === 'searching' && compatible(mySeek!, p.seek));
  candidates.sort((x, y) => Math.abs(x.seek!.rating - mySeek!.rating) - Math.abs(y.seek!.rating - mySeek!.rating));
  const best = candidates[0];
  if (!best) return emitQueue();
  // the player with the smaller id hosts and makes the offer
  if (currentUid! < best.pid) {
    const peer = peerOf(best.pid);
    const prof = myPresence();
    if (!peer || !prof) return;
    pendingOffer = best.pid;
    sendWire?.({ t: 'match-offer', mode: mySeek.mode, tc: mySeek.mode !== 'quick' ? mySeek.tc : best.seek!.mode !== 'quick' ? best.seek!.tc : '5+0', profile: prof }, peer);
    setTimeout(() => (pendingOffer = null), 6000);
  }
}
function emitQueue() {
  if (!facade) return;
  const p = mySeek ? presetById(mySeek.tc) : null;
  facade.fire(
    'queue:status',
    mySeek
      ? { searching: true, mode: mySeek.mode === 'ranked' ? 'ranked' : 'casual', tc: { initial: p!.initial, increment: p!.increment }, since: mySeek.since, range: null, playersInQueue: 1 + lobbyPlayers().filter((x) => x.seek).length }
      : { searching: false },
  );
}

function hostGame(mode: 'ranked' | 'casual' | 'private', settings: MatchSettings, guest: Presence, hostIsA = true): string | string {
  const guestId = ensureShadow(guest);
  try {
    const roomObj = localRt.games.createHumanGame(mode, settings, { userId: currentUid!, ip: 'self' }, { userId: guestId, ip: `p2p:${guest.pid}` });
    void hostIsA;
    publish();
    return roomObj.id;
  } catch (e) {
    throw e;
  }
}

// ------------------------------------------------------------------------------------------------ wire handling

function onWire(w: Wire, peerId: string) {
  switch (w.t) {
    case 'open':
      return hostOpen(w, peerId);
    case 'opened':
      openWaiters.get(w.sid)?.(w.ok);
      openWaiters.delete(w.sid);
      return;
    case 'rpc':
      return hostRpc(w, peerId);
    case 'ack': {
      const s = sessionsBySid.get(w.sid);
      const cb = s?.acks.get(w.ack);
      s?.acks.delete(w.ack);
      cb?.(w.r);
      return;
    }
    case 'ev': {
      const s = sessionsBySid.get(w.sid);
      (s as any)?.deliver?.(w.ev, w.payload);
      return;
    }
    case 'close': {
      const h = hosted.get(w.sid);
      h?.sock.disconnect();
      hosted.delete(w.sid);
      return;
    }
    case 'match-offer': {
      if (!mySeek || localRt.games.activeGameOf(currentUid!)) return sendWire?.({ t: 'match-decline' }, peerId);
      // accept by opening a session; the host creates the game once our session is open
      mySeek = null;
      publish();
      emitQueue();
      const s = sessionTo(w.profile.pid);
      if (!s) return;
      void s.opened.then((ok) => ok && s.sock.emit('p2p:start-match', { mode: w.mode, tc: w.tc }));
      return;
    }
    case 'match-decline':
      pendingOffer = null;
      return;
    case 'room-join': {
      if (!myRoom || myRoom.code !== w.code) return sendWire?.({ t: 'room-joined', ok: false, error: 'Room not found.' }, peerId);
      try {
        const settings = myRoom.settings;
        myRoom = null;
        const gameId = hostGame(settings.rated ? 'ranked' : 'private', settings, w.profile);
        sendWire?.({ t: 'room-joined', ok: true, gameId }, peerId);
      } catch (e) {
        sendWire?.({ t: 'room-joined', ok: false, error: (e as Error).message }, peerId);
      }
      return;
    }
    case 'room-joined':
      roomJoinWaiter?.(w);
      return;
    case 'challenge': {
      ensureShadow(w.profile);
      incomingChallenges.set(w.id, { from: w.profile.pid, settings: w.settings });
      facade?.fire('challenge:incoming', { challenge: { id: w.id, code: w.id, from: w.profile.pid, to: currentUid, settings: w.settings, createdAt: Date.now() }, from: profileOf(w.profile) });
      return;
    }
    case 'challenge-accept': {
      const ch = outgoingChallenges.get(w.id);
      if (!ch || ch.to !== w.profile.pid) return;
      outgoingChallenges.delete(w.id);
      try {
        hostGame(ch.settings.rated ? 'ranked' : 'private', ch.settings, w.profile);
      } catch (e) {
        console.error(e);
      }
      return;
    }
    case 'challenge-removed':
      incomingChallenges.delete(w.id);
      outgoingChallenges.delete(w.id);
      facade?.fire('challenge:removed', { id: w.id, declined: w.declined });
      return;
    case 'friend-req': {
      const uid = ensureShadow(w.profile);
      const already = localDb.prepare("SELECT status FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)").get(uid, currentUid, currentUid, uid) as { status: string } | undefined;
      if (already?.status === 'accepted') return sendWire?.({ t: 'friend-acc', profile: myPresence()! }, peerId);
      const outgoing = localDb.prepare("SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'pending'").get(currentUid, uid);
      if (outgoing) {
        // both sent requests: accept
        localDb.prepare("UPDATE friends SET status = 'accepted' WHERE user_id = ? AND friend_id = ?").run(currentUid, uid);
        sendWire?.({ t: 'friend-acc', profile: myPresence()! }, peerId);
        notify(localDb, currentUid!, 'friend_accepted', { fromId: uid, from: w.profile.name });
        return;
      }
      localDb.prepare("INSERT OR IGNORE INTO friends (user_id, friend_id, status, created_at) VALUES (?, ?, 'pending', ?)").run(uid, currentUid, Date.now());
      notify(localDb, currentUid!, 'friend_request', { fromId: uid, from: w.profile.name });
      return;
    }
    case 'friend-acc': {
      const uid = ensureShadow(w.profile);
      localDb.prepare("DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)").run(uid, currentUid, currentUid, uid);
      localDb.prepare("INSERT INTO friends (user_id, friend_id, status, created_at) VALUES (?, ?, 'accepted', ?)").run(currentUid, uid, Date.now());
      notify(localDb, currentUid!, 'friend_accepted', { fromId: uid, from: w.profile.name });
      facade?.fire('friends:changed', {});
      return;
    }
    case 'party-invite':
      notify(localDb, currentUid!, 'party_invite', { code: w.code, from: w.from });
      return;
    case 'api': {
      // another player asks for a public profile / history page of ours
      const ok = /^\/api\/users\/[^/]+(\/games|\/rating-history)?(\?.*)?$/.test(w.url) || /^\/api\/games\/[^/?]+$/.test(w.url);
      if (!ok || w.method !== 'GET') return sendWire?.({ t: 'api-r', id: w.id, status: 403, json: { error: 'Not allowed' } }, peerId);
      void localApi('GET', w.url).then((r) => sendWire?.({ t: 'api-r', id: w.id, status: r.status, json: r.json }, peerId));
      return;
    }
    case 'api-r':
      apiWaiters.get(w.id)?.({ status: w.status, json: w.json });
      apiWaiters.delete(w.id);
      return;
  }
}

let roomJoinWaiter: ((w: Extract<Wire, { t: 'room-joined' }>) => void) | null = null;
let partyHost: string | null = null;

function profileOf(p: Presence) {
  return { id: p.pid, username: p.name, level: p.level, xp: p.xp, icon: p.icon, card: p.card, createdAt: 0, rating: p.rating, peakRating: p.rating, online: true, playing: p.status === 'playing' };
}

export function askPeerApi(pid: string, url: string): Promise<{ status: number; json: any } | null> {
  const peer = peerOf(pid);
  if (!peer) return Promise.resolve(null);
  const id = ++apiSeq;
  return new Promise((res) => {
    apiWaiters.set(id, res);
    sendWire?.({ t: 'api', id, method: 'GET', url }, peer);
    setTimeout(() => {
      if (apiWaiters.has(id)) {
        apiWaiters.delete(id);
        res(null);
      }
    }, 6000);
  });
}

// ------------------------------------------------------------------------------------------------ the routing socket used by the UI

const LOCAL_ONLY_FROM_REMOTE = new Set(['notification', 'me:update', 'hello', 'friends:status', 'friends:changed', 'queue:status', 'game:rewards', 'challenge:incoming', 'challenge:removed']);
void LOCAL_ONLY_FROM_REMOTE;

export class RouterSocket {
  private handlers = new Map<string, Set<(...a: any[]) => void>>();
  constructor(private local: ClientSocket) {
    for (const ev of ['connect', 'disconnect', 'connect_error', 'hello', 'notification', 'friends:status', 'friends:changed', 'party:state', 'party:game', 'queue:status', 'match:found', 'challenge:incoming', 'challenge:removed', 'me:update', 'game:state', 'game:rating', 'game:rewards', 'game:analysis', 'game:bot']) {
      local.on(ev, (p: any) => {
        if (ev === 'party:state' && partyHost && p === null) return; // our own (empty) party state must not hide the remote one
        this.fire(ev, p);
      });
    }
    local.on('connect', () => {
      currentUid = null;
      void localApi('GET', '/api/me').then((r) => {
        currentUid = r.json?.me?.id ?? null;
        if (currentUid) startLobby();
      });
    });
  }
  get connected() {
    return this.local.connected;
  }
  on(ev: string, fn: (...a: any[]) => void) {
    if (!this.handlers.has(ev)) this.handlers.set(ev, new Set());
    this.handlers.get(ev)!.add(fn);
    return this;
  }
  off(ev: string, fn?: (...a: any[]) => void) {
    if (fn) this.handlers.get(ev)?.delete(fn);
    else this.handlers.delete(ev);
    return this;
  }
  once(ev: string, fn: (...a: any[]) => void) {
    const w = (...a: any[]) => {
      this.off(ev, w);
      fn(...a);
    };
    return this.on(ev, w);
  }
  fire(ev: string, ...a: unknown[]) {
    for (const h of [...(this.handlers.get(ev) ?? [])]) h(...a);
  }
  connect() {
    this.local.connect();
    return this;
  }
  disconnect() {
    this.local.disconnect();
    return this;
  }

  emit(ev: string, payload: any = {}, ack?: (r: any) => void): any {
    const reply = (r: unknown) => ack?.(r);
    const gid: string | undefined = payload?.gameId;
    // games hosted by another player
    if (gid && remoteGames.has(gid) && !localRt.games.rooms.has(gid)) {
      const s = sessionTo(remoteGames.get(gid)!);
      if (!s) return reply({ ok: false, error: 'The host of this game is offline.' });
      s.sock.emit(ev, payload, (r: any) => {
        if (ev === 'game:rematch' && r?.gameId) {
          remoteGames.set(r.gameId, s.hostPid);
          saveRemote();
        }
        reply(r);
      });
      return this;
    }
    // party actions go to the leader's browser when we are a member of a remote party
    if (ev.startsWith('party:') && partyHost && ev !== 'party:create') {
      const s = sessionTo(partyHost);
      if (s) {
        s.sock.emit(ev, payload, (r: any) => {
          if (ev === 'party:leave') {
            partyHost = null;
            this.fire('party:state', null);
          }
          if (ev === 'party:start' && r?.gameId) {
            remoteGames.set(r.gameId, s.hostPid);
            saveRemote();
          }
          reply(r);
        });
        return this;
      }
    }
    switch (ev) {
      case 'queue:join': {
        if (localRt.games.activeGameOf(currentUid!) || remoteActive()) return reply({ ok: false, error: 'You are already in a game.' });
        const tc = payload.mode === 'quick' ? '5+0' : String(payload.tc ?? '5+0');
        const preset = presetById(tc);
        if (!preset) return reply({ ok: false, error: 'Unknown time control.' });
        const rating = getRatings(localDb, currentUid!)[preset.category].rating;
        mySeek = { mode: payload.mode === 'ranked' ? 'ranked' : payload.mode === 'quick' ? 'quick' : 'casual', tc, rating, since: Date.now() };
        publish();
        setTimeout(emitQueue, 0);
        const status = { searching: true, mode: mySeek.mode === 'ranked' ? 'ranked' : 'casual', tc: { initial: preset.initial, increment: preset.increment }, since: mySeek.since, range: null, playersInQueue: 1 };
        return reply({ ok: true, status });
      }
      case 'queue:leave':
        mySeek = null;
        publish();
        emitQueue();
        return reply({ ok: true });
      case 'challenge:create': {
        const s = sanitizeSettings(payload.settings, { allowUntimed: false, allowRated: true });
        if (typeof s === 'string') return reply({ ok: false, error: s });
        const code = Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[O0I1]/g, 'X');
        if (payload.to) {
          const peer = peerOf(String(payload.to));
          if (!peer) return reply({ ok: false, error: 'That player is not online.' });
          outgoingChallenges.set(code, { to: String(payload.to), settings: s });
          sendWire?.({ t: 'challenge', id: code, settings: s, profile: myPresence()! }, peer);
          return reply({ ok: true, challenge: { id: code, code, from: currentUid, to: payload.to, settings: s, createdAt: Date.now() } });
        }
        myRoom = { code, settings: s };
        publish();
        return reply({ ok: true, challenge: { id: code, code, from: currentUid, to: null, settings: s, createdAt: Date.now() } });
      }
      case 'challenge:accept': {
        const id = String(payload.id ?? '').toUpperCase();
        const inc = incomingChallenges.get(id);
        if (inc) {
          const peer = peerOf(inc.from);
          if (!peer) return reply({ ok: false, error: 'The challenger went offline.' });
          incomingChallenges.delete(id);
          const s = sessionTo(inc.from);
          if (!s) return reply({ ok: false, error: 'Could not connect.' });
          void s.opened.then((ok) => {
            if (!ok) return reply({ ok: false, error: 'Could not connect.' });
            sendWire?.({ t: 'challenge-accept', id, profile: myPresence()! }, peer);
            const wait = (m: { gameId: string }) => {
              this.off('match:found', wait);
              reply({ ok: true, gameId: m.gameId });
            };
            this.on('match:found', wait);
          });
          return this;
        }
        if (myRoom?.code === id) return reply({ ok: false, error: 'You cannot accept your own challenge.' });
        const hostP = lobbyPlayers().find((p) => p.room?.code === id);
        if (!hostP) return reply({ ok: false, error: 'Room not found. Check the code and make sure the host is online.' });
        const s = sessionTo(hostP.pid);
        if (!s) return reply({ ok: false, error: 'Could not connect to the host.' });
        void s.opened.then((ok) => {
          if (!ok) return reply({ ok: false, error: 'Could not connect to the host.' });
          roomJoinWaiter = (r) => {
            roomJoinWaiter = null;
            if (r.ok && r.gameId) {
              remoteGames.set(r.gameId, hostP.pid);
              saveRemote();
              publish();
              reply({ ok: true, gameId: r.gameId });
            } else reply({ ok: false, error: r.error });
          };
          sendWire?.({ t: 'room-join', code: id, profile: myPresence()! }, peerOf(hostP.pid)!);
        });
        return this;
      }
      case 'challenge:decline': {
        const id = String(payload.id ?? '');
        if (myRoom?.code === id) {
          myRoom = null;
          publish();
          return reply({ ok: true });
        }
        const inc = incomingChallenges.get(id);
        const out = outgoingChallenges.get(id);
        const other = inc?.from ?? out?.to;
        incomingChallenges.delete(id);
        outgoingChallenges.delete(id);
        const peer = other ? peerOf(other) : null;
        if (peer) sendWire?.({ t: 'challenge-removed', id, declined: !!inc }, peer);
        return reply({ ok: true });
      }
      case 'party:join': {
        const code = String(payload.code ?? '').toUpperCase();
        if (localRt.parties.byCode.has(code)) break; // our own party
        const leader = lobbyPlayers().find((p) => p.party === code);
        if (!leader) return reply({ ok: false, error: 'Party not found. The leader must be online.' });
        const s = sessionTo(leader.pid);
        if (!s) return reply({ ok: false, error: 'Could not connect to the party leader.' });
        void s.opened.then((ok) => {
          if (!ok) return reply({ ok: false, error: 'Could not connect to the party leader.' });
          localRt.parties.leave(currentUid!);
          s.sock.emit('party:join', { code }, (r: any) => {
            if (r?.ok) partyHost = leader.pid;
            reply(r);
          });
        });
        return this;
      }
      case 'party:invite': {
        const target = String(payload.userId ?? '');
        const peer = peerOf(target);
        if (!peer) return reply({ ok: false, error: 'That friend is offline.' });
        let party = localRt.parties.partyOf(currentUid!);
        if (!party) party = localRt.parties.create(currentUid!);
        publish();
        sendWire?.({ t: 'party-invite', code: party.code, from: me()!.username }, peer);
        return reply({ ok: true });
      }
      case 'party:create':
        setTimeout(publish, 0);
        break;
      case 'game:join': {
        // a live game we only know from the lobby (spectating)
        if (gid && !localRt.games.rooms.has(gid)) {
          const host = lobbyPlayers().find((p) => p.games.some((g) => g.id === gid));
          if (host) {
            remoteGames.set(gid, host.pid);
            saveRemote();
            return this.emit(ev, payload, ack);
          }
        }
        break;
      }
    }
    this.local.emit(ev, payload, ack);
    if (ev === 'bot:start' || ev === 'party:start' || ev === 'party:leave' || ev === 'game:resign') setTimeout(publish, 50);
    return this;
  }
}

/** Host side: a guest's session asks to start the match agreed in the lobby. */
function installHostHandlers() {
  const io = localRt.io as unknown as Server;
  io.on('connection', (s: ServerSocket) => {
    s.on('p2p:start-match', (p: { mode: string; tc: string }, ack?: (r: unknown) => void) => {
      const guestPid = (s.data as { userId: string }).userId;
      const guest = lobbyPlayers().find((x) => x.pid === guestPid);
      const preset = presetById(p.tc) ?? presetById('5+0')!;
      if (!guest || !mySeek) {
        pendingOffer = null;
        return ack?.({ ok: false });
      }
      const ranked = p.mode === 'ranked';
      const settings: MatchSettings = { tc: { initial: preset.initial, increment: preset.increment }, rated: ranked, takebacks: false, assistance: false, spectators: true, color: 'random' };
      mySeek = null;
      pendingOffer = null;
      emitQueue();
      try {
        hostGame(ranked ? 'ranked' : 'casual', settings, guest);
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ ok: false, error: (e as Error).message });
      }
    });
  });
}

// ------------------------------------------------------------------------------------------------ lobby lifecycle

let lobbyStarted = false;
function startLobby() {
  if (lobbyStarted) return publish();
  lobbyStarted = true;
  installHostHandlers();
  // ?relay=ws://... overrides the public Nostr relays (used for local testing)
  const relay = new URLSearchParams(location.search).get('relay') ?? sessionStorage.getItem('dc.relay');
  if (relay) sessionStorage.setItem('dc.relay', relay);
  // Signalling: a broad set of free public Nostr relays (both players pick the same list, so they always overlap).
  const urls = relay ? [relay] : [...new Set([...PREFERRED_RELAYS, ...(defaultRelayUrls as string[])])].slice(0, 14);
  room = joinRoom(
    {
      appId: APP_ID,
      identity: 'none',
      relayConfig: { urls, redundancy: urls.length },
      // free public STUN + TURN fallbacks so players behind strict home/mobile networks can still connect
      rtcConfig: { iceServers: ICE_SERVERS },
    } as any,
    'lobby',
  );
  profileState = room.makeUserState<Presence | null>('profile', null) as any;
  const dm = room.makeAction<any>('dm');
  sendWire = (w, peerId) => void dm.send(w, { target: peerId }).catch(() => {});
  dm.onMessage((data: Wire, ctx: { peerId: string }) => {
    try {
      onWire(data, ctx.peerId);
    } catch (e) {
      console.error('[p2p]', e);
    }
  });
  room.onPeerLeave(({ peerId }) => {
    for (const [sid, h] of hosted) if (h.peerId === peerId) {
      h.sock.disconnect();
      hosted.delete(sid);
    }
    for (const [pid, s] of sessions) if (!peerOf(pid)) {
      s.sock.lost();
      sessions.delete(pid);
      if (partyHost === pid) {
        partyHost = null;
        facade?.fire('party:state', null);
      }
    }
    publish();
  });
  room.onPeerJoin(() => publish());
  (profileState as any).onChange?.(() => {
    facade?.fire('lobby:update', {});
  });
  // presence: online status for friends and profiles comes from the lobby
  const base = getPresence();
  setPresence({
    online: (id) => (isShadow(id) ? lobbyPlayers().some((p) => p.pid === id) : base.online(id)),
    playing: (id) => (isShadow(id) ? lobbyPlayers().find((p) => p.pid === id && p.status === 'playing')?.games[0]?.id ?? (lobbyPlayers().some((p) => p.pid === id && p.status === 'playing') ? 'remote' : null) : base.playing(id)),
  });
  const baseStatus = localRt.statusOf;
  localRt.statusOf = (id) => {
    if (!isShadow(id)) return baseStatus(id);
    const p = lobbyPlayers().find((x) => x.pid === id);
    return p ? p.status : 'offline';
  };
  // games changes / heartbeat
  const busEvents = ['game:created', 'game:ended'];
  void import('../../../server/src/bus').then(({ bus }) => busEvents.forEach((e) => bus.on(e, () => publish())));
  setInterval(() => {
    publish();
    matchTick();
  }, 1500);
  publish();
}

export function createRouterSocket(local: ClientSocket) {
  facade = new RouterSocket(local);
  return facade;
}

export const p2pInfo = () => ({ players: lobbyPlayers().length, connected: !!room });

// ------------------------------------------------------------------------------------------------ API overrides

/** Intercepts REST calls whose data lives with other players. Returns null to fall through to the local server. */
export async function apiOverride(method: string, url: string, body: any): Promise<{ status: number; json: any } | null> {
  const [path, qs] = url.split('?');
  const q = new URLSearchParams(qs ?? '');
  if (method === 'GET' && path === '/api/users/search') {
    const term = (q.get('q') ?? '').toLowerCase();
    const local = await localApi(method, url);
    const seen = new Set((local.json?.users ?? []).map((u: any) => u.id));
    const remote = lobbyPlayers()
      .filter((p) => p.name.toLowerCase().startsWith(term) && !seen.has(p.pid))
      .map(profileOf);
    return { status: 200, json: { users: [...(local.json?.users ?? []).filter((u: any) => isShadow(u.id) || u.id !== currentUid), ...remote].slice(0, 20) } };
  }
  if (method === 'POST' && path === '/api/friends/request') {
    const name = String(body?.username ?? '').toLowerCase();
    const target = lobbyPlayers().find((p) => p.name.toLowerCase() === name) ?? lobbyPlayers().find((p) => getUser(localDb, p.pid)?.username.toLowerCase() === name);
    if (!target) {
      const shadow = localDb.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE AND password_hash = 'remote'").get(body?.username) as { id: string } | undefined;
      return { status: 400, json: { error: shadow ? 'That player is offline. Friend requests are delivered directly, so they must be online.' : 'No online player with that username.' } };
    }
    const uid = ensureShadow(target);
    const incoming = localDb.prepare("SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'pending'").get(uid, currentUid);
    if (incoming) return apiOverride('POST', '/api/friends/respond', { userId: uid, accept: true });
    localDb.prepare("INSERT OR IGNORE INTO friends (user_id, friend_id, status, created_at) VALUES (?, ?, 'pending', ?)").run(currentUid, uid, Date.now());
    sendWire?.({ t: 'friend-req', profile: myPresence()! }, peerOf(target.pid)!);
    return { status: 200, json: { ok: true, accepted: false } };
  }
  if (method === 'POST' && path === '/api/friends/respond' && body?.accept) {
    const r = await localApi(method, url, body);
    const peer = peerOf(String(body.userId));
    if (r.status === 200 && peer) sendWire?.({ t: 'friend-acc', profile: myPresence()! }, peer);
    return r;
  }
  // other players' public profiles and histories are fetched from their own browser when online
  const um = /^\/api\/users\/([^/]+)(\/.*)?$/.exec(path);
  if (method === 'GET' && um && um[1] !== 'search') {
    const name = decodeURIComponent(um[1]);
    const u = (localDb.prepare('SELECT id, username, password_hash FROM users WHERE username = ? COLLATE NOCASE OR id = ?').get(name, name) as { id: string; username: string; password_hash: string } | undefined) ?? undefined;
    const lp = lobbyPlayers().find((p) => p.pid === u?.id || p.name.toLowerCase() === name.toLowerCase());
    if ((!u || u.password_hash === 'remote') && lp) {
      const r = await askPeerApi(lp.pid, `/api/users/${encodeURIComponent(lp.name)}${um[2] ?? ''}${qs ? `?${qs}` : ''}`);
      if (r && r.status === 200) {
        if (!um[2] && r.json) {
          r.json.status = lp.status;
          r.json.profile = { ...r.json.profile, online: true };
        }
        return r;
      }
    }
    return null;
  }
  if (method === 'GET' && path === '/api/leaderboard') {
    const type = q.get('type') ?? 'overall';
    const local = (await localApi(method, url)).json;
    const self = myPresence();
    const players = [...lobbyPlayers(), ...(self ? [self] : [])];
    const value = (p: Presence) =>
      type === 'level' ? p.xp : type === 'overall' || type === 'season' ? p.rating : (p.ratings as any)[type]?.rating ?? p.rating;
    const entries = players
      .filter((p) => type === 'level' || type === 'overall' || type === 'season' || ((p.ratings as any)[type]?.games ?? 0) > 0 || p.pid === currentUid)
      .sort((a, b) => value(b) - value(a))
      .slice(0, 100)
      .map((p, i) => ({ position: i + 1, id: p.pid, username: p.name, icon: p.icon, card: p.card, level: p.level, rating: type === 'level' ? p.rating : value(p), division: '', value: value(p) }));
    return { status: 200, json: { type, entries, myPosition: entries.find((e) => e.id === currentUid)?.position ?? null, season: local?.season, p2p: true } };
  }
  if (method === 'GET' && path === '/api/games/live') {
    const local = (await localApi(method, url)).json?.games ?? [];
    const ids = new Set(local.map((g: any) => g.id));
    const remote = lobbyPlayers().flatMap((p) => p.games).filter((g) => !ids.has(g.id));
    return { status: 200, json: { games: [...local, ...remote] } };
  }
  if (method === 'GET' && /^\/api\/games\/[^/]+$/.test(path)) {
    const id = path.split('/').pop()!;
    if (!localDb.prepare('SELECT 1 FROM games WHERE id = ?').get(id) && remoteGames.has(id) && !finishedRemote.has(id)) return { status: 200, json: { live: true, gameId: id } };
    return null;
  }
  if (method === 'GET' && path === '/api/me') {
    const r = await localApi(method, url);
    if (r.json && !r.json.activeGameId) {
      for (const [gid] of remoteGames) if (!finishedRemote.has(gid) && !localDb.prepare('SELECT 1 FROM games WHERE id = ?').get(gid)) r.json.activeGameId = null;
    }
    return r;
  }
  return null;
}
