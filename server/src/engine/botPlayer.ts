import { Chess, type Move, type Square, type PieceSymbol, type Color } from 'chess.js';
import { scoreToCp, type BotProfile } from '@dc/shared';
import { getBotPool } from './uci';

const VAL: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export type Rng = () => number;
export function seededRng(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

const fileOf = (sq: string) => sq.charCodeAt(0) - 97;
const rankOf = (sq: string) => Number(sq[1]) - 1;
const dist = (a: string, b: string) => Math.max(Math.abs(fileOf(a) - fileOf(b)), Math.abs(rankOf(a) - rankOf(b)));

function kingSquare(chess: Chess, color: Color): Square {
  return chess.findPiece({ type: 'k', color })[0];
}

export function nonPawnMaterial(chess: Chess): number {
  let m = 0;
  for (const row of chess.board()) for (const p of row) if (p && p.type !== 'p' && p.type !== 'k') m += VAL[p.type];
  return m;
}

export function isEndgame(chess: Chess) {
  return nonPawnMaterial(chess) <= 14;
}

/** Hand-crafted features describing *how* a move plays, used for personality. */
export function moveFeatures(chess: Chess, m: Move) {
  const me = m.color;
  const opp: Color = me === 'w' ? 'b' : 'w';
  const enemyKing = kingSquare(chess, opp);
  const ownKing = kingSquare(chess, me);
  const captured = m.captured ? VAL[m.captured] : 0;
  const moving = VAL[m.piece];
  const check = m.san.includes('+') || m.san.includes('#');
  const castle = m.isKingsideCastle() || m.isQueensideCastle();
  const endgame = isEndgame(chess);
  const opening = chess.history().length < 20;

  const after = new Chess(m.after);
  const relRank = (sq: string) => (me === 'w' ? rankOf(sq) : 7 - rankOf(sq));

  // aggression: getting closer to the enemy king (not for the king itself)
  let aggression = 0;
  if (m.piece !== 'k') aggression = (dist(m.from, enemyKing) - dist(m.to, enemyKing)) * (m.piece === 'q' ? 1.2 : m.piece === 'p' ? 0.4 : 0.8);
  // pressure: attacks on squares around enemy king after the move
  let pressure = 0;
  for (let df = -1; df <= 1; df++)
    for (let dr = -1; dr <= 1; dr++) {
      const f = fileOf(enemyKing) + df;
      const r = rankOf(enemyKing) + dr;
      if (f < 0 || f > 7 || r < 0 || r > 7) continue;
      const sq = (String.fromCharCode(97 + f) + (r + 1)) as Square;
      if (after.isAttacked(sq, me)) pressure++;
    }
  aggression += pressure * 0.15;

  let kingSafety = 0;
  if (castle) kingSafety += 2;
  if (m.piece === 'k' && !castle && !endgame) kingSafety -= 1.5;
  if (m.piece === 'p' && !endgame && Math.abs(fileOf(m.from) - fileOf(ownKing)) <= 1 && relRank(ownKing) === 0) kingSafety -= 1;
  if (m.piece !== 'p' && m.piece !== 'k' && dist(m.to, ownKing) <= 2 && dist(m.from, ownKing) > 2) kingSafety += 0.6;

  const trade = captured > 0 && Math.abs(captured - moving) <= 0.5 ? 1 : 0;

  // Offered material: moved piece is attacked by a cheaper piece or hangs.
  let sacrifice = 0;
  if (m.piece !== 'k') {
    const attackers = after.attackers(m.to as Square, opp);
    if (attackers.length) {
      const minAtt = Math.min(...attackers.map((s) => VAL[after.get(s)!.type] || 99));
      const defended = after.attackers(m.to as Square, me).length > 0;
      const lose = moving - captured;
      if (lose >= 1 && (!defended || minAtt < moving)) sacrifice = Math.min(3, lose / 2);
    }
  }

  let pawnStorm = 0;
  if (m.piece === 'p' && Math.abs(fileOf(m.to) - fileOf(enemyKing)) <= 2 && !endgame) pawnStorm = relRank(m.to) >= 3 ? 1 : 0.5;

  let positional = 0;
  const center = ['d4', 'e4', 'd5', 'e5'];
  const ring = ['c3', 'd3', 'e3', 'f3', 'c4', 'f4', 'c5', 'f5', 'c6', 'd6', 'e6', 'f6'];
  if (center.includes(m.to)) positional += 1;
  else if (ring.includes(m.to)) positional += 0.5;
  if (opening && (m.piece === 'n' || m.piece === 'b') && relRank(m.from) === 0) positional += 1;
  if (opening && m.piece === 'q' && chess.history().length < 10) positional -= 1;
  if ((m.piece === 'n' || m.piece === 'b') && relRank(m.to) === 0) positional -= 0.5;

  const quiet = !captured && !check && !(m.piece === 'p' && relRank(m.to) >= 4) ? 1 : 0;

  return { captured, check, aggression, kingSafety, trade, sacrifice, pawnStorm, positional, quiet };
}

function styleBonus(bot: BotProfile, f: ReturnType<typeof moveFeatures>, materialLead: number): number {
  const s = bot.engine.style;
  let b = 0;
  b += s.aggression * f.aggression;
  b += s.kingSafety * f.kingSafety;
  b += s.captures * f.captured * 0.5;
  // Exchangers like trades more when ahead
  b += s.trades * f.trade * (materialLead > 0 ? 1.5 : 1);
  b += s.checks * (f.check ? 1 : 0);
  b += s.sacrifice * f.sacrifice;
  b += s.pawnStorm * f.pawnStorm;
  b += s.positional * f.positional;
  b += s.quiet * f.quiet;
  return b;
}

function materialBalance(chess: Chess, color: Color) {
  let m = 0;
  for (const row of chess.board()) for (const p of row) if (p) m += (p.color === color ? 1 : -1) * VAL[p.type];
  return m;
}

/** A "human" blunder: a plausible-looking move picked without calculation. */
function plausibleRandomMove(chess: Chess, rng: Rng): Move {
  const moves = chess.moves({ verbose: true });
  const weights = moves.map((m) => {
    let w = 1;
    if (m.captured) w += 2 + VAL[m.captured] * 0.5;
    if (m.san.includes('+')) w += 1.5;
    if (m.promotion) w += 3;
    if (m.piece === 'k' && !m.isKingsideCastle() && !m.isQueensideCastle()) w *= 0.4;
    return w;
  });
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < moves.length; i++) {
    r -= weights[i];
    if (r <= 0) return moves[i];
  }
  return moves[moves.length - 1];
}

