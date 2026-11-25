export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#9aa3b2',
  uncommon: '#3fcf8e',
  rare: '#3d8bff',
  epic: '#a55bff',
  legendary: '#ffb22e',
};

export type CosmeticType =
  | 'pieces'
  | 'board'
  | 'background'
  | 'icon'
  | 'card'
  | 'moveEffect'
  | 'captureEffect'
  | 'checkEffect'
  | 'sound'
  | 'theme';

export const COSMETIC_TYPES: { type: CosmeticType; label: string; plural: string }[] = [
  { type: 'pieces', label: 'Piece Set', plural: 'Piece Sets' },
  { type: 'board', label: 'Board', plural: 'Boards' },
  { type: 'background', label: 'Environment', plural: 'Environments' },
  { type: 'icon', label: 'Player Icon', plural: 'Player Icons' },
  { type: 'card', label: 'Calling Card', plural: 'Calling Cards' },
  { type: 'moveEffect', label: 'Move Effect', plural: 'Move Effects' },
  { type: 'captureEffect', label: 'Capture Effect', plural: 'Capture Effects' },
  { type: 'checkEffect', label: 'Check Effect', plural: 'Check Effects' },
  { type: 'sound', label: 'Sound Pack', plural: 'Sound Packs' },
  { type: 'theme', label: 'Interface Theme', plural: 'Interface Themes' },
];

export type Unlock =
  | { kind: 'default' }
  | { kind: 'shop'; price: number }
  | { kind: 'level'; level: number }
  | { kind: 'achievement'; achievement: string }
  | { kind: 'division'; tier: string }
  | { kind: 'season'; season: string; tier: string };

export interface Cosmetic {
  id: string;
  type: CosmeticType;
  name: string;
  description: string;
  rarity: Rarity;
  unlock: Unlock;
}

const shop = (price: number): Unlock => ({ kind: 'shop', price });
const def: Unlock = { kind: 'default' };
const lvl = (level: number): Unlock => ({ kind: 'level', level });
const ach = (achievement: string): Unlock => ({ kind: 'achievement', achievement });
const div = (tier: string): Unlock => ({ kind: 'division', tier });

