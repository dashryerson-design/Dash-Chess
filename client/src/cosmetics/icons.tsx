import { memo } from 'react';
import { BOT_BY_ID, COSMETIC_BY_ID, RARITY_COLOR } from '@dc/shared';
import { STAUNTON, primToSvg, type PieceType } from './pieceShapes';

const pieceGlyph = (t: PieceType) => STAUNTON[t].prims.map(primToSvg).join('');

const GLYPHS: Record<string, string> = {
  pawn: pieceGlyph('p'),
  knight: pieceGlyph('n'),
  bishop: pieceGlyph('b'),
  rook: pieceGlyph('r'),
  queen: pieceGlyph('q'),
  king: pieceGlyph('k'),
  bolt: '<path d="M 10,6 L -18,54 L 0,54 L -10,94 L 22,40 L 3,40 L 16,6 Z"/>',
  flame: '<path d="M 0,6 C 18,26 30,40 27,62 C 24,82 12,93 0,93 C -15,93 -27,81 -27,63 C -27,48 -19,39 -12,29 C -10,41 -6,48 0,51 C 3,36 1,21 0,6 Z"/>',
  skull:
    '<path fill-rule="evenodd" d="M 0,12 C 23,12 35,29 35,47 C 35,60 29,66 24,70 L 24,86 L -24,86 L -24,70 C -29,66 -35,60 -35,47 C -35,29 -23,12 0,12 Z M -13,40 a 9,9 0 1,0 0.01,0 Z M 13,40 a 9,9 0 1,0 0.01,0 Z M 0,56 L 5,66 L -5,66 Z"/><path d="M -12,74 L -12,86 M 0,74 L 0,86 M 12,74 L 12,86" stroke="rgba(0,0,0,0.6)" stroke-width="3"/>',
  dragon:
    '<path d="M -34,90 C -26,70 -30,52 -16,36 L -28,12 L -6,26 L 4,6 L 10,28 C 26,30 38,40 42,54 L 24,56 L 34,66 C 18,70 6,66 -2,62 C -8,72 -4,82 6,92 Z"/><circle cx="12" cy="40" r="3.5" fill="rgba(0,0,0,0.7)"/>',
  star: '<path d="M 0,8 L 11,38 L 43,39 L 18,58 L 27,90 L 0,71 L -27,90 L -18,58 L -43,39 L -11,38 Z"/>',
  mate: `<g transform="rotate(-32 0 60)">${pieceGlyph('k')}</g>`,
  gem: '<path d="M -34,36 L -18,14 L 18,14 L 34,36 L 0,90 Z"/><path d="M -34,36 L 34,36 M -18,14 L -8,36 L 0,90 L 8,36 L 18,14 M -8,36 L 0,14 L 8,36" stroke="rgba(0,0,0,0.35)" stroke-width="2.2" fill="none"/>',
  laurel:
    '<g>' +
    Array.from({ length: 7 }, (_, i) => {
      const a = (200 + i * 22) * (Math.PI / 180);
      const x = Math.cos(a) * 32;
      const y = 52 + Math.sin(a) * -32;
      const rot = 200 + i * 22 - 90;
      return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="5" ry="11" transform="rotate(${-rot} ${x.toFixed(1)} ${y.toFixed(1)})"/><ellipse cx="${(-x).toFixed(1)}" cy="${y.toFixed(1)}" rx="5" ry="11" transform="rotate(${rot} ${(-x).toFixed(1)} ${y.toFixed(1)})"/>`;
    }).join('') +
    '</g><path d="M 0,30 L 6,46 L 23,46 L 9,56 L 14,72 L 0,62 L -14,72 L -9,56 L -23,46 L -6,46 Z"/>',
  robot:
    '<path fill-rule="evenodd" d="M -28,30 L 28,30 Q 34,30 34,36 L 34,74 Q 34,80 28,80 L -28,80 Q -34,80 -34,74 L -34,36 Q -34,30 -28,30 Z M -14,46 a 7,7 0 1,0 0.01,0 Z M 14,46 a 7,7 0 1,0 0.01,0 Z M -14,64 L 14,64 L 14,70 L -14,70 Z"/><rect x="-3" y="14" width="6" height="16"/><circle cx="0" cy="12" r="6"/><rect x="-42" y="44" width="8" height="20" rx="2"/><rect x="34" y="44" width="8" height="20" rx="2"/>',
  crest: '<path d="M 0,8 L 36,20 L 32,60 C 28,76 15,86 0,94 C -15,86 -28,76 -32,60 L -36,20 Z"/><path d="M -20,40 L 0,56 L 20,40 M -20,56 L 0,72 L 20,56" stroke="rgba(0,0,0,0.45)" stroke-width="5" fill="none" stroke-linejoin="round"/>',
};

interface IconDef {
  glyph: string;
  a: string;
  b: string;
  fg: string;
}

const ICONS: Record<string, IconDef> = {
  'icon.knight': { glyph: 'knight', a: '#2a3a66', b: '#101626', fg: '#cfe0ff' },
  'icon.pawn': { glyph: 'pawn', a: '#2c3340', b: '#12151b', fg: '#e6e9ef' },
  'icon.rook': { glyph: 'rook', a: '#3a2f22', b: '#16110b', fg: '#f0dcc0' },
  'icon.bishop': { glyph: 'bishop', a: '#12443a', b: '#071a16', fg: '#9ff5dc' },
  'icon.queen': { glyph: 'queen', a: '#3a1f6e', b: '#140a2a', fg: '#e0ccff' },
  'icon.king': { glyph: 'king', a: '#5a4210', b: '#1e1505', fg: '#ffe3a0' },
  'icon.bolt': { glyph: 'bolt', a: '#1f4f9a', b: '#0a1830', fg: '#ffe066' },
  'icon.flame': { glyph: 'flame', a: '#7a2210', b: '#260904', fg: '#ffb057' },
  'icon.skull': { glyph: 'skull', a: '#2b2b33', b: '#0b0b0e', fg: '#eaeaf2' },
  'icon.dragon': { glyph: 'dragon', a: '#6b0f2a', b: '#1e0410', fg: '#ffcf5a' },
  'icon.star': { glyph: 'star', a: '#1d4d3a', b: '#08190f', fg: '#ffe38a' },
  'icon.mate': { glyph: 'mate', a: '#5a1220', b: '#1a050a', fg: '#ffd0d6' },
  'icon.gem': { glyph: 'gem', a: '#36207a', b: '#0f0828', fg: '#d6b8ff' },
  'icon.laurel': { glyph: 'laurel', a: '#2f4a1a', b: '#0e1708', fg: '#e8f5b0' },
  'icon.robot': { glyph: 'robot', a: '#0f3d4f', b: '#03131a', fg: '#7ff3ff' },
  'icon.gold': { glyph: 'crest', a: '#6b4e0c', b: '#1f1503', fg: '#ffd76a' },
  'icon.platinum': { glyph: 'crest', a: '#14524e', b: '#041816', fg: '#9ffcf2' },
};

function iconDef(id: string): (IconDef & { border: string; stripe?: number; number?: number }) {
  if (id.startsWith('bot.')) {
    const bot = BOT_BY_ID[id.slice(4)];
    if (bot) return { glyph: bot.glyph, a: bot.color, b: '#07080b', fg: bot.accent, border: bot.color, stripe: bot.number, number: bot.number };
  }
  const d = ICONS[id] ?? ICONS['icon.knight'];
  const c = COSMETIC_BY_ID[id];
  return { ...d, border: c ? RARITY_COLOR[c.rarity] : '#4c5466' };
}

/** Square emblem used for player icons and bot avatars. */
export const PlayerIcon = memo(function PlayerIcon({ id, size = 40, ring = true }: { id: string; size?: number; ring?: boolean }) {
  const d = iconDef(id);
  const uid = id.replace(/[^a-z0-9]/gi, '');
  const stripes =
    d.stripe !== undefined
      ? `<g opacity="0.16" stroke="${d.fg}" stroke-width="6">${Array.from({ length: 6 }, (_, i) => `<line x1="${-60 + i * 26}" y1="0" x2="${-20 + i * 26 + (d.stripe! % 4) * 6}" y2="100"/>`).join('')}</g>`
      : '';
  const html =
    `<defs><linearGradient id="bg${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${d.a}"/><stop offset="1" stop-color="${d.b}"/></linearGradient>` +
    `<linearGradient id="fg${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="${d.fg}"/></linearGradient></defs>` +
    `<rect x="-50" y="0" width="100" height="100" fill="url(#bg${uid})"/>${stripes}` +
    `<ellipse cx="0" cy="96" rx="44" ry="14" fill="rgba(0,0,0,0.35)"/>` +
    `<g transform="translate(0 6) scale(0.8) translate(0 6)" fill="url(#fg${uid})" stroke="rgba(0,0,0,0.55)" stroke-width="2.4" stroke-linejoin="round">${GLYPHS[d.glyph] ?? GLYPHS.knight}</g>` +
    (d.number !== undefined
      ? `<rect x="22" y="2" width="26" height="17" rx="3" fill="rgba(0,0,0,0.55)"/><text x="35" y="15" text-anchor="middle" font-size="12" font-weight="700" font-family="Chakra Petch, sans-serif" fill="${d.fg}">${String(d.number).padStart(2, '0')}</text>`
      : '') +
    (ring ? `<rect x="-48.5" y="1.5" width="97" height="97" rx="9" fill="none" stroke="${d.border}" stroke-width="3" opacity="0.9"/>` : '');
  return (
    <span className="avatar" style={{ width: size, height: size, borderRadius: Math.max(4, size * 0.12) }}>
      <svg viewBox="-50 0 100 100" dangerouslySetInnerHTML={{ __html: html }} />
    </span>
  );
});
