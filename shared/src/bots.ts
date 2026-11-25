/**
 * The 20 DC Chess bots.
 *
 * Every bot is powered by Stockfish. Strength comes from the engine budget (nodes), the
 * candidate window it considers (MultiPV + tolerance), how "noisy" its selection is
 * (temperature) and an explicit human-like error model (mistakeRate / blunderRate).
 * Personality comes from style weights that bias the choice between engine candidates
 * which are close in evaluation, plus special behaviours (trap search, endgame depth, ...).
 */
export type Difficulty = 'Beginner' | 'Easy' | 'Medium' | 'Hard' | 'Very Hard' | 'Expert';

export interface StyleWeights {
  /** bonus (cp) for moves that move pieces toward the enemy king / increase pressure */
  aggression: number;
  /** bonus for moves that keep or improve own king shelter, castling */
  kingSafety: number;
  /** bonus for captures (scaled by captured value) */
  captures: number;
  /** bonus for equal trades (positive = likes simplifying, negative = avoids trades) */
  trades: number;
  /** bonus for checks */
  checks: number;
  /** bonus for moves that give up material (gambits / sacrifices) */
  sacrifice: number;
  /** bonus for central control and development */
  positional: number;
  /** bonus for pawn advances against the enemy king */
  pawnStorm: number;
  /** bonus for quiet, non-committal moves */
  quiet: number;
}

export interface BotEngineConfig {
  nodes: number;
  multipv: number;
  /** candidates within `tolerance` cp of best are eligible for style-based choice */
  tolerance: number;
  /** softmax temperature in cp; 0 = always pick the highest utility */
  temperature: number;
  mistakeRate: number;
  mistakeWindow: number;
  /** chance of a "human blunder": a plausible-looking move chosen without calculation */
  blunderRate: number;
  style: StyleWeights;
  endgameNodesFactor?: number;
  middlegameNodesFactor?: number;
  tacticalNodesFactor?: number;
  trapSearch?: boolean;
  counterpunch?: boolean;
  avoidDraws?: boolean;
  acceptDrawsWhenWorse?: boolean;
}

export interface BotProfile {
  id: string;
  number: number;
  name: string;
  personality: string;
  description: string;
  difficulty: Difficulty;
  elo: number;
  tier: number; // 1..6 used for reward scaling
  color: string;
  accent: string;
  glyph: 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
  quote: string;
  engine: BotEngineConfig;
}

const S = (s: Partial<StyleWeights>): StyleWeights => ({
  aggression: 0,
  kingSafety: 0,
  captures: 0,
  trades: 0,
  checks: 0,
  sacrifice: 0,
  positional: 0,
  pawnStorm: 0,
  quiet: 0,
  ...s,
});

