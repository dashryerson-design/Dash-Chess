import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Chess } from 'chess.js';
import {
  ACHIEVEMENTS,
  findRival,
  BOTS,
  COSMETICS,
  COSMETIC_BY_ID,
  DEFAULT_EQUIPPED,
  DIVISION_CONFIG,
  MAX_LEVEL,
  PLACEMENT_GAMES,
  TIME_CATEGORIES,
  activeChallenges,
  divisionFor,
  levelFromXp,
  levelReward,
  seasonEnds,
  seasonKey,
  seasonLabel,
  type CosmeticType,
  type TimeCategory,
} from '@dc/shared';
import type { DB } from './db';
import { createSession, destroySession, sessionUser, validPassword, validUsername, verifyPassword, hashPassword } from './auth';
import {
  createUser,
  equippedOf,
  getRatings,
  getUser,
  getUserByName,
  grantItem,
  grantXp,
  meOf,
  notify,
  overallFor,
  publicProfile,
  type UserRow,
} from './users';
import type { Realtime } from './realtime';
import { acceptFriend, declineFriend, listFriends, removeFriend, sendFriendRequest } from './social';
import { achievementStats, advanceChallenges, checkAchievements, ensureAnalysis } from './game/finish';
import { allPuzzles, checkSolution, dailyPuzzle, puzzleById, stepPuzzle } from './puzzles';
import { bookMoves, epdOf, openingAt } from './openings';
import { config } from './config';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string | null;
  }
}

const COOKIE = 'dc_session';

