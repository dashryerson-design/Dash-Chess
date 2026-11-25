import { TIME_PRESETS, categoryOf, presetById, type MatchSettings, type QueueStatus, type TimeControl } from '@dc/shared';
import type { DB } from './db';
import type { GameManager } from './game/manager';
import { getRatings } from './users';
import type { GameRoom } from './game/room';
import { config } from './config';

export type QueueMode = 'ranked' | 'casual' | 'quick';

interface Entry {
  userId: string;
  ip: string;
  mode: QueueMode;
  tcId: string;
  rating: number;
  since: number;
}

/**
 * Rating-based matchmaking.
 * - Ranked: starts at +-60 and widens by 20 every 2s up to +-450.
 * - Casual: starts at +-200, widens quickly, unlimited after 30s.
 * - Quick Play: takes the first compatible casual opponent in any time control; if nobody is
 *   waiting, waits in the 5+0 casual pool.
 * - Ranked avoids pairing the same two players more than 3 times per 24h, and never pairs
 *   two accounts on the same network.
 */
export class Matchmaker {
  queue = new Map<string, Entry>();
  private timer: NodeJS.Timeout;
  onMatch: (room: GameRoom) => void = () => {};
  onUpdate: (userId: string) => void = () => {};

  constructor(private db: DB, private games: GameManager) {
    this.timer = setInterval(() => this.tick(), 1000);
    (this.timer as any).unref?.();
  }

  stop() {
    clearInterval(this.timer);
  }

  join(userId: string, ip: string, mode: QueueMode, tcId: string): string | null {
    const preset = presetById(tcId);
    if (!preset) return 'Unknown time control.';
    if (this.games.activeGameOf(userId)) return 'You are already in a game.';
    const rating = getRatings(this.db, userId)[preset.category].rating;
    this.queue.set(userId, { userId, ip, mode, tcId: mode === 'quick' ? '5+0' : tcId, rating, since: Date.now() });
    this.tick();
    return null;
  }

  leave(userId: string) {
    this.queue.delete(userId);
  }

  status(userId: string): QueueStatus {
    const e = this.queue.get(userId);
    if (!e) return { searching: false };
    const p = presetById(e.tcId)!;
    return {
      searching: true,
      mode: e.mode === 'ranked' ? 'ranked' : 'casual',
      tc: { initial: p.initial, increment: p.increment },
      since: e.since,
      range: Math.round(this.range(e)),
      playersInQueue: [...this.queue.values()].filter((x) => x.tcId === e.tcId).length,
    };
  }

  range(e: Entry): number {
    const waited = (Date.now() - e.since) / 1000;
    if (e.mode === 'ranked') return Math.min(450, 60 + Math.floor(waited / 2) * 20);
    if (waited > 30) return Infinity;
    return 200 + waited * 25;
  }

  private recentPairs(a: string, b: string): number {
    return (
      this.db
        .prepare(
          `SELECT COUNT(*) n FROM games WHERE rated = 1 AND ended_at > ? AND ((white_id = ? AND black_id = ?) OR (white_id = ? AND black_id = ?))`,
        )
        .get(Date.now() - 86400_000, a, b, b, a) as { n: number }
    ).n;
  }

  private compatible(a: Entry, b: Entry): boolean {
    if (a.userId === b.userId) return false;
    const ranked = a.mode === 'ranked' || b.mode === 'ranked';
    if (ranked && (a.mode !== 'ranked' || b.mode !== 'ranked')) return false;
    if (ranked && config.blockSameIpRanked && a.ip === b.ip) return false;
    const quick = a.mode === 'quick' || b.mode === 'quick';
    if (!quick && a.tcId !== b.tcId) return false;
    const diff = Math.abs(a.rating - b.rating);
    if (diff > Math.min(this.range(a), this.range(b))) return false;
    if (ranked && this.recentPairs(a.userId, b.userId) >= 3) return false;
    return true;
  }

  tick() {
    const entries = [...this.queue.values()].sort((x, y) => x.since - y.since);
    const used = new Set<string>();
    for (let i = 0; i < entries.length; i++) {
      const a = entries[i];
      if (used.has(a.userId)) continue;
      let best: Entry | null = null;
      for (let j = i + 1; j < entries.length; j++) {
        const b = entries[j];
        if (used.has(b.userId) || !this.compatible(a, b)) continue;
        if (!best || Math.abs(b.rating - a.rating) < Math.abs(best.rating - a.rating)) best = b;
      }
      if (!best) continue;
      used.add(a.userId);
      used.add(best.userId);
      this.queue.delete(a.userId);
      this.queue.delete(best.userId);
      // Quick play adopts the non-quick player's time control
      const tcId = a.mode !== 'quick' ? a.tcId : best.tcId;
      const p = presetById(tcId) ?? TIME_PRESETS[4];
      const tc: TimeControl = { initial: p.initial, increment: p.increment };
      const ranked = a.mode === 'ranked';
      const settings: MatchSettings = { tc, rated: ranked, takebacks: false, assistance: false, spectators: true, color: 'random' };
      try {
        const room = this.games.createHumanGame(ranked ? 'ranked' : 'casual', settings, { userId: a.userId, ip: a.ip }, { userId: best.userId, ip: best.ip });
        this.onMatch(room);
      } catch (e) {
        console.error('[mm] could not create game', e);
      }
    }
    for (const e of this.queue.values()) this.onUpdate(e.userId);
  }
}

export function categoryForPreset(id: string) {
  const p = presetById(id);
  return p ? categoryOf(p) : null;
}
