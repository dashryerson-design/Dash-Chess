/**
 * Admin "hacker mode" move suggestions.
 *
 * Context-aware: the engine receives the whole game (so it sees repetitions), the search budget
 * follows the clock, positions with <= 7 pieces use perfect Syzygy tablebase play, and every style
 * is constrained so it can never turn a winning position into a draw or a loss. Styles only choose
 * between moves that keep the result the engine expects.
 */
import { Chess, type Move, type Square } from 'chess.js';
import { engine, type EngineLine } from '../engine/clientEngine';
import { pickStyledMove, type HackStyle } from './hackerStyles';

const START = new Chess().fen();
const cpOf = (l: EngineLine) => (l.mate !== null ? (l.mate > 0 ? 10000 - l.mate * 10 : -10000 - l.mate * 10) : l.cp ?? 0);
const wp = (cp: number) => 1 / (1 + Math.exp(-0.00368208 * cp));
const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

let startFen = START;
function replay(ucis: string[]) {
  const c = new Chess(startFen);
  for (const u of ucis) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  return c;
}
function play(c: Chess, u: string) {
  return c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
}
/** Would this move end the game in a draw (stalemate, threefold, 50-move, insufficient material)? */
function drawsImmediately(history: string[], u: string) {
  const c = replay(history);
  play(c, u);
  return !c.isCheckmate() && (c.isStalemate() || c.isThreefoldRepetition() || c.isDrawByFiftyMoves() || c.isInsufficientMaterial());
}

// ------------------------------------------------------------------------------------------------ tablebase