export const COSMETICS: Cosmetic[] = [
  // ---------- Piece sets ----------
  { id: 'pieces.classic', type: 'pieces', name: 'Classic', description: 'Tournament Staunton pieces in ivory and ebony.', rarity: 'common', unlock: def },
  { id: 'pieces.minimalist', type: 'pieces', name: 'Minimalist', description: 'Flat geometric forms. Nothing more than necessary.', rarity: 'common', unlock: shop(250) },
  { id: 'pieces.modern', type: 'pieces', name: 'Modern', description: 'Clean contemporary silhouettes with satin finish.', rarity: 'uncommon', unlock: shop(450) },
  { id: 'pieces.wooden', type: 'pieces', name: 'Wooden', description: 'Hand-turned boxwood and rosewood.', rarity: 'uncommon', unlock: shop(550) },
  { id: 'pieces.marble', type: 'pieces', name: 'Marble', description: 'Carrara white against Nero Marquina.', rarity: 'rare', unlock: shop(950) },
  { id: 'pieces.metallic', type: 'pieces', name: 'Metallic', description: 'Brushed chrome and gunmetal, machined to tolerance.', rarity: 'rare', unlock: shop(1150) },
  { id: 'pieces.futuristic', type: 'pieces', name: 'Futuristic', description: 'Faceted hard-light constructs.', rarity: 'epic', unlock: shop(1900) },
  { id: 'pieces.neon', type: 'pieces', name: 'Neon', description: 'Pure light. Cyan versus magenta.', rarity: 'epic', unlock: shop(2100) },
  { id: 'pieces.crystal', type: 'pieces', name: 'Crystal', description: 'Translucent quartz that catches every light.', rarity: 'legendary', unlock: shop(3400) },
  { id: 'pieces.animated', type: 'pieces', name: 'Animated', description: 'Living pieces with flowing energy. Earned at level 25.', rarity: 'legendary', unlock: lvl(25) },

  // ---------- Boards ----------
  { id: 'board.wood', type: 'board', name: 'Classic Wooden', description: 'Maple and walnut inlay.', rarity: 'common', unlock: def },
  { id: 'board.tournament', type: 'board', name: 'Tournament', description: 'The familiar green and cream.', rarity: 'common', unlock: def },
  { id: 'board.mono', type: 'board', name: 'Black & White', description: 'Pure contrast.', rarity: 'common', unlock: shop(150) },
  { id: 'board.ocean', type: 'board', name: 'Blue', description: 'Deep ocean blues.', rarity: 'uncommon', unlock: shop(300) },
  { id: 'board.amethyst', type: 'board', name: 'Purple', description: 'Amethyst and lavender.', rarity: 'uncommon', unlock: shop(350) },
  { id: 'board.crimson', type: 'board', name: 'Red', description: 'Crimson and rose stone.', rarity: 'uncommon', unlock: shop(350) },
  { id: 'board.marble', type: 'board', name: 'Marble', description: 'Polished veined marble.', rarity: 'rare', unlock: shop(900) },
  { id: 'board.metal', type: 'board', name: 'Dark Metallic', description: 'Anodised gunmetal plates.', rarity: 'rare', unlock: shop(1000) },
  { id: 'board.neon', type: 'board', name: 'Neon', description: 'Glowing grid lines on black glass.', rarity: 'epic', unlock: shop(1600) },
  { id: 'board.future', type: 'board', name: 'Futuristic', description: 'Holographic tactical display.', rarity: 'epic', unlock: shop(1800) },
  { id: 'board.diamond', type: 'board', name: 'Diamond League', description: 'Awarded for reaching Diamond.', rarity: 'epic', unlock: div('diamond') },
  { id: 'board.champion', type: 'board', name: 'Champion\'s Board', description: 'Gold and obsidian. Defeat the DC Champion.', rarity: 'legendary', unlock: ach('beat_champion') },

  // ---------- Environments / backgrounds ----------
  { id: 'background.void', type: 'background', name: 'Void', description: 'A quiet, dark studio.', rarity: 'common', unlock: def },
  { id: 'background.study', type: 'background', name: 'The Study', description: 'Warm lamplight and oak.', rarity: 'uncommon', unlock: shop(400) },
  { id: 'background.arena', type: 'background', name: 'Arena', description: 'Stadium spotlights. Everyone is watching.', rarity: 'rare', unlock: shop(1000) },
  { id: 'background.zen', type: 'background', name: 'Zen Garden', description: 'Stillness, sand and stone.', rarity: 'rare', unlock: shop(1100) },
  { id: 'background.grid', type: 'background', name: 'Cyber Grid', description: 'An endless synthwave horizon.', rarity: 'epic', unlock: shop(1700) },
  { id: 'background.nebula', type: 'background', name: 'Nebula', description: 'Play among the stars.', rarity: 'epic', unlock: shop(2000) },
  { id: 'background.throne', type: 'background', name: 'Throne Room', description: 'Reserved for those who reach Master.', rarity: 'legendary', unlock: div('master') },

  // ---------- Player icons ----------
  { id: 'icon.knight', type: 'icon', name: 'Knight', description: 'The default emblem.', rarity: 'common', unlock: def },
  { id: 'icon.pawn', type: 'icon', name: 'Pawn', description: 'Every grandmaster started here.', rarity: 'common', unlock: def },
  { id: 'icon.rook', type: 'icon', name: 'Rook', description: 'Solid as a castle.', rarity: 'common', unlock: def },
  { id: 'icon.bishop', type: 'icon', name: 'Bishop', description: 'Long diagonals.', rarity: 'uncommon', unlock: shop(200) },
  { id: 'icon.queen', type: 'icon', name: 'Queen', description: 'Power in every direction.', rarity: 'rare', unlock: shop(600) },
  { id: 'icon.king', type: 'icon', name: 'King', description: 'Long live the king.', rarity: 'rare', unlock: shop(650) },
  { id: 'icon.bolt', type: 'icon', name: 'Bolt', description: 'Lightning reflexes.', rarity: 'uncommon', unlock: shop(250) },
  { id: 'icon.flame', type: 'icon', name: 'Flame', description: 'Always on fire.', rarity: 'uncommon', unlock: shop(250) },
  { id: 'icon.skull', type: 'icon', name: 'Skull', description: 'Feared across the board.', rarity: 'epic', unlock: shop(1200) },
  { id: 'icon.dragon', type: 'icon', name: 'Dragon', description: 'The Dragon variation, personified.', rarity: 'legendary', unlock: shop(2600) },
  { id: 'icon.star', type: 'icon', name: 'First Star', description: 'Earned with your first victory.', rarity: 'uncommon', unlock: ach('first_win') },
  { id: 'icon.mate', type: 'icon', name: 'Checkmate', description: 'Deliver your first checkmate.', rarity: 'uncommon', unlock: ach('first_mate') },
  { id: 'icon.gem', type: 'icon', name: 'Brilliance', description: 'Play ten Incredible moves.', rarity: 'epic', unlock: ach('ten_incredible') },
  { id: 'icon.laurel', type: 'icon', name: 'Laurel', description: 'Reach level 10.', rarity: 'rare', unlock: lvl(10) },
  { id: 'icon.robot', type: 'icon', name: 'Machine Slayer', description: 'Defeat every bot.', rarity: 'legendary', unlock: ach('beat_all_bots') },
  { id: 'icon.gold', type: 'icon', name: 'Gold Crest', description: 'Reach Gold division.', rarity: 'rare', unlock: div('gold') },
  { id: 'icon.platinum', type: 'icon', name: 'Platinum Crest', description: 'Reach Platinum division.', rarity: 'epic', unlock: div('platinum') },

  // ---------- Calling cards ----------
  { id: 'card.carbon', type: 'card', name: 'Carbon', description: 'Woven carbon fibre.', rarity: 'common', unlock: def },
  { id: 'card.dawn', type: 'card', name: 'Dawn', description: 'First light.', rarity: 'common', unlock: def },
  { id: 'card.circuit', type: 'card', name: 'Circuit', description: 'Traces of logic.', rarity: 'uncommon', unlock: shop(300) },
  { id: 'card.aurora', type: 'card', name: 'Aurora', description: 'Northern lights.', rarity: 'rare', unlock: shop(800) },
  { id: 'card.ember', type: 'card', name: 'Ember', description: 'Smouldering intensity.', rarity: 'rare', unlock: shop(800) },
  { id: 'card.prism', type: 'card', name: 'Prism', description: 'Refracted light.', rarity: 'epic', unlock: shop(1500) },
  { id: 'card.galaxy', type: 'card', name: 'Galaxy', description: 'A spiral of stars.', rarity: 'epic', unlock: shop(1700) },
  { id: 'card.royal', type: 'card', name: 'Royal Decree', description: 'Purple and gold.', rarity: 'legendary', unlock: shop(3000) },
  { id: 'card.veteran', type: 'card', name: 'Veteran', description: 'Play one hundred games.', rarity: 'rare', unlock: ach('hundred_games') },
  { id: 'card.streak', type: 'card', name: 'Unstoppable', description: 'Win five games in a row.', rarity: 'epic', unlock: ach('streak_5') },
  { id: 'card.level50', type: 'card', name: 'Ascendant', description: 'Reach level 50.', rarity: 'legendary', unlock: lvl(50) },
  { id: 'card.ranked', type: 'card', name: 'Contender', description: 'Win your first ranked match.', rarity: 'uncommon', unlock: ach('first_ranked_win') },
  { id: 'card.season1', type: 'card', name: 'Season 1 Competitor', description: 'Finish a season ranked in Gold or higher.', rarity: 'epic', unlock: { kind: 'season', season: 'any', tier: 'gold' } },

  // ---------- Move effects ----------
  { id: 'moveEffect.none', type: 'moveEffect', name: 'Clean', description: 'No trail. Pure focus.', rarity: 'common', unlock: def },
  { id: 'moveEffect.spark', type: 'moveEffect', name: 'Spark', description: 'A few sparks where the piece lands.', rarity: 'uncommon', unlock: shop(300) },
  { id: 'moveEffect.ripple', type: 'moveEffect', name: 'Ripple', description: 'A ring ripples outward on landing.', rarity: 'rare', unlock: shop(700) },
  { id: 'moveEffect.comet', type: 'moveEffect', name: 'Comet', description: 'A glowing trail follows each move.', rarity: 'epic', unlock: shop(1400) },
  { id: 'moveEffect.royal', type: 'moveEffect', name: 'Royal Trail', description: 'Gilded trail. Reach level 15.', rarity: 'epic', unlock: lvl(15) },

  // ---------- Capture effects ----------
  { id: 'captureEffect.fade', type: 'captureEffect', name: 'Fade', description: 'Captured pieces quietly fade away.', rarity: 'common', unlock: def },
  { id: 'captureEffect.shatter', type: 'captureEffect', name: 'Shatter', description: 'Pieces break into shards.', rarity: 'rare', unlock: shop(800) },
  { id: 'captureEffect.burst', type: 'captureEffect', name: 'Burst', description: 'A burst of energy on capture.', rarity: 'uncommon', unlock: shop(350) },
  { id: 'captureEffect.vortex', type: 'captureEffect', name: 'Vortex', description: 'Pieces spiral into nothing.', rarity: 'epic', unlock: shop(1500) },
  { id: 'captureEffect.lightning', type: 'captureEffect', name: 'Lightning', description: 'A strike of lightning. Win 50 games.', rarity: 'legendary', unlock: ach('fifty_wins') },

  // ---------- Check effects ----------
  { id: 'checkEffect.glow', type: 'checkEffect', name: 'Red Glow', description: 'A red glow under the king.', rarity: 'common', unlock: def },
  { id: 'checkEffect.pulse', type: 'checkEffect', name: 'Pulse', description: 'A pulsing warning ring.', rarity: 'uncommon', unlock: shop(300) },
  { id: 'checkEffect.flare', type: 'checkEffect', name: 'Flare', description: 'A bright flare around the threatened king.', rarity: 'rare', unlock: shop(750) },

  // ---------- Sound packs ----------
  { id: 'sound.standard', type: 'sound', name: 'Standard', description: 'Crisp, neutral clicks.', rarity: 'common', unlock: def },
  { id: 'sound.wood', type: 'sound', name: 'Woodblock', description: 'Warm wooden knocks.', rarity: 'uncommon', unlock: shop(300) },
  { id: 'sound.digital', type: 'sound', name: 'Digital', description: 'Synthetic interface tones.', rarity: 'rare', unlock: shop(700) },
  { id: 'sound.arcade', type: 'sound', name: 'Arcade', description: '8-bit chiptune blips.', rarity: 'epic', unlock: shop(1300) },
  { id: 'sound.soft', type: 'sound', name: 'Soft', description: 'Muted, gentle feedback.', rarity: 'common', unlock: def },

  // ---------- UI themes ----------
  { id: 'theme.electric', type: 'theme', name: 'Electric', description: 'Signature DC blue and violet.', rarity: 'common', unlock: def },
  { id: 'theme.crimson', type: 'theme', name: 'Crimson', description: 'Red alert.', rarity: 'uncommon', unlock: shop(400) },
  { id: 'theme.emerald', type: 'theme', name: 'Emerald', description: 'Calm greens.', rarity: 'uncommon', unlock: shop(400) },
  { id: 'theme.solar', type: 'theme', name: 'Solar', description: 'Amber and gold.', rarity: 'rare', unlock: shop(800) },
  { id: 'theme.elite', type: 'theme', name: 'Elite', description: 'Monochrome prestige. Reach Platinum.', rarity: 'epic', unlock: div('platinum') },
];

export const COSMETIC_BY_ID: Record<string, Cosmetic> = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));

export type Equipped = Record<CosmeticType, string>;

export const DEFAULT_EQUIPPED: Equipped = {
  pieces: 'pieces.classic',
  board: 'board.wood',
  background: 'background.void',
  icon: 'icon.knight',
  card: 'card.carbon',
  moveEffect: 'moveEffect.none',
  captureEffect: 'captureEffect.fade',
  checkEffect: 'checkEffect.glow',
  sound: 'sound.standard',
  theme: 'theme.electric',
};

export const DEFAULT_ITEMS = COSMETICS.filter((c) => c.unlock.kind === 'default').map((c) => c.id);

export function unlockLabel(u: Unlock): string {
  switch (u.kind) {
    case 'default':
      return 'Included';
    case 'shop':
      return `${u.price.toLocaleString()} DC Points`;
    case 'level':
      return `Reach level ${u.level}`;
    case 'achievement':
      return 'Achievement reward';
    case 'division':
      return `Reach ${u.tier[0].toUpperCase()}${u.tier.slice(1)} division`;
    case 'season':
      return 'Seasonal reward';
  }
}
