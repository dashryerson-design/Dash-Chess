import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import type { GameState, GameRewards } from '@dc/shared';

process.env.DISCONNECT_FORFEIT_MS = '1500';
process.env.FIRST_MOVE_ABORT_MS = '30000';
process.env.BLOCK_SAME_IP_RANKED = '0';

const { createApp } = await import('../server/src/app');
type App = Awaited<ReturnType<typeof createApp>>;
let app: App;

interface Client {
  name: string;
  id: string;
  cookie: string;
  s: Socket;
  states: Map<string, GameState>;
  rewards: GameRewards[];
  matches: string[];
  emit: (ev: string, p?: unknown) => Promise<any>;
}

async function http(method: string, path: string, body?: unknown, cookie?: string, header = true) {
  const r = await fetch(app.url + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(header ? { 'x-dc-client': '1' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try {
    json = await r.json();
  } catch {
    /* empty */
  }
  return { status: r.status, json, cookie: r.headers.get('set-cookie')?.split(';')[0] };
}

async function client(name: string): Promise<Client> {
  const reg = await http('POST', '/api/auth/register', { username: name, password: 'password123' });
  expect(reg.status).toBe(200);
  const cookie = reg.cookie!;
  const s = io(app.url, { extraHeaders: { cookie }, transports: ['websocket'], forceNew: true });
  await new Promise<void>((res, rej) => {
    s.on('connect', () => res());
    s.on('connect_error', rej);
  });
  const c: Client = {
    name,
    id: reg.json.me.id,
    cookie,
    s,
    states: new Map(),
    rewards: [],
    matches: [],
    emit: (ev, p = {}) => new Promise((res) => s.emit(ev, p, res)),
  };
  s.on('game:state', (st: GameState) => c.states.set(st.id, st));
  s.on('game:rewards', (r: GameRewards) => c.rewards.push(r));
  s.on('match:found', (m: { gameId: string }) => c.matches.push(m.gameId));
  return c;
}

const wait = async (cond: () => boolean, ms = 15000, label = 'condition') => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 25));
  }
};

/** Plays a list of UCI moves alternating between whichever client holds the side to move. */
async function playMoves(gameId: string, w: Client, b: Client, moves: string[]) {
  for (const m of moves) {
    const st = w.states.get(gameId) ?? b.states.get(gameId);
    const turn = (st?.fen.split(' ')[1] ?? 'w') as 'w' | 'b';
    const who = turn === 'w' ? w : b;
    const n = st?.moves.length ?? 0;
    const r = await who.emit('game:move', { gameId, uci: m });
    expect(r, `${m}`).toEqual({ ok: true });
    await wait(() => (w.states.get(gameId)?.moves.length ?? 0) > n, 5000, `state after ${m}`);
  }
}

async function pairUp(a: Client, b: Client, mode: 'ranked' | 'casual', tc = '5+0') {
  const before = [a.matches.length, b.matches.length];
  expect((await a.emit('queue:join', { mode, tc })).ok).toBe(true);
  expect((await b.emit('queue:join', { mode, tc })).ok).toBe(true);
  await wait(() => a.matches.length > before[0] && b.matches.length > before[1], 10000, 'match');
  const gameId = a.matches.at(-1)!;
  expect(b.matches.at(-1)).toBe(gameId);
  const ja = await a.emit('game:join', { gameId });
  const jb = await b.emit('game:join', { gameId });
  expect(ja.ok && jb.ok).toBe(true);
  a.states.set(gameId, ja.state);
  b.states.set(gameId, jb.state);
  const white = ja.state.yourColor === 'w' ? a : b;
  const black = white === a ? b : a;
  return { gameId, white, black };
}

beforeAll(async () => {
  app = await createApp({ port: 0, dbPath: ':memory:' });
});
afterAll(async () => {
  await app?.close();
});

describe('accounts & security', () => {
  it('validates registration and login', async () => {
    expect((await http('POST', '/api/auth/register', { username: 'x', password: 'password123' })).status).toBe(400);
    expect((await http('POST', '/api/auth/register', { username: 'validname', password: 'short' })).status).toBe(400);
    const ok = await http('POST', '/api/auth/register', { username: 'validname', password: 'password123' });
    expect(ok.status).toBe(200);
    expect((await http('POST', '/api/auth/register', { username: 'VALIDNAME', password: 'password123' })).status).toBe(409);
    expect((await http('POST', '/api/auth/login', { username: 'validname', password: 'wrongpass1' })).status).toBe(401);
    const login = await http('POST', '/api/auth/login', { username: 'validname', password: 'password123' });
    expect(login.status).toBe(200);
    const me = await http('GET', '/api/me', undefined, login.cookie);
    expect(me.json.me.username).toBe('validname');
    expect(me.json.me.points).toBe(0);
  });

  it('rejects unauthenticated sockets and state-changing requests without the client header', async () => {
    const s = io(app.url, { transports: ['websocket'], forceNew: true, reconnection: false });
    const err = await new Promise<string>((res) => s.on('connect_error', (e) => res(e.message)));
    expect(err).toBe('unauthorized');
    s.close();
    const login = await http('POST', '/api/auth/login', { username: 'validname', password: 'password123' });
    const r = await http('POST', '/api/shop/buy', { itemId: 'board.mono' }, login.cookie, false);
    expect(r.status).toBe(403);
    expect((await http('GET', '/api/me')).status).toBe(401);
  });
});

