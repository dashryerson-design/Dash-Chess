import fs from 'node:fs';
import path from 'node:path';
import { Chess } from 'chess.js';
import { config } from './config';

/**
 * Puzzles are generated offline by scripts/generate-puzzles.ts from engine self-play: positions where
 * exactly one move wins decisively, verified by Stockfish. Format:
 *   fen: position with the solver to move
 *   solution: uci moves, solver moves at even indices, forced opponent replies at odd indices
 */
export interface Puzzle {
  id: string;
  fen: string;
  solution: string[];
  rating: number;
  themes: string[];
}

let puzzles: Puzzle[] | null = null;

export function allPuzzles(): Puzzle[] {
  if (puzzles) return puzzles;
  const file = path.join(config.dataDir, 'puzzles.json');
  puzzles = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Puzzle[]) : [];
  return puzzles;
}

export function puzzleById(id: string) {
  return allPuzzles().find((p) => p.id === id) ?? null;
}

/** Deterministic daily puzzle. */
export function dailyPuzzle(d = new Date()): Puzzle | null {
  const all = allPuzzles();
  if (!all.length) return null;
  const day = Math.floor(d.getTime() / 86400000);
  return all[(day * 7919) % all.length];
}

/**
 * Verifies a full attempt. The final solver move is accepted if it is the stored move or any
 * other move that delivers checkmate.
 */
export function checkSolution(p: Puzzle, moves: string[]): boolean {
  if (!Array.isArray(moves) || moves.length !== p.solution.length) return false;
  const c = new Chess(p.fen);
  for (let i = 0; i < moves.length; i++) {
    const u = String(moves[i]);
    const solverMove = i % 2 === 0;
    try {
      c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    } catch {
      return false;
    }
    if (u === p.solution[i]) continue;
    if (solverMove && c.isCheckmate()) continue;
    return false;
  }
  return true;
}

/** The opponent's reply for an in-progress attempt; null if the solver's move is wrong. */
export function stepPuzzle(p: Puzzle, moves: string[]): { correct: boolean; reply: string | null; done: boolean } {
  const i = moves.length - 1;
  if (i < 0 || i % 2 !== 0 || i >= p.solution.length) return { correct: false, reply: null, done: false };
  const c = new Chess(p.fen);
  for (let k = 0; k < moves.length; k++) {
    const u = moves[k];
    try {
      c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    } catch {
      return { correct: false, reply: null, done: false };
    }
    if (k < i && u !== p.solution[k]) return { correct: false, reply: null, done: false };
  }
  const ok = moves[i] === p.solution[i] || c.isCheckmate();
  if (!ok) return { correct: false, reply: null, done: false };
  const done = i + 1 >= p.solution.length || c.isCheckmate();
  return { correct: true, reply: done ? null : p.solution[i + 1], done };
}
