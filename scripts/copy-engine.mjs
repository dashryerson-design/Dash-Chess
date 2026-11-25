// Copies the Stockfish WASM build (and, for the serverless build, the static data) into client/public.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const copy = (src, dstDir, f) => {
  fs.mkdirSync(dstDir, { recursive: true });
  const to = path.join(dstDir, f);
  const from = path.join(src, f);
  if (!fs.existsSync(to) || fs.statSync(to).size !== fs.statSync(from).size) fs.copyFileSync(from, to);
};
for (const f of ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm']) copy(path.join(root, 'node_modules', 'stockfish', 'bin'), path.join(root, 'client', 'public', 'engine'), f);
for (const f of ['a.tsv', 'b.tsv', 'c.tsv', 'd.tsv', 'e.tsv', 'puzzles.json']) copy(path.join(root, 'data'), path.join(root, 'client', 'public', 'data'), f);
console.log('engine + data copied to client/public');
