import { GEOMETRIC, STAUNTON, primToSvg, type Family, type PieceType } from './pieceShapes';

export type { PieceType };
type C = 'w' | 'b';

interface Material {
  defs: string;
  fill: string;
  outline: string;
  outlineW: number;
  detail: string;
  detailW?: number;
  cut: string;
  /** markup rendered inside the silhouette clip (textures, facets) */
  overlay?: string;
  shade: number;
  glow?: { color: string; std: number };
}

export interface PieceSetVisual {
  family: Family;
  mat: (c: C) => Material;
  /** parameters for the 3D renderer */
  three: (c: C) => {
    color: string;
    roughness: number;
    metalness: number;
    emissive?: string;
    emissiveIntensity?: number;
    opacity?: number;
    transmission?: boolean;
    texture?: 'wood' | 'marble' | 'none';
    vein?: string;
    animated?: boolean;
    clearcoat?: number;
  };
}

const lin = (id: string, stops: [number, string, number?][], x2 = 0, y2 = 1) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops
    .map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`)
    .join('')}</linearGradient>`;

const woodGrain = (dark: string, op: number, seed: number) =>
  `<filter id="wg" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.32" numOctaves="2" seed="${seed}"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -2.4 1.3"/></filter>` +
  `<mask id="wm"><rect x="-50" y="0" width="100" height="100" fill="white" filter="url(#wg)"/></mask>` +
  `__OVERLAY__<rect x="-50" y="0" width="100" height="100" fill="${dark}" opacity="${op}" mask="url(#wm)"/>`;

const marbleVeins = (vein: string, op: number, seed: number) =>
  `<filter id="mv" x="0" y="0" width="1" height="1"><feTurbulence type="turbulence" baseFrequency="0.035 0.05" numOctaves="4" seed="${seed}"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -9 2.1"/></filter>` +
  `<mask id="mm"><rect x="-50" y="0" width="100" height="100" fill="white" filter="url(#mv)"/></mask>` +
  `__OVERLAY__<rect x="-50" y="0" width="100" height="100" fill="${vein}" opacity="${op}" mask="url(#mm)"/>`;

/** split helper: texture strings contain defs before __OVERLAY__ and overlay markup after */
function tex(s: string): { defs: string; overlay: string } {
  const [d, o] = s.split('__OVERLAY__');
  return { defs: d, overlay: o };
}

