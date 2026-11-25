/**
 * Piece silhouettes in a 100x100 box (x centred on 0, y downwards, base at y=92).
 * Staunton pieces are defined by lathe profiles (radius, height) so the exact same profile can
 * be turned into 3D LatheGeometry; additions (heads, crowns, crosses, knight head) are paths.
 */
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Family = 'staunton' | 'geometric';

export type Prim =
  | { kind: 'profile'; pts: [number, number][] }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'path'; d: string }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx?: number };

export interface PieceShape {
  prims: Prim[];
  /** decorative lines drawn on top of the fill */
  details: string[];
  /** dark accents (eyes, slits) */
  cuts: string[];
}

const base = (r: number): [number, number][] => [
  [r, 92],
  [r, 86.5],
  [r - 2.5, 84.5],
  [r - 4, 81],
];

export const STAUNTON_PROFILES: Record<PieceType, [number, number][]> = {
  p: [...base(30), [21, 78.5], [15, 71], [11.5, 63], [16.5, 59], [16.5, 56], [10, 53.5], [0, 53.5]],
  r: [...base(32), [24, 77.5], [20.5, 71], [19, 46], [20, 38], [24.5, 35], [24.5, 31], [0, 31]],
  n: [...base(31), [22, 78], [0, 78]],
  b: [...base(30), [21, 78], [14.5, 69], [10.5, 59], [16.5, 56], [16.5, 52.5], [9, 50.5], [0, 50.5]],
  q: [...base(33), [23, 78], [15.5, 67], [11.5, 52], [17.5, 48.5], [17.5, 45.5], [11.5, 43.5], [13.5, 37], [22.5, 25.5], [0, 25.5]],
  k: [...base(33), [23, 78], [15.5, 67], [12.5, 51], [18.5, 47.5], [18.5, 44.5], [12.5, 42.5], [14.5, 35], [20.5, 25.5], [0, 25.5]],
};

export const KNIGHT_HEAD =
  'M 19,79 C 25,63 27,45 21,31 C 17,21 9,14 0,12.5 L -3,4.5 L -8,11.5 C -16,15 -24,23 -28.5,33.5 C -31,38.5 -31,43 -27.5,45.5 C -24,48 -18.5,47.5 -14.5,45 C -11,43 -7.5,43 -5,46 C -11,55 -17,65 -19,79 Z';

export const STAUNTON: Record<PieceType, PieceShape> = {
  p: {
    prims: [{ kind: 'profile', pts: STAUNTON_PROFILES.p }, { kind: 'circle', cx: 0, cy: 39.5, r: 14.5 }],
    details: ['M -16.5,59 L 16.5,59', 'M -24,81 L 24,81'],
    cuts: [],
  },
  r: {
    prims: [
      { kind: 'profile', pts: STAUNTON_PROFILES.r },
      { kind: 'rect', x: -24.5, y: 17, w: 11, h: 15 },
      { kind: 'rect', x: -5.5, y: 17, w: 11, h: 15 },
      { kind: 'rect', x: 13.5, y: 17, w: 11, h: 15 },
    ],
    details: ['M -20,71 L 20,71', 'M -24.5,35 L 24.5,35', 'M -26,81 L 26,81'],
    cuts: [],
  },
  n: {
    prims: [{ kind: 'profile', pts: STAUNTON_PROFILES.n }, { kind: 'path', d: KNIGHT_HEAD }],
    details: ['M -1,14 C 10,18 18,30 18.5,48', 'M -26,81 L 26,81'],
    cuts: ['M -14.5,26.5 a 2.6,2.6 0 1,0 0.01,0 Z', 'M -26.5,40 a 1.4,1.4 0 1,0 0.01,0 Z'],
  },
  b: {
    prims: [
      { kind: 'profile', pts: STAUNTON_PROFILES.b },
      { kind: 'path', d: 'M 0,19 C 10,26.5 16.5,37 14,45.5 C 12.5,50.5 7,53 0,53 C -7,53 -12.5,50.5 -14,45.5 C -16.5,37 -10,26.5 0,19 Z' },
      { kind: 'circle', cx: 0, cy: 15.5, r: 5.2 },
    ],
    details: ['M -16.5,56 L 16.5,56', 'M -24,81 L 24,81'],
    cuts: ['M -6,30 L 6.5,41'],
  },
  q: {
    prims: [
      { kind: 'profile', pts: STAUNTON_PROFILES.q },
      { kind: 'path', d: 'M -23,26.5 L -24.5,13.5 L -15.5,24 L -11.5,11 L -5,23 L 0,9 L 5,23 L 11.5,11 L 15.5,24 L 24.5,13.5 L 23,26.5 Z' },
      { kind: 'circle', cx: -24.5, cy: 12.5, r: 3.6 },
      { kind: 'circle', cx: -11.5, cy: 10, r: 3.6 },
      { kind: 'circle', cx: 0, cy: 7.5, r: 4.2 },
      { kind: 'circle', cx: 11.5, cy: 10, r: 3.6 },
      { kind: 'circle', cx: 24.5, cy: 12.5, r: 3.6 },
    ],
    details: ['M -17.5,48.5 L 17.5,48.5', 'M -22.5,26.5 L 22.5,26.5', 'M -28,81 L 28,81'],
    cuts: [],
  },
  k: {
    prims: [
      { kind: 'profile', pts: STAUNTON_PROFILES.k },
      { kind: 'path', d: 'M -20.5,26.5 C -19,18.5 -9,15.5 0,15.5 C 9,15.5 19,18.5 20.5,26.5 Z' },
      { kind: 'rect', x: -3.2, y: 1.5, w: 6.4, h: 16, rx: 1 },
      { kind: 'rect', x: -9, y: 6, w: 18, h: 6, rx: 1 },
    ],
    details: ['M -18.5,47.5 L 18.5,47.5', 'M -20.5,26.5 L 20.5,26.5', 'M -28,81 L 28,81'],
    cuts: [],
  },
};

