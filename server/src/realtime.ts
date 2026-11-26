import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { BOT_BY_ID, type GameRewards, type MoveRating, type Notification, type PartyState, type Side } from '@dc/shared';
import type { DB } from './db';
import { cookieToken, sessionUser } from './auth';
import { GameManager } from './game/manager';
import type { GameRoom, HumanSeat } from './game/room';
import { Matchmaker, type QueueMode } from './matchmaking';
import { ChallengeService, PartyService, areFriends, friendIds, sanitizeSettings } from './social';
import { config } from './config';
import { getUser, publicProfile, setPresence } from './users';
import { bus } from './bus';

type Ack = (res: { ok: boolean; error?: string; [k: string]: unknown }) => void;

interface SocketData {
  userId: string;
  ip: string;
  games: Set<string>;
  bucket: { tokens: number; last: number };
}

export interface Realtime {
  io: Server;
  games: GameManager;
  mm: Matchmaker;
  parties: PartyService;
  challenges: ChallengeService;
  statusOf: (userId: string) => 'online' | 'offline' | 'playing' | 'searching';
  close: () => void;
}

export function clientIp(headers: Record<string, string | string[] | undefined>, fallback: string): string {
  const xf = headers['x-forwarded-for'];
  const v = Array.isArray(xf) ? xf[0] : xf;
  return (process.env.TRUST_PROXY === '1' && v ? v.split(',')[0].trim() : fallback) || 'unknown';
}

