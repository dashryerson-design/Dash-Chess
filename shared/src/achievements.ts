export interface AchievementStats {
  games: number;
  wins: number;
  draws: number;
  checkmates: number;
  incredible: number;
  great: number;
  rankedWins: number;
  onlineWins: number;
  peakRating: number;
  bestStreak: number;
  botsPlayed: number;
  botsBeaten: number;
  beatChampion: boolean;
  puzzlesSolved: number;
  friends: number;
  bestAccuracy: number; // best accuracy in a game with >= 20 own moves
  level: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: 'Victory' | 'Skill' | 'Competitive' | 'Bots' | 'Social' | 'Dedication';
  xp: number;
  points: number;
  item?: string;
  /** returns [current, target] */
  progress: (s: AchievementStats) => [number, number];
}

const n = (v: number, t: number): [number, number] => [Math.min(v, t), t];
const b = (v: boolean): [number, number] => [v ? 1 : 0, 1];

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_game', name: 'Opening Move', description: 'Complete your first game.', category: 'Dedication', xp: 50, points: 25, progress: (s) => n(s.games, 1) },
  { id: 'first_win', name: 'First Victory', description: 'Win your first game.', category: 'Victory', xp: 100, points: 50, item: 'icon.star', progress: (s) => n(s.wins, 1) },
  { id: 'first_mate', name: 'First Checkmate', description: 'Deliver checkmate.', category: 'Victory', xp: 100, points: 50, item: 'icon.mate', progress: (s) => n(s.checkmates, 1) },
  { id: 'ten_wins', name: 'Ten Wins', description: 'Win 10 games.', category: 'Victory', xp: 200, points: 150, progress: (s) => n(s.wins, 10) },
  { id: 'fifty_wins', name: 'Fifty Wins', description: 'Win 50 games.', category: 'Victory', xp: 500, points: 400, item: 'captureEffect.lightning', progress: (s) => n(s.wins, 50) },
  { id: 'hundred_games', name: 'Hundred Games', description: 'Complete 100 games.', category: 'Dedication', xp: 500, points: 400, item: 'card.veteran', progress: (s) => n(s.games, 100) },
  { id: 'mate_25', name: 'Executioner', description: 'Deliver 25 checkmates.', category: 'Victory', xp: 300, points: 250, progress: (s) => n(s.checkmates, 25) },
  { id: 'first_great', name: 'Sharp Eye', description: 'Play a Great move.', category: 'Skill', xp: 75, points: 40, progress: (s) => n(s.great, 1) },
  { id: 'first_incredible', name: 'First Incredible Move', description: 'Play an Incredible move.', category: 'Skill', xp: 150, points: 100, progress: (s) => n(s.incredible, 1) },
  { id: 'ten_incredible', name: 'Ten Incredible Moves', description: 'Play 10 Incredible moves.', category: 'Skill', xp: 500, points: 400, item: 'icon.gem', progress: (s) => n(s.incredible, 10) },
  { id: 'accuracy_90', name: 'Surgical', description: 'Finish a game of 20+ moves with 90% accuracy.', category: 'Skill', xp: 200, points: 150, progress: (s) => n(Math.floor(s.bestAccuracy), 90) },
  { id: 'first_ranked_win', name: 'First Ranked Victory', description: 'Win a ranked match.', category: 'Competitive', xp: 150, points: 100, item: 'card.ranked', progress: (s) => n(s.rankedWins, 1) },
  { id: 'first_online_win', name: 'Human Touch', description: 'Defeat a real opponent online.', category: 'Competitive', xp: 100, points: 60, progress: (s) => n(s.onlineWins, 1) },
  { id: 'reach_gold', name: 'Reach Gold', description: 'Reach a DC Rating of 1100.', category: 'Competitive', xp: 250, points: 200, progress: (s) => n(s.peakRating, 1100) },
  { id: 'reach_platinum', name: 'Reach Platinum', description: 'Reach a DC Rating of 1400.', category: 'Competitive', xp: 400, points: 300, progress: (s) => n(s.peakRating, 1400) },
  { id: 'reach_diamond', name: 'Reach Diamond', description: 'Reach a DC Rating of 1700.', category: 'Competitive', xp: 600, points: 500, progress: (s) => n(s.peakRating, 1700) },
  { id: 'streak_5', name: 'Win Five in a Row', description: 'Win 5 consecutive games.', category: 'Victory', xp: 300, points: 250, item: 'card.streak', progress: (s) => n(s.bestStreak, 5) },
  { id: 'play_all_bots', name: 'Meet the Roster', description: 'Play every bot.', category: 'Bots', xp: 300, points: 250, progress: (s) => n(s.botsPlayed, 20) },
  { id: 'beat_all_bots', name: 'Machine Slayer', description: 'Defeat every bot.', category: 'Bots', xp: 1500, points: 1500, item: 'icon.robot', progress: (s) => n(s.botsBeaten, 20) },
  { id: 'beat_champion', name: 'Defeat DC Champion', description: 'Beat the strongest bot.', category: 'Bots', xp: 1000, points: 1000, item: 'board.champion', progress: (s) => b(s.beatChampion) },
  { id: 'puzzles_10', name: 'Puzzle Solver', description: 'Solve 10 puzzles.', category: 'Skill', xp: 150, points: 100, progress: (s) => n(s.puzzlesSolved, 10) },
  { id: 'first_friend', name: 'Better Together', description: 'Add a friend.', category: 'Social', xp: 50, points: 30, progress: (s) => n(s.friends, 1) },
  { id: 'level_20', name: 'Rising Star', description: 'Reach level 20.', category: 'Dedication', xp: 0, points: 300, progress: (s) => n(s.level, 20) },
];

