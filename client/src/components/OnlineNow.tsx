import { Swords, UserPlus, Users } from 'lucide-react';
import { useLobby } from '../lib/lobby';
import { emit } from '../lib/socket';
import { api } from '../lib/api';
import { toast, toastError } from '../stores/toasts';
import { useSession } from '../stores/session';
import { PlayerIcon } from '../cosmetics/icons';

/** Everyone currently in the peer-to-peer lobby, with one-click challenge / add friend. */
export function OnlineNow() {
  const l = useLobby();
  const friends = useSession((s) => s.friends);
  const loadFriends = useSession((s) => s.loadFriends);
  const friendIds = new Set([...friends.friends, ...friends.outgoing].map((f) => f.id));
  const challenge = async (pid: string, name: string) => {
    const r = await emit('challenge:create', { to: pid, settings: { tc: { initial: 300, increment: 3 }, color: 'random', rated: false, spectators: true } });
    if (!r.ok) toast({ kind: 'error', title: 'Could not challenge', body: r.error });
    else toast({ kind: 'success', title: `Challenge sent to ${name}`, body: '5 + 3 casual. The game starts when they accept.' });
  };
  const add = async (name: string) => {
    try {
      await api.post('/api/friends/request', { username: name });
      toast({ kind: 'success', title: `Friend request sent to ${name}` });
      void loadFriends();
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="panel" style={{ marginBottom: 18 }}>
      <div className="panel-head">
        <h3 className="panel-title"><Users /> Online now <span className="muted small">{l.players.length}</span></h3>
        <span className="tiny muted">{l.relaysOpen ? `${l.relaysOpen} relays connected` : 'Connecting to lobby…'}</span>
      </div>
      {l.players.length === 0 ? (
        <div className="panel-body small muted">
          No other players are online yet. Ask your friend to open the site; they appear here within about 20 seconds. You can also share a private room code below.
        </div>
      ) : (
        <div className="list">
          {l.players.map((p) => (
            <div key={p.pid} className="list-item">
              <PlayerIcon id={p.icon} size={32} />
              <div className="grow">
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <div className="row tiny muted" style={{ gap: 6 }}><span className={`status-dot ${p.status}`} /> {p.status} · LV {p.level} · {p.rating}</div>
              </div>
              {!friendIds.has(p.pid) && <button className="btn btn-sm" onClick={() => add(p.name)}><UserPlus /> <span className="hide-xs">Add friend</span></button>}
              <button className="btn btn-sm btn-primary" disabled={p.status === 'playing'} onClick={() => challenge(p.pid, p.name)}><Swords /> Challenge</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
