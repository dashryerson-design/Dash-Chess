import { Chess, type Move, type Square, type Color } from 'chess.js';
import type { EngineLine } from '../engine/clientEngine';

export type HackStyle = 'goat' | 'defence' | 'offence' | 'attack' | 'sacrifice' | 'alien';

export const HACK_STYLES: { id: HackStyle; label: string; desc: string }[] = [
  { id: 'goat', label: 'All-around GOAT', desc: 'The objectively best move, every time.' },
  { id: 'defence', label: 'Slow Defence', desc: 'Safe, solid, king-first moves. Grind them down.' },
  { id: 'offence', label: 'Insane Offence', desc: 'Checks, captures and threats whenever they work.' },
  { id: 'attack', label: 'Overwhelming Attack', desc: 'Pile pieces and pawns onto their king.' },
  { id: 'sacrifice', label: 'Intelligent Sacrificing', desc: 'Sound sacrifices that keep you winning.' },
  { id: 'alien', label: 'Alien Gambit', desc: "Witty Alien's Caro-Kann gambit (5.Ng5 and 6.Nxf7!?), then all-out sacrificial attack." },
];

/** How far below the best engine score (centipawns) a style may go, and its feature weights. */
const CFG: Record<HackStyle, { window: number; w: Partial<Record<Feature, number>> }> = {
  goat: { window: 0, w: {} },
  defence: { window: 60, w: { quiet: 40, kingSafety: 45, trade: 25, capture: -10, aggression: -12 } },
  offence: { window: 80, w: { check: 55, capture: 30, aggression: 15, quiet: -25 } },
  attack: { window: 70, w: { aggression: 30, pressure: 18, pawnStorm: 35, check: 20, trade: -20 } },
  sacrifice: { window: 60, w: { sacrifice: 90, check: 15, aggression: 10 } },
  alien: { window: 90, w: { sacrifice: 60, aggression: 25, pressure: 15, check: 30, quiet: -20 } },
};

type Feature = 'quiet' | 'kingSafety' | 'trade' | 'capture' | 'aggression' | 'pressure' | 'pawnStorm' | 'check' | 'sacrifice' | 'weird';
const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const fileOf = (s: string) => s.charCodeAt(0) - 97;
const rankOf = (s: string) => Number(s[1]) - 1;
const dist = (a: string, b: string) => Math.max(Math.abs(fileOf(a) - fileOf(b)), Math.abs(rankOf(a) - rankOf(b)));

function features(fen: string, m: Move): Record<Feature, number> {
  const c = new Chess(fen);
  const me = m.color;
  const opp: Color = me === 'w' ? 'b' : 'w';
  const ek = c.findPiece({ type: 'k', color: opp })[0];
  const ok = c.findPiece({ type: 'k', color: me })[0];
  const after = new Chess(m.after);
  const captured = m.captured ? VAL[m.captured] : 0;
  let pressure = 0;
  for (let df = -1; df <= 1; df++)
    for (let dr = -1; dr <= 1; dr++) {
      const f = fileOf(ek) + df;
      const r = rankOf(ek) + dr;
      if (f >= 0 && f < 8 && r >= 0 && r < 8 && after.isAttacked((String.fromCharCode(97 + f) + (r + 1)) as Square, me)) pressure++;
    }
  let sacrifice = 0;
  if (m.piece !== 'k') {
    const att = after.attackers(m.to as Square, opp);
    if (att.length && VAL[m.piece] - captured >= 2) sacrifice = Math.min(3, (VAL[m.piece] - captured) / 2);
  }
  const castle = m.isKingsideCastle() || m.isQueensideCastle();
  const rel = (s: string) => (me === 'w' ? rankOf(s) : 7 - rankOf(s));
  const edge = fileOf(m.to) === 0 || fileOf(m.to) === 7 ? 1 : 0;
  const weird = (m.piece === 'k' && !castle ? 1.2 : 0) + (m.piece === 'q' && c.history().length < 20 ? 0.8 : 0) + edge * 0.7 + (m.piece === 'n' && edge ? 0.6 : 0) + (m.promotion && m.promotion !== 'q' ? 2 : 0) + sacrifice * 0.5;
  return {
    quiet: !captured && !m.san.includes('+') ? 1 : 0,
    kingSafety: (castle ? 2 : 0) + (m.piece !== 'p' && m.piece !== 'k' && dist(m.to, ok) <= 2 ? 0.6 : 0) - (m.piece === 'k' && !castle ? 1 : 0),
    trade: captured && Math.abs(captured - VAL[m.piece]) <= 0.5 ? 1 : 0,
    capture: captured / 3,
    aggression: m.piece === 'k' ? 0 : (dist(m.from, ek) - dist(m.to, ek)) * 0.8,
    pressure,
    pawnStorm: m.piece === 'p' && Math.abs(fileOf(m.to) - fileOf(ek)) <= 2 ? (rel(m.to) >= 3 ? 1 : 0.5) : 0,
    check: m.san.includes('+') || m.san.includes('#') ? 1 : 0,
    sacrifice,
    weird,
  };
}

const lineCp = (l: EngineLine) => (l.mate !== null ? (l.mate > 0 ? 10000 - l.mate * 10 : -10000 - l.mate * 10) : l.cp ?? 0);

/** Chooses a suggestion from engine MultiPV lines (scores from the side to move) for a style. */
export function pickStyledMove(fen: string, lines: EngineLine[], style: HackStyle): { uci: string; cp: number } | null {
  if (!lines.length) return null;
  const c = new Chess(fen);
  const legal = c.moves({ verbose: true });
  const best = lineCp(lines[0]);
  // never leave a forced mate on the table
  if (lines[0].mate !== null && lines[0].mate > 0) return { uci: lines[0].pv[0], cp: best };
  const cfg = CFG[style];
  let pick: { uci: string; cp: number; u: number } | null = null;
  for (const l of lines) {
    const cp = lineCp(l);
    if (cp < best - cfg.window) continue;
    const m = legal.find((x) => x.from + x.to + (x.promotion ?? '') === l.pv[0]);
    if (!m) continue;
    const f = features(fen, m);
    let u = cp;
    for (const [k, w] of Object.entries(cfg.w)) u += (w ?? 0) * f[k as Feature];
    if (!pick || u > pick.u) pick = { uci: l.pv[0], cp, u };
  }
  return pick ?? { uci: lines[0].pv[0], cp: best };
}
