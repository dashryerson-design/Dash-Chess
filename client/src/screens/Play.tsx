import { useEffect, useState } from 'react';
import { OnlineNow } from '../components/OnlineNow';
import { IS_P2P } from '../lib/lobby';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Zap, Trophy, Coffee, Lock, MonitorSmartphone, Copy, Users, Search, X, Clock, Timer } from 'lucide-react';
import { CATEGORY_LABEL, PLACEMENT_GAMES, TIME_PRESETS, categoryOf, presetById, tcLabel, type MatchSettings, type TimeCategory } from '@dc/shared';
import { useSession } from '../stores/session';
import { emit } from '../lib/socket';
import { toast } from '../stores/toasts';
import { Division, Seg, Switch, Tabs } from '../components/ui';
import { PlayerIcon } from '../cosmetics/icons';
import { fmtClock } from '../lib/format';

type Mode = 'quick' | 'ranked' | 'casual' | 'private' | 'local';

export function TimeGrid({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const cats: TimeCategory[] = ['bullet', 'blitz', 'rapid', 'classical'];
  return (
    <div className="col" style={{ gap: 12 }}>
      {cats.map((c) => (
        <div key={c} className="row wrap" style={{ gap: 8 }}>
          <span className="label" style={{ width: 82 }}>{CATEGORY_LABEL[c]}</span>
          {TIME_PRESETS.filter((p) => p.category === c).map((p) => (
            <button key={p.id} className={`btn ${value === p.id ? 'btn-primary' : ''}`} style={{ minWidth: 72 }} onClick={() => onChange(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

export function MatchSettingsEditor({ value, onChange, allowRated, compact }: { value: MatchSettings; onChange: (s: MatchSettings) => void; allowRated: boolean; compact?: boolean }) {
  const [custom, setCustom] = useState(!TIME_PRESETS.some((p) => p.initial === value.tc.initial && p.increment === value.tc.increment));
  const presetId = TIME_PRESETS.find((p) => p.initial === value.tc.initial && p.increment === value.tc.increment)?.id ?? '';
  const set = (p: Partial<MatchSettings>) => onChange({ ...value, ...p });
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row between">
        <span className="label">Time control</span>
        <Seg options={[{ value: 'preset', label: 'Presets' }, { value: 'custom', label: 'Custom' }]} value={custom ? 'custom' : 'preset'} onChange={(v) => setCustom(v === 'custom')} />
      </div>
      {!custom ? (
        <TimeGrid value={presetId} onChange={(id) => { const p = presetById(id)!; set({ tc: { initial: p.initial, increment: p.increment } }); }} />
      ) : (
        <div className="grid g2">
          <div className="field">
            <label>Minutes per side: {(value.tc.initial / 60).toFixed(value.tc.initial % 60 ? 1 : 0)}</label>
            <input className="range" type="range" min={0.5} max={120} step={0.5} value={value.tc.initial / 60} onChange={(e) => set({ tc: { ...value.tc, initial: Math.round(Number(e.target.value) * 60) }, rated: false })} />
          </div>
          <div className="field">
            <label>Increment: {value.tc.increment}s</label>
            <input className="range" type="range" min={0} max={60} step={1} value={value.tc.increment} onChange={(e) => set({ tc: { ...value.tc, increment: Number(e.target.value) }, rated: false })} />
          </div>
        </div>
      )}
      <div className="tiny muted">{CATEGORY_LABEL[categoryOf(value.tc)]} · {tcLabel(value.tc)}</div>
      <div className="setting-row">
        <div><div className="t">Your colour</div></div>
        <Seg options={[{ value: 'white', label: 'White' }, { value: 'random', label: 'Random' }, { value: 'black', label: 'Black' }]} value={value.color} onChange={(c) => set({ color: c as MatchSettings['color'] })} />
      </div>
      {allowRated && (
        <div className="setting-row">
          <div><div className="t">Rated</div><div className="d">Counts toward DC Rating. Requires a standard time control, no takebacks or assistance.</div></div>
          <Switch checked={value.rated} onChange={(v) => set({ rated: v && !custom, takebacks: v ? false : value.takebacks, assistance: v ? false : value.assistance, color: v ? 'random' : value.color })} />
        </div>
      )}
      <div className="setting-row">
        <div><div className="t">Takebacks</div>{!compact && <div className="d">Players may request to undo a move.</div>}</div>
        <Switch checked={value.takebacks} onChange={(v) => set({ takebacks: v, rated: v ? false : value.rated })} />
      </div>
      <div className="setting-row">
        <div><div className="t">Move assistance</div>{!compact && <div className="d">Hints and live move ratings during the game.</div>}</div>
        <Switch checked={value.assistance} onChange={(v) => set({ assistance: v, rated: v ? false : value.rated })} />
      </div>
      <div className="setting-row">
        <div><div className="t">Spectators</div>{!compact && <div className="d">Allow others to watch live.</div>}</div>
        <Switch checked={value.spectators} onChange={(v) => set({ spectators: v })} />
      </div>
    </div>
  );
}

function SearchingPanel() {
  const queue = useSession((s) => s.queue);
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 500);
    return () => clearInterval(t);
  }, []);
  if (!queue.searching) return null;
  const waited = Date.now() - (queue.since ?? Date.now());
  return (
    <div className="panel panel-pad col" style={{ alignItems: 'center', gap: 14, textAlign: 'center', borderColor: 'rgba(var(--accent-rgb),0.45)' }}>
      <div className="spinner lg" />
      <div>
        <div className="display" style={{ fontSize: '1.3rem', fontWeight: 700 }}>Finding an opponent…</div>
        <div className="muted small">
          {queue.mode === 'ranked' ? 'Ranked' : 'Casual'} · {queue.tc ? tcLabel(queue.tc) : ''} · {fmtClock(waited)} elapsed
        </div>
        <div className="tiny muted" style={{ marginTop: 4 }}>
          Search range ±{queue.range === null || queue.range === undefined || !Number.isFinite(queue.range) ? 'any' : queue.range} rating · {queue.playersInQueue ?? 1} searching in this pool
        </div>
      </div>
      <button className="btn btn-danger" onClick={() => emit('queue:leave')}><X /> Cancel search</button>
    </div>
  );
}

export default function Play() {
  const [params, setParams] = useSearchParams();
  const mode = (params.get('mode') as Mode) || 'quick';
  const setMode = (m: Mode) => setParams({ mode: m }, { replace: true });
  const navigate = useNavigate();
  const { ratings, friends, queue, activeGameId, party } = useSession();
  const [tc, setTc] = useState('5+0');
  const [settings, setSettings] = useState<MatchSettings>({ tc: { initial: 600, increment: 0 }, rated: false, takebacks: false, assistance: false, spectators: true, color: 'random' });
  const [room, setRoom] = useState<{ id: string; code: string } | null>(null);
  const [joinCode, setJoinCode] = useState('');

  const start = async (m: 'quick' | 'ranked' | 'casual') => {
    if (activeGameId) return navigate(`/game/${activeGameId}`);
    const r = await emit('queue:join', { mode: m, tc });
    if (!r.ok) toast({ kind: 'error', title: 'Could not start search', body: r.error });
    else useSession.getState().patch({ queue: r.status });
  };

  const createRoom = async (to?: string) => {
    const r = await emit('challenge:create', { to, settings });
    if (!r.ok) return toast({ kind: 'error', title: 'Could not create match', body: r.error });
    if (to) toast({ kind: 'success', title: 'Challenge sent', body: 'Waiting for them to accept.' });
    else setRoom({ id: r.challenge.id, code: r.challenge.code });
  };
  const cancelRoom = async () => {
    if (room) await emit('challenge:decline', { id: room.id });
    setRoom(null);
  };
  const join = async () => {
    const r = await emit('challenge:accept', { id: joinCode.trim() });
    if (!r.ok) toast({ kind: 'error', title: 'Could not join', body: r.error });
    else navigate(`/game/${r.gameId}`);
  };

  const cat = presetById(tc)?.category ?? 'blitz';
  const r = ratings?.[cat];
  const online = friends.friends.filter((f) => f.status === 'online');

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Play</h1>
          <p className="page-sub">Real opponents, server-validated games and fair matchmaking.</p>
        </div>
        {activeGameId && <button className="btn btn-primary" onClick={() => navigate(`/game/${activeGameId}`)}>Resume current game</button>}
      </div>
      {IS_P2P && <OnlineNow />}
      <Tabs
        value={mode}
        onChange={setMode}
        tabs={[
          { id: 'quick', label: 'Quick Play', icon: <Zap /> },
          { id: 'ranked', label: 'Ranked', icon: <Trophy /> },
          { id: 'casual', label: 'Casual', icon: <Coffee /> },
          { id: 'private', label: 'Friends & Private', icon: <Lock /> },
          { id: 'local', label: 'Local', icon: <MonitorSmartphone /> },
        ]}
      />

      {queue.searching && mode !== 'private' && mode !== 'local' ? (
        <SearchingPanel />
      ) : mode === 'quick' ? (
        <div className="grid g2">
          <div className="panel panel-pad col" style={{ gap: 14 }}>
            <h3 className="panel-title"><Zap /> Quick Play</h3>
            <p className="dim small" style={{ margin: 0 }}>Instantly joins whoever is waiting in any casual pool and adopts their time control. If nobody is waiting, you will wait in the 5 + 0 pool. Unrated.</p>
            <button className="btn btn-primary btn-lg" onClick={() => start('quick')}><Search /> Find a game</button>
          </div>
          <div className="panel panel-pad">
            <h3 className="panel-title" style={{ marginBottom: 10 }}><Users /> Prefer someone you know?</h3>
            <p className="dim small">Challenge an online friend, form a party or share a private room code.</p>
            <button className="btn" onClick={() => setMode('private')}>Friends & private matches</button>
          </div>
        </div>
      ) : mode === 'ranked' || mode === 'casual' ? (
        <div className="grid g2">
          <div className="panel panel-pad col" style={{ gap: 16 }}>
            <h3 className="panel-title">{mode === 'ranked' ? <Trophy /> : <Coffee />} {mode === 'ranked' ? 'Ranked match' : 'Casual match'}</h3>
            <TimeGrid value={tc} onChange={setTc} />
            <button className="btn btn-primary btn-lg" onClick={() => start(mode)}><Search /> {mode === 'ranked' ? 'Play ranked' : 'Find casual game'}</button>
          </div>
          <div className="panel panel-pad col" style={{ gap: 12 }}>
            <h3 className="panel-title"><Timer /> {CATEGORY_LABEL[cat]} rating</h3>
            {r && (
              <>
                <div className="row between">
                  <Division rating={r.rating} size={36} provisional={r.games < PLACEMENT_GAMES} />
                  <span className="display mono" style={{ fontSize: '1.8rem', fontWeight: 700 }}>{r.rating}</span>
                </div>
                {r.games < PLACEMENT_GAMES && (
                  <div className="small" style={{ color: 'var(--warn)' }}>Placement: {r.games}/{PLACEMENT_GAMES} games. Ratings move faster until placement is complete.</div>
                )}
                <div className="grid g3" style={{ gap: 8 }}>
                  <div className="inset" style={{ padding: 10 }}><div className="tiny muted">Wins</div><div className="mono win" style={{ fontWeight: 700 }}>{r.wins}</div></div>
                  <div className="inset" style={{ padding: 10 }}><div className="tiny muted">Losses</div><div className="mono loss" style={{ fontWeight: 700 }}>{r.losses}</div></div>
                  <div className="inset" style={{ padding: 10 }}><div className="tiny muted">Draws</div><div className="mono" style={{ fontWeight: 700 }}>{r.draws}</div></div>
                </div>
                <div className="tiny muted">Peak {r.peak}. {mode === 'ranked' ? 'Matchmaking searches near your rating and widens the range the longer you wait.' : 'Casual games do not affect your rating.'}</div>
              </>
            )}
          </div>
        </div>
      ) : mode === 'private' ? (
        <div className="grid g2">
          <div className="panel panel-pad col" style={{ gap: 14 }}>
            <h3 className="panel-title"><Lock /> Match settings</h3>
            <MatchSettingsEditor value={settings} onChange={setSettings} allowRated />
          </div>
          <div className="col" style={{ gap: 16 }}>
            <div className="panel panel-pad col" style={{ gap: 12 }}>
              <h3 className="panel-title"><Copy /> Private room</h3>
              {room ? (
                <div className="col" style={{ gap: 10, alignItems: 'center', textAlign: 'center' }}>
                  <div className="muted small">Share this code. The game starts as soon as someone joins.</div>
                  <div className="display mono" style={{ fontSize: '2.2rem', letterSpacing: '0.3em', fontWeight: 700 }}>{room.code}</div>
                  <div className="row">
                    <button className="btn btn-sm" onClick={() => { void navigator.clipboard?.writeText(room.code); toast({ kind: 'success', title: 'Code copied' }); }}><Copy /> Copy</button>
                    <button className="btn btn-sm btn-danger" onClick={cancelRoom}>Cancel</button>
                  </div>
                  <div className="row small muted"><span className="spinner" style={{ width: 14, height: 14 }} /> Waiting for opponent…</div>
                </div>
              ) : (
                <>
                  <button className="btn btn-primary" onClick={() => createRoom()}>Create room with these settings</button>
                  <div className="row">
                    <input className="input" placeholder="Enter room code" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} maxLength={8} />
                    <button className="btn" onClick={join} disabled={joinCode.trim().length < 4}>Join</button>
                  </div>
                </>
              )}
            </div>
            <div className="panel">
              <div className="panel-head">
                <h3 className="panel-title"><Users /> Challenge a friend</h3>
                <button className="btn btn-sm btn-ghost" onClick={() => navigate('/friends')}>{party ? 'Party' : 'Create party'}</button>
              </div>
              {online.length === 0 ? (
                <div className="empty small">No friends are online and available right now.</div>
              ) : (
                <div className="list">
                  {online.map((f) => (
                    <div key={f.id} className="list-item">
                      <PlayerIcon id={f.icon} size={30} />
                      <div className="grow"><div style={{ fontWeight: 600 }}>{f.username}</div><div className="tiny muted">{f.rating}</div></div>
                      <button className="btn btn-sm btn-primary" onClick={() => createRoom(f.id)}>Challenge</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="panel panel-pad col" style={{ gap: 14, maxWidth: 640 }}>
          <h3 className="panel-title"><MonitorSmartphone /> Local pass-and-play</h3>
          <p className="dim small" style={{ margin: 0 }}>Two players, one device. Played entirely on this device: no rating, XP or DC Points.</p>
          <MatchSettingsEditor value={settings} onChange={setSettings} allowRated={false} compact />
          <button className="btn btn-primary btn-lg" onClick={() => navigate(`/local?i=${settings.tc.initial}&inc=${settings.tc.increment}`)}><Clock /> Start local game</button>
        </div>
      )}
    </div>
  );
}
