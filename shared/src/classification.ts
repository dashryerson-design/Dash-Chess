import { Chess, type Square, type PieceSymbol, type Color } from 'chess.js';

/**
 * DC Chess move classification.
 *
 * Works on the *expected score* scale (win probability for the side to move) rather than raw
 * centipawns, so that the same centipawn loss matters more in balanced positions than in
 * already-decided ones. On top of the expected-score loss we look at:
 *  - forced moves (only one legal move)
 *  - obvious recaptures / trivial check evasions (cannot be Great/Incredible)
 *  - "only move" situations (gap to the second-best alternative)
 *  - sacrifices (material deliberately given up along the engine's principal variation)
 *  - difficulty (a shallow search prefers a different move = hard to find)
 *  - engine uncertainty (shallow vs deep evaluation disagree => widen tolerance for negatives)
 *  - missed short mates
 *
 * The function is pure and deterministic: identical inputs always yield identical output.
 */

export type MoveClass = 'incredible' | 'great' | 'good' | 'decent' | 'okay' | 'bad' | 'blunder';
export const MOVE_CLASSES: MoveClass[] = ['incredible', 'great', 'good', 'decent', 'okay', 'bad', 'blunder'];

export const CLASS_META: Record<MoveClass, { label: string; color: string; symbol: string }> = {
  incredible: { label: 'Incredible', color: '#b45cff', symbol: '!!' },
  great: { label: 'Great', color: '#22c55e', symbol: '!' },
  good: { label: 'Good', color: '#86efac', symbol: '' },
  decent: { label: 'Decent', color: '#60a5fa', symbol: '' },
  okay: { label: 'Okay', color: '#a3a3a3', symbol: '?!' },
  bad: { label: 'Bad', color: '#fb923c', symbol: '?' },
  blunder: { label: 'Blunder', color: '#ef4444', symbol: '??' },
};

/** Engine score from the point of view of the side to move. */
export type Score = { cp: number; mate?: undefined } | { mate: number; cp?: undefined };

export interface EngineLine {
  move: string; // uci
  score: Score;
  pv: string[]; // uci, starting with `move`
}

export interface PlyEngineData {
  depth: number;
  /** MultiPV lines for the position before the move (mover POV), best first */
  lines: EngineLine[];
  /** the played move searched at the same depth (mover POV) */
  played: EngineLine;
  /** best move / score from a shallow search, used to estimate difficulty & stability */
  shallowBest: string | null;
  shallowScore: Score | null;
}

export interface MoveRating {
  ply: number; // 0-based half-move index
  color: Color;
  san: string;
  uci: string;
  cls: MoveClass;
  /** expected-score loss 0..1 */
  loss: number;
  accuracy: number;
  /** evals from White's point of view, centipawns (mates mapped to +-10000) */
  evalBest: number;
  evalPlayed: number;
  bestMove: string;
  bestSan: string;
  flags: string[];
}

const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function winProb(score: Score): number {
  if (score.mate !== undefined) {
    if (score.mate > 0) return 1;
    if (score.mate < 0) return 0;
    return 0; // mated now
  }
  return 1 / (1 + Math.exp(-0.00368208 * score.cp));
}

export function scoreToCp(score: Score): number {
  if (score.mate !== undefined) {
    if (score.mate === 0) return -10000;
    return score.mate > 0 ? 10000 - score.mate * 10 : -10000 - score.mate * 10;
  }
  return Math.max(-9999, Math.min(9999, score.cp));
}

/** Per-move accuracy (0..100) from expected-score loss — same shape as the lichess formula. */
export function moveAccuracy(loss: number): number {
  const a = 103.1668 * Math.exp(-0.04354 * (loss * 100)) - 3.1669;
  return Math.max(0, Math.min(100, a));
}

/** Game accuracy: blend of arithmetic and harmonic mean (harmonic punishes blunders). */
export function gameAccuracy(accs: number[]): number {
  if (accs.length === 0) return 0;
  const mean = accs.reduce((s, a) => s + a, 0) / accs.length;
  const harm = accs.length / accs.reduce((s, a) => s + 1 / Math.max(a, 1), 0);
  return Math.round(((mean + harm) / 2) * 10) / 10;
}

