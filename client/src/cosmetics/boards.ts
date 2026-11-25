export interface BoardVisual {
  light: string;
  dark: string;
  texture: 'none' | 'wood' | 'marble' | 'metal' | 'neon' | 'future' | 'sparkle';
  frame: string;
  frameEdge: string;
  coordLight: string;
  coordDark: string;
  three: { light: string; dark: string; frame: string; roughness: number; metalness: number; emissive?: string; grid?: string };
}

export const BOARDS: Record<string, BoardVisual> = {
  'board.wood': {
    light: '#e9d1a8', dark: '#b37f50', texture: 'wood', frame: 'linear-gradient(135deg,#4a2c17,#2a170b)', frameEdge: '#5a361c',
    coordLight: '#a0714a', coordDark: '#f1dcb8',
    three: { light: '#e2c79c', dark: '#9c6a3f', frame: '#3a2212', roughness: 0.55, metalness: 0 },
  },
  'board.tournament': {
    light: '#eeeed2', dark: '#769656', texture: 'none', frame: 'linear-gradient(135deg,#2a3324,#151a12)', frameEdge: '#3a4632',
    coordLight: '#769656', coordDark: '#eeeed2',
    three: { light: '#e8e8cc', dark: '#6e8e4f', frame: '#1f261b', roughness: 0.7, metalness: 0 },
  },
  'board.mono': {
    light: '#ebebeb', dark: '#4d4d4f', texture: 'none', frame: 'linear-gradient(135deg,#2a2a2c,#111)', frameEdge: '#333',
    coordLight: '#4d4d4f', coordDark: '#ebebeb',
    three: { light: '#e6e6e6', dark: '#3a3a3c', frame: '#121214', roughness: 0.5, metalness: 0 },
  },
  'board.ocean': {
    light: '#dfe9f3', dark: '#4f7aa8', texture: 'none', frame: 'linear-gradient(135deg,#1b2c44,#0d1624)', frameEdge: '#25395a',
    coordLight: '#4f7aa8', coordDark: '#dfe9f3',
    three: { light: '#d6e2ee', dark: '#3f6898', frame: '#132037', roughness: 0.45, metalness: 0.05 },
  },
  'board.amethyst': {
    light: '#ebe1f6', dark: '#7d5ca8', texture: 'none', frame: 'linear-gradient(135deg,#2c1d42,#140c22)', frameEdge: '#3d2a5c',
    coordLight: '#7d5ca8', coordDark: '#ebe1f6',
    three: { light: '#e2d6f0', dark: '#6b4a98', frame: '#1f1430', roughness: 0.45, metalness: 0.05 },
  },
  'board.crimson': {
    light: '#f2dede', dark: '#a6434f', texture: 'none', frame: 'linear-gradient(135deg,#3a1217,#1a080b)', frameEdge: '#55202a',
    coordLight: '#a6434f', coordDark: '#f2dede',
    three: { light: '#ecd4d4', dark: '#933540', frame: '#2a0c11', roughness: 0.45, metalness: 0.05 },
  },
  'board.marble': {
    light: '#eeede9', dark: '#8c8b87', texture: 'marble', frame: 'linear-gradient(135deg,#3b3a37,#1c1b19)', frameEdge: '#55534e',
    coordLight: '#7d7c78', coordDark: '#eeede9',
    three: { light: '#ecebe6', dark: '#7d7c78', frame: '#2b2a27', roughness: 0.18, metalness: 0 },
  },
  'board.metal': {
    light: '#9298a3', dark: '#3d424b', texture: 'metal', frame: 'linear-gradient(135deg,#2c3037,#121418)', frameEdge: '#4a505a',
    coordLight: '#3d424b', coordDark: '#b8bec8',
    three: { light: '#8f96a1', dark: '#353a42', frame: '#1a1d22', roughness: 0.35, metalness: 0.85 },
  },
  'board.neon': {
    light: '#141725', dark: '#07080e', texture: 'neon', frame: 'linear-gradient(135deg,#0d0f1a,#040509)', frameEdge: '#3ff3ff',
    coordLight: '#3ff3ff', coordDark: '#ff3df2',
    three: { light: '#151828', dark: '#06070c', frame: '#05060a', roughness: 0.25, metalness: 0.3, emissive: '#3ff3ff', grid: '#ff3df2' },
  },
  'board.future': {
    light: '#24364f', dark: '#101b2b', texture: 'future', frame: 'linear-gradient(135deg,#13233a,#060b14)', frameEdge: '#26d9ff',
    coordLight: '#7fe9ff', coordDark: '#26d9ff',
    three: { light: '#223650', dark: '#0d1828', frame: '#08101c', roughness: 0.3, metalness: 0.5, emissive: '#26d9ff', grid: '#26d9ff' },
  },
  'board.diamond': {
    light: '#ddeeff', dark: '#3f76c4', texture: 'sparkle', frame: 'linear-gradient(135deg,#1c3866,#0b1630)', frameEdge: '#7fb2ff',
    coordLight: '#3f76c4', coordDark: '#ddeeff',
    three: { light: '#d6e8ff', dark: '#3468b4', frame: '#10234a', roughness: 0.15, metalness: 0.2 },
  },
  'board.champion': {
    light: '#e8c66c', dark: '#1d1a14', texture: 'marble', frame: 'linear-gradient(135deg,#6b531c,#1a1408)', frameEdge: '#e8c66c',
    coordLight: '#1d1a14', coordDark: '#e8c66c',
    three: { light: '#d9b45a', dark: '#16140f', frame: '#3a2c0c', roughness: 0.25, metalness: 0.6 },
  },
};

