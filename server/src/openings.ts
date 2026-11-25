import fs from 'node:fs';
import path from 'node:path';
import { Chess } from 'chess.js';
import { config } from './config';

/** Opening names from the CC0 lichess-org/chess-openings dataset, indexed by EPD. */
export interface OpeningInfo {
  eco: string;
  name: string;
  pgn: string;
  ply: number;
}

const byEpd = new Map<string, OpeningInfo>();
/** child openings reachable by one move: epd -> list of { uci, san, opening } */
const children = new Map<string, Map<string, { san: string; opening: OpeningInfo | null }>>();
let loaded = false;

export const epdOf = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

export function loadOpenings() {
  if (loaded) return;
  loaded = true;
  for (const f of ['a', 'b', 'c', 'd', 'e']) {
    const file = path.join(config.dataDir, `${f}.tsv`);
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n').slice(1);
    for (const line of lines) {
      const [eco, name, pgn] = line.split('\t');
      if (!pgn) continue;
      const c = new Chess();
      const sans = pgn.replace(/\d+\.\s*/g, '').trim().split(/\s+/);
      let ok = true;
      for (const san of sans) {
        const before = epdOf(c.fen());
        let m;
        try {
          m = c.move(san);
        } catch {
          ok = false;
          break;
        }
        const uci = m.from + m.to + (m.promotion ?? '');
        if (!children.has(before)) children.set(before, new Map());
        const ch = children.get(before)!;
        if (!ch.has(uci)) ch.set(uci, { san: m.san, opening: null });
      }
      if (!ok) continue;
      const epd = epdOf(c.fen());
      const info: OpeningInfo = { eco, name, pgn, ply: sans.length };
      if (!byEpd.has(epd) || byEpd.get(epd)!.ply > info.ply) byEpd.set(epd, info);
    }
  }
  // attach opening names to child edges
  for (const [, ch] of children) {
    for (const [, v] of ch) v.opening = null;
  }
  for (const [epd, ch] of children) {
    const c = new Chess(epd + ' 0 1');
    for (const [uci, v] of ch) {
      try {
        c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        v.opening = byEpd.get(epdOf(c.fen())) ?? null;
        c.undo();
      } catch {
        /* ignore */
      }
    }
  }
}

export function openingAt(fen: string): OpeningInfo | null {
  loadOpenings();
  return byEpd.get(epdOf(fen)) ?? null;
}

/** Deepest named opening reached during a game. */
export function detectOpening(startFen: string, ucis: string[]): OpeningInfo | null {
  loadOpenings();
  const c = new Chess(startFen);
  let found: OpeningInfo | null = byEpd.get(epdOf(c.fen())) ?? null;
  for (let i = 0; i < Math.min(ucis.length, 40); i++) {
    const u = ucis[i];
    c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    const o = byEpd.get(epdOf(c.fen()));
    if (o) found = o;
  }
  return found;
}

export function bookMoves(fen: string): { uci: string; san: string; opening: OpeningInfo | null }[] {
  loadOpenings();
  const ch = children.get(epdOf(fen));
  if (!ch) return [];
  return [...ch.entries()].map(([uci, v]) => ({ uci, san: v.san, opening: v.opening }));
}

export function openingCount() {
  loadOpenings();
  return byEpd.size;
}
