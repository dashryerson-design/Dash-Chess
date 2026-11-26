import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  BOTS,
  COSMETICS,
  DEFAULT_EQUIPPED,
  activeChallenges,
  categoryOf,
  classifyMove,
  divisionFor,
  levelFromXp,
  overallRating,
  ratingChange,
  totalXpForLevel,
  validTimeControl,
  winProb,
  xpToNext,
  type PlyEngineData,
  type Score,
} from '@dc/shared';

describe('divisions', () => {
  it('maps ratings to the configured tiers and sub-divisions', () => {
    expect(divisionFor(0).name).toBe('Bronze III');
    expect(divisionFor(799).name).toBe('Bronze I');
    expect(divisionFor(800).name).toBe('Silver III');
    expect(divisionFor(1000).name).toBe('Silver I');
    expect(divisionFor(1100).name).toBe('Gold III');
    expect(divisionFor(1999).name).toBe('Diamond I');
    expect(divisionFor(2000).name).toBe('Master');
    expect(divisionFor(2200).name).toBe('Grandmaster');
    expect(divisionFor(2400).name).toBe('DC Elite');
    expect(divisionFor(3000).name).toBe('DC Elite');
  });
  it('reports the next division threshold', () => {
    const d = divisionFor(1050);
    expect(d.nextAt).toBe(1100);
    expect(d.nextName).toBe('Gold III');
    expect(d.progress).toBeGreaterThan(0);
    expect(d.progress).toBeLessThanOrEqual(1);
  });
});

describe('DC Rating (Elo)', () => {
  it('gives symmetric changes for equal players', () => {
    const w = ratingChange(1500, 30, 1500, 1);
    const l = ratingChange(1500, 30, 1500, 0);
    expect(w.delta).toBe(16);
    expect(l.delta).toBe(-16);
    expect(ratingChange(1500, 30, 1500, 0.5).delta).toBe(0);
  });
  it('rewards upsets more and uses a higher K during placement', () => {
    const upset = ratingChange(1200, 30, 1600, 1).delta;
    const expected = ratingChange(1600, 30, 1200, 1).delta;
    expect(upset).toBeGreaterThan(expected);
    expect(ratingChange(1200, 2, 1200, 1).delta).toBe(40); // K=80 provisional
  });
  it('never drops below the floor and always moves at least one point', () => {
    expect(ratingChange(105, 30, 2000, 0).after).toBeGreaterThanOrEqual(100);
    expect(ratingChange(2600, 30, 1000, 1).delta).toBeGreaterThanOrEqual(1);
  });
  it('computes a games-weighted overall rating', () => {
    expect(overallRating([{ rating: 1200, games: 3 }, { rating: 1000, games: 1 }, { rating: 1500, games: 0 }])).toBe(1150);
    expect(overallRating([])).toBe(1000);
  });
});