export function createRealtime(http: HttpServer, db: DB, opts: { corsOrigin?: string } = {}): Realtime {
  const io = new Server(http, {
    cors: opts.corsOrigin ? { origin: opts.corsOrigin, credentials: true } : undefined,
    pingInterval: 10000,
    pingTimeout: 8000,
    maxHttpBufferSize: 64 * 1024,
  });
  const games = new GameManager(db);
  const mm = new Matchmaker(db, games);
  const parties = new PartyService(db);
  const challenges = new ChallengeService();
  const userSockets = new Map<string, Set<string>>();

  const ipOf = (id: string) =>
    [...(userSockets.get(id) ?? [])].map((sid) => (io.sockets.sockets.get(sid)?.data as SocketData | undefined)?.ip).find(Boolean) ?? 'unknown';
  const isOnline = (id: string) => (userSockets.get(id)?.size ?? 0) > 0;
  const statusOf = (id: string) => {
    if (games.activeGameOf(id)) return 'playing' as const;
    if (mm.queue.has(id)) return 'searching' as const;
    return isOnline(id) ? ('online' as const) : ('offline' as const);
  };
  setPresence({ online: isOnline, playing: (id) => games.activeGameOf(id)?.id ?? null });

  const toUser = (userId: string, ev: string, payload: unknown) => io.to(`u:${userId}`).emit(ev, payload);
  const broadcastStatus = (userId: string) => {
    const status = statusOf(userId);
    const u = getUser(db, userId);
    const hidden = u && JSON.parse(u.privacy || '{}').showOnline === false;
    for (const f of friendIds(db, userId)) toUser(f, 'friends:status', { id: userId, status: hidden ? 'offline' : status });
  };

  // ------------------------------------------------------------------ game broadcasting
  function sendState(room: GameRoom) {
    const sockets = io.sockets.adapter.rooms.get(`g:${room.id}`);
    if (!sockets) return;
    for (const sid of sockets) {
      const s = io.sockets.sockets.get(sid);
      if (!s) continue;
      const side = room.sideOfUser((s.data as SocketData).userId);
      s.emit('game:state', room.state(side));
    }
  }

  function wireRoom(room: GameRoom) {
    room.on('update', () => sendState(room));
    room.on('rating', (side: Side, r: MoveRating) => {
      const seat = room.seats[side];
      if (seat.kind === 'human') toUser(seat.userId, 'game:rating', { gameId: room.id, rating: r });
    });
    room.on('botMessage', (_side: Side, msg: string) => io.to(`g:${room.id}`).emit('game:bot', { gameId: room.id, message: msg }));
    for (const s of room.humanSides()) {
      const uid = (room.seats[s] as HumanSeat).userId;
      toUser(uid, 'match:found', { gameId: room.id });
      broadcastStatus(uid);
      // a player in a game is no longer searching
      mm.leave(uid);
    }
  }
  const listeners: [string, (...a: any[]) => void][] = [];
  const listen = (ev: string, fn: (...a: any[]) => void) => {
    bus.on(ev, fn);
    listeners.push([ev, fn]);
  };
  listen('game:created', wireRoom);
  listen('game:ended', (room: GameRoom) => {
    for (const s of room.humanSides()) broadcastStatus((room.seats[s] as HumanSeat).userId);
    const party = [...parties.parties.values()].find((p) => p.gameId === room.id);
    if (party) parties.setGame(party, null);
  });
  listen('game:analysis', (gameId: string) => io.to(`g:${gameId}`).emit('game:analysis', { gameId }));
  listen('game:rewards', (uid: string, r: GameRewards) => {
    toUser(uid, 'game:rewards', r);
    toUser(uid, 'me:update', {});
  });
  listen('notify', (uid: string, n: Notification) => toUser(uid, 'notification', n));

  mm.onMatch = () => {};
  mm.onUpdate = (uid) => toUser(uid, 'queue:status', mm.status(uid));
  parties.onChange = (state: PartyState | null, members: string[]) => {
    for (const m of members) {
      const mine = parties.partyOf(m);
      toUser(m, 'party:state', mine ? parties.state(mine) : null);
    }
    void state;
  };

  // ------------------------------------------------------------------ auth
  io.use((socket, next) => {
    const token = cookieToken(socket.handshake.headers.cookie) ?? (socket.handshake.auth?.token as string | undefined);
    const userId = sessionUser(db, token);
    if (!userId) return next(new Error('unauthorized'));
    const data: SocketData = {
      userId,
      ip: clientIp(socket.handshake.headers, socket.handshake.address),
      games: new Set(),
      bucket: { tokens: 40, last: Date.now() },
    };
    socket.data = data;
    next();
  });

  function limited(s: Socket): boolean {
    const b = (s.data as SocketData).bucket;
    const t = Date.now();
    b.tokens = Math.min(40, b.tokens + ((t - b.last) / 1000) * 15);
    b.last = t;
    if (b.tokens < 1) return true;
    b.tokens -= 1;
    return false;
  }

  io.on('connection', (socket) => {
    const data = socket.data as SocketData;
    const uid = data.userId;
    socket.join(`u:${uid}`);
    if (!userSockets.has(uid)) userSockets.set(uid, new Set());
    const wasOnline = isOnline(uid);
    userSockets.get(uid)!.add(socket.id);
    if (!wasOnline) broadcastStatus(uid);
    db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), uid);

    // initial push
    const active = games.activeGameOf(uid);
    socket.emit('hello', { activeGameId: active?.id ?? null, queue: mm.status(uid) });
    const party = parties.partyOf(uid);
    if (party) socket.emit('party:state', parties.state(party));

    const on = (ev: string, fn: (payload: any, ack: Ack) => void) => {
      socket.on(ev, (payload: unknown, ack?: Ack) => {
        const reply: Ack = typeof ack === 'function' ? ack : () => {};
        if (limited(socket)) return reply({ ok: false, error: 'Slow down.' });
        try {
          fn(payload ?? {}, reply);
        } catch (e) {
          console.error(`[socket] ${ev} failed`, e);
          reply({ ok: false, error: (e as Error).message || 'Server error' });
        }
      });
    };

    const roomFor = (gameId: unknown) => (typeof gameId === 'string' ? games.rooms.get(gameId) ?? null : null);
    const mySide = (room: GameRoom) => room.sideOfUser(uid);
    const result = (err: string | null, ack: Ack, extra: Record<string, unknown> = {}) => ack(err ? { ok: false, error: err } : { ok: true, ...extra });

    // ---------------------------------------------------------------- queue
    on('queue:join', (p, ack) => {
      const mode: QueueMode = p.mode === 'ranked' ? 'ranked' : p.mode === 'quick' ? 'quick' : 'casual';
      if (parties.partyOf(uid)?.gameId) return ack({ ok: false, error: 'Your party is in a match.' });
      const err = mm.join(uid, data.ip, mode, String(p.tc ?? '5+0'));
      broadcastStatus(uid);
      result(err, ack, { status: mm.status(uid) });
    });
    on('queue:leave', (_p, ack) => {
      mm.leave(uid);
      broadcastStatus(uid);
      toUser(uid, 'queue:status', mm.status(uid));
      ack({ ok: true });
    });

    // ---------------------------------------------------------------- bots
    on('bot:start', (p, ack) => {
      if (!BOT_BY_ID[p.botId]) return ack({ ok: false, error: 'Unknown bot.' });
      if (games.activeGameOf(uid)) return ack({ ok: false, error: 'Finish or resign your current game first.', gameId: games.activeGameOf(uid)!.id });
      const s = sanitizeSettings({ ...p.settings, rated: false }, { allowUntimed: true, allowRated: false });
      if (typeof s === 'string') return ack({ ok: false, error: s });
      mm.leave(uid);
      const room = games.createBotGame(p.botId, s, { userId: uid, ip: data.ip });
      ack({ ok: true, gameId: room.id });
    });

    // ---------------------------------------------------------------- games
    on('game:join', (p, ack) => {
      const room = roomFor(p.gameId);
      if (!room) return ack({ ok: false, error: 'Game not found or already archived.' });
      const side = mySide(room);
      if (!side && !room.settings.spectators) return ack({ ok: false, error: 'Spectators are disabled for this game.' });
      socket.join(`g:${room.id}`);
      if (!data.games.has(room.id)) {
        data.games.add(room.id);
        if (side) room.setConnected(side, 1);
        else {
          room.spectators.add(socket.id);
          sendState(room);
        }
      }
      const rewards = games.rewards.get(room.id)?.get(uid) ?? null;
      ack({ ok: true, state: room.state(side), ratings: room.ratingsFor(side), rewards });
    });
    on('game:leave', (p, ack) => {
      const room = roomFor(p.gameId);
      if (room && data.games.has(room.id)) leaveGame(room);
      ack({ ok: true });
    });
    const withSide = (p: any, ack: Ack, fn: (room: GameRoom, side: Side) => void) => {
      const room = roomFor(p.gameId);
      if (!room) return ack({ ok: false, error: 'Game not found.' });
      const side = mySide(room);
      if (!side) return ack({ ok: false, error: 'You are not playing in this game.' });
      fn(room, side);
    };
    on('game:move', (p, ack) => withSide(p, ack, (room, side) => result(room.move(side, String(p.uci ?? '')), ack)));
    on('game:resign', (p, ack) => withSide(p, ack, (room, side) => result(room.resign(side), ack)));
    on('game:abort', (p, ack) => withSide(p, ack, (room, side) => result(room.abort(side), ack)));
    on('game:draw', (p, ack) =>
      withSide(p, ack, (room, side) => {
        if (p.action === 'offer') result(room.offerDraw(side), ack);
        else result(room.respondDraw(side, p.action === 'accept'), ack);
      }),
    );
    on('game:takeback', (p, ack) =>
      withSide(p, ack, (room, side) => {
        if (p.action === 'request') result(room.requestTakeback(side), ack);
        else result(room.respondTakeback(side, p.action === 'accept'), ack);
      }),
    );
    on('game:hint', (p, ack) =>
      withSide(p, ack, (room, side) => {
        const r = room.hint(side);
        if (typeof r === 'string') return ack({ ok: false, error: r });
        r.then((uci) => ack({ ok: true, uci })).catch(() => ack({ ok: false, error: 'Engine unavailable.' }));
      }),
    );
    on('game:assist', (p, ack) =>
      withSide(p, ack, (room, side) => {
        if (room.status !== 'active') return ack({ ok: false });
        room.hintsUsed[side]++;
        // admin assist (hacker mode) no longer changes whether the game is rated
        ack({ ok: true });
      }),
    );
    on('game:rematch', (p, ack) =>
      withSide(p, ack, (room, side) => {
        if (room.mode === 'bot') {
          const botSide: Side = side === 'w' ? 'b' : 'w';
          const bot = room.seats[botSide];
          if (bot.kind !== 'bot') return ack({ ok: false, error: 'Not a bot game.' });
          if (games.activeGameOf(uid)) return ack({ ok: false, error: 'Already in a game.' });
          const next = games.createBotGame(bot.bot.id, { ...room.settings, color: side === 'w' ? 'black' : 'white' }, { userId: uid, ip: data.ip });
          return ack({ ok: true, gameId: next.id });
        }
        const refs = {
          w: { userId: (room.seats.w as HumanSeat).userId, ip: (room.seats.w as HumanSeat).ip },
          b: { userId: (room.seats.b as HumanSeat).userId, ip: (room.seats.b as HumanSeat).ip },
        };
        refs[side].ip = data.ip;
        const r = games.rematch(room, side, refs);
        if (typeof r === 'string') return r === 'pending' ? ack({ ok: true, pending: true }) : ack({ ok: false, error: r });
        ack({ ok: true, gameId: r.id });
      }),
    );

    // ---------------------------------------------------------------- challenges (private matches / friend invites)
    on('challenge:create', (p, ack) => {
      const s = sanitizeSettings(p.settings, { allowUntimed: false, allowRated: true });
      if (typeof s === 'string') return ack({ ok: false, error: s });
      let to: string | null = null;
      if (p.to) {
        const target = getUser(db, String(p.to));
        if (!target) return ack({ ok: false, error: 'Player not found.' });
        const privacy = JSON.parse(target.privacy || '{}');
        const allow = privacy.allowChallenges ?? 'everyone';
        if (allow === 'nobody' || (allow === 'friends' && !areFriends(db, uid, target.id))) return ack({ ok: false, error: `${target.username} is not accepting challenges.` });
        if (!isOnline(target.id)) return ack({ ok: false, error: `${target.username} is offline.` });
        to = target.id;
      }
      const ch = challenges.create(uid, to, s);
      if (to) {
        const me = getUser(db, uid)!;
        toUser(to, 'challenge:incoming', { challenge: ch, from: publicProfile(db, me) });
      }
      ack({ ok: true, challenge: ch });
    });
    on('challenge:accept', (p, ack) => {
      const ch = challenges.find(String(p.id ?? ''));
      if (!ch) return ack({ ok: false, error: 'Challenge not found or expired.' });
      if (ch.from === uid) return ack({ ok: false, error: 'You cannot accept your own challenge.' });
      if (ch.to && ch.to !== uid) return ack({ ok: false, error: 'This challenge is for someone else.' });
      const fromIp = ipOf(ch.from);
      if (ch.settings.rated && config.blockSameIpRanked && fromIp === data.ip)
        return ack({ ok: false, error: 'Rated games between players on the same network are not allowed.' });
      if (!isOnline(ch.from)) return ack({ ok: false, error: 'The challenger is no longer online.' });
      challenges.remove(ch.id);
      try {
        const room = games.createHumanGame(ch.settings.rated ? 'ranked' : 'private', ch.settings, { userId: ch.from, ip: fromIp }, { userId: uid, ip: data.ip });
        toUser(ch.from, 'challenge:removed', { id: ch.id });
        ack({ ok: true, gameId: room.id });
      } catch (e) {
        ack({ ok: false, error: (e as Error).message });
      }
    });
    on('challenge:decline', (p, ack) => {
      const ch = challenges.find(String(p.id ?? ''));
      if (!ch || (ch.to !== uid && ch.from !== uid)) return ack({ ok: false, error: 'Challenge not found.' });
      challenges.remove(ch.id);
      toUser(ch.from, 'challenge:removed', { id: ch.id, declined: ch.to === uid });
      if (ch.to) toUser(ch.to, 'challenge:removed', { id: ch.id });
      ack({ ok: true });
    });
    on('challenge:list', (_p, ack) => ack({ ok: true, challenges: challenges.mine(uid) }));

    // ---------------------------------------------------------------- parties
    on('party:create', (_p, ack) => {
      const party = parties.create(uid);
      ack({ ok: true, party: parties.state(party) });
    });
    on('party:join', (p, ack) => {
      const r = parties.join(uid, String(p.code ?? ''));
      if (typeof r === 'string') return ack({ ok: false, error: r });
      ack({ ok: true, party: parties.state(r) });
    });
    on('party:leave', (_p, ack) => {
      parties.leave(uid);
      ack({ ok: true });
    });
    on('party:invite', (p, ack) => {
      const target = getUser(db, String(p.userId ?? ''));
      if (!target) return ack({ ok: false, error: 'Player not found.' });
      if (!areFriends(db, uid, target.id)) return ack({ ok: false, error: 'You can only invite friends.' });
      result(parties.invite(uid, target.id), ack);
    });
    on('party:kick', (p, ack) => result(parties.kick(uid, String(p.userId ?? '')), ack));
    on('party:ready', (p, ack) => result(parties.setReady(uid, !!p.ready), ack));
    on('party:settings', (p, ack) => result(parties.setSettings(uid, p.settings), ack));
    on('party:players', (p, ack) => result(parties.setPlayers(uid, p.players), ack));
    on('party:start', (_p, ack) => {
      const r = parties.canStart(uid);
      if (typeof r === 'string') return ack({ ok: false, error: r });
      try {
        for (const pl of r.players) if (!isOnline(pl)) throw new Error(`${getUser(db, pl)!.username} is offline.`);
        const room = games.createHumanGame('private', r.party.settings, { userId: r.players[0], ip: ipOf(r.players[0]) }, { userId: r.players[1], ip: ipOf(r.players[1]) });
        parties.setGame(r.party, room.id);
        for (const m of r.party.members) if (!r.players.includes(m)) toUser(m, 'party:game', { gameId: room.id, spectate: true });
        ack({ ok: true, gameId: room.id });
      } catch (e) {
        ack({ ok: false, error: (e as Error).message });
      }
    });

    // ---------------------------------------------------------------- disconnect
    function leaveGame(room: GameRoom) {
      data.games.delete(room.id);
      socket.leave(`g:${room.id}`);
      const side = room.sideOfUser(uid);
      if (side) room.setConnected(side, -1);
      else if (room.spectators.delete(socket.id)) sendState(room);
    }

    socket.on('disconnect', () => {
      for (const gid of [...data.games]) {
        const room = games.rooms.get(gid);
        if (room) leaveGame(room);
      }
      const set = userSockets.get(uid);
      set?.delete(socket.id);
      if (!set?.size) {
        userSockets.delete(uid);
        mm.leave(uid);
        // grace period before leaving the party
        (setTimeout(() => {
          if (!isOnline(uid)) parties.leave(uid);
        }, 60_000) as any).unref?.();
        broadcastStatus(uid);
      }
    });
  });

  return {
    io,
    games,
    mm,
    parties,
    challenges,
    statusOf,
    close: () => {
      for (const [ev, fn] of listeners) bus.off(ev, fn);
      mm.stop();
      io.close();
    },
  };
}
