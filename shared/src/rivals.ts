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
  /** Generated on demand to fill a ranked queue: rating stays exactly at `base`. */
  fixed?: boolean;
}

/** Ranked search falls back to an AI rival after this long without a human opponent. */
export const RIVAL_WAIT_MS = 10_000;
/** AI rivals are always within this many DC rating points of the player. */
export const RIVAL_WINDOW = 200;

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

/**
 * Realistic spread: a bell curve centred around 1300 (most players 1000-1600), a tail of weaker
 * players down to ~200, and only a couple of elite players above 2300.
 */
const ELITE = new Set(['ImAGM', 'Gothamite']);
export const RIVALS: Rival[] = NAMES.map((name) => {
  const h = hash(name);
  const u = (k: number) => {
    let x = hash(`${k}:${name}:${k * 7919}`);
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  };
  const z = (u(1) + u(2) + u(3) + u(4) - 2) / 0.577; // ~normal(0, 1)
  let base = Math.round(1300 + z * (z < 0 ? 380 : 300));
  if (ELITE.has(name)) base = 2330 + (h % 120);
  else base = Math.min(2200, Math.max(200, base));
  return { id: `rival_${name.toLowerCase()}`, name, base, icon: ICONS[h % ICONS.length], card: CARDS[(h >> 8) % CARDS.length] };
});

export const RIVAL_BY_ID: Record<string, Rival> = Object.fromEntries(RIVALS.map((r) => [r.id, r]));
export const isRivalId = (id: string | null | undefined) => !!id && id.startsWith('rival_');

const day = (d = new Date()) => Math.floor(d.getTime() / 86400000);
const noise = (r: Rival, k: string, d: number) => ((hash(`${r.id}|${k}|${d}`) % 2001) / 1000 - 1); // -1..1

/** Current rating (overall or per category); a slow random walk so the board changes over days. */
export function rivalRating(r: Rival, cat?: TimeCategory, d = day()): number {
  if (r.fixed) return r.base;
  let drift = 0;
  for (let k = 0; k < 14; k++) drift += noise(r, 'walk', d - k) * 9;
  const catOffset = cat ? Math.round(noise(r, cat, 0) * 90) : 0;
  return Math.max(150, Math.round(r.base + drift + catOffset));
}

export function rivalProfile(r: Rival, d = day()) {
  const h = hash(r.id);
  // Level follows skill: weak players are low level, the strongest are veterans. A little per-player
  // variation (some grind more than others), plus slow growth over time.
  const skill = Math.min(1, Math.max(0, (r.base - 200) / 2250));
  const jitter = ((h >>> 3) % 9) - 3; // -3..+5
  const level = Math.max(2, Math.min(90, Math.round(3 + Math.pow(skill, 1.25) * 72 + jitter + (d % 365) / 120)));
  const games = Math.round(level * level * 0.9 + 15 + (h % 40));
  const ageDays = Math.round(20 + games / (1.5 + (h % 30) / 10));
  const winRate = 0.42 + Math.max(-0.08, Math.min(0.16, (r.base - 1000) / 9000));
  const wins = Math.round(games * winRate);
  const draws = Math.round(games * 0.07);
  const ratings = Object.fromEntries(
    TIME_CATEGORIES.map((c, i) => [c, { rating: rivalRating(r, c, d), games: Math.round(games * [0.15, 0.45, 0.3, 0.1][i]) }]),
  ) as Record<TimeCategory, { rating: number; games: number }>;
  return { games, wins, draws, losses: games - wins - draws, level, xp: level * level * 95, ratings, rating: rivalRating(r, undefined, d), createdAt: Date.now() - ageDays * 86400000 };
}

/**
 * The engine personality for a rival rating. Strength climbs much faster than the rating above 1500, so
 * high-ranked rivals are far harder to beat than their number suggests and the very top ones (2300+)
 * play at full engine strength — practically unbeatable.
 */
export function engineForRating(rating: number): BotProfile {
  const target = rating <= 1500 ? rating : 1500 + (rating - 1500) * 1.9;
  let best = BOTS[0];
  for (const b of BOTS) if (Math.abs(b.elo - target) < Math.abs(best.elo - target)) best = b;
  return best;
}

