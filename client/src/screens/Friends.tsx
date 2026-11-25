import { useEffect, useState } from 'react';
import { OnlineNow } from '../components/OnlineNow';
import { IS_P2P } from '../lib/lobby';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Users, Search, Check, X, Swords, Crown, LogOut, Copy, Play, UserMinus, Eye, Send } from 'lucide-react';
import type { PublicProfile } from '@dc/shared';
import { tcLabel } from '@dc/shared';
import { api } from '../lib/api';
import { emit } from '../lib/socket';
import { useSession } from '../stores/session';
import { toast, toastError } from '../stores/toasts';
import { Confirm, Empty, Modal } from '../components/ui';
import { PlayerIcon } from '../cosmetics/icons';
import { MatchSettingsEditor } from './Play';

function PartyPanel() {
  const { party, me, friends } = useSession();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  if (!me) return null;

  const run = async (ev: string, payload: Record<string, unknown> = {}) => {
    const r = await emit(ev, payload);
    if (!r.ok) toast({ kind: 'error', title: 'Party', body: r.error });
    return r;
  };

  if (!party) {
    return (
      <div className="panel panel-pad col" style={{ gap: 14 }}>
        <h3 className="panel-title"><Users /> Party</h3>
        <p className="small dim" style={{ margin: 0 }}>Group up with friends, pick match settings together and play private games. Other members watch live.</p>
        <button className="btn btn-primary" onClick={() => run('party:create')}><Users /> Create party</button>
        <div className="row">
          <input className="input" placeholder="Party code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} />
          <button className="btn" disabled={code.length < 4} onClick={() => run('party:join', { code })}>Join</button>
        </div>
      </div>
    );
  }

  const leader = party.leaderId === me.id;
  const meMember = party.members.find((m) => m.id === me.id);
  const invitable = friends.friends.filter((f) => f.status !== 'offline' && !party.members.some((m) => m.id === f.id));
  const players: string[] = party.players ?? [];
  const playerName = (id: string) => party.members.find((m) => m.id === id)?.username ?? '?';

  return (
    <div className="panel">
      <div className="panel-head">
        <h3 className="panel-title"><Users /> Party <span className="muted small">{party.members.length}/6</span></h3>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-sm" onClick={() => { void navigator.clipboard?.writeText(party.code); toast({ kind: 'success', title: 'Party code copied' }); }}>
            <Copy /> <span className="mono">{party.code}</span>
          </button>
          <button className="btn btn-sm btn-danger" onClick={() => run('party:leave')}><LogOut /> Leave</button>
        </div>
      </div>
      {party.gameId && (
        <div className="offer-bar" style={{ margin: 12 }}>
          <Swords size={16} /> <span className="grow">Party match in progress</span>
          <button className="btn btn-sm btn-primary" onClick={() => navigate(`/game/${party.gameId}`)}><Eye /> Open</button>
        </div>
      )}
      <div className="list">
        {party.members.map((m) => (
          <div key={m.id} className="list-item">
            <PlayerIcon id={m.icon} size={34} />
            <div className="grow">
              <div className="row" style={{ gap: 6, fontWeight: 600 }}>{m.username} {m.leader && <Crown size={14} style={{ color: 'var(--gold)' }} />}</div>
              <div className="tiny muted">Level {m.level} · {m.rating}{players.includes(m.id) ? ' · Playing next match' : ''}</div>
            </div>
            <span className="badge" style={{ color: m.ready || m.leader ? 'var(--good)' : 'var(--text-2)' }}>{m.leader ? 'LEADER' : m.ready ? 'READY' : 'NOT READY'}</span>
            {leader && !m.leader && <button className="icon-btn sm" title="Remove from party" onClick={() => run('party:kick', { userId: m.id })}><X /></button>}
          </div>
        ))}
      </div>
      <div className="panel-body col" style={{ gap: 12 }}>
        <div className="inset" style={{ padding: 10 }}>
          <div className="row between">
            <div>
              <div className="label">Next match</div>
              <div className="small" style={{ marginTop: 4 }}>
                {players.length === 2 ? <><b>{playerName(players[0])}</b> vs <b>{playerName(players[1])}</b></> : 'Needs two members'} · {tcLabel(party.settings.tc)} · {party.settings.color === 'random' ? 'random colours' : `${playerName(players[0] ?? '')} plays ${party.settings.color}`}
              </div>
              <div className="tiny muted">{[party.settings.takebacks && 'takebacks', party.settings.assistance && 'assistance', party.settings.spectators ? 'spectators on' : 'no spectators'].filter(Boolean).join(' · ')}</div>
            </div>
            {leader && <button className="btn btn-sm" onClick={() => setSettingsOpen(true)}>Configure</button>}
          </div>
          {leader && party.members.length > 2 && (
            <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
              <span className="tiny muted">Players:</span>
              {party.members.map((m) => (
                <button key={m.id} className={`btn btn-sm ${players.includes(m.id) ? 'btn-primary' : ''}`}
                  onClick={() => {
                    const next = players.includes(m.id) ? players.filter((x) => x !== m.id) : [...players, m.id].slice(-2);
                    if (next.length === 2) void run('party:players', { players: next });
                  }}>
                  {m.username}
                </button>
              ))}
            </div>
          )}
        </div>
        {leader ? (
          <button className="btn btn-primary btn-lg" disabled={party.members.length < 2 || !!party.gameId} onClick={async () => { const r = await run('party:start'); if (r.ok) navigate(`/game/${r.gameId}`); }}>
            <Play /> Start match
          </button>
        ) : (
          <button className={`btn btn-lg ${meMember?.ready ? '' : 'btn-primary'}`} onClick={() => run('party:ready', { ready: !meMember?.ready })}>
            {meMember?.ready ? <><X /> Not ready</> : <><Check /> Ready up</>}
          </button>
        )}
        {invitable.length > 0 && (
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Invite online friends</div>
            <div className="row wrap" style={{ gap: 6 }}>
              {invitable.map((f) => (
                <button key={f.id} className="btn btn-sm" onClick={async () => { const r = await run('party:invite', { userId: f.id }); if (r.ok) toast({ kind: 'success', title: `Invited ${f.username}` }); }}>
                  <Send /> {f.username}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Party match settings" footer={<button className="btn btn-primary" onClick={() => setSettingsOpen(false)}>Done</button>}>
        <MatchSettingsEditor value={party.settings} onChange={(s) => run('party:settings', { settings: s })} allowRated={false} compact />
        <div className="tiny muted" style={{ marginTop: 10 }}>Changing settings resets everyone's ready status. Party matches are unrated.</div>
      </Modal>
    </div>
  );
}

export default function Friends() {
  const { friends, loadFriends, party } = useSession();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    void loadFriends();
  }, [loadFriends]);
  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => api.get(`/api/users/search?q=${encodeURIComponent(q.trim())}`).then((r) => setResults(r.users)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  const request = async (username: string) => {
    try {
      const r = await api.post('/api/friends/request', { username });
      toast({ kind: 'success', title: r.accepted ? 'You are now friends' : 'Friend request sent' });
      void loadFriends();
    } catch (e) {
      toastError(e);
    }
  };
  const respond = async (userId: string, accept: boolean) => {
    try {
      await api.post('/api/friends/respond', { userId, accept });
      void loadFriends();
    } catch (e) {
      toastError(e);
    }
  };
  const remove = async () => {
    if (!removing) return;
    try {
      await api.del(`/api/friends/${removing.id}`);
      void loadFriends();
    } catch (e) {
      toastError(e);
    }
    setRemoving(null);
  };
  const challenge = async (id: string, name: string) => {
    const r = await emit('challenge:create', { to: id, settings: { tc: { initial: 300, increment: 3 }, color: 'random', rated: false, spectators: true } });
    if (!r.ok) toast({ kind: 'error', title: 'Could not challenge', body: r.error });
    else toast({ kind: 'success', title: `Challenged ${name}`, body: '5 + 3 casual. Customise from Play → Friends & Private.' });
  };
  const invite = async (id: string) => {
    const r = await emit('party:invite', { userId: id });
    if (!r.ok) toast({ kind: 'error', title: 'Could not invite', body: r.error });
    else toast({ kind: 'success', title: 'Party invite sent' });
  };
  const friendIds = new Set(friends.friends.map((f) => f.id));
  const outIds = new Set(friends.outgoing.map((f) => f.id));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Friends & Party</h1>
          <p className="page-sub">{friends.friends.filter((f) => f.status !== 'offline').length} of {friends.friends.length} friends online.</p>
        </div>
      </div>
      {IS_P2P && <OnlineNow />}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.3fr) minmax(320px,1fr)', gap: 18, alignItems: 'start' }}>
        <div className="col" style={{ gap: 18 }}>
          <div className="panel panel-pad col" style={{ gap: 10 }}>
            <div className="row">
              <Search size={18} className="muted" />
              <input className="input" placeholder="Search players by username" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {results.length > 0 && (
              <div className="list inset">
                {results.map((u) => (
                  <div key={u.id} className="list-item">
                    <PlayerIcon id={u.icon} size={30} />
                    <div className="grow click" style={{ cursor: 'pointer' }} onClick={() => navigate(`/profile/${u.username}`)}>
                      <div style={{ fontWeight: 600 }}>{u.username}</div>
                      <div className="tiny muted">Level {u.level} · {u.rating}</div>
                    </div>
                    {friendIds.has(u.id) ? <span className="badge">Friend</span> : outIds.has(u.id) ? <span className="badge">Requested</span> : <button className="btn btn-sm" onClick={() => request(u.username)}><UserPlus /> Add</button>}
                  </div>
                ))}
              </div>
            )}
            {q.trim().length >= 2 && results.length === 0 && <div className="small muted">No players found.</div>}
          </div>

          {friends.incoming.length > 0 && (
            <div className="panel">
              <div className="panel-head"><h3 className="panel-title"><UserPlus /> Requests <span className="muted small">{friends.incoming.length}</span></h3></div>
              <div className="list">
                {friends.incoming.map((f) => (
                  <div key={f.id} className="list-item">
                    <PlayerIcon id={f.icon} size={32} />
                    <div className="grow"><div style={{ fontWeight: 600 }}>{f.username}</div><div className="tiny muted">Level {f.level} · {f.rating}</div></div>
                    <button className="btn btn-sm btn-good" onClick={() => respond(f.id, true)}><Check /> Accept</button>
                    <button className="btn btn-sm" onClick={() => respond(f.id, false)}><X /> Decline</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="panel">
            <div className="panel-head"><h3 className="panel-title"><Users /> Friends <span className="muted small">{friends.friends.length}</span></h3></div>
            {friends.friends.length === 0 ? (
              <Empty icon={<Users />} title="No friends yet">Search for a username above to send a request.</Empty>
            ) : (
              <div className="list">
                {friends.friends.map((f) => (
                  <div key={f.id} className="list-item">
                    <PlayerIcon id={f.icon} size={36} />
                    <div className="grow" style={{ cursor: 'pointer', minWidth: 0 }} onClick={() => navigate(`/profile/${f.username}`)}>
                      <div style={{ fontWeight: 600 }}>{f.username}</div>
                      <div className="row tiny muted" style={{ gap: 6 }}><span className={`status-dot ${f.status}`} /> <span style={{ textTransform: 'capitalize' }}>{f.status === 'playing' ? 'In a game' : f.status}</span> · LV {f.level} · {f.rating}</div>
                    </div>
                    {f.status === 'playing' && f.gameId && <button className="btn btn-sm" onClick={() => navigate(`/game/${f.gameId}`)}><Eye /> Watch</button>}
                    {f.status === 'online' && <button className="btn btn-sm btn-primary" onClick={() => challenge(f.id, f.username)}><Swords /> <span className="hide-xs">Challenge</span></button>}
                    {f.status !== 'offline' && <button className="btn btn-sm" title="Invite to party" onClick={() => invite(f.id)}><Users /> <span className="hide-xs">{party ? 'Invite' : 'Party'}</span></button>}
                    <button className="icon-btn sm" title="Remove friend" onClick={() => setRemoving({ id: f.id, name: f.username })}><UserMinus /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {friends.outgoing.length > 0 && (
            <div className="panel">
              <div className="panel-head"><h3 className="panel-title">Sent requests</h3></div>
              <div className="list">
                {friends.outgoing.map((f) => (
                  <div key={f.id} className="list-item">
                    <PlayerIcon id={f.icon} size={28} />
                    <span className="grow">{f.username}</span>
                    <span className="tiny muted">Pending</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <PartyPanel />
      </div>
      <Confirm open={!!removing} title={`Remove ${removing?.name}?`} body="You can send a new request later." confirmLabel="Remove friend" danger onCancel={() => setRemoving(null)} onConfirm={remove} />
    </div>
  );
}