interface TbMove { uci: string; category: string; dtz: number | null; dtm: number | null }
async function tablebase(fen: string): Promise<string | null> {
  const pieces = fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length;
  if (pieces > 7) return null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(`https://tablebase.lichess.ovh/standard?fen=${encodeURIComponent(fen)}`, { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const data = (await r.json()) as { moves: TbMove[] };
    if (!data.moves?.length) return null;
    // the API lists moves best-first for the side to move (fastest win, else draw, else longest loss)
    return data.moves[0].uci;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------------------------------------ Alien Gambit book (Witty Alien)
// Caro-Kann: 1.e4 c6 2.d4 d5 3.Nc3 dxe4 4.Nxe4 Nf6 5.Ng5!? h6 6.Nxf7!? Kxf7 7.Nf3 (7.Ne5+ / Bc4+ ideas follow)

const ALIEN_WHITE: Record<string, string> = {
  '': 'e2e4',
  'e2e4 c7c6': 'd2d4',
  'e2e4 c7c6 d2d4 d7d5': 'b1c3',
  'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4': 'c3e4',
  'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 g8f6': 'e4g5',
  'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 g8f6 e4g5 h7h6': 'g5f7',
  'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 g8f6 e4g5 h7h6 g5f7 e8f7': 'g1f3',
};

function alienBook(history: string[]): string | null {
  if (history.length % 2 !== 0) return null; // the Alien Gambit is a White weapon
  return ALIEN_WHITE[history.join(' ')] ?? null;
}

// ------------------------------------------------------------------------------------------------ bait detection (Intelligent Sacrificing)

/**
 * For a candidate, look at the opponent's replies: natural-looking captures/checks that lose a lot
 * compared with their best reply are "bait". Returns a bonus in centipawns.
 */
async function baitScore(history: string[], u: string, depth: number): Promise<number> {
  const c = replay(history);
  const mv = play(c, u);
  if (c.isGameOver()) return 0;
  const replies = c.moves({ verbose: true });
  const lines = await engine.search(startFen, { moves: [...history, u], depth: Math.max(8, depth - 6), multipv: Math.min(8, replies.length) });
  if (lines.length < 2) return 0;
  const oppBest = cpOf(lines[0]);
  let bonus = 0;
  for (const l of lines.slice(1)) {
    const r = replies.find((m) => m.from + m.to + (m.promotion ?? '') === l.pv[0]);
    if (!r) continue;
    const tempting = !!r.captured && (r.to === mv.to || VAL[r.captured] >= 3);
    const loses = oppBest - cpOf(l);
    if (tempting && loses >= 150) bonus += Math.min(250, loses * 0.5);
  }
  // capturing on the square we just moved to must actually be legal and look like free material
  const offered = replies.some((r) => r.to === mv.to && r.captured);
  return offered ? bonus : bonus * 0.5;
}

function isSacrifice(history: string[], u: string): boolean {
  const c = replay(history);
  const mv = play(c, u);
  if (mv.piece === 'k') return false;
  const opp = mv.color === 'w' ? 'b' : 'w';
  const attackers = c.attackers(mv.to as Square, opp);
  return attackers.length > 0 && VAL[mv.piece] - (mv.captured ? VAL[mv.captured] : 0) >= 2;
}

// ------------------------------------------------------------------------------------------------ main entry

export interface Suggestion {
  uci: string;
  source: 'book' | 'tablebase' | 'engine';
}

export async function suggestMove(history: string[], style: HackStyle, clockMs: number | null, isAlive: () => boolean, fromFen: string = START): Promise<Suggestion | null> {
  startFen = fromFen;
  const c = replay(history);
  const legal = c.moves({ verbose: true });
  if (!legal.length) return null;
  if (legal.length === 1) return { uci: uciOf(legal[0]), source: 'engine' };

  // 1. perfect endgame play
  const tb = await tablebase(c.fen());
  if (tb && legal.some((m) => uciOf(m) === tb)) return { uci: tb, source: 'tablebase' };
  if (!isAlive()) return null;

  // 2. Alien Gambit opening book
  if (style === 'alien' && startFen === START) {
    const book = alienBook(history);
    if (book && legal.some((m) => uciOf(m) === book)) return { uci: book, source: 'book' };
  }

  // 3. deep, history-aware engine search; budget follows the clock
  const movetime = clockMs === null ? 3500 : Math.max(400, Math.min(6000, clockMs / 25));
  const multipv = style === 'goat' ? 3 : 8;
  const lines = await engine.search(startFen, { moves: history, depth: 30, movetime, multipv: Math.min(multipv, legal.length) });
  if (!isAlive() || !lines.length) return null;

  const best = cpOf(lines[0]);
  // forced mate: always take the fastest one
  if (lines[0].mate !== null && lines[0].mate > 0) return { uci: lines[0].pv[0], source: 'engine' };

  // never throw away a win: drop drawing moves when better, and moves that cost the result
  const safe = lines.filter((l) => {
    const u = l.pv[0];
    if (!u) return false;
    if (best > 120 && drawsImmediately(history, u)) return false;
    const v = cpOf(l);
    if (best > 300 && v < 200) return false; // winning must stay winning
    if (best > -100 && wp(best) - wp(v) > 0.06) return false; // no more than 6% expected-score loss
    return true;
  });
  // when clearly losing, a forced draw is a great result
  if (best < -250) {
    const drawing = lines.find((l) => l.pv[0] && drawsImmediately(history, l.pv[0]));
    if (drawing) return { uci: drawing.pv[0], source: 'engine' };
  }
  const pool = safe.length ? safe : [lines[0]];
  if (style === 'goat') return { uci: pool[0].pv[0], source: 'engine' };

  if (style === 'sacrifice') {
    // rank sound candidates by sacrifice + bait value
    let pick = { uci: pool[0].pv[0], u: -Infinity };
    for (const l of pool.slice(0, 5)) {
      if (!isAlive()) return null;
      const u = l.pv[0];
      const sac = isSacrifice(history, u) ? 120 : 0;
      const bait = await baitScore(history, u, 18);
      const util = cpOf(l) + sac + bait;
      if (util > pick.u) pick = { uci: u, u: util };
    }
    return { uci: pick.uci, source: 'engine' };
  }

  const styled = pickStyledMove(c.fen(), pool, style);
  return { uci: styled?.uci ?? pool[0].pv[0], source: 'engine' };
}

const uciOf = (m: Move) => m.from + m.to + (m.promotion ?? '');

// test hook (admin feature only)
(globalThis as any).__dcSuggest = suggestMove;