export const GEOMETRIC: Record<PieceType, PieceShape> = {
  p: {
    prims: [{ kind: 'path', d: 'M -21,91 L 21,91 L 11,58 L -11,58 Z' }, { kind: 'circle', cx: 0, cy: 43, r: 14 }],
    details: [],
    cuts: [],
  },
  r: {
    prims: [
      { kind: 'path', d: 'M -24,91 L 24,91 L 19,40 L -19,40 Z' },
      { kind: 'path', d: 'M -24,40 L -24,17 L -14,17 L -14,25 L -5,25 L -5,17 L 5,17 L 5,25 L 14,25 L 14,17 L 24,17 L 24,40 Z' },
    ],
    details: ['M -21,58 L 21,58'],
    cuts: [],
  },
  n: {
    prims: [{ kind: 'path', d: 'M -22,91 L 24,91 L 24,54 L 16,20 L 0,9 L -4,14 L -26,32 L -24,46 L -6,41 L -18,66 Z' }],
    details: ['M 2,12 L 17,24'],
    cuts: ['M -12,26 L -7,26 L -7,30 L -12,30 Z'],
  },
  b: {
    prims: [
      { kind: 'path', d: 'M -22,91 L 22,91 L 9,60 L 17,40 L 0,12 L -17,40 L -9,60 Z' },
      { kind: 'circle', cx: 0, cy: 10, r: 5 },
    ],
    details: ['M -9,60 L 9,60'],
    cuts: ['M -7,33 L 6,45'],
  },
  q: {
    prims: [{ kind: 'path', d: 'M -25,91 L 25,91 L 18,58 L 28,18 L 13,38 L 0,8 L -13,38 L -28,18 L -18,58 Z' }],
    details: ['M -18,58 L 18,58'],
    cuts: [],
  },
  k: {
    prims: [
      { kind: 'path', d: 'M -24,91 L 24,91 L 16,42 L -16,42 Z' },
      { kind: 'rect', x: -20, y: 30, w: 40, h: 12 },
      { kind: 'rect', x: -3.5, y: 3, w: 7, h: 27 },
      { kind: 'rect', x: -11, y: 10, w: 22, h: 7 },
    ],
    details: ['M -18,60 L 18,60'],
    cuts: [],
  },
};

/** Smooth closed silhouette from a lathe profile (mirrored). */
export function profilePath(pts: [number, number][]): string {
  const right = pts.map(([r, y]) => [r, y] as [number, number]);
  const left = [...pts].reverse().map(([r, y]) => [-r, y] as [number, number]);
  const all = [...right, ...left];
  let d = `M ${all[0][0]},${all[0][1]}`;
  for (let i = 1; i < all.length; i++) d += ` L ${all[i][0].toFixed(2)},${all[i][1].toFixed(2)}`;
  return d + ' Z';
}

export function primToSvg(p: Prim): string {
  switch (p.kind) {
    case 'profile':
      return `<path d="${profilePath(p.pts)}"/>`;
    case 'circle':
      return `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}"/>`;
    case 'path':
      return `<path d="${p.d}"/>`;
    case 'rect':
      return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.rx ?? 0.6}"/>`;
  }
}
