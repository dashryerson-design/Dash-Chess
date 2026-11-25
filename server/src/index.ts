import { createApp } from './app';
import { config } from './config';
import { openingCount } from './openings';
import { allPuzzles } from './puzzles';

const app = await createApp({ logger: false });
console.log(`DC Chess server listening on ${app.url.replace('127.0.0.1', config.host)} (port ${config.port})`);
console.log(`  database: ${config.dbPath}`);
console.log(`  engine:   ${config.stockfishPath || 'bundled Stockfish 18 lite (WASM)'}, analysis depth ${config.analysisDepth}`);
console.log(`  openings: ${openingCount()} named positions, puzzles: ${allPuzzles().length}`);

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