export const ACHIEVEMENT_BY_ID: Record<string, Achievement> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

// ---------------------------------------------------------------------------------------------
// Daily & weekly challenges
// ---------------------------------------------------------------------------------------------

/** Events a completed game or puzzle can contribute to challenges. */
export interface ChallengeEvent {
  games?: number;
  wins?: number;
  botWins?: number;
  hardBotWins?: number;
  blitzWins?: number;
  rapidWins?: number;
  bulletWins?: number;
  great?: number;
  incredible?: number;
  goodPlus?: number;
  online?: number;
  rankedWins?: number;
  mates?: number;
  puzzles?: number;
  accuracyGame?: number; // accuracy of a completed game (>= 15 own moves)
}

export interface ChallengeDef {
  id: string;
  period: 'daily' | 'weekly';
  name: string;
  target: number;
  xp: number;
  points: number;
  /** how much an event advances this challenge */
  advance: (e: ChallengeEvent) => number;
  /** "threshold" challenges complete when advance() >= target in a single event */
  threshold?: boolean;
}

export const CHALLENGES: ChallengeDef[] = [
  { id: 'd_win2', period: 'daily', name: 'Win two matches', target: 2, xp: 80, points: 60, advance: (e) => e.wins ?? 0 },
  { id: 'd_play5', period: 'daily', name: 'Play five games', target: 5, xp: 80, points: 50, advance: (e) => e.games ?? 0 },
  { id: 'd_great3', period: 'daily', name: 'Achieve three Great moves', target: 3, xp: 90, points: 70, advance: (e) => (e.great ?? 0) + (e.incredible ?? 0) },
  { id: 'd_bot', period: 'daily', name: 'Defeat a bot', target: 1, xp: 60, points: 40, advance: (e) => e.botWins ?? 0 },
  { id: 'd_blitz', period: 'daily', name: 'Win a Blitz match', target: 1, xp: 70, points: 50, advance: (e) => e.blitzWins ?? 0 },
  { id: 'd_good20', period: 'daily', name: 'Play 20 Good or better moves', target: 20, xp: 70, points: 50, advance: (e) => e.goodPlus ?? 0 },
  { id: 'd_puzzle3', period: 'daily', name: 'Solve three puzzles', target: 3, xp: 60, points: 40, advance: (e) => e.puzzles ?? 0 },
  { id: 'd_acc80', period: 'daily', name: 'Finish a game with 80%+ accuracy', target: 80, xp: 90, points: 60, threshold: true, advance: (e) => e.accuracyGame ?? 0 },
  { id: 'd_online', period: 'daily', name: 'Play an online match', target: 1, xp: 60, points: 40, advance: (e) => e.online ?? 0 },
  { id: 'd_mate', period: 'daily', name: 'Deliver checkmate', target: 1, xp: 70, points: 50, advance: (e) => e.mates ?? 0 },
  { id: 'w_win10', period: 'weekly', name: 'Win ten matches', target: 10, xp: 300, points: 250, advance: (e) => e.wins ?? 0 },
  { id: 'w_play20', period: 'weekly', name: 'Play twenty games', target: 20, xp: 300, points: 200, advance: (e) => e.games ?? 0 },
  { id: 'w_incredible', period: 'weekly', name: 'Play an Incredible move', target: 1, xp: 300, points: 250, advance: (e) => e.incredible ?? 0 },
  { id: 'w_great15', period: 'weekly', name: 'Achieve fifteen Great moves', target: 15, xp: 300, points: 250, advance: (e) => (e.great ?? 0) + (e.incredible ?? 0) },
  { id: 'w_hardbot', period: 'weekly', name: 'Defeat a Hard (or tougher) bot', target: 1, xp: 350, points: 300, advance: (e) => e.hardBotWins ?? 0 },
  { id: 'w_ranked3', period: 'weekly', name: 'Win three ranked matches', target: 3, xp: 350, points: 300, advance: (e) => e.rankedWins ?? 0 },
  { id: 'w_rapid3', period: 'weekly', name: 'Win three Rapid matches', target: 3, xp: 300, points: 250, advance: (e) => e.rapidWins ?? 0 },
  { id: 'w_puzzle15', period: 'weekly', name: 'Solve fifteen puzzles', target: 15, xp: 250, points: 200, advance: (e) => e.puzzles ?? 0 },
  { id: 'w_mate5', period: 'weekly', name: 'Deliver five checkmates', target: 5, xp: 300, points: 250, advance: (e) => e.mates ?? 0 },
];