export const BOTS: BotProfile[] = [
  {
    id: 'rookie', number: 1, name: 'Rookie', personality: 'Makes frequent mistakes', difficulty: 'Beginner', elo: 400, tier: 1,
    color: '#5fbf6a', accent: '#b8f5bd', glyph: 'pawn', quote: 'Wait, how does the horse move again?',
    description: 'Rookie has just learned the rules. Leaves pieces hanging, misses threats and rarely sees more than one move ahead. The perfect first opponent.',
    engine: { nodes: 1500, multipv: 6, tolerance: 400, temperature: 220, mistakeRate: 0.4, mistakeWindow: 900, blunderRate: 0.42, style: S({ captures: 25, checks: 20 }) },
  },
  {
    id: 'casual', number: 2, name: 'Casual', personality: 'Plays straightforward chess', difficulty: 'Beginner', elo: 650, tier: 1,
    color: '#68b0d8', accent: '#c4e8ff', glyph: 'pawn', quote: 'Just here for a fun game.',
    description: 'Casual develops pieces, grabs free material and enjoys a relaxed game. Still overlooks simple tactics now and then.',
    engine: { nodes: 3000, multipv: 6, tolerance: 220, temperature: 140, mistakeRate: 0.3, mistakeWindow: 600, blunderRate: 0.22, style: S({ captures: 20, positional: 15 }) },
  },
  {
    id: 'defender', number: 3, name: 'Defender', personality: 'Prioritises king safety', difficulty: 'Easy', elo: 800, tier: 2,
    color: '#7f8ea8', accent: '#d6deee', glyph: 'rook', quote: 'Castle early. Castle often.',
    description: 'Defender castles quickly, keeps the pawn shield intact and retreats pieces to cover the king. Hard to mate, but passive.',
    engine: { nodes: 5000, multipv: 6, tolerance: 160, temperature: 90, mistakeRate: 0.24, mistakeWindow: 450, blunderRate: 0.14, style: S({ kingSafety: 60, quiet: 25, aggression: -15, trades: 10 }) },
  },
  {
    id: 'attacker', number: 4, name: 'Attacker', personality: 'Looks for attacking opportunities', difficulty: 'Easy', elo: 900, tier: 2,
    color: '#e0703c', accent: '#ffc9a8', glyph: 'knight', quote: 'Your king looks lonely.',
    description: 'Attacker brings pieces towards your king at every opportunity and loves giving check, sometimes neglecting its own defence.',
    engine: { nodes: 6000, multipv: 6, tolerance: 150, temperature: 85, mistakeRate: 0.22, mistakeWindow: 400, blunderRate: 0.12, style: S({ aggression: 45, checks: 35, pawnStorm: 20, kingSafety: -10 }) },
  },
  {
    id: 'gambler', number: 5, name: 'Gambler', personality: 'Takes unusual risks', difficulty: 'Easy', elo: 1000, tier: 2,
    color: '#d6b13b', accent: '#fff0b3', glyph: 'bishop', quote: 'Fortune favours the bold.',
    description: 'Gambler offers pawns, sacrifices pieces for initiative and chooses chaotic lines. Dangerous if you do not punish the risks.',
    engine: { nodes: 8000, multipv: 7, tolerance: 170, temperature: 110, mistakeRate: 0.18, mistakeWindow: 380, blunderRate: 0.08, style: S({ sacrifice: 60, aggression: 25, checks: 20, quiet: -20 }) },
  },
  {
    id: 'tactician', number: 6, name: 'Tactician', personality: 'Looks for combinations', difficulty: 'Medium', elo: 1200, tier: 3,
    color: '#e04f8a', accent: '#ffc2db', glyph: 'knight', quote: 'Forks, pins and skewers. In that order.',
    description: 'Tactician calculates sharply in forcing positions, hunting for forks, pins and discovered attacks. Weaker in quiet positions.',
    engine: { nodes: 12000, multipv: 5, tolerance: 100, temperature: 55, mistakeRate: 0.14, mistakeWindow: 300, blunderRate: 0.05, tacticalNodesFactor: 3, middlegameNodesFactor: 1, style: S({ captures: 25, checks: 30, quiet: -15 }) },
  },
  {
    id: 'strategist', number: 7, name: 'Strategist', personality: 'Focuses on positional play', difficulty: 'Medium', elo: 1300, tier: 3,
    color: '#4f9de0', accent: '#bfe0ff', glyph: 'bishop', quote: 'A plan is better than no plan.',
    description: 'Strategist controls the centre, improves pieces and builds long-term advantages, but can be caught out by sharp tactics.',
    engine: { nodes: 15000, multipv: 5, tolerance: 80, temperature: 45, mistakeRate: 0.12, mistakeWindow: 260, blunderRate: 0.04, tacticalNodesFactor: 0.6, style: S({ positional: 45, quiet: 20, checks: -10 }) },
  },
  {
    id: 'exchanger', number: 8, name: 'Exchanger', personality: 'Likes simplifying positions', difficulty: 'Medium', elo: 1350, tier: 3,
    color: '#8fa35b', accent: '#e2f0b8', glyph: 'rook', quote: 'Fewer pieces, fewer problems.',
    description: 'Exchanger trades pieces whenever it can and steers games toward simple endgames. Very solid once the queens are off.',
    engine: { nodes: 18000, multipv: 5, tolerance: 90, temperature: 40, mistakeRate: 0.11, mistakeWindow: 240, blunderRate: 0.035, endgameNodesFactor: 2, style: S({ trades: 60, captures: 15, sacrifice: -30 }) },
  },
  {
    id: 'trapper', number: 9, name: 'Trapper', personality: 'Looks for tactical traps', difficulty: 'Medium', elo: 1400, tier: 3,
    color: '#9b6cd8', accent: '#e1cdff', glyph: 'bishop', quote: 'That pawn looks free, does it not?',
    description: 'Trapper chooses moves that set traps: positions where your most natural reply is a mistake. Look twice before grabbing material.',
    engine: { nodes: 18000, multipv: 5, tolerance: 70, temperature: 35, mistakeRate: 0.1, mistakeWindow: 220, blunderRate: 0.03, trapSearch: true, style: S({ checks: 10 }) },
  },
  {
    id: 'counterpuncher', number: 10, name: 'Counterpuncher', personality: 'Waits for opponent mistakes', difficulty: 'Medium', elo: 1450, tier: 3,
    color: '#4fc3b0', accent: '#bdf5ec', glyph: 'king', quote: 'Go on. Overextend.',
    description: 'Counterpuncher keeps a compact position and waits. When you slip, it switches instantly to precise, punishing play.',
    engine: { nodes: 22000, multipv: 5, tolerance: 70, temperature: 35, mistakeRate: 0.09, mistakeWindow: 200, blunderRate: 0.025, counterpunch: true, style: S({ quiet: 35, kingSafety: 20, aggression: -10 }) },
  },
  {
    id: 'veteran', number: 11, name: 'Veteran', personality: 'Balanced playing style', difficulty: 'Medium', elo: 1550, tier: 4,
    color: '#b08d5f', accent: '#f0dcc0', glyph: 'king', quote: 'I have seen this position before.',
    description: 'Veteran plays sound, well-rounded chess with few weaknesses: decent openings, sensible plans and reliable technique.',
    engine: { nodes: 30000, multipv: 4, tolerance: 50, temperature: 25, mistakeRate: 0.07, mistakeWindow: 180, blunderRate: 0.015, style: S({ positional: 15, kingSafety: 10 }) },
  },
  {
    id: 'aggressor', number: 12, name: 'Aggressor', personality: 'Applies constant pressure', difficulty: 'Hard', elo: 1700, tier: 4,
    color: '#e0453c', accent: '#ffb3ad', glyph: 'queen', quote: 'No time to breathe.',
    description: 'Aggressor never lets up: active pieces, constant threats and pawn storms. You will be defending all game.',
    engine: { nodes: 50000, multipv: 4, tolerance: 45, temperature: 20, mistakeRate: 0.06, mistakeWindow: 160, blunderRate: 0.01, style: S({ aggression: 35, checks: 20, pawnStorm: 25, quiet: -15 }) },
  },
  {
    id: 'positional', number: 13, name: 'Positional', personality: 'Strong positional understanding', difficulty: 'Hard', elo: 1800, tier: 4,
    color: '#3f7fd0', accent: '#b5d4ff', glyph: 'bishop', quote: 'Weak squares are forever.',
    description: 'Positional squeezes you slowly with superior pawn structure, outposts and space. A masterclass in prophylaxis.',
    engine: { nodes: 70000, multipv: 4, tolerance: 35, temperature: 15, mistakeRate: 0.05, mistakeWindow: 140, blunderRate: 0.006, style: S({ positional: 40, quiet: 20 }) },
  },
  {
    id: 'endgame', number: 14, name: 'Endgame Expert', personality: 'Strong endgame play', difficulty: 'Hard', elo: 1850, tier: 5,
    color: '#6b8f71', accent: '#c9efce', glyph: 'rook', quote: 'Every endgame is a puzzle with one solution.',
    description: 'Endgame Expert plays an ordinary middlegame, then calculates endgames with near-perfect precision. Trading down is risky.',
    engine: { nodes: 50000, multipv: 4, tolerance: 40, temperature: 18, mistakeRate: 0.05, mistakeWindow: 140, blunderRate: 0.008, endgameNodesFactor: 12, middlegameNodesFactor: 0.8, style: S({ trades: 25 }) },
  },
  {
    id: 'calculator', number: 15, name: 'Calculator', personality: 'Strong tactical calculations', difficulty: 'Hard', elo: 1950, tier: 5,
    color: '#00b4d8', accent: '#aef1ff', glyph: 'knight', quote: 'Calculating... 14 moves deep.',
    description: 'Calculator sees deep into forcing lines. In tactical positions it searches several times deeper than in quiet ones.',
    engine: { nodes: 90000, multipv: 3, tolerance: 30, temperature: 12, mistakeRate: 0.04, mistakeWindow: 120, blunderRate: 0.004, tacticalNodesFactor: 4, style: S({ captures: 10, checks: 10 }) },
  },
  {
    id: 'grinder', number: 16, name: 'The Grinder', personality: 'Patient and defensive', difficulty: 'Hard', elo: 2000, tier: 5,
    color: '#7a7f8c', accent: '#d9dce4', glyph: 'rook', quote: 'We can play for another hundred moves.',
    description: 'The Grinder defends tenaciously, avoids repetitions, refuses draws and will happily play 80 moves to convert a tiny edge.',
    engine: { nodes: 120000, multipv: 3, tolerance: 25, temperature: 10, mistakeRate: 0.03, mistakeWindow: 110, blunderRate: 0.003, avoidDraws: true, endgameNodesFactor: 2, style: S({ kingSafety: 25, quiet: 20, trades: -10 }) },
  },
  {
    id: 'grandmaster', number: 17, name: 'Grandmaster', personality: 'Advanced chess ability', difficulty: 'Very Hard', elo: 2300, tier: 6,
    color: '#c9a227', accent: '#ffe9a0', glyph: 'queen', quote: 'Interesting. Let me think.',
    description: 'Grandmaster combines deep strategy with sharp tactics. Occasionally imprecise, rarely wrong.',
    engine: { nodes: 160000, multipv: 3, tolerance: 22, temperature: 9, mistakeRate: 0.03, mistakeWindow: 110, blunderRate: 0, style: S({ positional: 10 }) },
  },
  {
    id: 'destroyer', number: 18, name: 'The Destroyer', personality: 'Relentless attacking play', difficulty: 'Very Hard', elo: 2400, tier: 6,
    color: '#ff2e4d', accent: '#ff9aab', glyph: 'queen', quote: 'Nothing survives.',
    description: 'The Destroyer launches attack after attack with engine-level calculation and an appetite for sacrifices.',
    engine: { nodes: 220000, multipv: 3, tolerance: 22, temperature: 8, mistakeRate: 0.02, mistakeWindow: 90, blunderRate: 0, style: S({ aggression: 30, checks: 15, sacrifice: 20, pawnStorm: 20 }) },
  },
  {
    id: 'professor', number: 19, name: 'The Professor', personality: 'Exceptionally accurate chess', difficulty: 'Expert', elo: 2650, tier: 6,
    color: '#8b7bff', accent: '#d2cbff', glyph: 'king', quote: 'Precision is a habit.',
    description: 'The Professor makes almost no inaccuracies. Expect textbook openings and flawless technique.',
    engine: { nodes: 600000, multipv: 2, tolerance: 8, temperature: 3, mistakeRate: 0.006, mistakeWindow: 50, blunderRate: 0, style: S({}) },
  },
  {
    id: 'champion', number: 20, name: 'DC Champion', personality: 'Strongest available bot', difficulty: 'Expert', elo: 2900, tier: 6,
    color: '#6a5bff', accent: '#00d4ff', glyph: 'king', quote: 'Welcome to the final boss.',
    description: 'The DC Champion plays at full engine strength with a deep search budget. Beatable, but only by the very best.',
    engine: { nodes: 1500000, multipv: 1, tolerance: 0, temperature: 0, mistakeRate: 0, mistakeWindow: 0, blunderRate: 0, style: S({}) },
  },
];

export const BOT_BY_ID: Record<string, BotProfile> = Object.fromEntries(BOTS.map((b) => [b.id, b]));

export const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  Beginner: '#5fbf6a',
  Easy: '#9ccf4d',
  Medium: '#e0b43c',
  Hard: '#ff8a3d',
  'Very Hard': '#ff4f5e',
  Expert: '#a55bff',
};
