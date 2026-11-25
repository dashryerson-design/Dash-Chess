import { Chess } from 'chess.js';
import { classifyMove, gameAccuracy, type MoveRating, type PlyEngineData, type Score } from '@dc/shared';
import { getAnalysisPool, type UciEngine } from './uci';
import { config } from '../config';
import type { DB } from '../db';

/**
 * Engine-powered move analysis.
 *  1. MultiPV search of the position before the move (fixed depth, cleared hash => deterministic)
 *  2. If the played move is not among the top lines, a `searchmoves` search of the played move at
 *     the same depth (so its evaluation is directly comparable)
 *  3. A shallow search to estimate difficulty / engine stability
 * Results are cached by (depth, position, move) in memory and in SQLite.
 */
const mem = new Map<string, PlyEngineData>();
const MEM_MAX = 20000;
let db: DB | null = null;
export function setAnalysisDb(d: DB) {
  db = d;
}

const keyOf = (fen: string, uci: string, depth: number) => `${depth}|${fen}|${uci}`;

function cacheGet(key: string): PlyEngineData | null {
  const m = mem.get(key);
  if (m) return m;
  if (db) {
    const row = db.prepare('SELECT data FROM analysis_cache WHERE key = ?').get(key) as { data: string } | undefined;
    if (row) {
      const d = JSON.parse(row.data) as PlyEngineData;
      memSet(key, d);
      return d;
    }
  }
  return null;
}
function memSet(key: string, d: PlyEngineData) {
  if (mem.size >= MEM_MAX) mem.delete(mem.keys().next().value!);
  mem.set(key, d);
}
function cacheSet(key: string, d: PlyEngineData) {
  memSet(key, d);
  db?.prepare('INSERT OR REPLACE INTO analysis_cache (key, data) VALUES (?, ?)').run(key, JSON.stringify(d));
}

async function evalPlayed(e: UciEngine, fen: string, uci: string, depth: number) {
  const r = await e.search({ fen, depth, multipv: 1, searchmoves: [uci], fresh: true });
  if (r.lines[0] && r.lines[0].move === uci) return { move: uci, score: r.lines[0].score, pv: r.lines[0].pv };
  // Fallback: evaluate the resulting position and negate.
  const c = new Chess(fen);
  c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  if (c.isCheckmate()) return { move: uci, score: { mate: 1 } as Score, pv: [uci] };
  if (c.isDraw() || c.isStalemate()) return { move: uci, score: { cp: 0 } as Score, pv: [uci] };
  const r2 = await e.search({ fen: c.fen(), depth: Math.max(1, depth - 1), multipv: 1, fresh: true });
  const s = r2.lines[0]?.score ?? { cp: 0 };
  const neg: Score = s.mate !== undefined ? { mate: s.mate > 0 ? -s.mate : -s.mate + 1 } : { cp: -s.cp };
  return { move: uci, score: neg, pv: [uci, ...(r2.lines[0]?.pv ?? [])] };
}

export async function analyzePly(fen: string, uci: string, priority = 5, depth = config.analysisDepth): Promise<PlyEngineData> {
  const key = keyOf(fen, uci, depth);
  const hit = cacheGet(key);
  if (hit) return hit;
  const data = await getAnalysisPool().run(async (e) => {
    const main = await e.search({ fen, depth, multipv: config.analysisMultiPv, fresh: true });
    const lines = main.lines.map(({ move, score, pv }) => ({ move, score, pv }));
    let played = lines.find((l) => l.move === uci) ?? null;
    if (!played) played = await evalPlayed(e, fen, uci, depth);
    const sh = await e.search({ fen, depth: config.shallowDepth, multipv: 1, fresh: true });
    const result: PlyEngineData = {
      depth,
      lines,
      played,
      shallowBest: sh.lines[0]?.move ?? null,
      shallowScore: sh.lines[0]?.score ?? null,
    };
    return result;
  }, priority);
  cacheSet(key, data);
  return data;
}

export interface PlyInput {
  fenBefore: string;
  uci: string;
  prevUci: string | null;
  prevWasCapture: boolean;
}

export function plyInputs(startFen: string, ucis: string[]): PlyInput[] {
  const c = new Chess(startFen);
  const out: PlyInput[] = [];
  let prev: { uci: string; capture: boolean } | null = null;
  for (const uci of ucis) {
    const fenBefore = c.fen();
    const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    out.push({ fenBefore, uci, prevUci: prev?.uci ?? null, prevWasCapture: prev?.capture ?? false });
    prev = { uci, capture: m.isCapture() };
  }
  return out;
}

export async function ratePly(input: PlyInput, ply: number, priority = 5): Promise<MoveRating> {
  const data = await analyzePly(input.fenBefore, input.uci, priority);
  return classifyMove({ fenBefore: input.fenBefore, uci: input.uci, prevUci: input.prevUci, prevWasCapture: input.prevWasCapture }, data, ply);
}

export async function analyzeGame(startFen: string, ucis: string[], priority = 1): Promise<{ ratings: MoveRating[]; accuracy: { w: number; b: number } }> {
  const inputs = plyInputs(startFen, ucis);
  const ratings = await Promise.all(inputs.map((inp, i) => ratePly(inp, i, priority)));
  const acc = (c: 'w' | 'b') => gameAccuracy(ratings.filter((r) => r.color === c && !r.flags.includes('forced')).map((r) => r.accuracy));
  return { ratings, accuracy: { w: acc('w'), b: acc('b') } };
}
