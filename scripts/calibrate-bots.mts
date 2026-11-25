/**
 * Bot calibration tournament: plays bot-vs-bot games with the real server move selector and reports
 * scores plus style metrics. Usage: npx tsx scripts/calibrate-bots.mts [gamesPerPair] [a:b,c:d]
 */
import { Chess } from 'chess.js';
import { BOT_BY_ID, scoreToCp } from '../shared/src/index';
import { chooseBotMove, seededRng } from '../server/src/engine/botPlayer';
import { closePools, getAnalysisPool } from '../server/src/engine/uci';

const N = Number(process.argv[2] ?? 4);
const DEFAULT_PAIRS: [string, string, number?][] = [
  ['rookie', 'casual'],
  ['casual', 'defender'],
  ['attacker', 'tactician'],
  ['rookie', 'veteran'],
  ['tactician', 'veteran'],
  ['veteran', 'aggressor'],
  ['aggressor', 'grandmaster'],
  ['grandmaster', 'champion', 2],
];
// optional: "a:b,c:d" to run specific pairings
const PAIRS: [string, string, number?][] = process.argv[3] ? process.argv[3].split(',').map((x) => x.split(':') as [string, string]) : DEFAULT_PAIRS;

interface Style { moves: number; checks: number; captures: number; castlePly: number[]; sacrifices: number }
const style: Record<string, Style> = {};
const st = (id: string) => (style[id] ??= { moves: 0, checks: 0, captures: 0, castlePly: [], sacrifices: 0 });

async function game(whiteId: string, blackId: string, seed: number): Promise<number> {
  const c = new Chess();
  const rng = seededRng(seed);
  while (!c.isGameOver() && c.history().length < 220) {
    const id = c.turn() === 'w' ? whiteId : blackId;
    const d = await chooseBotMove(BOT_BY_ID[id], c, null, rng);
    const m = c.move({ from: d.uci.slice(0, 2), to: d.uci.slice(2, 4), promotion: d.uci[4] });
    const s = st(id);
    s.moves++;
    if (m.san.includes('+')) s.checks++;
    if (m.captured) s.captures++;
    if (m.isKingsideCastle() || m.isQueensideCastle()) s.castlePly.push(c.history().length);
  }
  if (c.isCheckmate()) return c.turn() === 'w' ? 0 : 1;
  if (c.isGameOver()) return 0.5;
  // adjudicate long games with the analysis engine
  const r = await getAnalysisPool().run((e) => e.search({ fen: c.fen(), depth: 14, multipv: 1, fresh: true }));
  const cp = r.lines[0] ? scoreToCp(r.lines[0].score) * (c.turn() === 'w' ? 1 : -1) : 0;
  return cp > 300 ? 1 : cp < -300 ? 0 : 0.5;
}

const t0 = Date.now();
const rows: string[] = [];
for (const [a, b, n = N] of PAIRS) {
  let scoreA = 0;
  const results = await Promise.all(
    Array.from({ length: n }, (_, i) => (i % 2 === 0 ? game(a, b, 1000 + i).then((r) => r) : game(b, a, 1000 + i).then((r) => 1 - r))),
  );
  for (const r of results) scoreA += r;
  const line = `${BOT_BY_ID[a].name.padEnd(15)} ${scoreA.toFixed(1)} - ${(n - scoreA).toFixed(1)}  ${BOT_BY_ID[b].name}`;
  rows.push(line);
  console.log(line, `(${Math.round((Date.now() - t0) / 1000)}s)`);
}
console.log('\nStyle metrics (per move):');
for (const [id, s] of Object.entries(style)) {
  const avgCastle = s.castlePly.length ? Math.round(s.castlePly.reduce((x, y) => x + y, 0) / s.castlePly.length) : '-';
  console.log(`${BOT_BY_ID[id].name.padEnd(15)} checks ${(s.checks / s.moves).toFixed(3)}  captures ${(s.captures / s.moves).toFixed(3)}  castled in ${s.castlePly.length} games (avg ply ${avgCastle})`);
}
closePools();
process.exit(0);
