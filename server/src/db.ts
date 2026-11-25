import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';

export type DB = Database.Database;

const MIGRATIONS: string[] = [
  // v1 — initial schema
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    points INTEGER NOT NULL DEFAULT 0,
    equipped TEXT NOT NULL DEFAULT '{}',
    settings TEXT NOT NULL DEFAULT '{}',
    privacy TEXT NOT NULL DEFAULT '{"showOnline":true,"allowChallenges":"everyone"}',
    last_seen INTEGER,
    username_changed_at INTEGER
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    user_agent TEXT
  );
  CREATE INDEX idx_sessions_user ON sessions(user_id);

  CREATE TABLE ratings (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    rating INTEGER NOT NULL,
    peak INTEGER NOT NULL,
    games INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, category)
  );
  CREATE INDEX idx_ratings_cat ON ratings(category, rating DESC);

  CREATE TABLE rating_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    game_id TEXT,
    rating_before INTEGER NOT NULL,
    rating_after INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_rh_user ON rating_history(user_id, category, created_at);

  CREATE TABLE games (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    rated INTEGER NOT NULL,
    category TEXT NOT NULL,
    tc_initial INTEGER NOT NULL,
    tc_increment INTEGER NOT NULL,
    settings TEXT NOT NULL,
    white_id TEXT,
    black_id TEXT,
    white_bot TEXT,
    black_bot TEXT,
    white_name TEXT NOT NULL,
    black_name TEXT NOT NULL,
    white_rating INTEGER,
    black_rating INTEGER,
    white_delta INTEGER,
    black_delta INTEGER,
    result TEXT NOT NULL,
    winner TEXT,
    reason TEXT NOT NULL,
    moves TEXT NOT NULL,
    pgn TEXT NOT NULL,
    opening_eco TEXT,
    opening_name TEXT,
    ply_count INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    analysis TEXT,
    white_accuracy REAL,
    black_accuracy REAL,
    season TEXT NOT NULL,
    white_ip TEXT,
    black_ip TEXT
  );
  CREATE INDEX idx_games_white ON games(white_id, ended_at DESC);
  CREATE INDEX idx_games_black ON games(black_id, ended_at DESC);
  CREATE INDEX idx_games_ended ON games(ended_at DESC);

  CREATE TABLE player_games (
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    color TEXT NOT NULL,
    score REAL NOT NULL,
    opponent_id TEXT,
    opponent_bot TEXT,
    xp INTEGER NOT NULL DEFAULT 0,
    points INTEGER NOT NULL DEFAULT 0,
    accuracy REAL,
    counts TEXT,
    rewarded INTEGER NOT NULL DEFAULT 0,
    rewards TEXT,
    ended_at INTEGER NOT NULL,
    PRIMARY KEY (game_id, user_id)
  );
  CREATE INDEX idx_pg_user ON player_games(user_id, ended_at DESC);

  CREATE TABLE user_stats (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    games INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    cur_streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    checkmates INTEGER NOT NULL DEFAULT 0,
    ranked_wins INTEGER NOT NULL DEFAULT 0,
    online_wins INTEGER NOT NULL DEFAULT 0,
    online_games INTEGER NOT NULL DEFAULT 0,
    bot_games INTEGER NOT NULL DEFAULT 0,
    bot_wins INTEGER NOT NULL DEFAULT 0,
    total_duration_ms INTEGER NOT NULL DEFAULT 0,
    c_incredible INTEGER NOT NULL DEFAULT 0,
    c_great INTEGER NOT NULL DEFAULT 0,
    c_good INTEGER NOT NULL DEFAULT 0,
    c_decent INTEGER NOT NULL DEFAULT 0,
    c_okay INTEGER NOT NULL DEFAULT 0,
    c_bad INTEGER NOT NULL DEFAULT 0,
    c_blunder INTEGER NOT NULL DEFAULT 0,
    accuracy_sum REAL NOT NULL DEFAULT 0,
    accuracy_games INTEGER NOT NULL DEFAULT 0,
    best_accuracy REAL NOT NULL DEFAULT 0,
    puzzles_solved INTEGER NOT NULL DEFAULT 0,
    puzzle_rating INTEGER NOT NULL DEFAULT 1000
  );

  CREATE TABLE bot_records (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bot_id TEXT NOT NULL,
    games INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, bot_id)
  );

  CREATE TABLE inventory (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    source TEXT NOT NULL,
    acquired_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, item_id)
  );

  CREATE TABLE achievements (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id TEXT NOT NULL,
    unlocked_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, achievement_id)
  );

  CREATE TABLE challenges (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_key TEXT NOT NULL,
    challenge_id TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    completed_at INTEGER,
    PRIMARY KEY (user_id, period_key, challenge_id)
  );

  CREATE TABLE friends (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL, -- 'pending' (user_id requested friend_id) | 'accepted'
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, friend_id)
  );
  CREATE INDEX idx_friends_friend ON friends(friend_id);

  CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    read INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_notif_user ON notifications(user_id, created_at DESC);

  CREATE TABLE daily_rewards (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    xp INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
  );

  CREATE TABLE season_stats (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    season TEXT NOT NULL,
    games INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    peak INTEGER NOT NULL DEFAULT 0,
    current INTEGER NOT NULL DEFAULT 0,
    claimed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, season)
  );
  CREATE INDEX idx_season ON season_stats(season, peak DESC);

  CREATE TABLE puzzle_attempts (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    puzzle_id TEXT NOT NULL,
    solved INTEGER NOT NULL,
    attempted_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, puzzle_id)
  );

  CREATE TABLE opening_moves (
    epd TEXT NOT NULL,
    uci TEXT NOT NULL,
    san TEXT NOT NULL,
    white_wins INTEGER NOT NULL DEFAULT 0,
    black_wins INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (epd, uci)
  );

  CREATE TABLE analysis_cache (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
  `,
];

export function openDb(file = config.dbPath): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  const version = db.pragma('user_version', { simple: true }) as number;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
  return db;
}

export const now = () => Date.now();
