import type { Square } from 'chess.js';
import { FILES } from './types';
import type { PieceType } from '../cosmetics/pieces';

export interface PieceItem {
  id: number;
  type: PieceType;
  color: 'w' | 'b';
  square: Square;
  captured?: number;
}

let nextId = 1;
export const nextPieceId = () => nextId++;

export function parseBoard(fen: string): Map<Square, { type: PieceType; color: 'w' | 'b' }> {
  const m = new Map<Square, { type: PieceType; color: 'w' | 'b' }>();
  const rows = fen.split(' ')[0].split('/');
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r] ?? '') {
      if (/\d/.test(ch)) f += Number(ch);
      else {
        const sq = (FILES[f] + (8 - r)) as Square;
        m.set(sq, { type: ch.toLowerCase() as PieceType, color: ch === ch.toUpperCase() ? 'w' : 'b' });
        f++;
      }
    }
  }
  return m;
}

const dist = (a: string, b: string) => Math.abs(a.charCodeAt(0) - b.charCodeAt(0)) + Math.abs(Number(a[1]) - Number(b[1]));

/** Match new board against previous pieces so moved pieces keep their identity (and animate). */
export function diffPieces(prev: PieceItem[], fen: string): { pieces: PieceItem[]; captured: PieceItem[] } {
  const board = parseBoard(fen);
  const live = prev.filter((p) => !p.captured);
  const out: PieceItem[] = [];
  const unmatchedPrev = new Set(live);
  const unmatchedNew: Square[] = [];
  for (const [sq, pc] of board) {
    const stay = live.find((p) => p.square === sq && p.type === pc.type && p.color === pc.color && unmatchedPrev.has(p));
    if (stay) {
      unmatchedPrev.delete(stay);
      out.push(stay);
    } else unmatchedNew.push(sq);
  }
  for (const sq of unmatchedNew) {
    const pc = board.get(sq)!;
    let best: PieceItem | null = null;
    for (const p of unmatchedPrev) if (p.type === pc.type && p.color === pc.color && (!best || dist(p.square, sq) < dist(best.square, sq))) best = p;
    if (!best) for (const p of unmatchedPrev) if (p.type === 'p' && p.color === pc.color && (!best || dist(p.square, sq) < dist(best.square, sq))) best = p;
    if (best && dist(best.square, sq) <= 14) {
      unmatchedPrev.delete(best);
      out.push({ ...best, square: sq, type: pc.type });
    } else out.push({ id: nextId++, type: pc.type, color: pc.color, square: sq });
  }
  const captured = [...unmatchedPrev].map((p) => ({ ...p, captured: Date.now() }));
  return { pieces: out, captured };
}