export function boardVisual(id: string): BoardVisual {
  return BOARDS[id] ?? BOARDS['board.wood'];
}

function textureLayer(b: BoardVisual): string {
  switch (b.texture) {
    case 'wood':
      return `<filter id="t" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency="0.004 0.09" numOctaves="3" seed="5"/><feColorMatrix type="matrix" values="0 0 0 0 0.25  0 0 0 0 0.13  0 0 0 0 0.04  0 0 0 -1.6 0.9"/></filter><rect width="800" height="800" filter="url(#t)" opacity="0.55"/>`;
    case 'marble':
      return `<filter id="t" x="0" y="0" width="1" height="1"><feTurbulence type="turbulence" baseFrequency="0.006 0.01" numOctaves="4" seed="11"/><feColorMatrix type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.35  0 0 0 0 0.37  0 0 0 -7 1.6"/></filter><rect width="800" height="800" filter="url(#t)" opacity="0.6"/>`;
    case 'metal':
      return `<filter id="t" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency="0.002 0.9" numOctaves="2" seed="3"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 -0.2"/></filter><rect width="800" height="800" filter="url(#t)" opacity="0.35"/>`;
    case 'neon': {
      let lines = '';
      for (let i = 0; i <= 8; i++) {
        lines += `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="800"/><line x1="0" y1="${i * 100}" x2="800" y2="${i * 100}"/>`;
      }
      return `<filter id="gl"><feGaussianBlur stdDeviation="3"/></filter><g stroke="#3ff3ff" stroke-width="3" opacity="0.8" filter="url(#gl)">${lines}</g><g stroke="#9ffbff" stroke-width="1.2" opacity="0.9">${lines}</g>`;
    }
    case 'future': {
      let s = '';
      for (let y = 0; y < 800; y += 6) s += `<line x1="0" y1="${y}" x2="800" y2="${y}"/>`;
      let g = '';
      for (let i = 0; i <= 8; i++) g += `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="800"/><line x1="0" y1="${i * 100}" x2="800" y2="${i * 100}"/>`;
      return `<g stroke="#26d9ff" stroke-width="0.6" opacity="0.12">${s}</g><g stroke="#26d9ff" stroke-width="1.5" opacity="0.55">${g}</g>`;
    }
    case 'sparkle': {
      let dots = '';
      let seed = 7;
      for (let i = 0; i < 90; i++) {
        seed = (seed * 9301 + 49297) % 233280;
        const x = (seed / 233280) * 800;
        seed = (seed * 9301 + 49297) % 233280;
        const y = (seed / 233280) * 800;
        dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1 + (i % 3) * 0.6).toFixed(1)}"/>`;
      }
      return `<g fill="#fff" opacity="0.55">${dots}</g>`;
    }
    default:
      return '';
  }
}

const cache = new Map<string, string>();
/** Full 8x8 board as an SVG data URI (orientation independent: a1 is always dark). */
export function boardUrl(id: string): string {
  if (cache.has(id)) return cache.get(id)!;
  const b = boardVisual(id);
  let squares = '';
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) if ((r + f) % 2 === 1) squares += `<rect x="${f * 100}" y="${r * 100}" width="100" height="100"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="800" height="800" fill="${b.light}"/><g fill="${b.dark}">${squares}</g><g shape-rendering="auto">${textureLayer(b)}</g></svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  cache.set(id, url);
  return url;
}

export const HIGHLIGHTS: Record<string, { last: string; select: string; legal: string; premove: string }> = {
  gold: { last: 'rgba(255, 214, 64, 0.42)', select: 'rgba(255, 214, 64, 0.55)', legal: 'rgba(20, 20, 20, 0.28)', premove: 'rgba(80, 120, 255, 0.45)' },
  blue: { last: 'rgba(80, 160, 255, 0.42)', select: 'rgba(80, 160, 255, 0.55)', legal: 'rgba(20, 40, 80, 0.3)', premove: 'rgba(255, 120, 80, 0.45)' },
  green: { last: 'rgba(120, 230, 110, 0.42)', select: 'rgba(120, 230, 110, 0.55)', legal: 'rgba(10, 50, 20, 0.3)', premove: 'rgba(80, 120, 255, 0.45)' },
  purple: { last: 'rgba(180, 120, 255, 0.45)', select: 'rgba(180, 120, 255, 0.58)', legal: 'rgba(40, 10, 70, 0.3)', premove: 'rgba(255, 200, 60, 0.45)' },
  red: { last: 'rgba(255, 110, 110, 0.42)', select: 'rgba(255, 110, 110, 0.55)', legal: 'rgba(70, 10, 10, 0.3)', premove: 'rgba(80, 120, 255, 0.45)' },
};
