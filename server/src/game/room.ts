import { Chess, type Color } from 'chess.js';
import { EventEmitter } from 'node:events';
import {
  categoryOf,
  type BotProfile,
  type GameMode,
  type GameResult,
  type GameState,
  type MatchSettings,
  type MoveRating,
  type MoveRecord,
  type SeatInfo,
  type Side,
  type TimeCategory,
} from '@dc/shared';
import { config } from '../config';
import { chooseBotMove, botEval, seededRng, type Rng } from '../engine/botPlayer';
import { plyInputs, ratePly } from '../engine/analyzer';

export interface HumanSeat {
  kind: 'human';
  userId: string;
  username: string;
  icon: string;
  card: string;
  level: number;
  rating: number;
  ratingGames: number;
  provisional: boolean;
  ip: string;
}
export interface BotSeat {
  kind: 'bot';
  bot: BotProfile;
}
export type Seat = HumanSeat | BotSeat;

const other = (s: Side): Side => (s === 'w' ? 'b' : 'w');

/** Has `color` enough material to possibly deliver mate? (lone king / king + single minor => no) */
export function hasMatingMaterial(chess: Chess, color: Color): boolean {
  let minors = 0;
  for (const row of chess.board())
    for (const p of row) {
      if (!p || p.color !== color || p.type === 'k') continue;
      if (p.type === 'p' || p.type === 'r' || p.type === 'q') return true;
      minors++;
    }
  return minors >= 2;
}

export interface RoomOptions {
  id: string;
  mode: GameMode;
  settings: MatchSettings;
  white: Seat;
  black: Seat;
  rngSeed?: number;
}

/**
 * Authoritative chess game. All rules, clocks and results are decided here.
 * Events: 'update' (state changed), 'move' (MoveRecord), 'end' (GameResult), 'rating' (side, MoveRating)
 */
export class GameRoom extends EventEmitter {
  readonly id: string;
  readonly mode: GameMode;
  readonly settings: MatchSettings;
  readonly category: TimeCategory;
  readonly seats: Record<Side, Seat>;
  readonly chess = new Chess();
  readonly startFen: string;
  moves: MoveRecord[] = [];
  clock: Record<Side, number> | null;
  clockRunning = false;
  turnStart = Date.now();
  status: 'active' | 'ended' = 'active';
  result: GameResult | null = null;
  drawOffer: Side | null = null;
  takebackOffer: Side | null = null;
  rematchOffer: Side | null = null;
  connected: Record<Side, number> = { w: 0, b: 0 };
  disconnectedAt: Record<Side, number | null> = { w: null, b: null };
  spectators = new Set<string>();
  startedAt = Date.now();
  endedAt = 0;
  liveRatings = new Map<number, MoveRating>();
  hintsUsed: Record<Side, number> = { w: 0, b: 0 };
  takebacksUsed = 0;
  /** increments on every position change so stale async work (bot moves) can be discarded */
  version = 0;
  private timers: Record<string, NodeJS.Timeout | undefined> = {};
  private rng: Rng;
  private botLosingStreak: Record<Side, number> = { w: 0, b: 0 };
  readonly showLiveRatings: boolean;

  constructor(o: RoomOptions) {
    super();
    this.id = o.id;
    this.mode = o.mode;
    this.settings = o.settings;
    this.category = categoryOf(o.settings.tc);
    this.seats = { w: o.white, b: o.black };
    this.startFen = this.chess.fen();
    this.clock = o.settings.tc.initial > 0 ? { w: o.settings.tc.initial * 1000, b: o.settings.tc.initial * 1000 } : null;
    this.rng = seededRng(o.rngSeed ?? Math.floor(Math.random() * 2 ** 31));
    this.showLiveRatings = o.settings.assistance && !o.settings.rated;
  }

  // ------------------------------------------------------------------ lifecycle
  start() {
    this.startedAt = Date.now();
    this.turnStart = this.startedAt;
    this.armTimers();
    this.maybeBotTurn();
  }

