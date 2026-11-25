/**
 * Generates data/puzzles.json from engine self-play.
 *
 * A strong engine plays a deliberately error-prone opponent. After each opponent move we check whether
 * the side to move now has exactly one decisive move (MultiPV gap). The solution is extended while each
 * solver move remains unique. Every puzzle is therefore verified by Stockfish.
 *
 *   npx tsx scripts/generate-puzzles.mts [count]
 */
import fs from 'node:fs';
import path from 'node:path';
import { Chess } from 'chess.js';
import { EnginePool } from '../server/src/engine/uci';
import { detectSacrifice, scoreToCp, type Score } from '../shared/src/classification';

const TARGET = Number(process.argv[2] ?? 160);
const pool = new EnginePool('puzzle', 3);
const out: { id: string; fen: string; solution: string[]; rating: number; themes: string[] }[] = [];
const seen = new Set<string>();
let seed = 12345;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const nonPawn = (c: Chess) => c.board().flat().reduce((s, p) => s + (p && p.type !== 'p' && p.type !== 'k' ? VAL[p.type] : 0), 0);

async function multi(fen: string, depth: number, k = 2) {
  return pool.run((e) => e.search({ fen, depth, multipv: k, fresh: true }));
}

function uniqueGap(lines: { score: Score }[]): number {
  if (lines.length < 2) return 9999;
  return scoreToCp(lines[0].score) - scoreToCp(lines[1].score);
}

async function tryPuzzle(fen: string): Promise<void> {
  const key = fen.split(' ').slice(0, 4).join(' ');
  if (seen.has(key)) return;
  seen.add(key);
  const first = await multi(fen, 14);
  if (!first.lines.length) return;
  const best = first.lines[0];
  const bestCp = scoreToCp(best.score);
  const isMate = best.score.mate !== undefined && best.score.mate > 0 && best.score.mate <= 4;
  if (!isMate && (bestCp < 280 || bestCp > 1500)) return;
  if (uniqueGap(first.lines) < (isMate ? 150 : 250)) return;
  const second = first.lines[1] ? scoreToCp(first.lines[1].score) : -9999;
  if (!isMate && second > 120) return;

  // build solution
  const c = new Chess(fen);
  const solution: string[] = [];
  let pv = best.pv;
  for (let step = 0; step < 4; step++) {
    const mv = pv[0];
    if (!mv) break;
    c.move({ from: mv.slice(0, 2), to: mv.slice(2, 4), promotion: mv[4] });
    solution.push(mv);
    if (c.isGameOver()) break;
    const reply = pv[1];
    if (!reply || (!isMate && solution.length >= 2)) break;
    c.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
    const nxt = await multi(c.fen(), 13);
    if (!nxt.lines.length || uniqueGap(nxt.lines) < 200) {
      c.undo();
      break;
    }
    solution.push(reply);
    pv = nxt.lines[0].pv;
  }
  if (solution.length % 2 === 0) solution.pop();
  if (!solution.length) return;

  const shallow = await pool.run((e) => e.search({ fen, depth: 4, multipv: 1, fresh: true }));
  const easy = shallow.lines[0]?.move === best.move;
  const solverMoves = Math.ceil(solution.length / 2);
  const themes: string[] = [];
  const start = new Chess(fen);
  const m0 = start.move({ from: solution[0].slice(0, 2), to: solution[0].slice(2, 4), promotion: solution[0][4] });
  if (isMate) themes.push(`Mate in ${best.score.mate}`);
  if (m0.promotion) themes.push('Promotion');
  if (detectSacrifice(fen, solution[0], best.pv)) themes.push('Sacrifice');
  if (m0.captured && !isMate) themes.push('Winning material');
  if (m0.san.includes('+')) themes.push('Check');
  // fork: the moved piece attacks two or more valuable pieces
  const after = new Chess(m0.after);
  const attacked = after
    .board()
    .flat()
    .filter((p) => p && p.color !== m0.color && VAL[p.type] >= 3 || (p && p.type === 'k' && p.color !== m0.color))
    .filter((p) => after.attackers(p!.square, m0.color).includes(m0.to as any));
  if (attacked.length >= 2) themes.push('Fork');
  if (nonPawn(start) <= 14) themes.push('Endgame');
  else if (start.moveNumber() <= 15) themes.push('Opening');
  else themes.push('Middlegame');
  const h = [...key].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rating = Math.round(900 + (easy ? 0 : 450) + (solverMoves - 1) * 220 + (isMate ? 0 : 80) + (h % 160) - 80);
  out.push({ id: `pz${String(out.length + 1).padStart(4, '0')}`, fen, solution, rating, themes });
  process.stdout.write(`\rpuzzles: ${out.length}/${TARGET}   `);
}

async function playGame(g: number) {
  const c = new Chess();
  const strong = g % 2 === 0 ? 'w' : 'b';
  // varied openings: a few random plausible moves
  for (let i = 0; i < 4 + Math.floor(rnd() * 4); i++) {
    const ms = c.moves();
    c.move(ms[Math.floor(rnd() * ms.length)]);
  }
  while (!c.isGameOver() && c.history().length < 160 && out.length < TARGET) {
    const turn = c.turn();
    let move: string | null = null;
    if (turn !== strong && rnd() < 0.3) {
      // a "human" error: plausible but unchecked move
      const ms = c.moves({ verbose: true });
      const caps = ms.filter((m) => m.captured || m.san.includes('+'));
      const pick = caps.length && rnd() < 0.5 ? caps[Math.floor(rnd() * caps.length)] : ms[Math.floor(rnd() * ms.length)];
      move = pick.from + pick.to + (pick.promotion ?? '');
    } else {
      const r = await pool.run((e) => e.search({ fen: c.fen(), nodes: turn === strong ? 60000 : 4000, multipv: 1 }));
      move = r.bestmove;
    }
    if (!move) break;
    c.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
    if (turn !== strong && !c.isGameOver()) await tryPuzzle(c.fen());
  }
}

const t0 = Date.now();
let g = 0;
const workers = Array.from({ length: 3 }, async () => {
  while (out.length < TARGET) await playGame(g++);
});
await Promise.all(workers);
pool.close();
out.sort((a, b) => a.rating - b.rating);
out.forEach((p, i) => (p.id = `pz${String(i + 1).padStart(4, '0')}`));
const file = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data', 'puzzles.json');
fs.writeFileSync(file, JSON.stringify(out.slice(0, TARGET), null, 0));
console.log(`\nwrote ${Math.min(out.length, TARGET)} puzzles in ${Math.round((Date.now() - t0) / 1000)}s -> ${file}`);
process.exit(0);