describe('online multiplayer', () => {
  let a: Client;
  let b: Client;
  let spectator: Client;
  beforeAll(async () => {
    a = await client('alice');
    b = await client('bobby');
    spectator = await client('carol');
  });
  afterAll(() => {
    for (const c of [a, b, spectator]) c.s.close();
  });

  it('matches ranked players, keeps both clients in sync and updates ratings on checkmate', async () => {
    const { gameId, white, black } = await pairUp(a, b, 'ranked', '3+2');
    const st = white.states.get(gameId)!;
    expect(st.mode).toBe('ranked');
    expect(st.settings.rated).toBe(true);
    expect(st.settings.assistance).toBe(false);

    // cheating attempts are rejected
    expect((await black.emit('game:move', { gameId, uci: 'e7e5' })).error).toBe('Not your turn.');
    expect((await white.emit('game:move', { gameId, uci: 'e7e5' })).error).toBe('Illegal move.');
    expect((await white.emit('game:move', { gameId, uci: 'e1e8' })).error).toBe('Illegal move.');
    expect((await white.emit('game:takeback', { gameId, action: 'request' })).error).toMatch(/disabled/);
    expect((await white.emit('game:hint', { gameId })).error).toMatch(/disabled/);

    // spectator sees the game but cannot move
    const sj = await spectator.emit('game:join', { gameId });
    expect(sj.ok).toBe(true);
    expect(sj.state.yourColor).toBeNull();
    expect((await spectator.emit('game:move', { gameId, uci: 'e2e4' })).error).toMatch(/not playing/);

    await playMoves(gameId, white, black, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    const end = white.states.get(gameId)!;
    expect(end.status).toBe('ended');
    expect(end.result!.winner).toBe('b');
    expect(end.result!.reason).toBe('checkmate');
    expect(end.result!.ratingDelta!.b).toBeGreaterThan(0);
    expect(end.result!.ratingDelta!.w).toBeLessThan(0);
    await wait(() => (spectator.states.get(gameId)?.status ?? '') === 'ended', 3000, 'spectator end');

    const wMe = await http('GET', '/api/me', undefined, white.cookie);
    const bMe = await http('GET', '/api/me', undefined, black.cookie);
    expect(wMe.json.ratings.blitz.rating).toBeLessThan(1000);
    expect(bMe.json.ratings.blitz.rating).toBeGreaterThan(1000);
    expect(bMe.json.ratings.blitz.games).toBe(1);
    const hist = await http('GET', `/api/users/${black.name}/rating-history?category=blitz`);
    expect(hist.json.history).toHaveLength(1);
    const game = await http('GET', `/api/games/${gameId}`);
    expect(game.json.game.result).toBe('0-1');
    expect(game.json.game.white_ip).toBeUndefined(); // never leaked
  });

  it('gives no rewards for very short games (anti-farming) but still records stats', async () => {
    // the checkmate game above was only 2 moves for black
    await wait(() => a.rewards.length > 0 && b.rewards.length > 0, 60000, 'rewards');
    const r = [...a.rewards, ...b.rewards];
    const { ACHIEVEMENT_BY_ID } = await import('@dc/shared');
    for (const x of r) {
      // no game XP / points; only one-time achievement rewards (e.g. "Opening Move") may apply
      void ACHIEVEMENT_BY_ID;
      expect(x.achievements).toEqual([]); // achievements wait for an eligible game
      expect(x.xp).toBe(0);
      expect(x.points).toBe(0);
      expect(x.pointsFromMoves + x.pointsFromResult).toBe(0);
      expect(x.notes.join(' ')).toMatch(/shorter than/);
    }
    const prof = await http('GET', '/api/users/bobby');
    expect(prof.json.stats.games).toBe(1);
  });

  it('awards XP and DC Points for a full game, computed on the server from engine analysis', async () => {
    const { gameId, white, black } = await pairUp(a, b, 'casual', '10+0');
    const line = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1', 'f8e7', 'f1e1', 'b7b5', 'a4b3', 'd7d6', 'c2c3', 'e8g8', 'h2h3', 'c6a5'];
    await playMoves(gameId, white, black, line);
    const before = { a: a.rewards.length, b: b.rewards.length };
    expect((await black.emit('game:resign', { gameId })).ok).toBe(true);
    await wait(() => a.rewards.length > before.a && b.rewards.length > before.b, 120000, 'full-game rewards');
    const wr = (white === a ? a : b).rewards.at(-1)!;
    const br = (black === a ? a : b).rewards.at(-1)!;
    expect(wr.gameId).toBe(gameId);
    expect(wr.xp).toBeGreaterThan(100); // completion + win + moves
    expect(br.xp).toBeGreaterThan(0);
    expect(wr.points).toBeGreaterThan(0);
    expect(wr.notes.join(' ')).toMatch(/share a network/); // both test clients are on 127.0.0.1
    expect(wr.counts).not.toBeNull();
    expect(Object.values(wr.counts!).reduce((x, y) => x + y, 0)).toBe(9);
    expect(wr.accuracy).toBeGreaterThan(0);
    const g = await http('GET', `/api/games/${gameId}`);
    expect(g.json.game.analysis.ratings).toHaveLength(line.length);
    expect(g.json.game.opening_name).toMatch(/Ruy Lopez/);
  });

  it('forfeits a player who disconnects and does not return', async () => {
    const c1 = await client('dave');
    const c2 = await client('erin');
    const { gameId, white, black } = await pairUp(c1, c2, 'casual', '5+0');
    await playMoves(gameId, white, black, ['d2d4', 'd7d5', 'c2c4', 'e7e6']);
    // simulate reconnect first: drop and rejoin quickly keeps the game alive
    black.s.disconnect();
    await new Promise((r) => setTimeout(r, 300));
    expect(white.states.get(gameId)!.black.connected).toBe(false);
    black.s.connect();
    await new Promise<void>((r) => black.s.once('connect', () => r()));
    const rj = await black.emit('game:join', { gameId });
    expect(rj.ok).toBe(true);
    expect(rj.state.moves).toHaveLength(4);
    expect(rj.state.status).toBe('active');
    // now leave for good
    black.s.disconnect();
    await wait(() => white.states.get(gameId)?.status === 'ended', 6000, 'abandon');
    expect(white.states.get(gameId)!.result).toMatchObject({ winner: 'w', reason: 'abandoned' });
    c1.s.close();
    c2.s.close();
  });
});

describe('economy, cosmetics and social', () => {
  let a: Client;
  let b: Client;
  beforeAll(async () => {
    a = await client('frank');
    b = await client('grace');
  });
  afterAll(() => {
    a.s.close();
    b.s.close();
  });

  it('validates purchases on the server', async () => {
    let r = await http('POST', '/api/shop/buy', { itemId: 'board.mono' }, a.cookie);
    expect(r.status).toBe(402); // cannot afford
    r = await http('POST', '/api/shop/buy', { itemId: 'pieces.animated' }, a.cookie);
    expect(r.status).toBe(403); // level reward, not purchasable
    r = await http('POST', '/api/me/equip', { type: 'board', itemId: 'board.mono' }, a.cookie);
    expect(r.status).toBe(403); // not owned
    app.db.prepare('UPDATE users SET points = 200 WHERE id = ?').run(a.id);
    r = await http('POST', '/api/shop/buy', { itemId: 'board.mono' }, a.cookie);
    expect(r.status).toBe(200);
    expect(r.json.points).toBe(50);
    r = await http('POST', '/api/shop/buy', { itemId: 'board.mono' }, a.cookie);
    expect(r.status).toBe(402); // already owned
    r = await http('POST', '/api/me/equip', { type: 'board', itemId: 'board.mono' }, a.cookie);
    expect(r.status).toBe(200);
    r = await http('POST', '/api/me/equip', { type: 'pieces', itemId: 'board.wood' }, a.cookie);
    expect(r.status).toBe(400); // wrong type
    const me = await http('GET', '/api/me', undefined, a.cookie);
    expect(me.json.me.equipped.board).toBe('board.mono');
    expect(me.json.me.inventory).toContain('board.mono');
  });

  it('handles friend requests and parties end to end', async () => {
    let r = await http('POST', '/api/friends/request', { username: 'grace' }, a.cookie);
    expect(r.json.ok).toBe(true);
    r = await http('POST', '/api/friends/request', { username: 'frank' }, a.cookie);
    expect(r.status).toBe(400);
    const pending = await http('GET', '/api/friends', undefined, b.cookie);
    expect(pending.json.incoming.map((f: any) => f.username)).toEqual(['frank']);
    r = await http('POST', '/api/friends/respond', { userId: a.id, accept: true }, b.cookie);
    expect(r.json.ok).toBe(true);
    const list = await http('GET', '/api/friends', undefined, a.cookie);
    expect(list.json.friends[0].username).toBe('grace');
    expect(list.json.friends[0].status).toBe('online');
    const ach = await http('GET', '/api/achievements', undefined, a.cookie);
    expect(ach.json.achievements.find((x: any) => x.id === 'first_friend').unlockedAt).not.toBeNull();

    const created = await a.emit('party:create');
    expect(created.ok).toBe(true);
    const code = created.party.code;
    const joined = await b.emit('party:join', { code });
    expect(joined.ok).toBe(true);
    expect(joined.party.members).toHaveLength(2);
    expect((await b.emit('party:settings', { settings: { tc: { initial: 600, increment: 5 } } })).error).toMatch(/leader/);
    expect((await a.emit('party:settings', { settings: { tc: { initial: 600, increment: 5 }, color: 'white', takebacks: true } })).ok).toBe(true);
    const notReady = await a.emit('party:start');
    expect(notReady.error).toMatch(/ready/);
    expect((await b.emit('party:ready', { ready: true })).ok).toBe(true);
    const start = await a.emit('party:start');
    expect(start.ok).toBe(true);
    const j = await a.emit('game:join', { gameId: start.gameId });
    expect(j.state.mode).toBe('private');
    expect(j.state.settings.takebacks).toBe(true);
    expect(j.state.settings.tc).toEqual({ initial: 600, increment: 5 });
    expect(j.state.yourColor).toBe('w');
    await a.emit('game:abort', { gameId: start.gameId });
  });

  it('creates private rooms joinable by code', async () => {
    const c = await a.emit('challenge:create', { settings: { tc: { initial: 180, increment: 2 }, color: 'black' } });
    expect(c.ok).toBe(true);
    expect((await a.emit('challenge:accept', { id: c.challenge.code })).error).toMatch(/own challenge/);
    const acc = await b.emit('challenge:accept', { id: c.challenge.code.toLowerCase() });
    expect(acc.ok).toBe(true);
    const j = await a.emit('game:join', { gameId: acc.gameId });
    expect(j.state.yourColor).toBe('b');
    await a.emit('game:abort', { gameId: acc.gameId });
  });
});

describe('bots', () => {
  it('plays a server-side bot game and rewards the human', async () => {
    const h = await client('henry');
    const st = await h.emit('bot:start', { botId: 'rookie', settings: { tc: { initial: 0, increment: 0 }, color: 'white', assistance: true } });
    expect(st.ok).toBe(true);
    const gameId = st.gameId;
    const ratings: any[] = [];
    h.s.on('game:rating', (r) => ratings.push(r));
    const j = await h.emit('game:join', { gameId });
    h.states.set(gameId, j.state);
    expect((await h.emit('bot:start', { botId: 'casual', settings: {} })).error).toMatch(/current game/);
    const { Chess } = await import('chess.js');
    for (let i = 0; i < 10; i++) {
      const s = h.states.get(gameId)!;
      if (s.status !== 'active') break;
      await wait(() => h.states.get(gameId)!.fen.split(' ')[1] === 'w' || h.states.get(gameId)!.status !== 'active', 15000, 'bot reply');
      const cur = h.states.get(gameId)!;
      if (cur.status !== 'active') break;
      const c = new Chess(cur.fen);
      const mv = c.moves({ verbose: true }).sort((x, y) => (y.captured ? 1 : 0) - (x.captured ? 1 : 0))[0];
      const n = cur.moves.length;
      expect((await h.emit('game:move', { gameId, uci: mv.from + mv.to + (mv.promotion ?? '') })).ok).toBe(true);
      await wait(() => (h.states.get(gameId)?.moves.length ?? 0) > n, 5000, 'own move');
    }
    await wait(() => ratings.length >= 3, 30000, 'live ratings');
    const s = h.states.get(gameId)!;
    if (s.status === 'active') expect((await h.emit('game:resign', { gameId })).ok).toBe(true);
    await wait(() => h.rewards.length > 0, 120000, 'bot rewards');
    expect(h.rewards[0].xp).toBeGreaterThan(0);
    const recs = await http('GET', '/api/bots', undefined, h.cookie);
    expect(recs.json.bots.find((x: any) => x.id === 'rookie').record.games).toBe(1);
    h.s.close();
  });
});
