// One-time setup: copies the browser engine and generates puzzles if they are missing.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
execSync('node scripts/copy-engine.mjs', { cwd: root, stdio: 'inherit' });
const puzzles = path.join(root, 'data', 'puzzles.json');
if (!fs.existsSync(puzzles) || JSON.parse(fs.readFileSync(puzzles, 'utf8')).length < 50) {
  console.log('Generating puzzles with Stockfish (a few minutes)...');
  execSync('npx tsx scripts/generate-puzzles.mts 160', { cwd: root, stdio: 'inherit' });
}
console.log('Setup complete. Run "npm run dev" for development or "npm run build && npm start" for production.');
