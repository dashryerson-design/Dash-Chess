import { COSMETICS } from './cosmetics';

export const MAX_LEVEL = 100;

/** XP required to advance from `level` to `level + 1`. Grows gradually. */
export function xpToNext(level: number): number {
  const n = Math.max(0, level - 1);
  return Math.round(150 + 50 * n + 8 * Math.pow(n, 1.5));
}

/** Total XP required to reach `level` from level 1. */
export function totalXpForLevel(level: number): number {
  let t = 0;
  for (let l = 1; l < level; l++) t += xpToNext(l);
  return t;
}

export interface LevelInfo {
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  progress: number;
  totalXp: number;
}

export function levelFromXp(totalXp: number): LevelInfo {
  let level = 1;
  let rem = Math.max(0, Math.floor(totalXp));
  while (level < MAX_LEVEL && rem >= xpToNext(level)) {
    rem -= xpToNext(level);
    level++;
  }
  const need = level >= MAX_LEVEL ? 0 : xpToNext(level);
  return { level, xpIntoLevel: rem, xpForNext: need, progress: need ? rem / need : 1, totalXp };
}

export const MILESTONE_LEVELS = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100];

export interface LevelReward {
  level: number;
  points: number;
  items: string[];
  milestone: boolean;
}

/** Rewards granted when the player *reaches* `level`. */
export function levelReward(level: number): LevelReward {
  const milestone = MILESTONE_LEVELS.includes(level);
  const items = COSMETICS.filter((c) => c.unlock.kind === 'level' && c.unlock.level === level).map((c) => c.id);
  const points = level <= 1 ? 0 : milestone ? 100 + level * 10 : 25 + Math.floor(level / 2) * 5;
  return { level, points, items, milestone };
}

// ---------------- Reward economy (authoritative values used by the server) ----------------

export const REWARDS = {
  /** DC Points per move classification (only the rewarded player's own moves). */
  movePoints: { incredible: 15, great: 8, good: 4, decent: 2, okay: 0, bad: 0, blunder: 0 } as Record<string, number>,
  /** Max DC Points from move classifications in a single game. */
  movePointsCapPerGame: 120,
  /** Daily soft cap on DC Points earned from gameplay; beyond it, rewards are reduced to `overCapRate`. */
  dailyPointsSoftCap: 900,
  overCapRate: 0.2,
  /** Minimum full moves the rewarded player must make for a game to award progression. */
  minMovesForRewards: 8,
  xp: {
    completeBot: 40,
    completeOnline: 60,
    win: 50,
    draw: 20,
    ranked: 20,
    newOpponent: 15,
    perMove: 1,
    perMoveCap: 40,
  },
  points: {
    winCasual: 25,
    winRanked: 40,
    drawOnline: 10,
    /** Bot wins scale with the bot's strength tier. */
    botWinBase: 8,
    botWinPerTier: 6,
  },
  /** Repeat wins against the same bot on the same day: 1st full, then reduced. */
  botRepeatMultipliers: [1, 0.5, 0.25, 0.1],
  /** Repeat games against the same human opponent in a day. */
  opponentRepeatMultipliers: [1, 1, 0.6, 0.3, 0.1],
} as const;

export function repeatMultiplier(table: readonly number[], priorCount: number): number {
  return table[Math.min(priorCount, table.length - 1)];
}
