import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../..');

const num = (v: string | undefined, d: number) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 3001),
  host: process.env.HOST ?? '0.0.0.0',
  dbPath: process.env.DB_PATH ?? path.join(ROOT, 'data', 'dc-chess.db'),
  clientDist: process.env.CLIENT_DIST ?? path.join(ROOT, 'client', 'dist'),
  dataDir: path.join(ROOT, 'data'),
  /** Optional path to a native Stockfish binary (much faster than the bundled WASM build). */
  stockfishPath: process.env.STOCKFISH_PATH ?? '',
  stockfishWasm: path.join(ROOT, 'node_modules', 'stockfish', 'bin', 'stockfish-18-lite-single.js'),
  botEngines: num(process.env.BOT_ENGINES, 2),
  analysisEngines: num(process.env.ANALYSIS_ENGINES, 2),
  /** Fixed analysis depth => deterministic, reproducible move classifications. */
  analysisDepth: num(process.env.ANALYSIS_DEPTH, 12),
  shallowDepth: 6,
  analysisMultiPv: 3,
  cookieSecure: process.env.COOKIE_SECURE === '1',
  sessionDays: 30,
  /** Disconnected players forfeit after this long (ms) */
  disconnectForfeitMs: num(process.env.DISCONNECT_FORFEIT_MS, 60_000),
  /** Game auto-aborts if a side does not make its first move in time */
  firstMoveAbortMs: num(process.env.FIRST_MOVE_ABORT_MS, 30_000),
  /** Faster bots for automated tests */
  botDelay: process.env.BOT_DELAY !== '0',
  isTest: process.env.NODE_ENV === 'test',
  isProd: process.env.NODE_ENV === 'production',
  /** Two accounts on the same network may not play ranked against each other (production default). */
  blockSameIpRanked: process.env.BLOCK_SAME_IP_RANKED ? process.env.BLOCK_SAME_IP_RANKED === '1' : process.env.NODE_ENV === 'production',
};
