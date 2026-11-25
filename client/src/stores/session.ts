import { create } from 'zustand';
import type { FriendEntry, LevelInfo, Me, Notification, PartyState, PublicProfile, QueueStatus, TimeCategory, MatchSettings } from '@dc/shared';
import { api } from '../lib/api';
import { closeSocket } from '../lib/socket';

export interface RatingRow {
  category: TimeCategory;
  rating: number;
  peak: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface IncomingChallenge {
  challenge: { id: string; code: string; from: string; to: string | null; settings: MatchSettings; createdAt: number };
  from: PublicProfile;
}

interface SessionStore {
  status: 'loading' | 'guest' | 'ready';
  me: Me | null;
  ratings: Record<TimeCategory, RatingRow> | null;
  level: LevelInfo | null;
  unread: number;
  activeGameId: string | null;
  connected: boolean;
  friends: { friends: FriendEntry[]; incoming: FriendEntry[]; outgoing: FriendEntry[] };
  party: PartyState | null;
  queue: QueueStatus;
  notifications: Notification[];
  challenges: IncomingChallenge[];
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  loadFriends: () => Promise<void>;
  loadNotifications: () => Promise<void>;
  logout: () => Promise<void>;
  patch: (p: Partial<SessionStore>) => void;
}

export const useSession = create<SessionStore>((set, get) => ({
  status: 'loading',
  me: null,
  ratings: null,
  level: null,
  unread: 0,
  activeGameId: null,
  connected: false,
  friends: { friends: [], incoming: [], outgoing: [] },
  party: null,
  queue: { searching: false },
  notifications: [],
  challenges: [],
  load: async () => {
    try {
      const r = await api.get('/api/me');
      set({ status: 'ready', me: r.me, ratings: r.ratings, level: r.level, unread: r.unread, activeGameId: r.activeGameId });
    } catch {
      set({ status: 'guest', me: null });
    }
  },
  refresh: async () => {
    if (get().status !== 'ready') return;
    try {
      const r = await api.get('/api/me');
      set({ me: r.me, ratings: r.ratings, level: r.level, unread: r.unread, activeGameId: r.activeGameId });
    } catch {
      /* ignore transient errors */
    }
  },
  loadFriends: async () => {
    try {
      set({ friends: await api.get('/api/friends') });
    } catch {
      /* ignore */
    }
  },
  loadNotifications: async () => {
    try {
      const r = await api.get('/api/notifications');
      set({ notifications: r.notifications, unread: r.notifications.filter((n: Notification) => !n.read).length });
    } catch {
      /* ignore */
    }
  },
  logout: async () => {
    await api.post('/api/auth/logout').catch(() => {});
    closeSocket();
    set({ status: 'guest', me: null, ratings: null, level: null, party: null, friends: { friends: [], incoming: [], outgoing: [] }, notifications: [] });
  },
  patch: (p) => set(p),
}));