/** Rivals currently "online" (same for everyone). Rotates every 20 minutes; busier in the evening. */
export function onlineRivals(now = Date.now()): { rival: Rival; status: 'online' | 'playing' }[] {
  const slot = Math.floor(now / 1_200_000);
  const hour = new Date(now).getHours();
  // 3 overnight, up to 8 in the evening
  const target = hour < 7 ? 3 : hour < 12 ? 5 : hour < 17 ? 6 : hour < 23 ? 8 : 4;
  const ranked = [...RIVALS].sort((a, b) => hash(`${a.id}|${slot}`) - hash(`${b.id}|${slot}`));
  // a few stay on across neighbouring slots so the list changes gradually, not all at once
  const sticky = [...RIVALS].sort((a, b) => hash(`${a.id}|${slot >> 2}`) - hash(`${b.id}|${slot >> 2}`)).slice(0, 2);
  const chosen = [...new Set([...sticky, ...ranked])].slice(0, target);
  return chosen.map((rival) => ({ rival, status: hash(`${rival.id}|p|${Math.floor(now / 300_000)}`) % 4 === 0 ? 'playing' : 'online' }));
}

const PREFIX = [
  'Shadow', 'Neon', 'Frost', 'Iron', 'Void', 'Crimson', 'Silent', 'Turbo', 'Cosmic', 'Rogue', 'Hyper', 'Storm', 'Lunar', 'Blaze',
  'Quantum', 'Venom', 'Pixel', 'Night', 'Atomic', 'Ghost', 'Savage', 'Solar', 'Cyber', 'Phantom',
];
const NOUN = [
  'Knight', 'Rook', 'Bishop', 'Pawn', 'Gambit', 'Castle', 'Fork', 'Mate', 'Tempo', 'Fianchetto', 'Zugzwang', 'Sac', 'Outpost',
  'Blitzer', 'Tactician', 'Queen', 'King', 'Pin', 'Skewer', 'Endgame',
];
const STYLE = [(a: string, b: string, n: number) => `${a}${b}${n}`, (a: string, b: string) => `${a}_${b}`, (a: string, b: string, n: number) => `${a.toLowerCase()}${b.toLowerCase()}_${n}`, (a: string, b: string) => `x${a}${b}x`, (a: string, b: string, n: number) => `${b}${a}${n}`];

const generated = new Map<string, Rival>();

/** Creates a brand new rival with a fresh name at exactly `rating` (used when no roster name is close enough). */
export function generateRival(rating: number, seed = Math.random()): Rival {
  const taken = new Set(RIVALS.map((r) => r.name.toLowerCase()));
  for (let k = 0; ; k++) {
    const h = hash(`${seed}|${k}`);
    const name = STYLE[h % STYLE.length](PREFIX[(h >>> 4) % PREFIX.length], NOUN[(h >>> 10) % NOUN.length], 1 + ((h >>> 16) % 99));
    if (taken.has(name.toLowerCase()) && k < 50) continue;
    const base = Math.max(150, Math.round(rating));
    const r: Rival = { id: `rival_x${base}_${name}`, name, base, icon: ICONS[h % ICONS.length], card: CARDS[(h >>> 8) % CARDS.length], fixed: true };
    generated.set(r.id, r);
    generated.set(name.toLowerCase(), r);
    return r;
  }
}

/** Finds a rival (roster or generated) by id or name. Generated ids encode their rating, so they survive reloads. */
export function findRival(key: string): Rival | undefined {
  const k = key.toLowerCase();
  const hit = RIVAL_BY_ID[key] ?? RIVALS.find((r) => r.name.toLowerCase() === k) ?? generated.get(key) ?? generated.get(k);
  if (hit) return hit;
  const m = /^rival_x(\d+)_(.+)$/.exec(key);
  if (!m) return undefined;
  const h = hash(m[2]);
  const r: Rival = { id: key, name: m[2], base: Number(m[1]), icon: ICONS[h % ICONS.length], card: CARDS[(h >>> 8) % CARDS.length], fixed: true };
  generated.set(key, r);
  generated.set(m[2].toLowerCase(), r);
  return r;
}

/**
 * Picks an opponent for a player: a leaderboard rival within RIVAL_WINDOW of their rating (a random one
 * of the closest few, for variety), or a newly generated rival near their rating if none is close enough.
 */
export function pickRival(rating: number, cat: TimeCategory, seed = Math.random()): Rival {
  const near = RIVALS.map((r) => ({ r, d: Math.abs(rivalRating(r, cat) - rating) }))
    .filter((x) => x.d <= RIVAL_WINDOW)
    .sort((a, b) => a.d - b.d)
    .slice(0, 6);
  if (near.length) return near[Math.floor(seed * near.length)].r;
  return generateRival(rating + Math.round((seed * 2 - 1) * 120), seed);
}
