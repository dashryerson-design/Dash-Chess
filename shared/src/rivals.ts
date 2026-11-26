/**
 * AI rivals: engine opponents with player-style names that populate the leaderboard and fill the
 * ranked queue when no human opponent is available. They are shown with a small "AI" mark in game.
 * Everything is deterministic (same for every player) and drifts slowly day by day.
 */
import { BOTS, type BotProfile } from './bots';
import { TIME_CATEGORIES, type TimeCategory } from './timeControls';

export interface Rival {
  id: string;
  name: string;
  base: number;
  icon: string;
  card: string;
}

const NAMES = [
  'BobyCHess', 'ImAGM', 'Goth4m_Chaess', 'opxes', 'jdlk', 'KnightRider77', 'pawnstorm_99', 'xXCheckmateXx', 'qwrtz', 'LadyBishop',
  'RookieNoMore', 'sicilian_dragon', 'mvkd', 'TheGrindz', 'EnPassantPete', 'zugzwang_zara', 'blitzkrieg04', 'aaaaasd', 'HikaruFanboy', 'ponzi_gambit',
  'tactix_tom', 'kingsafety1st', 'lol_hung_queen', 'Caro_Kanny', 'MrFianchetto', 'hjkl', 'NightOwlChess', 'queen_of_d4', 'fork_n_spoon', 'grandpa_gm',
  'BongCloud420', 'eloHell', 'nxf7', 'SlowPlayer_', 'Danyalfan', 'ChessIsLife', 'brrrrr', 'tripleXrook', 'Wombat_e4', 'stalemate_steve',
  'oikjh', 'MagnusWannabe', 'TheGambiteer', 'castle_early', 'luna_chess', 'kdpr', 'rookandroll', 'endgame_eric', 'PlsNoBlunder', 'mateinthree',
  'Gothamite', 'kvnn', 'AnnaAttack', 'zxcv1', 'IM_Hopeful', 'clockflagger', 'smothered_mate', 'yeet_pawn', 'Vienna_Viking', 'outpost_otto',
  'tmplk', 'PetrovPal', 'chesskid2011', 'noobmaster69', 'theLondonSystem',
];
const ICONS = ['icon.knight', 'icon.pawn', 'icon.rook', 'icon.bishop', 'icon.queen', 'icon.king', 'icon.bolt', 'icon.flame', 'icon.star', 'icon.skull', 'icon.gem', 'icon.dragon'];
const CARDS = ['card.carbon', 'card.dawn', 'card.circuit', 'card.aurora', 'card.ember', 'card.prism', 'card.galaxy', 'card.royal'];

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Spread base ratings across divisions: most players mid-table, a few strong ones at the top. */
export const RIVALS: Rival[] = NAMES.map((name, i) => {
  const h = hash(name);
  const t = (h % 10000) / 10000;
  const base = Math.round(650 + Math.pow(t, 1.35) * 1850 + (i % 7) * 9);
  return { id: `rival_${name.toLowerCase()}`, name, base, icon: ICONS[h % ICONS.length], card: CARDS[(h >> 8) % CARDS.length] };
});

export const RIVAL_BY_ID: Record<string, Rival> = Object.fromEntries(RIVALS.map((r) => [r.id, r]));
export const isRivalId = (id: string | null | undefined) => !!id && id.startsWith('rival_');

const day = (d = new Date()) => Math.floor(d.getTime() / 86400000);
const noise = (r: Rival, k: string, d: number) => ((hash(`${r.id}|${k}|${d}`) % 2001) / 1000 - 1); // -1..1

/** Current rating (overall or per category); a slow random walk so the board changes over days. */
export function rivalRating(r: Rival, cat?: TimeCategory, d = day()): number {
  let drift = 0;
  for (let k = 0; k < 14; k++) drift += noise(r, 'walk', d - k) * 9;
  const catOffset = cat ? Math.round(noise(r, cat, 0) * 90) : 0;
  return Math.max(400, Math.round(r.base + drift + catOffset));
}

export function rivalProfile(r: Rival, d = day()) {
  const h = hash(r.id);
  const ageDays = 40 + (h % 500);
  const games = Math.round(ageDays * (0.6 + (h % 50) / 25)) + (d % 997);
  const winRate = 0.42 + Math.min(0.16, (r.base - 650) / 12000);
  const wins = Math.round(games * winRate);
  const draws = Math.round(games * 0.07);
  const level = Math.max(3, Math.min(99, Math.round(Math.sqrt(games) * 1.6)));
  const ratings = Object.fromEntries(
    TIME_CATEGORIES.map((c, i) => [c, { rating: rivalRating(r, c, d), games: Math.round(games * [0.15, 0.45, 0.3, 0.1][i]) }]),
  ) as Record<TimeCategory, { rating: number; games: number }>;
  return { games, wins, draws, losses: games - wins - draws, level, xp: level * level * 95, ratings, rating: rivalRating(r, undefined, d), createdAt: Date.now() - ageDays * 86400000 };
}

/** The engine personality whose strength best matches a rating. */
export function engineForRating(rating: number): BotProfile {
  let best = BOTS[0];
  for (const b of BOTS) if (Math.abs(b.elo - rating) < Math.abs(best.elo - rating)) best = b;
  return best;
}

/** Picks the rival closest to a player's rating (with a little variety). */
export function pickRival(rating: number, cat: TimeCategory, seed = Math.random()): Rival {
  const sorted = [...RIVALS].sort((a, b) => Math.abs(rivalRating(a, cat) - rating) - Math.abs(rivalRating(b, cat) - rating));
  return sorted[Math.floor(seed * Math.min(4, sorted.length))];
}
