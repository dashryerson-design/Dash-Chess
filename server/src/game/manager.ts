import {
  BOT_BY_ID,
  PLACEMENT_GAMES,
  categoryOf,
  type GameMode,
  type GameRewards,
  type MatchSettings,
  type Side,
} from '@dc/shared';
import type { DB } from '../db';
import { newId } from '../auth';
import { GameRoom, type HumanSeat, type Seat } from './room';
import { persistGame, ensureAnalysis, processRewards } from './finish';
import { equippedOf, getRatings, getUser } from '../users';
import { bus } from '../bus';

export interface HumanRef {
  userId: string;
  ip: string;
}

export class GameManager {
  rooms = new Map<string, GameRoom>();
  /** userId -> active gameId */
  active = new Map<string, string>();
  /** gameId -> rewards per user (kept briefly so reconnecting clients can fetch them) */
  rewards = new Map<string, Map<string, GameRewards>>();
  /** gameId -> promise of the post-game pipeline */
  pipelines = new Map<string, Promise<void>>();

  constructor(private db: DB) {}

  humanSeat(ref: HumanRef, category: ReturnType<typeof categoryOf>): HumanSeat {
    const u = getUser(this.db, ref.userId)!;
    const eq = equippedOf(u);
    const r = getRatings(this.db, u.id)[category];
    return {
      kind: 'human',
      userId: u.id,
      username: u.username,
      icon: eq.icon,
      card: eq.card,
      level: u.level,
      rating: r.rating,
      ratingGames: r.games,
      provisional: r.games < PLACEMENT_GAMES,
      ip: ref.ip,
    };
  }

  activeGameOf(userId: string): GameRoom | null {
    const id = this.active.get(userId);
    const room = id ? this.rooms.get(id) : null;
    return room && room.status === 'active' ? room : null;
  }

  createHumanGame(mode: GameMode, settings: MatchSettings, a: HumanRef, b: HumanRef): GameRoom {
    const cat = categoryOf(settings.tc);
    let white = a;
    let black = b;
    if (settings.color === 'black' || (settings.color === 'random' && Math.random() < 0.5)) [white, black] = [b, a];
    return this.create(mode, settings, this.humanSeat(white, cat), this.humanSeat(black, cat));
  }

  createBotGame(botId: string, settings: MatchSettings, human: HumanRef): GameRoom {
    const bot = BOT_BY_ID[botId];
    if (!bot) throw new Error('Unknown bot');
    const cat = categoryOf(settings.tc);
    const seatH = this.humanSeat(human, cat);
    const seatB: Seat = { kind: 'bot', bot };
    const humanWhite = settings.color === 'white' || (settings.color === 'random' && Math.random() < 0.5);
    return this.create('bot', { ...settings, rated: false }, humanWhite ? seatH : seatB, humanWhite ? seatB : seatH);
  }

  private create(mode: GameMode, settings: MatchSettings, white: Seat, black: Seat): GameRoom {
    for (const s of [white, black]) {
      if (s.kind === 'human' && this.activeGameOf(s.userId)) throw new Error(`${s.username} is already in a game.`);
    }
    const room = new GameRoom({ id: newId('g_'), mode, settings, white, black });
    this.rooms.set(room.id, room);
    for (const s of [white, black]) if (s.kind === 'human') this.active.set(s.userId, room.id);
    room.on('end', () => this.onEnd(room));
    bus.emit('game:created', room);
    room.start();
    return room;
  }

  private onEnd(room: GameRoom) {
    for (const s of room.humanSides()) {
      const seat = room.seats[s] as HumanSeat;
      if (this.active.get(seat.userId) === room.id) this.active.delete(seat.userId);
    }
    let recorded = false;
    try {
      recorded = persistGame(this.db, room);
    } catch (e) {
      console.error('[game] persist failed', e);
    }
    bus.emit('game:ended', room);
    if (recorded) {
      const p = this.runPipeline(room.id).catch((e) => console.error('[game] pipeline failed', e));
      this.pipelines.set(room.id, p);
    }
    // keep finished rooms around for rematch / review for a while
    (setTimeout(() => {
      const r = this.rooms.get(room.id);
      if (r === room) {
        this.rooms.delete(room.id);
        room.dispose();
      }
      this.rewards.delete(room.id);
      this.pipelines.delete(room.id);
    }, 15 * 60_000) as any).unref?.();
  }

  async runPipeline(gameId: string) {
    let analysis = null;
    try {
      analysis = await ensureAnalysis(this.db, gameId);
    } catch (e) {
      console.error('[game] analysis failed; rewarding without move ratings', e);
    }
    if (analysis) bus.emit('game:analysis', gameId, analysis);
    const rewards = processRewards(this.db, gameId, analysis);
    this.rewards.set(gameId, rewards);
    for (const [uid, r] of rewards) bus.emit('game:rewards', uid, r);
  }

  /** On startup: finish reward processing for any games that were persisted but not rewarded. */
  async resumePending() {
    const rows = this.db.prepare('SELECT DISTINCT game_id FROM player_games WHERE rewarded = 0').all() as { game_id: string }[];
    for (const r of rows) await this.runPipeline(r.game_id).catch((e) => console.error(e));
  }

  rematch(room: GameRoom, side: Side, refs: Record<Side, HumanRef>): GameRoom | 'pending' | string {
    const res = room.offerRematch(side);
    if (res !== 'accepted') return res;
    // swap colours
    const settings: MatchSettings = { ...room.settings, color: 'white' };
    const a = refs.b;
    const b = refs.w;
    try {
      return this.createHumanGame(room.mode, settings, a, b);
    } catch (e) {
      return (e as Error).message;
    }
  }
}