  sideOfUser(userId: string): Side | null {
    for (const s of ['w', 'b'] as Side[]) {
      const seat = this.seats[s];
      if (seat.kind === 'human' && seat.userId === userId) return s;
    }
    return null;
  }

  humanSides(): Side[] {
    return (['w', 'b'] as Side[]).filter((s) => this.seats[s].kind === 'human');
  }

  get turn(): Side {
    return this.chess.turn();
  }

  remaining(side: Side, at = Date.now()): number | null {
    if (!this.clock) return null;
    let r = this.clock[side];
    if (this.clockRunning && this.status === 'active' && this.turn === side) r -= at - this.turnStart;
    return Math.max(0, r);
  }

  // ------------------------------------------------------------------ actions
  /** Returns null on success or an error string. */
  move(side: Side, uci: string, at = Date.now()): string | null {
    if (this.status !== 'active') return 'Game is over.';
    if (this.turn !== side) return 'Not your turn.';
    if (typeof uci !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return 'Malformed move.';

    // Clock check before accepting the move
    let spent = at - this.turnStart;
    if (this.clock && this.clockRunning) {
      const left = this.clock[side] - spent;
      if (left <= 0) {
        this.clock[side] = 0;
        this.timeout(side);
        return 'Out of time.';
      }
    }

    let mv;
    try {
      mv = this.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
    } catch {
      return 'Illegal move.';
    }
    const realUci = mv.from + mv.to + (mv.promotion ?? '');
    if (realUci !== uci && !(uci.length === 4 && mv.promotion)) {
      // e.g. promotion without piece: chess.js would have thrown; keep strictness
    }

    if (this.clock) {
      if (this.clockRunning) {
        this.clock[side] = this.clock[side] - spent + this.settings.tc.increment * 1000;
      } else spent = 0;
    }
    const rec: MoveRecord = { uci: realUci, san: mv.san, clock: this.clock ? this.clock[side] : null, spent: Math.max(0, spent) };
    this.moves.push(rec);
    this.version++;
    this.drawOffer = this.drawOffer === side ? side : null;
    this.takebackOffer = null;
    this.turnStart = at;
    if (this.moves.length >= 2 && this.clock) this.clockRunning = true;

    this.emit('move', rec);
    this.liveAnalyze(this.moves.length - 1);

    if (!this.checkGameOver()) {
      this.armTimers();
      this.emit('update');
      this.maybeBotTurn();
    }
    return null;
  }

  private checkGameOver(): boolean {
    const c = this.chess;
    const mover = other(this.turn);
    if (c.isCheckmate()) return this.end({ winner: mover, reason: 'checkmate' }), true;
    if (c.isStalemate()) return this.end({ winner: null, reason: 'stalemate' }), true;
    if (c.isInsufficientMaterial()) return this.end({ winner: null, reason: 'insufficient_material' }), true;
    if (c.isThreefoldRepetition()) return this.end({ winner: null, reason: 'repetition' }), true;
    if (c.isDrawByFiftyMoves()) return this.end({ winner: null, reason: 'fifty_moves' }), true;
    return false;
  }

  resign(side: Side) {
    if (this.status !== 'active') return 'Game is over.';
    if (this.moves.length < 2) return this.abort(side);
    this.end({ winner: other(side), reason: 'resignation' });
    return null;
  }

  abort(side: Side): string | null {
    if (this.status !== 'active') return 'Game is over.';
    if (this.moves.length >= 2) return 'Too late to abort; resign instead.';
    void side;
    this.end({ winner: null, reason: 'aborted' });
    return null;
  }

  offerDraw(side: Side): string | null {
    if (this.status !== 'active') return 'Game is over.';
    if (this.moves.length < 2) return 'Make a move first.';
    if (this.drawOffer === other(side)) {
      this.end({ winner: null, reason: 'agreement' });
      return null;
    }
    if (this.drawOffer === side) return null;
    this.drawOffer = side;
    this.emit('update');
    const opp = this.seats[other(side)];
    if (opp.kind === 'bot') void this.botConsiderDraw(other(side));
    return null;
  }

  respondDraw(side: Side, accept: boolean): string | null {
    if (this.status !== 'active' || this.drawOffer !== other(side)) return 'No draw offer.';
    if (accept) this.end({ winner: null, reason: 'agreement' });
    else {
      this.drawOffer = null;
      this.emit('update');
    }
    return null;
  }

  requestTakeback(side: Side): string | null {
    if (this.status !== 'active') return 'Game is over.';
    if (!this.settings.takebacks || this.settings.rated) return 'Takebacks are disabled for this game.';
    const myMoves = this.moves.filter((_, i) => (i % 2 === 0 ? 'w' : 'b') === side).length;
    if (myMoves === 0) return 'Nothing to take back.';
    const opp = this.seats[other(side)];
    if (opp.kind === 'bot') {
      this.applyTakeback(side);
      return null;
    }
    this.takebackOffer = side;
    this.emit('update');
    return null;
  }

  respondTakeback(side: Side, accept: boolean): string | null {
    if (this.status !== 'active' || this.takebackOffer !== other(side)) return 'No takeback request.';
    if (accept) this.applyTakeback(other(side));
    else {
      this.takebackOffer = null;
      this.emit('update');
    }
    return null;
  }

  /** Undo until it is `side`'s turn again and `side`'s last move is undone. */
  private applyTakeback(side: Side) {
    const undoCount = this.turn === side ? 2 : 1;
    for (let i = 0; i < undoCount && this.moves.length; i++) {
      this.chess.undo();
      this.moves.pop();
      this.liveRatings.delete(this.moves.length);
    }
    // restore clocks from move records
    if (this.clock) {
      const init = this.settings.tc.initial * 1000;
      const last = (s: Side) => {
        for (let i = this.moves.length - 1; i >= 0; i--) if ((i % 2 === 0 ? 'w' : 'b') === s && this.moves[i].clock !== null) return this.moves[i].clock!;
        return init;
      };
      this.clock = { w: last('w'), b: last('b') };
      this.clockRunning = this.moves.length >= 2;
    }
    this.takebacksUsed++;
    this.takebackOffer = null;
    this.drawOffer = null;
    this.turnStart = Date.now();
    this.version++;
    this.armTimers();
    this.emit('takeback');
    this.emit('update');
    this.maybeBotTurn();
  }

  hint(side: Side): Promise<string | null> | string {
    if (this.status !== 'active' || this.turn !== side) return 'Not your turn.';
    if (!this.settings.assistance || this.settings.rated) return 'Move assistance is disabled for this game.';
    this.hintsUsed[side]++;
    const fen = this.chess.fen();
    return import('../engine/uci').then(({ getAnalysisPool }) =>
      getAnalysisPool().run((e) => e.search({ fen, depth: 10, multipv: 1, fresh: true }), 9).then((r) => r.bestmove),
    );
  }

  setConnected(side: Side, delta: 1 | -1) {
    this.connected[side] = Math.max(0, this.connected[side] + delta);
    if (this.status !== 'active' || this.seats[side].kind !== 'human') return;
    if (this.connected[side] === 0 && this.disconnectedAt[side] === null) {
      this.disconnectedAt[side] = Date.now();
      this.armTimers();
      this.emit('update');
    } else if (this.connected[side] > 0 && this.disconnectedAt[side] !== null) {
      this.disconnectedAt[side] = null;
      this.armTimers();
      this.emit('update');
    }
  }

  offerRematch(side: Side): 'pending' | 'accepted' | string {
    if (this.status !== 'ended') return 'Game still in progress.';
    if (this.mode === 'bot') return 'accepted';
    if (this.rematchOffer === other(side)) {
      this.rematchOffer = null;
      return 'accepted';
    }
    this.rematchOffer = side;
    this.emit('update');
    return 'pending';
  }

  // ------------------------------------------------------------------ timers
  private clearTimer(k: string) {
    if (this.timers[k]) clearTimeout(this.timers[k]);
    this.timers[k] = undefined;
  }

  private armTimers() {
    this.clearTimer('flag');
    this.clearTimer('abort');
    this.clearTimer('gone');
    if (this.status !== 'active') return;
    const side = this.turn;
    if (this.clock && this.clockRunning) {
      const left = this.remaining(side)!;
      this.timers.flag = setTimeout(() => this.onFlagTimer(), left + 20);
    }
    if (this.moves.length < 2 && this.seats[side].kind === 'human') {
      this.timers.abort = setTimeout(() => {
        if (this.status === 'active' && this.moves.length < 2) this.end({ winner: null, reason: 'aborted' });
      }, config.firstMoveAbortMs);
    }
    for (const s of ['w', 'b'] as Side[]) {
      const at = this.disconnectedAt[s];
      if (at !== null) {
        const wait = Math.max(0, at + config.disconnectForfeitMs - Date.now());
        this.timers.gone = setTimeout(() => this.onGoneTimer(), wait + 10);
      }
    }
  }

  private onFlagTimer() {
    if (this.status !== 'active' || !this.clock) return;
    const side = this.turn;
    if (this.remaining(side)! <= 0) {
      this.clock[side] = 0;
      this.timeout(side);
    } else this.armTimers();
  }

  private onGoneTimer() {
    if (this.status !== 'active') return;
    for (const s of ['w', 'b'] as Side[]) {
      const at = this.disconnectedAt[s];
      if (at !== null && Date.now() - at >= config.disconnectForfeitMs) {
        if (this.moves.length < 2) this.end({ winner: null, reason: 'aborted' });
        else this.end({ winner: other(s), reason: 'abandoned' });
        return;
      }
    }
    this.armTimers();
  }

  private timeout(side: Side) {
    const winner = other(side);
    if (!hasMatingMaterial(this.chess, winner)) this.end({ winner: null, reason: 'timeout_insufficient' });
    else this.end({ winner, reason: 'timeout' });
  }

  end(result: GameResult) {
    if (this.status !== 'active') return;
    if (this.clock && this.clockRunning) {
      const s = this.turn;
      this.clock[s] = Math.max(0, this.clock[s] - (Date.now() - this.turnStart));
    }
    this.status = 'ended';
    this.result = result;
    this.endedAt = Date.now();
    this.drawOffer = null;
    this.takebackOffer = null;
    for (const k of Object.keys(this.timers)) this.clearTimer(k);
    this.version++;
    this.emit('end', result);
    this.emit('update');
  }

  dispose() {
    for (const k of Object.keys(this.timers)) this.clearTimer(k);
    this.removeAllListeners();
  }

  // ------------------------------------------------------------------ bots
  private maybeBotTurn() {
    if (this.status !== 'active') return;
    const side = this.turn;
    const seat = this.seats[side];
    if (seat.kind !== 'bot') return;
    const version = this.version;
    const t0 = Date.now();
    const clock = this.clock ? { remainingMs: this.remaining(side)!, incrementMs: this.settings.tc.increment * 1000 } : null;
    void chooseBotMove(seat.bot, this.chess, clock, this.rng)
      .then(async (d) => {
        if (this.status !== 'active' || this.version !== version) return;
        // resignation logic for strong bots in hopeless positions
        if (seat.bot.tier >= 4 && d.evalCp !== null && d.evalCp <= -1500) this.botLosingStreak[side]++;
        else this.botLosingStreak[side] = 0;
        if (this.botLosingStreak[side] >= 4 && this.moves.length > 30) {
          this.resign(side);
          return;
        }
        const wait = config.botDelay ? Math.max(0, d.thinkMs - (Date.now() - t0)) : 0;
        this.timers.bot = setTimeout(() => {
          if (this.status !== 'active' || this.version !== version) return;
          const err = this.move(side, d.uci);
          if (err) console.error(`[bot ${seat.bot.id}] move rejected: ${err} (${d.uci})`);
        }, wait);
      })
      .catch((e) => console.error('[bot] engine error', e));
  }

  private async botConsiderDraw(side: Side) {
    const seat = this.seats[side];
    if (seat.kind !== 'bot') return;
    const version = this.version;
    const ev = await botEval(this.chess);
    if (this.status !== 'active' || this.drawOffer !== other(side) || this.version !== version) return;
    const plies = this.moves.length;
    let accept = false;
    if (seat.bot.engine.avoidDraws) accept = ev < -400;
    else accept = ev < -120 || (Math.abs(ev) <= 40 && plies >= 60);
    if (accept) this.end({ winner: null, reason: 'agreement' });
    else {
      this.drawOffer = null;
      this.emit('update');
      this.emit('botMessage', side, 'declined_draw');
    }
  }

  // ------------------------------------------------------------------ analysis
  private liveAnalyze(ply: number) {
    const inputs = plyInputs(this.startFen, this.moves.slice(0, ply + 1).map((m) => m.uci));
    const inp = inputs[ply];
    const side: Side = ply % 2 === 0 ? 'w' : 'b';
    const humanMove = this.seats[side].kind === 'human';
    // only spend live analysis on human moves; bot moves get analysed after the game
    if (!humanMove) return;
    const priority = this.showLiveRatings ? 7 : 3;
    void ratePly(inp, ply, priority)
      .then((r) => {
        if (this.moves[ply]?.uci !== inp.uci) return; // taken back
        this.liveRatings.set(ply, r);
        if (this.showLiveRatings || this.status === 'ended') this.emit('rating', side, r);
      })
      .catch(() => {});
  }

  // ------------------------------------------------------------------ serialization
  seatInfo(side: Side): SeatInfo {
    const s = this.seats[side];
    if (s.kind === 'bot')
      return {
        kind: 'bot',
        id: s.bot.id,
        name: s.bot.name,
        icon: `bot.${s.bot.id}`,
        card: 'card.carbon',
        level: null,
        rating: s.bot.elo,
        provisional: false,
        connected: true,
      };
    return {
      kind: 'human',
      id: s.userId,
      name: s.username,
      icon: s.icon,
      card: s.card,
      level: s.level,
      rating: s.rating,
      provisional: s.provisional,
      connected: this.connected[side] > 0 || this.status === 'ended',
    };
  }

  state(viewer: Side | null): GameState {
    const now = Date.now();
    let abortIn: number | null = null;
    if (this.status === 'active' && this.moves.length < 2 && this.seats[this.turn].kind === 'human')
      abortIn = Math.max(0, this.turnStart + config.firstMoveAbortMs - now);
    let goneFor: number | null = null;
    if (viewer) {
      const at = this.disconnectedAt[other(viewer)];
      if (at !== null && this.status === 'active') goneFor = Math.max(0, at + config.disconnectForfeitMs - now);
    }
    return {
      id: this.id,
      mode: this.mode,
      settings: this.settings,
      category: this.category,
      white: this.seatInfo('w'),
      black: this.seatInfo('b'),
      moves: this.moves,
      fen: this.chess.fen(),
      clock: this.clock
        ? {
            w: this.clock.w,
            b: this.clock.b,
            running: this.clockRunning && this.status === 'active',
            turn: this.turn,
            elapsed: this.clockRunning && this.status === 'active' ? now - this.turnStart : 0,
          }
        : null,
      status: this.status,
      result: this.result,
      drawOffer: this.drawOffer,
      takebackOffer: this.takebackOffer,
      spectators: this.spectators.size,
      yourColor: viewer,
      startedAt: this.startedAt,
      abortIn,
      opponentGoneFor: goneFor,
      rematchOffer: this.rematchOffer,
      liveRatings: this.showLiveRatings,
    };
  }

  /** Live ratings visible to a viewer (own moves only, and only when allowed). */
  ratingsFor(side: Side | null): MoveRating[] {
    if (!side) return [];
    if (!this.showLiveRatings && this.status !== 'ended') return [];
    return [...this.liveRatings.values()].filter((r) => r.color === side).sort((a, b) => a.ply - b.ply);
  }
}

