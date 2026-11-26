import type { Square } from 'chess.js';

export type Side = 'w' | 'b';
export interface Arrow {
  from: Square;
  to: Square;
  color: string;
}
export interface Marker {
  square: Square;
  color: string;
  key: string | number;
}

export interface BoardProps {
  fen: string;
  orientation: Side;
  /** which colour the user may move (null = view only) */
  movable: Side | 'both' | null;
  lastMove?: [Square, Square] | null;
  premove?: [Square, Square] | null;
  hint?: [Square, Square] | null;
  /** 'hacker mode' suggestion: green target square with a hologram of the piece */
  ghost?: { from: Square; to: Square; piece: string } | null;
  arrows?: Arrow[];
  markers?: Marker[];
  allowPremove?: boolean;
  onMove?: (from: Square, to: Square, promotion?: string) => boolean | void;
  onPremove?: (from: Square, to: Square, promotion?: string) => void;
  onPremoveCancel?: () => void;
  /** override cosmetics (previews) */
  pieceSet?: string;
  boardId?: string;
  environmentId?: string;
  className?: string;
  /** force a renderer regardless of settings */
  mode?: '2d' | '3d';
  /** a move event key to trigger effects (changes on each new move) */
  moveKey?: string | number;
  showCoordinates?: boolean;
  compact?: boolean;
}

export const FILES = 'abcdefgh';

export function squareXY(sq: string, orientation: Side): [number, number] {
  const f = FILES.indexOf(sq[0]);
  const r = Number(sq[1]) - 1;
  return orientation === 'w' ? [f, 7 - r] : [7 - f, r];
}

export function xyToSquare(x: number, y: number, orientation: Side): Square | null {
  if (x < 0 || x > 7 || y < 0 || y > 7) return null;
  const f = orientation === 'w' ? x : 7 - x;
  const r = orientation === 'w' ? 7 - y : y;
  return (FILES[f] + (r + 1)) as Square;
}

/** Centre of a square in percent of the board (for overlays). */
export function squareCenterPct(sq: string, orientation: Side): [number, number] {
  const [x, y] = squareXY(sq, orientation);
  return [(x + 0.5) * 12.5, (y + 0.5) * 12.5];
}
