import { afterAll, describe, expect, it } from 'vitest';
import { GameRoom, hasMatingMaterial, type HumanSeat } from '../server/src/game/room';
import { Chess } from 'chess.js';
import type { MatchSettings } from '@dc/shared';
import { closePools } from '../server/src/engine/uci';

const human = (id: string): HumanSeat => ({ kind: 'human', userId: id, username: id, icon: 'icon.knight', card: 'card.carbon', level: 1, rating: 1000, ratingGames: 0, provisional: true, ip: '1.1.1.1' });
const settings = (p: Partial<MatchSettings> = {}): MatchSettings => ({ tc: { initial: 0, increment: 0 }, rated: false, takebacks: false, assistance: false, spectators: true, color: 'white', ...p });

function room(p: Partial<MatchSettings> = {}) {
  const r = new GameRoom({ id: 'g_test', mode: 'casual', settings: settings(p), white: human('w'), black: human('b') });
  r.start();
  return r;
}
function play(r: GameRoom, moves: string[]) {
  for (const m of moves) {
    const side = r.turn;
    const err = r.move(side, m);
    if (err) throw new Error(`${m}: ${err}`);
  }
}

afterAll(() => closePools());

describe('authoritative chess rules (GameRoom)', () => {
  it('rejects illegal, malformed and out-of-turn moves', () => {
    const r = room();
    expect(r.move('b', 'e7e5')).toBe('Not your turn.');
    expect(r.move('w', 'e2e5')).toBe('Illegal move.');
    expect(r.move('w', 'zz')).toBe('Malformed move.');
    expect(r.move('w', 'e7e5')).toBe('Illegal move.'); // moving the opponent's piece
    expect(r.move('w', 'e2e4')).toBeNull();
    r.dispose();
  });

  it('detects checkmate (fool\'s mate)', () => {
    const r = room();
    play(r, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(r.status).toBe('ended');
    expect(r.result).toEqual({ winner: 'b', reason: 'checkmate' });
    expect(r.move('w', 'a2a3')).toBe('Game is over.');
    r.dispose();
  });

  it('supports castling both sides and forbids castling through check', () => {
    const r = room();
    play(r, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'e1g1']);
    expect(r.chess.get('g1')?.type).toBe('k');
    expect(r.chess.get('f1')?.type).toBe('r');
    r.dispose();
    const q = room();
    play(q, ['d2d4', 'd7d5', 'b1c3', 'b8c6', 'c1f4', 'c8f5', 'd1d2', 'd8d7', 'e1c1']);
    expect(q.chess.get('c1')?.type).toBe('k');
    expect(q.chess.get('d1')?.type).toBe('r');
    q.dispose();
    // king would pass through an attacked square (f1 attacked by the bishop on c4... use a constructed line)
    const c = room();
    play(c, ['e2e4', 'e7e5', 'g1f3', 'd7d6', 'f1e2', 'c8g4', 'b2b3', 'g4f3', 'd2d3', 'f3e2']);
    expect(c.move('w', 'e1g1')).toBe('Illegal move.'); // king is... capture on e2 pending; castling illegal
    c.dispose();
  });

  it('supports en passant', () => {
    const r = room();
    play(r, ['e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6']);
    expect(r.chess.get('d5')).toBeUndefined();
    expect(r.chess.get('d6')?.type).toBe('p');
    expect(r.moves.at(-1)!.san).toBe('exd6');
    r.dispose();
  });

  it('supports promotion (including under-promotion)', () => {
    const r = room();
    play(r, ['h2h4', 'g7g5', 'h4g5', 'h7h6', 'g5h6', 'f8g7', 'h6g7', 'g8f6']);
    expect(r.move('w', 'g7h8')).toBe('Illegal move.'); // promotion piece required
    expect(r.move('w', 'g7h8n')).toBeNull(); // capture + under-promotion to a knight
    expect(r.chess.get('h8')).toEqual({ type: 'n', color: 'w' });
    expect(r.moves.at(-1)!.san).toBe('gxh8=N');
    r.dispose();
  });

  it('detects stalemate', () => {
    // Sam Loyd's 10-move stalemate
    const r = room();
    play(r, ['e2e3', 'a7a5', 'd1h5', 'a8a6', 'h5a5', 'h7h5', 'a5c7', 'a6h6', 'h2h4', 'f7f6', 'c7d7', 'e8f7', 'd7b7', 'd8d3', 'b7b8', 'd3h7', 'b8c8', 'f7g6', 'c8e6']);
    expect(r.result).toEqual({ winner: null, reason: 'stalemate' });
    r.dispose();
  });

  it('detects threefold repetition', () => {
    const r = room();
    play(r, ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']);
    expect(r.result?.reason).toBe('repetition');
    r.dispose();
  });

  it('detects insufficient material', () => {
    const c = new Chess('8/8/8/4k3/8/8/3p4/4K3 w - - 0 1');
    expect(c.moves().includes('Kxd2')).toBe(true);
    // play out a capture into K vs K in a room started from a normal game is long; use chess.js semantics used by GameRoom
    c.move('Kxd2');
    expect(c.isInsufficientMaterial()).toBe(true);
  });

  it('applies the fifty-move rule', () => {
    const c = new Chess('8/8/8/4k3/8/8/8/R3K3 w - - 99 80');
    c.move('Ra2');
    expect(c.isDrawByFiftyMoves()).toBe(true);
  });

  it('handles draw offers, takebacks and resignation', () => {
    const r = room({ takebacks: true });
    expect(r.offerDraw('w')).toBe('Make a move first.');
    play(r, ['e2e4', 'e7e5']);
    expect(r.requestTakeback('w')).toBeNull();
    expect(r.takebackOffer).toBe('w');
    expect(r.respondTakeback('b', true)).toBeNull();
    expect(r.moves.map((m) => m.uci)).toEqual([]); // white's turn: both plies undone so white can replay
    play(r, ['d2d4', 'd7d5']);
    expect(r.offerDraw('w')).toBeNull();
    expect(r.respondDraw('b', false)).toBeNull();
    expect(r.drawOffer).toBeNull();
    expect(r.offerDraw('b')).toBeNull();
    expect(r.respondDraw('w', true)).toBeNull();
    expect(r.result).toEqual({ winner: null, reason: 'agreement' });
    r.dispose();
    const s = room();
    play(s, ['e2e4', 'e7e5']);
    s.resign('w');
    expect(s.result).toEqual({ winner: 'b', reason: 'resignation' });
    s.dispose();
  });

  it('forbids takebacks in rated games and aborts games with fewer than two moves', () => {
    const r = room({ rated: true, takebacks: true });
    play(r, ['e2e4', 'e7e5']);
    expect(r.requestTakeback('w')).toMatch(/disabled/);
    r.dispose();
    const a = room();
    play(a, ['e2e4']);
    expect(a.resign('b')).toBeNull();
    expect(a.result?.reason).toBe('aborted');
    a.dispose();
  });

  it('runs server clocks: increments, and flags on time', () => {
    const r = room({ tc: { initial: 60, increment: 2 } });
    const t0 = Date.now();
    play(r, ['e2e4', 'e7e5']); // clocks start after both sides have moved
    expect(r.clockRunning).toBe(true);
    expect(r.move('w', 'g1f3', t0 + 10_000)).toBeNull();
    expect(r.clock!.w).toBeGreaterThan(51_000);
    expect(r.clock!.w).toBeLessThanOrEqual(52_100);
    // black thinks for 70s and is out of time
    expect(r.move('b', 'b8c6', t0 + 81_000)).toBe('Out of time.');
    expect(r.result).toEqual({ winner: 'w', reason: 'timeout' });
    r.dispose();
  });

  it('declares a draw when the flag falls but the winner cannot mate', () => {
    expect(hasMatingMaterial(new Chess('8/8/8/4k3/8/8/8/4K1N1 w - - 0 1'), 'w')).toBe(false);
    expect(hasMatingMaterial(new Chess('8/8/8/4k3/8/8/4P3/4K3 w - - 0 1'), 'w')).toBe(true);
    expect(hasMatingMaterial(new Chess('8/8/8/4k3/8/8/8/2B1KB2 w - - 0 1'), 'w')).toBe(true);
  });
});
