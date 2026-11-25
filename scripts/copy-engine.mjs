// Copies the Stockfish WASM build into client/public so the browser can load it in a Web Worker.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules', 'stockfish', 'bin');
const dst = path.join(root, 'client', 'public', 'engine');
fs.mkdirSync(dst, { recursive: true });
for (const f of ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm']) {
  const to = path.join(dst, f);
  if (!fs.existsSync(to) || fs.statSync(to).size !== fs.statSync(path.join(src, f)).size) fs.copyFileSync(path.join(src, f), to);
}
console.log('engine copied to client/public/engine');