export const CHALLENGE_BY_ID: Record<string, ChallengeDef> = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));

export function dayKey(d: Date = new Date()): string {
  return `D${d.toISOString().slice(0, 10)}`;
}

/** ISO week key, e.g. W2026-48 */
export function weekKey(d: Date = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `W${t.getUTCFullYear()}-${String(week).padStart(2, '0')}`;
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic rotation: everyone gets the same 3 daily and 3 weekly challenges. */
export function activeChallenges(d: Date = new Date()): { key: string; defs: ChallengeDef[] }[] {
  const pick = (period: 'daily' | 'weekly', key: string, count: number) => {
    const pool = CHALLENGES.filter((c) => c.period === period);
    return [...pool].sort((a, b2) => hash(key + a.id) - hash(key + b2.id)).slice(0, count);
  };
  return [
    { key: dayKey(d), defs: pick('daily', dayKey(d), 3) },
    { key: weekKey(d), defs: pick('weekly', weekKey(d), 3) },
  ];
}

/** Seasons are calendar quarters: S2026-Q4 */
export function seasonKey(d: Date = new Date()): string {
  return `S${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

export function seasonLabel(key: string): string {
  const m = /^S(\d{4})-Q(\d)$/.exec(key);
  return m ? `Season ${m[2]} · ${m[1]}` : key;
}

export function seasonEnds(d: Date = new Date()): Date {
  const q = Math.floor(d.getUTCMonth() / 3);
  return new Date(Date.UTC(d.getUTCFullYear(), (q + 1) * 3, 1));
}
