import type { DB } from './db';
import { hashPassword, newId } from './auth';
import {
  COSMETICS,
  COSMETIC_BY_ID,
  DEFAULT_EQUIPPED,
  DEFAULT_ITEMS,
  DIVISION_CONFIG,
  START_RATING,
  TIME_CATEGORIES,
  levelFromXp,
  levelReward,
  overallRating,
  type Equipped,
  type LevelReward,
  type Me,
  type Notification,
  type PublicProfile,
  type TimeCategory,
} from '@dc/shared';
import { bus } from './bus';

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  created_at: number;
  xp: number;
  level: number;
  points: number;
  equipped: string;
  settings: string;
  privacy: string;
  last_seen: number | null;
  username_changed_at: number | null;
}

export interface RatingRow {
  user_id: string;
  category: TimeCategory;
  rating: number;
  peak: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

export function createUser(db: DB, username: string, password: string): string {
  const id = newId('u_');
  const t = Date.now();
  db.transaction(() => {
    db.prepare('INSERT INTO users (id, username, password_hash, created_at, equipped) VALUES (?, ?, ?, ?, ?)').run(
      id,
      username,
      hashPassword(password),
      t,
      JSON.stringify(DEFAULT_EQUIPPED),
    );
    const r = db.prepare('INSERT INTO ratings (user_id, category, rating, peak) VALUES (?, ?, ?, ?)');
    for (const c of TIME_CATEGORIES) r.run(id, c, START_RATING, START_RATING);
    db.prepare('INSERT INTO user_stats (user_id) VALUES (?)').run(id);
    const inv = db.prepare('INSERT OR IGNORE INTO inventory (user_id, item_id, source, acquired_at) VALUES (?, ?, ?, ?)');
    for (const item of DEFAULT_ITEMS) inv.run(id, item, 'default', t);
  })();
  return id;
}

export const getUser = (db: DB, id: string) => db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
export const getUserByName = (db: DB, username: string) =>
  db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username) as UserRow | undefined;

export function getRatings(db: DB, id: string): Record<TimeCategory, RatingRow> {
  const rows = db.prepare('SELECT * FROM ratings WHERE user_id = ?').all(id) as RatingRow[];
  return Object.fromEntries(rows.map((r) => [r.category, r])) as Record<TimeCategory, RatingRow>;
}

export function overallFor(db: DB, id: string): { rating: number; peak: number } {
  const rows = Object.values(getRatings(db, id));
  return { rating: overallRating(rows), peak: Math.max(START_RATING, ...rows.map((r) => r.peak)) };
}

export function equippedOf(u: UserRow): Equipped {
  try {
    return { ...DEFAULT_EQUIPPED, ...JSON.parse(u.equipped) };
  } catch {
    return { ...DEFAULT_EQUIPPED };
  }
}

export function inventoryOf(db: DB, id: string): string[] {
  return (db.prepare('SELECT item_id FROM inventory WHERE user_id = ?').all(id) as { item_id: string }[]).map((r) => r.item_id);
}

export interface Presence {
  online: (id: string) => boolean;
  playing: (id: string) => string | null;
}
let presence: Presence = { online: () => false, playing: () => null };
export function setPresence(p: Presence) {
  presence = p;
}
export const getPresence = () => presence;

export function publicProfile(db: DB, u: UserRow): PublicProfile {
  const eq = equippedOf(u);
  const ov = overallFor(db, u.id);
  const privacy = JSON.parse(u.privacy || '{}');
  const showOnline = privacy.showOnline !== false;
  return {
    id: u.id,
    username: u.username,
    level: u.level,
    xp: u.xp,
    icon: eq.icon,
    card: eq.card,
    createdAt: u.created_at,
    rating: ov.rating,
    peakRating: ov.peak,
    online: showOnline && presence.online(u.id),
    playing: showOnline && !!presence.playing(u.id),
  };
}

export function meOf(db: DB, u: UserRow): Me {
  return {
    ...publicProfile(db, u),
    online: true,
    points: u.points,
    equipped: equippedOf(u),
    inventory: inventoryOf(db, u.id),
    settings: JSON.parse(u.settings || '{}'),
    privacy: { showOnline: true, allowChallenges: 'everyone', ...JSON.parse(u.privacy || '{}') },
  };
}

/** Grants a cosmetic. Returns true if newly granted. */
export function grantItem(db: DB, userId: string, itemId: string, source: string): boolean {
  if (!COSMETIC_BY_ID[itemId]) return false;
  const r = db
    .prepare('INSERT OR IGNORE INTO inventory (user_id, item_id, source, acquired_at) VALUES (?, ?, ?, ?)')
    .run(userId, itemId, source, Date.now());
  return r.changes > 0;
}

export function notify(db: DB, userId: string, type: Notification['type'], payload: Record<string, unknown>): Notification {
  const t = Date.now();
  const r = db.prepare('INSERT INTO notifications (user_id, type, payload, created_at) VALUES (?, ?, ?, ?)').run(userId, type, JSON.stringify(payload), t);
  // keep the table bounded per user
  db.prepare(
    'DELETE FROM notifications WHERE user_id = ? AND id NOT IN (SELECT id FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 100)',
  ).run(userId, userId);
  const n: Notification = { id: Number(r.lastInsertRowid), type, payload, createdAt: t, read: false };
  bus.emit('notify', userId, n);
  return n;
}

export interface XpGrant {
  xpBefore: number;
  xpAfter: number;
  levelBefore: number;
  levelAfter: number;
  rewards: LevelReward[];
  items: string[];
  points: number;
}

/** Adds XP, processes level-ups (points + level-locked cosmetics). Must run inside a transaction. */
export function grantXp(db: DB, userId: string, xp: number): XpGrant {
  const u = getUser(db, userId)!;
  const before = levelFromXp(u.xp);
  const xpAfter = u.xp + Math.max(0, Math.round(xp));
  const after = levelFromXp(xpAfter);
  const rewards: LevelReward[] = [];
  const items: string[] = [];
  let points = 0;
  for (let l = before.level + 1; l <= after.level; l++) {
    const r = levelReward(l);
    rewards.push(r);
    points += r.points;
    for (const it of r.items) if (grantItem(db, userId, it, `level:${l}`)) items.push(it);
  }
  db.prepare('UPDATE users SET xp = ?, level = ?, points = points + ? WHERE id = ?').run(xpAfter, after.level, points, userId);
  if (after.level > before.level) notify(db, userId, 'level_up', { level: after.level, points, items });
  return { xpBefore: u.xp, xpAfter, levelBefore: before.level, levelAfter: after.level, rewards, items, points };
}

export function addPoints(db: DB, userId: string, points: number) {
  if (points) db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(Math.round(points), userId);
}

/** Grants division-locked cosmetics based on the player's peak rating in any category. */
export function checkDivisionUnlocks(db: DB, userId: string): string[] {
  const peak = overallFor(db, userId).peak;
  const granted: string[] = [];
  for (const c of COSMETICS) {
    if (c.unlock.kind !== 'division') continue;
    const tierId = c.unlock.tier;
    const tier = DIVISION_CONFIG.find((t) => t.id === tierId);
    if (tier && peak >= tier.min && grantItem(db, userId, c.id, `division:${tier.id}`)) granted.push(c.id);
  }
  return granted;
}