const SETS: Record<string, PieceSetVisual> = {
  'pieces.classic': {
    family: 'staunton',
    mat: (c) =>
      c === 'w'
        ? { defs: lin('f', [[0, '#fffdf8'], [1, '#e3d8c6']]), fill: 'url(#f)', outline: '#17130e', outlineW: 3.4, detail: '#8a7558', cut: '#17130e', shade: 0.2 }
        : { defs: lin('f', [[0, '#45454d'], [1, '#141417']]), fill: 'url(#f)', outline: '#000000', outlineW: 3.4, detail: '#8d8d99', cut: '#000', shade: 0.25 },
    three: (c) => (c === 'w' ? { color: '#efe6d6', roughness: 0.45, metalness: 0, clearcoat: 0.4 } : { color: '#2e2e35', roughness: 0.35, metalness: 0.05, clearcoat: 0.6 }),
  },
  'pieces.modern': {
    family: 'staunton',
    mat: (c) =>
      c === 'w'
        ? { defs: lin('f', [[0, '#ffffff'], [0.55, '#eef1f6'], [1, '#c3cad6']], 1, 1), fill: 'url(#f)', outline: '#2a303c', outlineW: 2.4, detail: '#aab2c0', cut: '#2a303c', shade: 0.16 }
        : { defs: lin('f', [[0, '#3b4252'], [0.55, '#232834'], [1, '#0d1016']], 1, 1), fill: 'url(#f)', outline: '#9ba6bb', outlineW: 2.2, detail: '#59637a', cut: '#9ba6bb', shade: 0.2 },
    three: (c) => (c === 'w' ? { color: '#f4f6fa', roughness: 0.32, metalness: 0.05, clearcoat: 0.8 } : { color: '#272c38', roughness: 0.32, metalness: 0.1, clearcoat: 0.8 }),
  },
  'pieces.minimalist': {
    family: 'geometric',
    mat: (c) =>
      c === 'w'
        ? { defs: '', fill: '#f1f1f1', outline: '#151515', outlineW: 2, detail: '#bdbdbd', cut: '#151515', shade: 0 }
        : { defs: '', fill: '#1d1d1d', outline: '#6e6e6e', outlineW: 2, detail: '#4a4a4a', cut: '#6e6e6e', shade: 0 },
    three: (c) => (c === 'w' ? { color: '#efefef', roughness: 0.85, metalness: 0 } : { color: '#202020', roughness: 0.85, metalness: 0 }),
  },
  'pieces.wooden': {
    family: 'staunton',
    mat: (c) => {
      const t = tex(woodGrain(c === 'w' ? '#9a6a33' : '#1c0a04', c === 'w' ? 0.45 : 0.55, c === 'w' ? 4 : 9));
      return c === 'w'
        ? { defs: lin('f', [[0, '#f6dcaa'], [1, '#c8975a']]) + t.defs, fill: 'url(#f)', overlay: t.overlay, outline: '#3a220f', outlineW: 2.8, detail: '#9c6c37', cut: '#3a220f', shade: 0.22 }
        : { defs: lin('f', [[0, '#8a4a28'], [1, '#3b1a0c']]) + t.defs, fill: 'url(#f)', overlay: t.overlay, outline: '#120602', outlineW: 2.8, detail: '#c58456', cut: '#120602', shade: 0.25 };
    },
    three: (c) => (c === 'w' ? { color: '#e2bd84', roughness: 0.6, metalness: 0, texture: 'wood', vein: '#a8743c' } : { color: '#5c2b14', roughness: 0.55, metalness: 0, texture: 'wood', vein: '#2a1006' }),
  },
  'pieces.marble': {
    family: 'staunton',
    mat: (c) => {
      const t = tex(marbleVeins(c === 'w' ? '#8b8f99' : '#e9e9ee', c === 'w' ? 0.34 : 0.3, c === 'w' ? 7 : 21));
      return c === 'w'
        ? { defs: lin('f', [[0, '#fbfbf9'], [1, '#dcdcd6']]) + t.defs, fill: 'url(#f)', overlay: t.overlay, outline: '#33343a', outlineW: 2.6, detail: '#a5a7ad', cut: '#33343a', shade: 0.2 }
        : { defs: lin('f', [[0, '#2c2c31'], [1, '#0f0f12']]) + t.defs, fill: 'url(#f)', overlay: t.overlay, outline: '#000', outlineW: 2.6, detail: '#6d6d75', cut: '#000', shade: 0.22 };
    },
    three: (c) => (c === 'w' ? { color: '#f1f1ee', roughness: 0.22, metalness: 0, texture: 'marble', vein: '#8b8f99', clearcoat: 1 } : { color: '#18181b', roughness: 0.2, metalness: 0, texture: 'marble', vein: '#cfcfd6', clearcoat: 1 }),
  },
  'pieces.metallic': {
    family: 'staunton',
    mat: (c) =>
      c === 'w'
        ? { defs: lin('f', [[0, '#f7f9fc'], [0.25, '#a9b2bf'], [0.48, '#ffffff'], [0.72, '#7f8999'], [1, '#e2e6ec']], 1, 0), fill: 'url(#f)', outline: '#252a32', outlineW: 2.6, detail: '#5e6775', cut: '#252a32', shade: 0.1 }
        : { defs: lin('f', [[0, '#646b78'], [0.28, '#1e2229'], [0.5, '#737a88'], [0.75, '#15181d'], [1, '#4a505c']], 1, 0), fill: 'url(#f)', outline: '#000', outlineW: 2.6, detail: '#9aa2b0', cut: '#000', shade: 0.1 },
    three: (c) => (c === 'w' ? { color: '#d7dde6', roughness: 0.18, metalness: 1 } : { color: '#3a3f48', roughness: 0.25, metalness: 1 }),
  },
  'pieces.futuristic': {
    family: 'geometric',
    mat: (c) =>
      c === 'w'
        ? {
            defs: lin('f', [[0, '#eef6ff'], [1, '#9fb4cc']], 1, 1),
            fill: 'url(#f)',
            outline: '#0b1828',
            outlineW: 2.4,
            detail: '#26d9ff',
            detailW: 2.4,
            cut: '#26d9ff',
            shade: 0.18,
            overlay: '<path d="M -50,62 L 50,62" stroke="#26d9ff" stroke-width="1.6" opacity="0.9"/>',
          }
        : {
            defs: lin('f', [[0, '#26314a'], [1, '#080b14']], 1, 1),
            fill: 'url(#f)',
            outline: '#000',
            outlineW: 2.4,
            detail: '#ff7a2f',
            detailW: 2.4,
            cut: '#ff7a2f',
            shade: 0.18,
            overlay: '<path d="M -50,62 L 50,62" stroke="#ff7a2f" stroke-width="1.6" opacity="0.9"/>',
          },
    three: (c) =>
      c === 'w'
        ? { color: '#c9d8ea', roughness: 0.3, metalness: 0.6, emissive: '#26d9ff', emissiveIntensity: 0.18 }
        : { color: '#1b2236', roughness: 0.3, metalness: 0.6, emissive: '#ff7a2f', emissiveIntensity: 0.2 },
  },
  'pieces.neon': {
    family: 'staunton',
    mat: (c) => {
      const col = c === 'w' ? '#3ff3ff' : '#ff3df2';
      return { defs: '', fill: c === 'w' ? '#061418' : '#18061a', outline: col, outlineW: 2.4, detail: col, cut: col, shade: 0, glow: { color: col, std: 1.6 } };
    },
    three: (c) =>
      c === 'w'
        ? { color: '#0b2a30', roughness: 0.4, metalness: 0.2, emissive: '#3ff3ff', emissiveIntensity: 0.9 }
        : { color: '#2a0b2c', roughness: 0.4, metalness: 0.2, emissive: '#ff3df2', emissiveIntensity: 0.9 },
  },
  'pieces.crystal': {
    family: 'staunton',
    mat: (c) =>
      c === 'w'
        ? {
            defs: lin('f', [[0, '#ffffff', 0.95], [0.5, '#bfe8ff', 0.55], [1, '#6fb8ea', 0.75]], 1, 1),
            fill: 'url(#f)',
            outline: '#d8f3ff',
            outlineW: 1.8,
            detail: '#ffffff',
            cut: '#3a86c0',
            shade: 0,
            overlay: '<path d="M -50,10 L 10,100 M -30,0 L 40,100 M 0,0 L 50,70" stroke="white" stroke-width="1.2" opacity="0.45"/>',
            glow: { color: '#9ad8ff', std: 1 },
          }
        : {
            defs: lin('f', [[0, '#e3c4ff', 0.9], [0.5, '#7a3fd0', 0.6], [1, '#2b0d5e', 0.85]], 1, 1),
            fill: 'url(#f)',
            outline: '#d8b4ff',
            outlineW: 1.8,
            detail: '#f0e0ff',
            cut: '#f0e0ff',
            shade: 0,
            overlay: '<path d="M -50,10 L 10,100 M -30,0 L 40,100 M 0,0 L 50,70" stroke="white" stroke-width="1.2" opacity="0.35"/>',
            glow: { color: '#b07bff', std: 1 },
          },
    three: (c) =>
      c === 'w'
        ? { color: '#d9f1ff', roughness: 0.05, metalness: 0, opacity: 0.62, transmission: true }
        : { color: '#6a2fc0', roughness: 0.05, metalness: 0, opacity: 0.72, transmission: true },
  },
  'pieces.animated': {
    family: 'staunton',
    mat: (c) => {
      const [a, b2, d] = c === 'w' ? ['#fff2c2', '#58e6d2', '#ffd36a'] : ['#5a2bff', '#ff3dc8', '#1e8bff'];
      const anim = `<linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"><animate attributeName="stop-color" values="${a};${b2};${d};${a}" dur="4s" repeatCount="indefinite"/></stop><stop offset="1" stop-color="${b2}"><animate attributeName="stop-color" values="${b2};${d};${a};${b2}" dur="4s" repeatCount="indefinite"/></stop></linearGradient>`;
      return {
        defs: anim,
        fill: 'url(#f)',
        outline: c === 'w' ? '#2a1e05' : '#0a0420',
        outlineW: 2.8,
        detail: c === 'w' ? '#fff' : '#e3d6ff',
        cut: c === 'w' ? '#2a1e05' : '#0a0420',
        shade: 0.18,
        glow: { color: c === 'w' ? '#ffe38a' : '#a57bff', std: 1.2 },
        overlay: `<rect x="-90" y="0" width="30" height="100" fill="white" opacity="0.35" transform="skewX(-20)"><animate attributeName="x" values="-90;80" dur="2.6s" repeatCount="indefinite"/></rect>`,
      };
    },
    three: (c) =>
      c === 'w'
        ? { color: '#ffe7a8', roughness: 0.3, metalness: 0.4, emissive: '#ffbf3d', emissiveIntensity: 0.35, animated: true }
        : { color: '#4a24c9', roughness: 0.3, metalness: 0.4, emissive: '#b04dff', emissiveIntensity: 0.45, animated: true },
  },
};