function material(chess: Chess, color: Color): number {
  let m = 0;
  for (const row of chess.board()) for (const p of row) if (p) m += (p.color === color ? 1 : -1) * PIECE_VALUE[p.type];
  return m;
}

function applyUci(chess: Chess, uci: string): boolean {
  try {
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
    return true;
  } catch {
    return false;
  }
}

/**
 * Sacrifice detection: following the engine's principal variation for the played move,
 * the mover is down >= 2 points of material after the opponent's replies (checked after
 * ply 2 and ply 4 of the PV) compared to before the move — or the moved piece is left
 * en prise to a cheaper attacker / undefended (an offered sacrifice the opponent may decline).
 */
export function detectSacrifice(fenBefore: string, uci: string, pv: string[]): boolean {
  const chess = new Chess(fenBefore);
  const mover = chess.turn();
  const m0 = material(chess, mover);
  if (!applyUci(chess, uci)) return false;

  // Offered sacrifice: moved piece hangs to a cheaper piece or is undefended & attacked.
  const to = uci.slice(2, 4) as Square;
  const piece = chess.get(to);
  if (piece && piece.type !== 'p' && piece.type !== 'k' && !chess.isCheckmate()) {
    const opp: Color = mover === 'w' ? 'b' : 'w';
    const attackers = chess.attackers(to, opp);
    if (attackers.length > 0) {
      const minAttacker = Math.min(...attackers.map((s) => PIECE_VALUE[chess.get(s)!.type] || 100));
      const defended = chess.attackers(to, mover).length > 0;
      const captured = new Chess(fenBefore).get(to);
      const gain = captured ? PIECE_VALUE[captured.type] : 0;
      const value = PIECE_VALUE[piece.type];
      if (value - gain >= 2 && (!defended || minAttacker <= value - 2)) return true;
    }
  }

  const checkpoints: number[] = [];
  for (let i = 1; i < Math.min(pv.length, 5); i++) {
    if (!applyUci(chess, pv[i])) break;
    if (i === 1 || i === 3) checkpoints.push(m0 - material(chess, mover));
  }
  if (checkpoints.length === 0) return false;
  return checkpoints.every((d) => d >= 2);
}

export interface ClassifyContext {
  fenBefore: string;
  uci: string;
  /** previous move (uci) in the game, for recapture detection */
  prevUci?: string | null;
  prevWasCapture?: boolean;
}