export interface BotDecision {
  uci: string;
  evalCp: number | null;
  thinkMs: number;
  reason: string;
}

export interface BotClock {
  remainingMs: number;
  incrementMs: number;
}

export async function chooseBotMove(bot: BotProfile, chess: Chess, clock: BotClock | null, rng: Rng = Math.random): Promise<BotDecision> {
  const cfg = bot.engine;
  const legal = chess.moves({ verbose: true });
  if (legal.length === 0) throw new Error('no legal moves');
  const me = chess.turn();
  if (legal.length === 1) return { uci: uciOf(legal[0]), evalCp: null, thinkMs: 250, reason: 'forced' };

  if (rng() < cfg.blunderRate) {
    const m = plausibleRandomMove(chess, rng);
    return { uci: uciOf(m), evalCp: null, thinkMs: humanDelay(bot, clock, rng, false), reason: 'blunder' };
  }

  const endgame = isEndgame(chess);
  const tactical = legal.some((m) => m.captured || m.san.includes('+'));
  let nodes = cfg.nodes;
  if (endgame && cfg.endgameNodesFactor) nodes *= cfg.endgameNodesFactor;
  if (!endgame && cfg.middlegameNodesFactor) nodes *= cfg.middlegameNodesFactor;
  if (tactical && cfg.tacticalNodesFactor) nodes *= cfg.tacticalNodesFactor;
  nodes = Math.round(nodes);

  let movetime: number | undefined;
  if (clock) {
    const budget = clock.remainingMs / 28 + clock.incrementMs * 0.75;
    movetime = Math.max(60, Math.min(budget, clock.remainingMs / 6, 8000));
  }

  const multipv = Math.min(cfg.multipv, legal.length);
  const res = await getBotPool().run((e) => e.search({ fen: chess.fen(), nodes, movetime, multipv }), 10);
  const lines = res.lines.filter((l) => legal.some((m) => uciOf(m) === l.move));
  if (lines.length === 0) {
    const fallback = res.bestmove ?? uciOf(legal[0]);
    return { uci: fallback, evalCp: null, thinkMs: humanDelay(bot, clock, rng, tactical), reason: 'fallback' };
  }

  const cps = lines.map((l) => scoreToCp(l.score));
  const bestCp = cps[0];
  let temperature = cfg.temperature;
  let window = cfg.tolerance;
  let reason = 'style';

  if (cfg.counterpunch && bestCp >= 150) {
    temperature = 0;
    window = 10;
    reason = 'counterpunch';
  } else if (rng() < cfg.mistakeRate) {
    window = cfg.mistakeWindow;
    reason = 'mistake';
  }
  // Never throw away a forced mate when it has been found (except deliberate blunders above).
  if (lines[0].score.mate !== undefined && lines[0].score.mate > 0 && lines[0].score.mate <= 2) {
    window = 0;
    temperature = 0;
  }

  const lead = materialBalance(chess, me);
  const candidates = lines
    .map((l, i) => ({ line: l, cp: cps[i], move: legal.find((m) => uciOf(m) === l.move)! }))
    .filter((c) => c.cp >= bestCp - window);

  // Trapper: look one ply deeper for natural-looking opponent replies that lose material.
  const trapBonus = new Map<string, number>();
  if (cfg.trapSearch) {
    for (const c of candidates.slice(0, 3)) {
      const after = new Chess(c.move.after);
      if (after.isGameOver()) continue;
      const replies = after.moves({ verbose: true });
      const r = await getBotPool().run((e) => e.search({ fen: after.fen(), nodes: 6000, multipv: Math.min(6, replies.length) }), 10);
      if (!r.lines.length) continue;
      const oppBest = scoreToCp(r.lines[0].score);
      let traps = 0;
      for (const l of r.lines.slice(1)) {
        const rm = replies.find((m) => uciOf(m) === l.move);
        const natural = rm && (rm.captured || rm.san.includes('+'));
        if (natural && oppBest - scoreToCp(l.score) >= 200) traps++;
      }
      // Also count tempting captures not shown in MultiPV that hang material at 1-ply.
      trapBonus.set(c.line.move, traps * 30);
    }
  }

  const scored = candidates.map((c) => {
    const f = moveFeatures(chess, c.move);
    let u = c.cp + styleBonus(bot, f, lead) + (trapBonus.get(c.line.move) ?? 0);
    if (cfg.avoidDraws && c.cp > -150) {
      const after = new Chess();
      // replay history to detect repetition
      after.loadPgn(chess.pgn());
      after.move(c.move);
      if (after.isThreefoldRepetition() || after.isDraw()) u -= 400;
    }
    return { ...c, u };
  });

  let pick = scored[0];
  if (temperature <= 0) {
    for (const s of scored) if (s.u > pick.u) pick = s;
  } else {
    const maxU = Math.max(...scored.map((s) => s.u));
    const w = scored.map((s) => Math.exp((s.u - maxU) / temperature));
    let r = rng() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < scored.length; i++) {
      r -= w[i];
      if (r <= 0) {
        pick = scored[i];
        break;
      }
    }
  }
  return { uci: pick.line.move, evalCp: pick.cp, thinkMs: humanDelay(bot, clock, rng, tactical), reason };
}

/** Bot's own evaluation of the current position (bot POV), used for draw / resign decisions. */
export async function botEval(chess: Chess, nodes = 40000): Promise<number> {
  const r = await getBotPool().run((e) => e.search({ fen: chess.fen(), nodes, multipv: 1 }), 8);
  return r.lines[0] ? scoreToCp(r.lines[0].score) : 0;
}

function humanDelay(bot: BotProfile, clock: BotClock | null, rng: Rng, complex: boolean): number {
  let base = 350 + rng() * 900 + (complex ? 300 : 0) + bot.tier * 60;
  if (clock) base = Math.min(base, clock.remainingMs / 40 + clock.incrementMs * 0.3);
  return Math.max(150, Math.round(base));
}

export const uciOf = (m: Move) => m.from + m.to + (m.promotion ?? '');