describe('progression', () => {
  it('requires gradually more XP per level', () => {
    for (let l = 1; l < 60; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
  });
  it('levelFromXp is consistent with totalXpForLevel', () => {
    for (const l of [1, 2, 5, 10, 25, 50]) {
      expect(levelFromXp(totalXpForLevel(l)).level).toBe(l);
      expect(levelFromXp(totalXpForLevel(l) - 1).level).toBe(Math.max(1, l - 1));
    }
  });
});

describe('time controls & catalogues', () => {
  it('categorises by estimated duration', () => {
    expect(categoryOf({ initial: 60, increment: 0 })).toBe('bullet');
    expect(categoryOf({ initial: 180, increment: 2 })).toBe('blitz');
    expect(categoryOf({ initial: 600, increment: 5 })).toBe('rapid');
    expect(categoryOf({ initial: 1800, increment: 0 })).toBe('classical');
  });
  it('validates custom time controls', () => {
    expect(validTimeControl({ initial: 0, increment: 0 }, true)).toBe(true);
    expect(validTimeControl({ initial: 0, increment: 0 }, false)).toBe(false);
    expect(validTimeControl({ initial: 5, increment: 0 }, false)).toBe(false);
    expect(validTimeControl({ initial: 300, increment: 1000 }, false)).toBe(false);
  });
  it('has exactly 20 bots with unique ids and increasing strength', () => {
    expect(BOTS).toHaveLength(20);
    expect(new Set(BOTS.map((b) => b.id)).size).toBe(20);
    for (let i = 1; i < BOTS.length; i++) expect(BOTS[i].elo).toBeGreaterThan(BOTS[i - 1].elo);
  });
  it('defaults are valid cosmetics and every unlock references something real', () => {
    const ids = new Set(COSMETICS.map((c) => c.id));
    for (const v of Object.values(DEFAULT_EQUIPPED)) expect(ids.has(v)).toBe(true);
    expect(COSMETICS.filter((c) => c.type === 'pieces')).toHaveLength(10);
  });
  it('rotates three daily and three weekly challenges deterministically', () => {
    const a = activeChallenges(new Date('2026-11-25T10:00:00Z'));
    const b = activeChallenges(new Date('2026-11-25T23:00:00Z'));
    expect(a[0].defs.map((d) => d.id)).toEqual(b[0].defs.map((d) => d.id));
    expect(a[0].defs).toHaveLength(3);
    expect(a[1].defs).toHaveLength(3);
  });
});

// ------------------------------------------------------------------------------------------------
// Move classification: synthetic engine data lets us test each rule precisely.

const cp = (v: number): Score => ({ cp: v });
function data(lines: [string, Score, string[]?][], played: [string, Score, string[]?], shallowBest: string | null = null, shallowScore: Score | null = null): PlyEngineData {
  return {
    depth: 12,
    lines: lines.map(([move, score, pv]) => ({ move, score, pv: pv ?? [move] })),
    played: { move: played[0], score: played[1], pv: played[2] ?? [played[0]] },
    shallowBest,
    shallowScore,
  };
}

describe('move classification', () => {
  const start = new Chess().fen();

  it('a forced move is Good, never a blunder', () => {
    const c = new Chess('k7/8/8/8/8/8/1r6/K7 w - - 0 1'); // Ka1 attacked by the rook on b2: Kxb2 is the only move
    expect(c.moves()).toEqual(['Kxb2']);
    const r = classifyMove({ fenBefore: c.fen(), uci: 'a1b2' }, data([['a1b2', cp(800)]], ['a1b2', cp(800)]), 0);
    expect(r.cls).toBe('good');
    expect(r.flags).toContain('forced');
  });

  it('playing the engine move with comfortable alternatives is Good, not Great', () => {
    const r = classifyMove({ fenBefore: start, uci: 'e2e4' }, data([['e2e4', cp(30)], ['d2d4', cp(25)], ['g1f3', cp(20)]], ['e2e4', cp(30)]), 0);
    expect(r.cls).toBe('good');
  });

  it('the same centipawn loss matters less when completely winning than when equal', () => {
    const equal = classifyMove({ fenBefore: start, uci: 'a2a3' }, data([['e2e4', cp(0)], ['d2d4', cp(-5)]], ['a2a3', cp(-150)]), 0);
    const winning = classifyMove({ fenBefore: start, uci: 'a2a3' }, data([['e2e4', cp(900)], ['d2d4', cp(880)]], ['a2a3', cp(800)]), 0);
    expect(['okay', 'bad']).toContain(equal.cls);
    expect(winning.cls).toBe('good');
    expect(winning.loss).toBeLessThan(equal.loss);
  });

  it('throwing away a winning position is a Blunder', () => {
    const r = classifyMove({ fenBefore: start, uci: 'f2f3' }, data([['e2e4', cp(300)], ['d2d4', cp(280)]], ['f2f3', cp(-400)]), 0);
    expect(r.cls).toBe('blunder');
  });

  it('finding the only good move is Great', () => {
    const r = classifyMove({ fenBefore: start, uci: 'e2e4' }, data([['e2e4', cp(50)], ['d2d4', cp(-250)], ['g1f3', cp(-300)]], ['e2e4', cp(50)]), 0);
    expect(r.cls).toBe('great');
    expect(r.flags).toContain('only_move');
  });

  it('an obvious recapture is not Great even if it is the only move', () => {
    // 1.e4 d5 2.exd5 Qxd5 — test the recapture Qxd5 (black) after white captured on d5
    const c = new Chess();
    c.move('e4');
    c.move('d5');
    c.move('exd5');
    const r = classifyMove({ fenBefore: c.fen(), uci: 'd8d5', prevUci: 'e4d5', prevWasCapture: true }, data([['d8d5', cp(0)], ['g8f6', cp(-200)]], ['d8d5', cp(0)]), 3);
    expect(r.cls).toBe('good');
    expect(r.flags).toContain('recapture');
  });

  it('a sound, hard-to-find sacrifice is Incredible', () => {
    // Greek gift setup: Bxh7+ gives up the bishop for a winning attack
    const fen = 'r1bq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R1BQK2R w KQ - 0 8';
    const c = new Chess(fen);
    expect(c.moves({ verbose: true }).some((m) => m.from + m.to === 'd3h7')).toBe(true);
    const pv = ['d3h7', 'g8h7', 'f3g5', 'h7g8', 'd1h5'];
    const r = classifyMove({ fenBefore: fen, uci: 'd3h7' }, data([['d3h7', cp(250), pv], ['e1g1', cp(60)], ['a2a3', cp(40)]], ['d3h7', cp(250), pv], 'e1g1', cp(70)), 14);
    expect(r.flags).toContain('sacrifice');
    expect(r.cls).toBe('incredible');
  });

  it('is deterministic for identical input', () => {
    const d = data([['e2e4', cp(50)], ['d2d4', cp(-250)]], ['e2e4', cp(50)]);
    const a = classifyMove({ fenBefore: start, uci: 'e2e4' }, d, 0);
    const b = classifyMove({ fenBefore: start, uci: 'e2e4' }, d, 0);
    expect(a).toEqual(b);
  });

  it('win probability is monotone and symmetric', () => {
    expect(winProb(cp(0))).toBeCloseTo(0.5);
    expect(winProb(cp(300))).toBeGreaterThan(winProb(cp(100)));
    expect(winProb(cp(200)) + winProb(cp(-200))).toBeCloseTo(1);
    expect(winProb({ mate: 3 })).toBe(1);
    expect(winProb({ mate: -2 })).toBe(0);
  });
});
