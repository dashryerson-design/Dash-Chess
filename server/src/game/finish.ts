import { Chess } from 'chess.js';
import {
  ACHIEVEMENTS,
  BOT_BY_ID,
  REWARDS,
  activeChallenges,
  countClasses,
  dayKey,
  gameAccuracy,
  overallRating,
  ratingChange,
  repeatMultiplier,
  seasonKey,
  type AchievementStats,
  type ChallengeEvent,
  type GameRewards,
  type MoveRating,
  type Side,
} from '@dc/shared';
import type { DB } from '../db';
import type { GameRoom } from './room';
import { checkDivisionUnlocks, getRatings, getUser, grantItem, grantXp, notify, overallFor, type RatingRow } from '../users';
import { detectOpening, epdOf } from '../openings';
import { analyzeGame } from '../engine/analyzer';

const sideName = (s: Side) => (s === 'w' ? 'white' : 'black');

function pgnOf(room: GameRoom, resultStr: string, opening: string | null): string {
  const c = new Chess();
  for (const m of room.moves) c.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci[4] });
  c.setHeader('Event', `DC Chess ${room.mode} game`);
  c.setHeader('Site', 'DC Chess');
  c.setHeader('Date', new Date(room.startedAt).toISOString().slice(0, 10).replace(/-/g, '.'));
  c.setHeader('White', room.seatInfo('w').name);
  c.setHeader('Black', room.seatInfo('b').name);
  c.setHeader('Result', resultStr);
  c.setHeader('TimeControl', room.clock ? `${room.settings.tc.initial}+${room.settings.tc.increment}` : '-');
  if (opening) c.setHeader('Opening', opening);
  return c.pgn();
}

/**
 * Persists a finished game and applies rating changes atomically.
 * Returns false for aborted games (which are not recorded).
 */