export function classifyMove(ctx: ClassifyContext, data: PlyEngineData, ply: number): MoveRating {
  const chess = new Chess(ctx.fenBefore);
  const color = chess.turn();
  const legal = chess.moves({ verbose: true });
  const inCheck = chess.inCheck();
  const mv = legal.find((m) => m.from + m.to + (m.promotion ?? '') === ctx.uci);
  if (!mv) throw new Error(`illegal move ${ctx.uci} in ${ctx.fenBefore}`);
  const after = new Chess(ctx.fenBefore);
  after.move(mv);
  const deliversMate = after.isCheckmate();

  const best = data.lines[0] ?? data.played;
  const playedIsBest = best.move === ctx.uci;
  const playedScore = playedIsBest ? best.score : data.played.score;
  const wpBest = winProb(best.score);
  const wpPlayed = deliversMate ? 1 : winProb(playedScore);
  let loss = playedIsBest ? 0 : Math.max(0, wpBest - wpPlayed);

  const flags: string[] = [];
  const forced = legal.length === 1;
  if (forced) flags.push('forced');

  const isCapture = mv.isCapture();
  const recapture = !!(isCapture && ctx.prevWasCapture && ctx.prevUci && ctx.prevUci.slice(2, 4) === mv.to);
  if (recapture) flags.push('recapture');

  // Best alternative that is not the played move.
  const alt = data.lines.find((l) => l.move !== ctx.uci) ?? null;
  const wpAlt = alt ? winProb(alt.score) : null;
  const gap = wpAlt !== null ? wpPlayed - wpAlt : 0;

  // Engine uncertainty: shallow and deep evaluation of the position disagree strongly.
  const deepCp = scoreToCp(best.score);
  const shallowCp = data.shallowScore ? scoreToCp(data.shallowScore) : deepCp;
  const uncertain = Math.abs(deepCp - shallowCp) > 180 && Math.abs(deepCp) < 2000;
  if (uncertain) flags.push('complex');
  const hardToFind = data.shallowBest !== null && data.shallowBest !== ctx.uci;

  // ---- Base classification on expected-score loss ----
  const widen = uncertain ? 1.25 : 1;
  let cls: MoveClass;
  if (loss <= 0.02) cls = 'good';
  else if (loss <= 0.05) cls = 'decent';
  else if (loss <= 0.1 * widen) cls = 'okay';
  else if (loss <= 0.2 * widen) cls = 'bad';
  else cls = 'blunder';

  // Missing a short forced mate while staying winning is not "good".
  if (best.score.mate !== undefined && best.score.mate > 0 && best.score.mate <= 3 && !deliversMate) {
    const stillMating = playedScore.mate !== undefined && playedScore.mate > 0;
    if (!stillMating && (cls === 'good' || cls === 'decent')) {
      cls = 'okay';
      flags.push('missed_mate');
    }
  }

  if (forced) {
    cls = 'good';
    loss = 0;
  } else if (cls === 'good' && (playedIsBest || loss <= 0.005)) {
    // ---- Positive classifications ----
    const trivialEvasion = inCheck && legal.length <= 3;
    const obvious = recapture || trivialEvasion || deliversMate;
    if (deliversMate) flags.push('mate');
    const sacrifice = !obvious && detectSacrifice(ctx.fenBefore, ctx.uci, playedIsBest ? best.pv : data.played.pv);
    if (sacrifice) flags.push('sacrifice');
    const onlyMove = wpAlt !== null && gap >= 0.15;
    if (onlyMove) flags.push('only_move');
    const alternativesFine = wpAlt !== null && wpAlt >= 0.85; // position already comfortably won anyway
    const savesGame = wpAlt !== null && wpAlt < 0.25 && wpPlayed >= 0.4;
    if (savesGame) flags.push('defensive_resource');

    if (!obvious && wpAlt !== null) {
      const incredibleSac = sacrifice && gap >= 0.08 && wpPlayed >= 0.5 && wpAlt < 0.8;
      const incredibleFind = hardToFind && gap >= 0.25 && wpPlayed >= 0.45 && !alternativesFine;
      const incredibleSave = savesGame && hardToFind && gap >= 0.3;
      if (incredibleSac || incredibleFind || incredibleSave) cls = 'incredible';
      else if ((onlyMove && !alternativesFine && wpPlayed >= 0.25) || (savesGame && gap >= 0.15)) cls = 'great';
    }
  }

  const sanBest = (() => {
    const b = legal.find((m) => m.from + m.to + (m.promotion ?? '') === best.move);
    return b ? b.san : best.move;
  })();

  const sign = color === 'w' ? 1 : -1;
  return {
    ply,
    color,
    san: mv.san,
    uci: ctx.uci,
    cls,
    loss: Math.round(loss * 10000) / 10000,
    accuracy: Math.round(moveAccuracy(loss) * 10) / 10,
    evalBest: sign * scoreToCp(best.score),
    evalPlayed: deliversMate ? sign * 10000 : sign * scoreToCp(playedScore),
    bestMove: best.move,
    bestSan: sanBest,
    flags,
  };
}

export type ClassCounts = Record<MoveClass, number>;
export function emptyCounts(): ClassCounts {
  return { incredible: 0, great: 0, good: 0, decent: 0, okay: 0, bad: 0, blunder: 0 };
}
export function countClasses(ratings: MoveRating[], color?: Color): ClassCounts {
  const c = emptyCounts();
  for (const r of ratings) if (!color || r.color === color) c[r.cls]++;
  return c;
}