export function pieceSet(id: string): PieceSetVisual {
  return SETS[id] ?? SETS['pieces.classic'];
}

export function pieceSvg(setId: string, color: C, type: PieceType): string {
  const set = pieceSet(setId);
  const shape = (set.family === 'staunton' ? STAUNTON : GEOMETRIC)[type];
  const m = set.mat(color);
  const prims = shape.prims.map(primToSvg).join('');
  const glowDef = m.glow
    ? `<filter id="g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${m.glow.std}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
    : '';
  const shadeDef = `<linearGradient id="sh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="${m.shade * 0.9}"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${m.shade * 1.6}"/></linearGradient>`;
  const flip = type === 'n' && color === 'b' ? '' : '';
  const details = shape.details.length
    ? `<path d="${shape.details.join(' ')}" fill="none" stroke="${m.detail}" stroke-width="${m.detailW ?? 1.6}" stroke-linecap="round" opacity="0.9"/>`
    : '';
  const cuts = shape.cuts.length
    ? `<path d="${shape.cuts.join(' ')}" fill="${m.cut}" stroke="${m.cut}" stroke-width="2.2" stroke-linecap="round"/>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 0 100 100">` +
    `<defs>${m.defs}${glowDef}${shadeDef}<clipPath id="c">${prims}</clipPath></defs>` +
    `<g${m.glow ? ' filter="url(#g)"' : ''}${flip}>` +
    `<g fill="none" stroke="${m.outline}" stroke-width="${m.outlineW * 2}" stroke-linejoin="round">${prims}</g>` +
    `<g fill="${m.fill}">${prims}</g>` +
    `<g clip-path="url(#c)">${m.overlay ?? ''}${m.shade ? '<rect x="-50" y="0" width="100" height="100" fill="url(#sh)"/>' : ''}</g>` +
    details +
    cuts +
    `</g></svg>`
  );
}

const cache = new Map<string, string>();
export function pieceUrl(setId: string, color: C, type: PieceType): string {
  const k = `${setId}|${color}|${type}`;
  let u = cache.get(k);
  if (!u) {
    u = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pieceSvg(setId, color, type))}`;
    cache.set(k, u);
  }
  return u;
}

export const PIECE_SET_IDS = Object.keys(SETS);