export function registerRoutes(app: FastifyInstance, db: DB, rt: Realtime) {
  app.decorateRequest('userId', null);
  app.addHook('preHandler', async (req, reply) => {
    req.userId = sessionUser(db, req.cookies[COOKIE]);
    // CSRF defence in depth: state-changing API calls must come from our client (custom header).
    if (req.url.startsWith('/api/') && req.method !== 'GET' && req.headers['x-dc-client'] !== '1') {
      return reply.code(403).send({ error: 'Missing client header.' });
    }
  });

  const auth = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.userId) return reply.code(401).send({ error: 'Please log in.' });
  };
  const me = (req: FastifyRequest) => getUser(db, req.userId!)!;
  const bad = (reply: FastifyReply, error: string, code = 400) => reply.code(code).send({ error });

  const setCookie = (reply: FastifyReply, token: string) =>
    reply.setCookie(COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: config.sessionDays * 86400 });

  const authLimit = { config: { rateLimit: { max: config.isTest ? 1000 : 10, timeWindow: '1 minute' } } };

  // ------------------------------------------------------------------ auth
  const creds = z.object({ username: z.string().max(32), password: z.string().max(200) });
  app.post('/api/auth/register', authLimit, async (req, reply) => {
    const p = creds.safeParse(req.body);
    if (!p.success) return bad(reply, 'Invalid request.');
    const { username, password } = p.data;
    const uErr = validUsername(username) ?? validPassword(password);
    if (uErr) return bad(reply, uErr);
    if (getUserByName(db, username)) return bad(reply, 'That username is taken.', 409);
    const id = createUser(db, username, password);
    setCookie(reply, createSession(db, id, req.headers['user-agent']));
    return { me: meOf(db, getUser(db, id)!) };
  });

  app.post('/api/auth/login', authLimit, async (req, reply) => {
    const p = creds.safeParse(req.body);
    if (!p.success) return bad(reply, 'Invalid request.');
    const u = getUserByName(db, p.data.username);
    if (!u || !verifyPassword(p.data.password, u.password_hash)) return bad(reply, 'Incorrect username or password.', 401);
    setCookie(reply, createSession(db, u.id, req.headers['user-agent']));
    return { me: meOf(db, u) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    destroySession(db, req.cookies[COOKIE]);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/config', async () => ({
    analysisDepth: config.analysisDepth,
    placementGames: PLACEMENT_GAMES,
    divisions: DIVISION_CONFIG.map((d) => ({ ...d, max: Number.isFinite(d.max) ? d.max : null })),
    season: { key: seasonKey(), label: seasonLabel(seasonKey()), endsAt: seasonEnds().getTime() },
  }));

  // ------------------------------------------------------------------ me
  app.get('/api/me', { preHandler: auth }, async (req) => {
    claimSeasonRewards(db, req.userId!);
    const u = me(req);
    const ratings = getRatings(db, u.id);
    return {
      me: meOf(db, u),
      ratings,
      level: levelFromXp(u.xp),
      activeGameId: rt.games.activeGameOf(u.id)?.id ?? null,
      unread: (db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read = 0').get(u.id) as { n: number }).n,
    };
  });

  app.patch('/api/me/settings', { preHandler: auth }, async (req, reply) => {
    const body = req.body as { settings?: unknown };
    const json = JSON.stringify(body?.settings ?? {});
    if (json.length > 8000) return bad(reply, 'Settings too large.');
    db.prepare('UPDATE users SET settings = ? WHERE id = ?').run(json, req.userId);
    return { ok: true };
  });

  app.patch('/api/me/privacy', { preHandler: auth }, async (req, reply) => {
    const p = z
      .object({ showOnline: z.boolean().optional(), allowChallenges: z.enum(['everyone', 'friends', 'nobody']).optional() })
      .safeParse(req.body);
    if (!p.success) return bad(reply, 'Invalid privacy settings.');
    const u = me(req);
    const merged = { showOnline: true, allowChallenges: 'everyone', ...JSON.parse(u.privacy || '{}'), ...p.data };
    db.prepare('UPDATE users SET privacy = ? WHERE id = ?').run(JSON.stringify(merged), u.id);
    return { ok: true, privacy: merged };
  });

  app.post('/api/me/username', { preHandler: auth }, async (req, reply) => {
    const username = String((req.body as any)?.username ?? '');
    const err = validUsername(username);
    if (err) return bad(reply, err);
    const u = me(req);
    if (u.username_changed_at && Date.now() - u.username_changed_at < 30 * 86400_000) return bad(reply, 'You can change your username once every 30 days.');
    const other = getUserByName(db, username);
    if (other && other.id !== u.id) return bad(reply, 'That username is taken.', 409);
    db.prepare('UPDATE users SET username = ?, username_changed_at = ? WHERE id = ?').run(username, Date.now(), u.id);
    return { ok: true };
  });

  app.post('/api/me/password', { preHandler: auth }, async (req, reply) => {
    const b = req.body as { current?: string; next?: string };
    const u = me(req);
    if (!b?.current || !verifyPassword(b.current, u.password_hash)) return bad(reply, 'Current password is incorrect.', 401);
    const err = validPassword(String(b.next ?? ''));
    if (err) return bad(reply, err);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(b.next!), u.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(u.id, '');
    setCookie(reply, createSession(db, u.id, req.headers['user-agent']));
    return { ok: true };
  });

  app.post('/api/me/equip', { preHandler: auth }, async (req, reply) => {
    const p = z.object({ type: z.string(), itemId: z.string().nullable() }).safeParse(req.body);
    if (!p.success) return bad(reply, 'Invalid request.');
    const type = p.data.type as CosmeticType;
    if (!(type in DEFAULT_EQUIPPED)) return bad(reply, 'Unknown cosmetic type.');
    const u = me(req);
    const eq = equippedOf(u);
    const itemId = p.data.itemId ?? DEFAULT_EQUIPPED[type];
    const item = COSMETIC_BY_ID[itemId];
    if (!item || item.type !== type) return bad(reply, 'Unknown item.');
    const owned = db.prepare('SELECT 1 FROM inventory WHERE user_id = ? AND item_id = ?').get(u.id, itemId);
    if (!owned && item.unlock.kind !== 'default') return bad(reply, 'You do not own that item.', 403);
    eq[type] = itemId;
    db.prepare('UPDATE users SET equipped = ? WHERE id = ?').run(JSON.stringify(eq), u.id);
    return { ok: true, equipped: eq };
  });

  // ------------------------------------------------------------------ players
  app.get('/api/users/search', { preHandler: auth }, async (req) => {
    const q = String((req.query as any).q ?? '').trim();
    if (q.length < 2) return { users: [] };
    const rows = db.prepare(`SELECT * FROM users WHERE username LIKE ? ESCAPE '\\' ORDER BY length(username) LIMIT 20`).all(q.replace(/[%_\\]/g, (c) => '\\' + c) + '%') as UserRow[];
    return { users: rows.filter((u) => u.id !== req.userId).map((u) => publicProfile(db, u)) };
  });

  const findUser = (name: string) => getUserByName(db, name) ?? getUser(db, name);

  app.get('/api/users/:name', async (req, reply) => {
    const u = findUser((req.params as any).name);
    if (!u) return bad(reply, 'Player not found.', 404);
    const stats = playerStats(db, u.id);
    const ratings = getRatings(db, u.id);
    const achievements = db.prepare('SELECT achievement_id, unlocked_at FROM achievements WHERE user_id = ? ORDER BY unlocked_at DESC').all(u.id);
    return { profile: publicProfile(db, u), ratings, stats, achievements, status: rt.statusOf(u.id), activeGameId: rt.games.activeGameOf(u.id)?.id ?? null };
  });

  app.get('/api/users/:name/games', async (req, reply) => {
    const u = findUser((req.params as any).name);
    if (!u) return bad(reply, 'Player not found.', 404);
    const q = req.query as { offset?: string; limit?: string; filter?: string };
    const limit = Math.min(50, Math.max(1, Number(q.limit ?? 20)));
    const offset = Math.max(0, Number(q.offset ?? 0));
    const filter = q.filter ?? 'all';
    let where = 'pg.user_id = ?';
    if (filter === 'bots') where += ' AND pg.opponent_bot IS NOT NULL';
    else if (filter === 'online') where += ' AND pg.opponent_bot IS NULL';
    else if (filter === 'ranked') where += ' AND g.rated = 1';
    else if (filter === 'wins') where += ' AND pg.score = 1';
    else if (filter === 'losses') where += ' AND pg.score = 0';
    const rows = db
      .prepare(
        `SELECT g.id, g.mode, g.rated, g.category, g.tc_initial, g.tc_increment, g.white_id, g.black_id, g.white_bot, g.black_bot, g.white_name, g.black_name,
                g.white_rating, g.black_rating, g.white_delta, g.black_delta, g.result, g.winner, g.reason, g.opening_name, g.opening_eco, g.ply_count,
                g.started_at, g.ended_at, g.duration_ms, pg.color, pg.score, pg.xp, pg.points, pg.accuracy, pg.counts
         FROM player_games pg JOIN games g ON g.id = pg.game_id WHERE ${where} ORDER BY pg.ended_at DESC LIMIT ? OFFSET ?`,
      )
      .all(u.id, limit + 1, offset) as any[];
    const iconCache = new Map<string, string>();
    const iconOf = (id: string | null, bot: string | null) => {
      if (bot) return findRival(bot)?.icon ?? `bot.${bot}`;
      if (!id) return 'icon.pawn';
      if (!iconCache.has(id)) {
        const uu = getUser(db, id);
        iconCache.set(id, uu ? equippedOf(uu).icon : 'icon.pawn');
      }
      return iconCache.get(id)!;
    };
    return {
      games: rows.slice(0, limit).map((r) => ({
        ...r,
        counts: r.counts ? JSON.parse(r.counts) : null,
        white_icon: iconOf(r.white_id, r.white_bot),
        black_icon: iconOf(r.black_id, r.black_bot),
      })),
      more: rows.length > limit,
    };
  });

  app.get('/api/users/:name/rating-history', async (req, reply) => {
    const u = findUser((req.params as any).name);
    if (!u) return bad(reply, 'Player not found.', 404);
    const cat = String((req.query as any).category ?? 'blitz');
    if (!TIME_CATEGORIES.includes(cat as TimeCategory)) return bad(reply, 'Unknown category.');
    const rows = db
      .prepare('SELECT rating_before, rating_after, created_at, game_id FROM rating_history WHERE user_id = ? AND category = ? ORDER BY created_at ASC LIMIT 500')
      .all(u.id, cat);
    return { history: rows };
  });

  // ------------------------------------------------------------------ games
  app.get('/api/games/live', async () => {
    const live = [...rt.games.rooms.values()]
      .filter((r) => r.status === 'active' && r.settings.spectators)
      .slice(0, 50)
      .map((r) => ({ id: r.id, mode: r.mode, white: r.seatInfo('w'), black: r.seatInfo('b'), fen: r.chess.fen(), moves: r.moves.length, tc: r.settings.tc, spectators: r.spectators.size }));
    return { games: live };
  });

  app.get('/api/games/:id', async (req, reply) => {
    const id = (req.params as any).id;
    const g = db.prepare('SELECT * FROM games WHERE id = ?').get(id) as any;
    if (!g) {
      const room = rt.games.rooms.get(id);
      if (room) return { live: true, gameId: id };
      return bad(reply, 'Game not found.', 404);
    }
    const pgs = db.prepare('SELECT user_id, color, xp, points, accuracy, counts, rewarded, rewards FROM player_games WHERE game_id = ?').all(id) as any[];
    const mine = req.userId ? pgs.find((p) => p.user_id === req.userId) : null;
    return {
      game: {
        ...g,
        white_ip: undefined,
        black_ip: undefined,
        settings: JSON.parse(g.settings),
        moves: JSON.parse(g.moves),
        analysis: g.analysis ? JSON.parse(g.analysis) : null,
      },
      icons: {
        w: g.white_id ? equippedOf(getUser(db, g.white_id)!).icon : findRival(g.white_bot)?.icon ?? `bot.${g.white_bot}`,
        b: g.black_id ? equippedOf(getUser(db, g.black_id)!).icon : findRival(g.black_bot)?.icon ?? `bot.${g.black_bot}`,
      },
      myRewards: mine?.rewards ? JSON.parse(mine.rewards) : null,
      pending: mine ? !mine.rewarded : false,
    };
  });

  /** Requests analysis of an archived game (e.g. if analysis failed earlier). */
  app.post('/api/games/:id/analyze', { preHandler: auth }, async (req, reply) => {
    const id = (req.params as any).id;
    const a = await ensureAnalysis(db, id).catch(() => null);
    if (!a) return bad(reply, 'Could not analyse that game.', 404);
    return { analysis: a };
  });

  // ------------------------------------------------------------------ leaderboards
  app.get('/api/leaderboard', async (req) => {
    const type = String((req.query as any).type ?? 'overall');
    const limit = 100;
    let rows: { user_id: string; value: number }[] = [];
    if (type === 'overall') {
      rows = db
        .prepare(`SELECT user_id, CAST(ROUND(SUM(rating * games) * 1.0 / SUM(games)) AS INTEGER) value FROM ratings WHERE games > 0 GROUP BY user_id ORDER BY value DESC LIMIT ?`)
        .all(limit) as any[];
    } else if (TIME_CATEGORIES.includes(type as TimeCategory)) {
      rows = db.prepare(`SELECT user_id, rating value FROM ratings WHERE category = ? AND games > 0 ORDER BY rating DESC LIMIT ?`).all(type, limit) as any[];
    } else if (type === 'level') {
      rows = db.prepare(`SELECT id user_id, xp value FROM users ORDER BY xp DESC, created_at ASC LIMIT ?`).all(limit) as any[];
    } else if (type === 'season') {
      rows = db.prepare(`SELECT user_id, peak value FROM season_stats WHERE season = ? AND games > 0 ORDER BY peak DESC LIMIT ?`).all(seasonKey(), limit) as any[];
    }
    const entries = rows.map((r, i) => {
      const u = getUser(db, r.user_id)!;
      const ov = overallFor(db, u.id).rating;
      const rating = type === 'level' ? ov : r.value;
      return {
        position: i + 1,
        id: u.id,
        username: u.username,
        icon: equippedOf(u).icon,
        card: equippedOf(u).card,
        level: u.level,
        rating,
        division: divisionFor(rating).name,
        value: r.value,
      };
    });
    const myPosition = req.userId ? entries.find((e) => e.id === req.userId)?.position ?? null : null;
    return { type, entries, myPosition, season: type === 'season' ? { key: seasonKey(), label: seasonLabel(seasonKey()), endsAt: seasonEnds().getTime() } : undefined };
  });

  // ------------------------------------------------------------------ shop & inventory
  app.get('/api/shop', { preHandler: auth }, async (req) => {
    const u = me(req);
    const owned = new Set((db.prepare('SELECT item_id FROM inventory WHERE user_id = ?').all(u.id) as any[]).map((r) => r.item_id));
    return { points: u.points, items: COSMETICS.map((c) => ({ ...c, owned: owned.has(c.id) })), equipped: equippedOf(u) };
  });

  app.post('/api/shop/buy', { preHandler: auth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const itemId = String((req.body as any)?.itemId ?? '');
    const item = COSMETIC_BY_ID[itemId];
    if (!item) return bad(reply, 'Unknown item.', 404);
    if (item.unlock.kind !== 'shop') return bad(reply, 'This item cannot be purchased. It must be earned.', 403);
    const price = item.unlock.price;
    const result = db.transaction(() => {
      const owned = db.prepare('SELECT 1 FROM inventory WHERE user_id = ? AND item_id = ?').get(req.userId, itemId);
      if (owned) return 'You already own this item.';
      const r = db.prepare('UPDATE users SET points = points - ? WHERE id = ? AND points >= ?').run(price, req.userId, price);
      if (r.changes === 0) return 'Not enough DC Points.';
      grantItem(db, req.userId!, itemId, 'shop');
      return null;
    })();
    if (result) return bad(reply, result, 402);
    return { ok: true, points: me(req).points };
  });

  // ------------------------------------------------------------------ progression
  app.get('/api/achievements', { preHandler: auth }, async (req) => {
    const stats = achievementStats(db, req.userId!);
    const have = new Map((db.prepare('SELECT achievement_id, unlocked_at FROM achievements WHERE user_id = ?').all(req.userId) as any[]).map((r) => [r.achievement_id, r.unlocked_at]));
    return {
      achievements: ACHIEVEMENTS.map((a) => {
        const [cur, target] = a.progress(stats);
        return { id: a.id, name: a.name, description: a.description, category: a.category, xp: a.xp, points: a.points, item: a.item ?? null, current: cur, target, unlockedAt: have.get(a.id) ?? null };
      }),
    };
  });

  app.get('/api/challenges', { preHandler: auth }, async (req) => {
    const out = activeChallenges().map((period, i) => {
      const rows = new Map(
        (db.prepare('SELECT challenge_id, progress, completed_at FROM challenges WHERE user_id = ? AND period_key = ?').all(req.userId, period.key) as any[]).map((r) => [r.challenge_id, r]),
      );
      return {
        period: i === 0 ? 'daily' : 'weekly',
        key: period.key,
        resetsAt: i === 0 ? new Date(new Date().toISOString().slice(0, 10)).getTime() + 86400_000 : nextWeek(),
        challenges: period.defs.map((d) => ({
          id: d.id,
          name: d.name,
          target: d.target,
          xp: d.xp,
          points: d.points,
          progress: rows.get(d.id)?.progress ?? 0,
          completed: !!rows.get(d.id)?.completed_at,
        })),
      };
    });
    return { periods: out };
  });

  app.get('/api/progression', { preHandler: auth }, async (req) => {
    const u = me(req);
    const levels = [];
    for (let l = 2; l <= MAX_LEVEL; l++) levels.push(levelReward(l));
    return { level: levelFromXp(u.xp), levels };
  });

  // ------------------------------------------------------------------ bots
  app.get('/api/bots', { preHandler: auth }, async (req) => {
    const recs = new Map((db.prepare('SELECT * FROM bot_records WHERE user_id = ?').all(req.userId) as any[]).map((r) => [r.bot_id, r]));
    return {
      bots: BOTS.map((b) => {
        const r = recs.get(b.id);
        return { id: b.id, record: r ? { games: r.games, wins: r.wins, losses: r.losses, draws: r.draws } : { games: 0, wins: 0, losses: 0, draws: 0 } };
      }),
    };
  });

  // ------------------------------------------------------------------ friends
  app.get('/api/friends', { preHandler: auth }, async (req) => listFriends(db, req.userId!, rt.statusOf));

  app.post('/api/friends/request', { preHandler: auth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const r = sendFriendRequest(db, req.userId!, String((req.body as any)?.username ?? ''));
    if (!r.ok) return bad(reply, r.error);
    if (r.accepted) db.transaction(() => checkAchievements(db, req.userId!))();
    return r;
  });

  app.post('/api/friends/respond', { preHandler: auth }, async (req, reply) => {
    const b = req.body as { userId?: string; accept?: boolean };
    const ok = b?.accept ? acceptFriend(db, req.userId!, String(b.userId)) : declineFriend(db, req.userId!, String(b?.userId));
    if (!ok) return bad(reply, 'No such request.', 404);
    if (b.accept) {
      db.transaction(() => {
        checkAchievements(db, req.userId!);
        checkAchievements(db, String(b.userId));
      })();
      rt.io.to(`u:${b.userId}`).emit('friends:changed', {});
    }
    return { ok: true };
  });

  app.delete('/api/friends/:id', { preHandler: auth }, async (req, reply) => {
    const id = (req.params as any).id;
    if (!removeFriend(db, req.userId!, id)) return bad(reply, 'Not friends.', 404);
    rt.io.to(`u:${id}`).emit('friends:changed', {});
    return { ok: true };
  });

  // ------------------------------------------------------------------ notifications
  app.get('/api/notifications', { preHandler: auth }, async (req) => {
    const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.userId) as any[];
    return { notifications: rows.map((r) => ({ id: r.id, type: r.type, payload: JSON.parse(r.payload), createdAt: r.created_at, read: !!r.read })) };
  });
  app.post('/api/notifications/read', { preHandler: auth }, async (req) => {
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.userId);
    return { ok: true };
  });

  // ------------------------------------------------------------------ puzzles
  const puzzleOut = (p: ReturnType<typeof puzzleById>) => p && { id: p.id, fen: p.fen, rating: p.rating, themes: p.themes, length: p.solution.length };
  app.get('/api/puzzles/daily', async () => ({ puzzle: puzzleOut(dailyPuzzle()), count: allPuzzles().length }));
  app.get('/api/puzzles/next', { preHandler: auth }, async (req) => {
    const stats = db.prepare('SELECT puzzle_rating FROM user_stats WHERE user_id = ?').get(req.userId) as { puzzle_rating: number };
    const done = new Set((db.prepare('SELECT puzzle_id FROM puzzle_attempts WHERE user_id = ?').all(req.userId) as any[]).map((r) => r.puzzle_id));
    const pool = allPuzzles().filter((p) => !done.has(p.id));
    const list = pool.length ? pool : allPuzzles();
    list.sort((a, b) => Math.abs(a.rating - stats.puzzle_rating) - Math.abs(b.rating - stats.puzzle_rating));
    const pick = list[Math.floor(Math.random() * Math.min(8, list.length))];
    return { puzzle: puzzleOut(pick ?? null), rating: stats.puzzle_rating, solved: done.size };
  });
  app.post('/api/puzzles/:id/step', { preHandler: auth }, async (req, reply) => {
    const p = puzzleById((req.params as any).id);
    if (!p) return bad(reply, 'Puzzle not found.', 404);
    const moves = ((req.body as any)?.moves ?? []) as string[];
    if (!Array.isArray(moves) || moves.length > 40) return bad(reply, 'Invalid moves.');
    return stepPuzzle(p, moves.map(String));
  });
  app.post('/api/puzzles/:id/finish', { preHandler: auth }, async (req, reply) => {
    const p = puzzleById((req.params as any).id);
    if (!p) return bad(reply, 'Puzzle not found.', 404);
    const moves = ((req.body as any)?.moves ?? []) as string[];
    const solved = checkSolution(p, Array.isArray(moves) ? moves.map(String) : []);
    const uid = req.userId!;
    const res = db.transaction(() => {
      const prev = db.prepare('SELECT 1 FROM puzzle_attempts WHERE user_id = ? AND puzzle_id = ?').get(uid, p.id);
      if (prev) return { solved, first: false, ratingDelta: 0, xp: 0 };
      db.prepare('INSERT INTO puzzle_attempts (user_id, puzzle_id, solved, attempted_at) VALUES (?, ?, ?, ?)').run(uid, p.id, solved ? 1 : 0, Date.now());
      const st = db.prepare('SELECT puzzle_rating FROM user_stats WHERE user_id = ?').get(uid) as { puzzle_rating: number };
      const exp = 1 / (1 + Math.pow(10, (p.rating - st.puzzle_rating) / 400));
      const delta = Math.round(24 * ((solved ? 1 : 0) - exp));
      db.prepare('UPDATE user_stats SET puzzle_rating = MAX(100, puzzle_rating + ?), puzzles_solved = puzzles_solved + ? WHERE user_id = ?').run(delta, solved ? 1 : 0, uid);
      let xp = 0;
      if (solved) {
        // puzzles give XP (bounded: each puzzle can only be rewarded once) but no DC Points
        const ch = advanceChallenges(db, uid, { puzzles: 1 });
        xp = 10 + ch.xp;
        grantXp(db, uid, xp);
        checkAchievements(db, uid);
      }
      return { solved, first: true, ratingDelta: delta, xp };
    })();
    return { ...res, solution: p.solution };
  });

  // ------------------------------------------------------------------ openings explorer
  app.get('/api/openings', async (req) => {
    const fen = String((req.query as any).fen ?? new Chess().fen());
    let c: Chess;
    try {
      c = new Chess(fen);
    } catch {
      c = new Chess();
    }
    const epd = epdOf(c.fen());
    const stats = db.prepare('SELECT uci, san, white_wins, black_wins, draws FROM opening_moves WHERE epd = ?').all(epd) as any[];
    const book = bookMoves(c.fen());
    const merged = new Map<string, any>();
    for (const b of book) merged.set(b.uci, { uci: b.uci, san: b.san, opening: b.opening ? { eco: b.opening.eco, name: b.opening.name } : null, white: 0, black: 0, draws: 0 });
    for (const s of stats) {
      const e = merged.get(s.uci) ?? { uci: s.uci, san: s.san, opening: null, white: 0, black: 0, draws: 0 };
      e.white = s.white_wins;
      e.black = s.black_wins;
      e.draws = s.draws;
      merged.set(s.uci, e);
    }
    const moves = [...merged.values()].sort((a, b) => b.white + b.black + b.draws - (a.white + a.black + a.draws) || (a.opening ? -1 : 1));
    const here = openingAt(c.fen());
    return { opening: here ? { eco: here.eco, name: here.name } : null, moves };
  });

  // ------------------------------------------------------------------ seasons
  app.get('/api/seasons/me', { preHandler: auth }, async (req) => {
    const rows = db.prepare('SELECT season, games, wins, peak, current, claimed FROM season_stats WHERE user_id = ? ORDER BY season DESC').all(req.userId);
    return { current: { key: seasonKey(), label: seasonLabel(seasonKey()), endsAt: seasonEnds().getTime() }, seasons: rows };
  });
}

