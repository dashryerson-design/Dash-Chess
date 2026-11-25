import type { TimeControl, TimeCategory } from './timeControls';
import type { MoveRating, ClassCounts } from './classification';
import type { Equipped } from './cosmetics';
import type { LevelReward } from './progression';

export type GameMode = 'bot' | 'ranked' | 'casual' | 'private';
export type ColorChoice = 'white' | 'black' | 'random';
export type Side = 'w' | 'b';

export type EndReason =
  | 'checkmate'
  | 'resignation'
  | 'timeout'
  | 'timeout_insufficient'
  | 'stalemate'
  | 'repetition'
  | 'fifty_moves'
  | 'insufficient_material'
  | 'agreement'
  | 'abandoned'
  | 'aborted';

export const END_REASON_LABEL: Record<EndReason, string> = {
  checkmate: 'Checkmate',
  resignation: 'Resignation',
  timeout: 'Time forfeit',
  timeout_insufficient: 'Timeout vs insufficient material',
  stalemate: 'Stalemate',
  repetition: 'Threefold repetition',
  fifty_moves: 'Fifty-move rule',
  insufficient_material: 'Insufficient material',
  agreement: 'Draw by agreement',
  abandoned: 'Abandoned (disconnected)',
  aborted: 'Game aborted',
};

export interface MatchSettings {
  tc: TimeControl;
  rated: boolean;
  takebacks: boolean;
  /** move hints + live move ratings */
  assistance: boolean;
  spectators: boolean;
  color: ColorChoice;
}

export interface SeatInfo {
  kind: 'human' | 'bot';
  id: string;
  name: string;
  icon: string;
  card: string;
  level: number | null;
  rating: number | null;
  provisional: boolean;
  connected: boolean;
}

export interface ClockState {
  w: number; // ms remaining
  b: number;
  running: boolean;
  /** side whose clock is ticking */
  turn: Side;
  /** ms since the ticking side's turn started, measured on the server when the state was sent */
  elapsed: number;
}

export interface GameResult {
  winner: Side | null;
  reason: EndReason;
  ratingDelta?: { w?: number; b?: number };
  ratingAfter?: { w?: number; b?: number };
}

export interface MoveRecord {
  uci: string;
  san: string;
  /** clock of the mover after the move, ms (null if untimed) */
  clock: number | null;
  /** ms spent on this move */
  spent: number;
}

export interface GameState {
  id: string;
  mode: GameMode;
  settings: MatchSettings;
  category: TimeCategory;
  white: SeatInfo;
  black: SeatInfo;
  moves: MoveRecord[];
  fen: string;
  clock: ClockState | null;
  status: 'active' | 'ended';
  result: GameResult | null;
  drawOffer: Side | null;
  takebackOffer: Side | null;
  spectators: number;
  yourColor: Side | null;
  startedAt: number;
  /** ms until auto-abort if the current side has not made its first move */
  abortIn: number | null;
  /** for disconnected opponents: ms until they forfeit */
  opponentGoneFor: number | null;
  rematchOffer: Side | null;
  liveRatings: boolean;
}

export interface GameRewards {
  gameId: string;
  xp: number;
  points: number;
  pointsFromMoves: number;
  pointsFromResult: number;
  xpBefore: number;
  xpAfter: number;
  levelBefore: number;
  levelAfter: number;
  levelRewards: LevelReward[];
  achievements: string[];
  challenges: string[];
  items: string[];
  accuracy: number | null;
  counts: ClassCounts | null;
  notes: string[];
}

export interface GameAnalysis {
  gameId: string;
  depth: number;
  ratings: MoveRating[];
  accuracy: { w: number; b: number };
  complete: boolean;
}

export interface PublicProfile {
  id: string;
  username: string;
  level: number;
  xp: number;
  icon: string;
  card: string;
  createdAt: number;
  rating: number;
  peakRating: number;
  online: boolean;
  playing: boolean;
}

export interface Me extends PublicProfile {
  points: number;
  equipped: Equipped;
  inventory: string[];
  settings: Record<string, unknown>;
  privacy: { showOnline: boolean; allowChallenges: 'everyone' | 'friends' | 'nobody' };
}

export interface FriendEntry {
  id: string;
  username: string;
  icon: string;
  card: string;
  level: number;
  rating: number;
  status: 'online' | 'offline' | 'playing' | 'searching';
  gameId: string | null;
}

export interface PartyMember {
  id: string;
  username: string;
  icon: string;
  level: number;
  rating: number;
  ready: boolean;
  leader: boolean;
}

export interface PartyState {
  id: string;
  code: string;
  leaderId: string;
  members: PartyMember[];
  settings: MatchSettings;
  /** the two members who will play (white preference applied by settings.color) */
  players: [string, string] | null;
  gameId: string | null;
}

export interface Notification {
  id: number;
  type: 'friend_request' | 'friend_accepted' | 'challenge' | 'party_invite' | 'achievement' | 'level_up' | 'season_reward' | 'system';
  payload: Record<string, unknown>;
  createdAt: number;
  read: boolean;
}

export interface QueueStatus {
  searching: boolean;
  mode?: 'ranked' | 'casual';
  tc?: TimeControl;
  since?: number;
  range?: number;
  playersInQueue?: number;
}
