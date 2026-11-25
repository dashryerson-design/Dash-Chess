import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FriendEntry, Notification, PartyState, QueueStatus } from '@dc/shared';
import { ACHIEVEMENT_BY_ID } from '@dc/shared';
import { getSocket, emit } from './socket';
import { useSession, type IncomingChallenge } from '../stores/session';
import { toast } from '../stores/toasts';
import { play } from './sound';
import { getSettings } from '../stores/settings';
import { tcLabel } from '@dc/shared';

/** Wires server push events into the stores. Mount once inside the router. */
export function useRealtime() {
  const navigate = useNavigate();
  const status = useSession((s) => s.status);

  useEffect(() => {
    if (status !== 'ready') return;
    const s = getSocket();
    const st = useSession.getState;
    const patch = st().patch;

    const onConnect = () => {
      patch({ connected: true });
      void st().loadFriends();
    };
    const onDisconnect = () => patch({ connected: false });
    const onHello = (h: { activeGameId: string | null; queue: QueueStatus }) => patch({ activeGameId: h.activeGameId, queue: h.queue });
    const onNotification = (n: Notification) => {
      const cur = st();
      patch({ notifications: [n, ...cur.notifications].slice(0, 50), unread: cur.unread + 1 });
      const ui = getSettings().ui;
      if (!ui.toasts) return;
      play('notify');
      const p = n.payload as any;
      switch (n.type) {
        case 'friend_request':
          if (ui.friendAlerts) toast({ kind: 'info', title: 'Friend request', body: `${p.from} wants to be your friend.`, action: { label: 'View', run: () => navigate('/friends') } });
          void cur.loadFriends();
          break;
        case 'friend_accepted':
          if (ui.friendAlerts) toast({ kind: 'success', title: 'New friend', body: `${p.from} accepted your request.` });
          void cur.loadFriends();
          break;
        case 'party_invite':
          toast(
            {
              kind: 'info',
              title: 'Party invite',
              body: `${p.from} invited you to their party.`,
              action: {
                label: 'Join party',
                run: async () => {
                  const r = await emit('party:join', { code: p.code });
                  if (!r.ok) toast({ kind: 'error', title: 'Could not join', body: r.error });
                  else navigate('/friends');
                },
              },
            },
            12000,
          );
          break;
        case 'achievement':
          toast({ kind: 'reward', title: `Achievement unlocked: ${p.name ?? ACHIEVEMENT_BY_ID[p.id]?.name}`, body: `+${p.xp} XP · +${p.points} DC Points` }, 6000);
          break;
        case 'level_up':
          play('levelup');
          toast({ kind: 'reward', title: `Level ${p.level} reached!`, body: p.points ? `+${p.points} DC Points${p.items?.length ? ' and a new cosmetic' : ''}` : undefined }, 6000);
          break;
        case 'season_reward':
          toast({ kind: 'reward', title: `${p.label} rewards`, body: `Peak division ${p.division}: +${p.points} DC Points` }, 8000);
          break;
        default:
          break;
      }
    };
    const onFriendStatus = (u: { id: string; status: FriendEntry['status'] }) => {
      const f = st().friends;
      patch({ friends: { ...f, friends: f.friends.map((x) => (x.id === u.id ? { ...x, status: u.status } : x)) } });
    };
    const onFriendsChanged = () => void st().loadFriends();
    const onParty = (p: PartyState | null) => patch({ party: p });
    const onPartyGame = (g: { gameId: string; spectate: boolean }) => {
      toast({ kind: 'info', title: 'Your party started a match', body: 'Joining as a spectator.' });
      navigate(`/game/${g.gameId}`);
    };
    const onQueue = (q: QueueStatus) => patch({ queue: q });
    const onMatch = (m: { gameId: string }) => {
      patch({ queue: { searching: false }, activeGameId: m.gameId });
      play('start');
      navigate(`/game/${m.gameId}`);
    };
    const onChallenge = (c: IncomingChallenge) => {
      patch({ challenges: [...st().challenges.filter((x) => x.challenge.id !== c.challenge.id), c] });
      if (!getSettings().ui.challengeAlerts) return;
      play('notify');
      toast(
        {
          kind: 'info',
          title: `${c.from.username} challenges you`,
          body: `${tcLabel(c.challenge.settings.tc)} · ${c.challenge.settings.rated ? 'Rated' : 'Casual'}`,
          action: {
            label: 'Accept',
            run: async () => {
              const r = await emit('challenge:accept', { id: c.challenge.id });
              if (!r.ok) toast({ kind: 'error', title: 'Could not accept', body: r.error });
              else navigate(`/game/${r.gameId}`);
            },
          },
        },
        20000,
      );
    };
    const onChallengeRemoved = (r: { id: string; declined?: boolean }) => {
      patch({ challenges: st().challenges.filter((c) => c.challenge.id !== r.id) });
      if (r.declined) toast({ kind: 'info', title: 'Challenge declined' });
    };
    const onMe = () => void st().refresh();
    const onConnectError = (e: Error) => {
      if (e.message === 'unauthorized') void st().load();
    };

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onConnectError);
    s.on('hello', onHello);
    s.on('notification', onNotification);
    s.on('friends:status', onFriendStatus);
    s.on('friends:changed', onFriendsChanged);
    s.on('party:state', onParty);
    s.on('party:game', onPartyGame);
    s.on('queue:status', onQueue);
    s.on('match:found', onMatch);
    s.on('challenge:incoming', onChallenge);
    s.on('challenge:removed', onChallengeRemoved);
    s.on('me:update', onMe);
    if (s.connected) onConnect();
    void st().loadNotifications();
    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('connect_error', onConnectError);
      s.off('hello', onHello);
      s.off('notification', onNotification);
      s.off('friends:status', onFriendStatus);
      s.off('friends:changed', onFriendsChanged);
      s.off('party:state', onParty);
      s.off('party:game', onPartyGame);
      s.off('queue:status', onQueue);
      s.off('match:found', onMatch);
      s.off('challenge:incoming', onChallenge);
      s.off('challenge:removed', onChallengeRemoved);
      s.off('me:update', onMe);
    };
  }, [status, navigate]);
}