export function persistGame(db: DB, room: GameRoom): boolean {
  const res = room.result!;
  if (res.reason === 'aborted') return false;
  const resultStr = res.winner === 'w' ? '1-0' : res.winner === 'b' ? '0-1' : '1/2-1/2';
  const ucis = room.moves.map((m) => m.uci);
  const opening = detectOpening(room.startFen, ucis);
  const season = seasonKey(new Date(room.endedAt));
  const W = room.seats.w;
  const B = room.seats.b;

  db.transaction(() => {
    const delta: { w?: number; b?: number } = {};
    const after: { w?: number; b?: number } = {};
    let ratedApplied = false;
    if (room.settings.rated && W.kind === 'human' && B.kind === 'human' && room.moves.length >= 2) {
      // Anti-abuse: rating only changes for the first 3 rated games between the same pair per 24h.
      const pairCount = (
        db
          .prepare(
            `SELECT COUNT(*) n FROM games WHERE rated = 1 AND ended_at > ? AND ((white_id = ? AND black_id = ?) OR (white_id = ? AND black_id = ?)) AND white_delta IS NOT NULL`,
          )
          .get(Date.now() - 86400_000, W.userId, B.userId, B.userId, W.userId) as { n: number }
      ).n;
      if (pairCount < 3) {
        const rw = getRatings(db, W.userId)[room.category];
        const rb = getRatings(db, B.userId)[room.category];
        const sw: 0 | 0.5 | 1 = res.winner === 'w' ? 1 : res.winner === 'b' ? 0 : 0.5;
        const cw = ratingChange(rw.rating, rw.games, rb.rating, sw);
        const cb = ratingChange(rb.rating, rb.games, rw.rating, (1 - sw) as 0 | 0.5 | 1);
        const upd = db.prepare(
          'UPDATE ratings SET rating = ?, peak = MAX(peak, ?), games = games + 1, wins = wins + ?, losses = losses + ?, draws = draws + ? WHERE user_id = ? AND category = ?',
        );
        const hist = db.prepare(
          'INSERT INTO rating_history (user_id, category, game_id, rating_before, rating_after, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        );
        for (const [uid, ch, s] of [
          [W.userId, cw, sw],
          [B.userId, cb, 1 - sw],
        ] as [string, typeof cw, number][]) {
          upd.run(ch.after, ch.after, s === 1 ? 1 : 0, s === 0 ? 1 : 0, s === 0.5 ? 1 : 0, uid, room.category);
          hist.run(uid, room.category, room.id, ch.before, ch.after, room.endedAt);
          const ov = overallFor(db, uid).rating;
          db.prepare(
            `INSERT INTO season_stats (user_id, season, games, wins, peak, current) VALUES (?, ?, 1, ?, ?, ?)
             ON CONFLICT(user_id, season) DO UPDATE SET games = games + 1, wins = wins + excluded.wins, peak = MAX(peak, excluded.peak), current = excluded.current`,
          ).run(uid, season, s === 1 ? 1 : 0, ov, ov);
          checkDivisionUnlocks(db, uid);
        }
        delta.w = cw.delta;
        delta.b = cb.delta;
        after.w = cw.after;
        after.b = cb.after;
        ratedApplied = true;
      }
    }
    if (ratedApplied) {
      res.ratingDelta = delta;
      res.ratingAfter = after;
    }

    db.prepare(
      `INSERT INTO games (id, mode, rated, category, tc_initial, tc_increment, settings, white_id, black_id, white_bot, black_bot,
        white_name, black_name, white_rating, black_rating, white_delta, black_delta, result, winner, reason, moves, pgn,
        opening_eco, opening_name, ply_count, started_at, ended_at, duration_ms, season, white_ip, black_ip)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      room.id,
      room.mode,
      ratedApplied ? 1 : 0,
      room.category,
      room.settings.tc.initial,
      room.settings.tc.increment,
      JSON.stringify({ ...room.settings, hintsUsed: room.hintsUsed, takebacksUsed: room.takebacksUsed }),
      W.kind === 'human' ? W.userId : null,
      B.kind === 'human' ? B.userId : null,
      W.kind === 'bot' ? W.bot.id : null,
      B.kind === 'bot' ? B.bot.id : null,
      room.seatInfo('w').name,
      room.seatInfo('b').name,
      room.seatInfo('w').rating,
      room.seatInfo('b').rating,
      delta.w ?? null,
      delta.b ?? null,
      resultStr,
      res.winner,
      res.reason,
      JSON.stringify(room.moves),
      pgnOf(room, resultStr, opening?.name ?? null),
      opening?.eco ?? null,
      opening?.name ?? null,
      room.moves.length,
      room.startedAt,
      room.endedAt,
      room.endedAt - room.startedAt,
      season,
      W.kind === 'human' ? W.ip : null,
      B.kind === 'human' ? B.ip : null,
    );

    const pg = db.prepare(
      'INSERT INTO player_games (game_id, user_id, color, score, opponent_id, opponent_bot, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    for (const s of ['w', 'b'] as Side[]) {
      const seat = room.seats[s];
      if (seat.kind !== 'human') continue;
      const opp = room.seats[s === 'w' ? 'b' : 'w'];
      const score = res.winner === s ? 1 : res.winner === null ? 0.5 : 0;
      pg.run(room.id, seat.userId, s, score, opp.kind === 'human' ? opp.userId : null, opp.kind === 'bot' ? opp.bot.id : null, room.endedAt);
    }

    // Opening explorer statistics (first 20 plies)
    const om = db.prepare(
      `INSERT INTO opening_moves (epd, uci, san, white_wins, black_wins, draws) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(epd, uci) DO UPDATE SET white_wins = white_wins + excluded.white_wins, black_wins = black_wins + excluded.black_wins, draws = draws + excluded.draws`,
    );
    const c = new Chess();
    for (const m of room.moves.slice(0, 20)) {
      const epd = epdOf(c.fen());
      om.run(epd, m.uci, m.san, res.winner === 'w' ? 1 : 0, res.winner === 'b' ? 1 : 0, res.winner === null ? 1 : 0);
      c.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci[4] });
    }
  })();
  return true;
}

// ---------------------------------------------------------------------------------------------

interface GameRow {
  id: string;
  mode: string;
  rated: number;
  category: string;
  settings: string;
  white_id: string | null;
  black_id: string | null;
  white_bot: string | null;
  black_bot: string | null;
  winner: string | null;
  reason: string;
  moves: string;
  ply_count: number;
  duration_ms: number;
  ended_at: number;
  analysis: string | null;
  white_ip: string | null;
  black_ip: string | null;
}

/** Runs (or reuses) full-game analysis and stores it on the game row. */
export async function ensureAnalysis(db: DB, gameId: string): Promise<{ ratings: MoveRating[]; accuracy: { w: number; b: number } } | null> {
  const g = db.prepare('SELECT id, moves, analysis FROM games WHERE id = ?').get(gameId) as { id: string; moves: string; analysis: string | null } | undefined;
  if (!g) return null;
  if (g.analysis) return JSON.parse(g.analysis);
  const moves = JSON.parse(g.moves) as { uci: string }[];
  const a = await analyzeGame(new Chess().fen(), moves.map((m) => m.uci), 2);
  db.prepare('UPDATE games SET analysis = ?, white_accuracy = ?, black_accuracy = ? WHERE id = ?').run(JSON.stringify(a), a.accuracy.w, a.accuracy.b, gameId);
  return a;
}

export function achievementStats(db: DB, userId: string): AchievementStats {
  const s = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(userId) as any;
  const u = getUser(db, userId)!;
  const bots = db.prepare('SELECT bot_id, games, wins FROM bot_records WHERE user_id = ?').all(userId) as { bot_id: string; games: number; wins: number }[];
  const friends = (db.prepare("SELECT COUNT(*) n FROM friends WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'").get(userId, userId) as { n: number }).n;
  return {
    games: s.games,
    wins: s.wins,
    draws: s.draws,
    checkmates: s.checkmates,
    incredible: s.c_incredible,
    great: s.c_great,
    rankedWins: s.ranked_wins,
    onlineWins: s.online_wins,
    peakRating: overallFor(db, userId).peak,
    bestStreak: s.best_streak,
    botsPlayed: bots.filter((b) => b.games > 0).length,
    botsBeaten: bots.filter((b) => b.wins > 0).length,
    beatChampion: bots.some((b) => b.bot_id === 'champion' && b.wins > 0),
    puzzlesSolved: s.puzzles_solved,
    friends,
    bestAccuracy: s.best_accuracy,
    level: u.level,
  };
}

/** Unlocks newly satisfied achievements. Returns ids + reward totals. Run inside a transaction. */
export function checkAchievements(db: DB, userId: string): { ids: string[]; xp: number; points: number; items: string[] } {
  const have = new Set(
    (db.prepare('SELECT achievement_id FROM achievements WHERE user_id = ?').all(userId) as { achievement_id: string }[]).map((r) => r.achievement_id),
  );
  const stats = achievementStats(db, userId);
  const out = { ids: [] as string[], xp: 0, points: 0, items: [] as string[] };
  for (const a of ACHIEVEMENTS) {
    if (have.has(a.id)) continue;
    const [cur, target] = a.progress(stats);
    if (cur < target) continue;
    db.prepare('INSERT INTO achievements (user_id, achievement_id, unlocked_at) VALUES (?, ?, ?)').run(userId, a.id, Date.now());
    out.ids.push(a.id);
    out.xp += a.xp;
    out.points += a.points;
    if (a.item && grantItem(db, userId, a.item, `achievement:${a.id}`)) out.items.push(a.item);
    notify(db, userId, 'achievement', { id: a.id, name: a.name, xp: a.xp, points: a.points, item: a.item ?? null });
  }
  if (out.points) db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(out.points, userId);
  return out;
}

/** Advances active daily/weekly challenges. Returns completed challenge ids + rewards. */
export function advanceChallenges(db: DB, userId: string, ev: ChallengeEvent): { ids: string[]; xp: number; points: number } {
  const out = { ids: [] as string[], xp: 0, points: 0 };
  for (const period of activeChallenges()) {
    for (const def of period.defs) {
      const amount = def.advance(ev);
      if (!amount) continue;
      const row = db.prepare('SELECT progress, completed_at FROM challenges WHERE user_id = ? AND period_key = ? AND challenge_id = ?').get(userId, period.key, def.id) as
        | { progress: number; completed_at: number | null }
        | undefined;
      if (row?.completed_at) continue;
      const progress = def.threshold ? Math.max(row?.progress ?? 0, amount) : (row?.progress ?? 0) + amount;
      const done = progress >= def.target;
      db.prepare(
        `INSERT INTO challenges (user_id, period_key, challenge_id, progress, completed_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, period_key, challenge_id) DO UPDATE SET progress = excluded.progress, completed_at = excluded.completed_at`,
      ).run(userId, period.key, def.id, Math.min(progress, def.target), done ? Date.now() : null);
      if (done) {
        out.ids.push(def.id);
        out.xp += def.xp;
        out.points += def.points;
      }
    }
  }
  if (out.points) db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(out.points, userId);
  return out;
}

/** Applies the daily soft cap. Returns the points actually granted. */
function applyDailyCap(db: DB, userId: string, points: number, xp: number): { points: number; capped: boolean } {
  const day = dayKey();
  const row = db.prepare('SELECT points FROM daily_rewards WHERE user_id = ? AND day = ?').get(userId, day) as { points: number } | undefined;
  const before = row?.points ?? 0;
  const cap = REWARDS.dailyPointsSoftCap;
  let granted = points;
  let capped = false;
  if (before + points > cap) {
    const full = Math.max(0, cap - before);
    granted = full + Math.round((points - full) * REWARDS.overCapRate);
    capped = true;
  }
  db.prepare(
    `INSERT INTO daily_rewards (user_id, day, points, xp) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, day) DO UPDATE SET points = points + excluded.points, xp = xp + excluded.xp`,
  ).run(userId, day, granted, xp);
  return { points: granted, capped };
}

/**
 * Post-game progression for every human participant. Runs after analysis.
 * Idempotent per (game, user) via player_games.rewarded.
 */
export function processRewards(db: DB, gameId: string, analysis: { ratings: MoveRating[]; accuracy: { w: number; b: number } } | null): Map<string, GameRewards> {
  const g = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId) as GameRow;
  const out = new Map<string, GameRewards>();
  const rows = db.prepare('SELECT * FROM player_games WHERE game_id = ? AND rewarded = 0').all(gameId) as { user_id: string; color: Side; score: number }[];
  const settings = JSON.parse(g.settings) as { assistance: boolean; hintsUsed?: Record<Side, number>; takebacksUsed?: number };
  const moves = JSON.parse(g.moves) as unknown[];

  for (const row of rows) {
    const uid = row.user_id;
    const side = row.color;
    const ownMoves = Math.ceil((moves.length - (side === 'w' ? 0 : 1)) / 2);
    const won = row.score === 1;
    const draw = row.score === 0.5;
    const oppBot = side === 'w' ? g.black_bot : g.white_bot;
    const oppId = side === 'w' ? g.black_id : g.white_id;
    const bot = oppBot ? BOT_BY_ID[oppBot] : null;
    const notes: string[] = [];

    const myRatings = analysis ? analysis.ratings.filter((r) => r.color === side) : [];
    const counts = analysis ? countClasses(myRatings) : null;
    const accuracy = analysis ? gameAccuracy(myRatings.filter((r) => !r.flags.includes('forced')).map((r) => r.accuracy)) : null;

    const reward = db.transaction((): GameRewards => {
      const userBefore = getUser(db, uid)!;
      // ---------- statistics (every recorded game) ----------
      const st = db.prepare('SELECT cur_streak, best_streak FROM user_stats WHERE user_id = ?').get(uid) as { cur_streak: number; best_streak: number };
      const streak = won ? st.cur_streak + 1 : 0;
      const c = counts ?? { incredible: 0, great: 0, good: 0, decent: 0, okay: 0, bad: 0, blunder: 0 };
      const accCounts = accuracy !== null && ownMoves >= 5;
      db.prepare(
        `UPDATE user_stats SET games = games + 1, wins = wins + ?, losses = losses + ?, draws = draws + ?, cur_streak = ?, best_streak = MAX(best_streak, ?),
          checkmates = checkmates + ?, ranked_wins = ranked_wins + ?, online_wins = online_wins + ?, online_games = online_games + ?,
          bot_games = bot_games + ?, bot_wins = bot_wins + ?, total_duration_ms = total_duration_ms + ?,
          c_incredible = c_incredible + ?, c_great = c_great + ?, c_good = c_good + ?, c_decent = c_decent + ?, c_okay = c_okay + ?, c_bad = c_bad + ?, c_blunder = c_blunder + ?,
          accuracy_sum = accuracy_sum + ?, accuracy_games = accuracy_games + ?, best_accuracy = MAX(best_accuracy, ?)
         WHERE user_id = ?`,
      ).run(
        won ? 1 : 0,
        row.score === 0 ? 1 : 0,
        draw ? 1 : 0,
        streak,
        streak,
        won && g.reason === 'checkmate' ? 1 : 0,
        won && g.rated ? 1 : 0,
        won && !bot ? 1 : 0,
        bot ? 0 : 1,
        bot ? 1 : 0,
        won && bot ? 1 : 0,
        g.duration_ms,
        c.incredible,
        c.great,
        c.good,
        c.decent,
        c.okay,
        c.bad,
        c.blunder,
        accCounts ? accuracy! : 0,
        accCounts ? 1 : 0,
        accuracy !== null && ownMoves >= 20 ? accuracy : 0,
        uid,
      );
      if (bot) {
        db.prepare(
          `INSERT INTO bot_records (user_id, bot_id, games, wins, losses, draws) VALUES (?, ?, 1, ?, ?, ?)
           ON CONFLICT(user_id, bot_id) DO UPDATE SET games = games + 1, wins = wins + excluded.wins, losses = losses + excluded.losses, draws = draws + excluded.draws`,
        ).run(uid, bot.id, won ? 1 : 0, row.score === 0 ? 1 : 0, draw ? 1 : 0);
      }

      // ---------- rewards (anti-farming) ----------
      let xp = 0;
      let movePoints = 0;
      let resultPoints = 0;
      const eligible = ownMoves >= REWARDS.minMovesForRewards;
      if (!eligible) notes.push(`Games shorter than ${REWARDS.minMovesForRewards} moves do not award XP or DC Points.`);
      else {
        const dayStart = new Date(new Date().toISOString().slice(0, 10)).getTime();
        const priorVsOpponent = (
          db
            .prepare(
              `SELECT COUNT(*) n FROM player_games WHERE user_id = ? AND game_id != ? AND ended_at >= ? AND rewarded = 1 AND ${bot ? 'opponent_bot = ?' : 'opponent_id = ?'}`,
            )
            .get(uid, gameId, dayStart, bot ? bot.id : oppId) as { n: number }
        ).n;
        const priorWinsVsOpponent = (
          db
            .prepare(
              `SELECT COUNT(*) n FROM player_games WHERE user_id = ? AND game_id != ? AND ended_at >= ? AND rewarded = 1 AND score = 1 AND ${bot ? 'opponent_bot = ?' : 'opponent_id = ?'}`,
            )
            .get(uid, gameId, dayStart, bot ? bot.id : oppId) as { n: number }
        ).n;

        const X = REWARDS.xp;
        xp += bot ? X.completeBot : X.completeOnline;
        if (won) xp += X.win;
        else if (draw) xp += X.draw;
        if (g.rated) xp += X.ranked;
        if (priorVsOpponent === 0) xp += X.newOpponent;
        xp += Math.min(X.perMoveCap, ownMoves * X.perMove);

        const assisted = (settings.hintsUsed?.[side] ?? 0) > 0 || (settings.takebacksUsed ?? 0) > 0;
        if (analysis && !assisted) {
          for (const r of myRatings) if (!r.flags.includes('forced')) movePoints += REWARDS.movePoints[r.cls] ?? 0;
          if (bot) movePoints *= Math.min(1, 0.4 + bot.tier * 0.15);
          movePoints = Math.min(REWARDS.movePointsCapPerGame, Math.round(movePoints));
        } else if (assisted) notes.push('Hints or takebacks were used: no DC Points for move quality.');

        if (bot) {
          if (won) {
            const P = REWARDS.points;
            let p = P.botWinBase + P.botWinPerTier * bot.tier;
            const mult = repeatMultiplier(REWARDS.botRepeatMultipliers, priorWinsVsOpponent);
            if (mult < 1) notes.push(`Repeat win against ${bot.name} today: win reward x${mult}.`);
            p *= mult;
            const myRating = overallRating(Object.values(getRatings(db, uid)) as RatingRow[]);
            if (myRating > bot.elo + 400) {
              p *= 0.25;
              notes.push(`${bot.name} is well below your rating: reduced win reward.`);
            } else if (myRating > bot.elo + 200) p *= 0.5;
            resultPoints = Math.round(p);
          }
          const xm = Math.max(0.5, repeatMultiplier(REWARDS.botRepeatMultipliers, priorVsOpponent));
          xp = Math.round(xp * xm);
        } else {
          const P = REWARDS.points;
          if (won) resultPoints = g.rated ? P.winRanked : P.winCasual;
          else if (draw) resultPoints = P.drawOnline;
          const mult = repeatMultiplier(REWARDS.opponentRepeatMultipliers, priorVsOpponent);
          if (mult < 1) notes.push(`Repeated games against the same opponent today: rewards x${mult}.`);
          resultPoints = Math.round(resultPoints * mult);
          movePoints = Math.round(movePoints * mult);
          xp = Math.round(xp * Math.max(0.3, mult));
          if (g.white_ip && g.white_ip === g.black_ip) {
            resultPoints = Math.round(resultPoints / 2);
            movePoints = Math.round(movePoints / 2);
            notes.push('Both players share a network: rewards halved.');
          }
        }
      }

      const capped = applyDailyCap(db, uid, movePoints + resultPoints, xp);
      if (capped.capped) notes.push('Daily DC Points soft cap reached: further gameplay points are reduced today.');
      const gamePoints = capped.points;
      db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(gamePoints, uid);

      // ---------- achievements & challenges ----------
      const cat = g.category;
      const ev: ChallengeEvent = {
        games: 1,
        wins: won ? 1 : 0,
        botWins: won && bot ? 1 : 0,
        hardBotWins: won && bot && bot.number >= 12 ? 1 : 0,
        blitzWins: won && cat === 'blitz' ? 1 : 0,
        rapidWins: won && cat === 'rapid' ? 1 : 0,
        bulletWins: won && cat === 'bullet' ? 1 : 0,
        great: c.great,
        incredible: c.incredible,
        goodPlus: c.good + c.great + c.incredible,
        online: bot ? 0 : 1,
        rankedWins: won && g.rated ? 1 : 0,
        mates: won && g.reason === 'checkmate' ? 1 : 0,
        accuracyGame: accuracy !== null && ownMoves >= 15 ? Math.floor(accuracy) : 0,
      };
      const ch = eligible ? advanceChallenges(db, uid, ev) : { ids: [], xp: 0, points: 0 };
      // XP first so level-based achievements see the new level
      const xpGrant = grantXp(db, uid, xp + ch.xp);
      // achievements are only evaluated after reward-eligible games (stops alt-account resign farming)
      const ach = eligible ? checkAchievements(db, uid) : { ids: [] as string[], xp: 0, points: 0, items: [] as string[] };
      const xpGrant2 = ach.xp ? grantXp(db, uid, ach.xp) : null;

      const userAfter = getUser(db, uid)!;
      const result: GameRewards = {
        gameId,
        xp: xp + ch.xp + ach.xp,
        points: userAfter.points - userBefore.points,
        pointsFromMoves: Math.min(movePoints, gamePoints),
        pointsFromResult: Math.max(0, gamePoints - Math.min(movePoints, gamePoints)),
        xpBefore: userBefore.xp,
        xpAfter: userAfter.xp,
        levelBefore: userBefore.level,
        levelAfter: userAfter.level,
        levelRewards: [...xpGrant.rewards, ...(xpGrant2?.rewards ?? [])],
        achievements: ach.ids,
        challenges: ch.ids,
        items: [...xpGrant.items, ...(xpGrant2?.items ?? []), ...ach.items],
        accuracy,
        counts,
        notes,
      };
      db.prepare('UPDATE player_games SET rewarded = 1, xp = ?, points = ?, accuracy = ?, counts = ?, rewards = ? WHERE game_id = ? AND user_id = ?').run(
        result.xp,
        result.points,
        accuracy,
        counts ? JSON.stringify(counts) : null,
        JSON.stringify(result),
        gameId,
        uid,
      );
      return result;
    })();
    out.set(uid, reward);
  }
  return out;
}

export { sideName };