function nextWeek(): number {
  const d = new Date();
  const day = d.getUTCDay() || 7;
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + (8 - day) * 86400_000;
  return t;
}

/** Detailed statistics for the profile screen. All values derived from stored game data. */
export function playerStats(db: DB, userId: string) {
  const s = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(userId) as any;
  const fav = db
    .prepare(
      `SELECT g.opening_name name, g.opening_eco eco, COUNT(*) n, SUM(CASE WHEN pg.score = 1 THEN 1 ELSE 0 END) wins FROM player_games pg JOIN games g ON g.id = pg.game_id
       WHERE pg.user_id = ? AND g.opening_name IS NOT NULL GROUP BY g.opening_name ORDER BY n DESC LIMIT 5`,
    )
    .all(userId) as any[];
  const byCat = db
    .prepare(`SELECT g.category, COUNT(*) n FROM player_games pg JOIN games g ON g.id = pg.game_id WHERE pg.user_id = ? GROUP BY g.category ORDER BY n DESC`)
    .all(userId) as any[];
  const bots = db.prepare('SELECT bot_id, games, wins, losses, draws FROM bot_records WHERE user_id = ?').all(userId);
  const recentAcc = db
    .prepare('SELECT accuracy, ended_at FROM player_games WHERE user_id = ? AND accuracy IS NOT NULL ORDER BY ended_at DESC LIMIT 30')
    .all(userId) as any[];
  const games = s.games || 0;
  return {
    games,
    wins: s.wins,
    losses: s.losses,
    draws: s.draws,
    winRate: games ? Math.round((s.wins / games) * 1000) / 10 : 0,
    currentStreak: s.cur_streak,
    bestStreak: s.best_streak,
    checkmates: s.checkmates,
    averageAccuracy: s.accuracy_games ? Math.round((s.accuracy_sum / s.accuracy_games) * 10) / 10 : null,
    bestAccuracy: s.best_accuracy || null,
    classes: {
      incredible: s.c_incredible,
      great: s.c_great,
      good: s.c_good,
      decent: s.c_decent,
      okay: s.c_okay,
      bad: s.c_bad,
      blunder: s.c_blunder,
    },
    favouriteOpening: fav[0] ?? null,
    openings: fav,
    averageDurationMs: games ? Math.round(s.total_duration_ms / games) : 0,
    mostPlayedCategory: byCat[0]?.category ?? null,
    categories: byCat,
    botGames: s.bot_games,
    botWins: s.bot_wins,
    onlineGames: s.online_games,
    onlineWins: s.online_wins,
    rankedWins: s.ranked_wins,
    bots,
    puzzleRating: s.puzzle_rating,
    puzzlesSolved: s.puzzles_solved,
    accuracyTrend: recentAcc.reverse(),
  };
}

/** Grants end-of-season rewards for past seasons the player competed in. */
export function claimSeasonRewards(db: DB, userId: string) {
  const current = seasonKey();
  const rows = db.prepare('SELECT season, peak, games FROM season_stats WHERE user_id = ? AND claimed = 0 AND season != ?').all(userId, current) as any[];
  for (const r of rows) {
    db.transaction(() => {
      db.prepare('UPDATE season_stats SET claimed = 1 WHERE user_id = ? AND season = ?').run(userId, r.season);
      if (r.games < 5) return;
      const div = divisionFor(r.peak);
      const points = 100 + div.index * 40;
      db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(points, userId);
      const items: string[] = [];
      if (r.peak >= 1100 && grantItem(db, userId, 'card.season1', `season:${r.season}`)) items.push('card.season1');
      notify(db, userId, 'season_reward', { season: r.season, label: seasonLabel(r.season), division: div.name, points, items });
    })();
  }
}
