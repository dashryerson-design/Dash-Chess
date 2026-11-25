import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Play, Quote, Swords } from 'lucide-react';
import { BOTS, DIFFICULTY_COLOR, TIME_PRESETS, tcLabel, type BotProfile, type MatchSettings } from '@dc/shared';
import { api } from '../lib/api';
import { emit } from '../lib/socket';
import { PlayerIcon } from '../cosmetics/icons';
import { Modal, Seg, Switch } from '../components/ui';
import { toast } from '../stores/toasts';
import { useSession } from '../stores/session';

type Rec = { games: number; wins: number; losses: number; draws: number };

const TC_OPTIONS = [{ id: 'untimed', initial: 0, increment: 0, label: 'Untimed' }, ...TIME_PRESETS.filter((p) => ['3+2', '5+0', '10+0', '10+5', '15+10', '30+0'].includes(p.id)).map((p) => ({ id: p.id, initial: p.initial, increment: p.increment, label: p.label }))];

export default function Bots() {
  const [records, setRecords] = useState<Record<string, Rec>>({});
  const [sel, setSel] = useState<BotProfile | null>(null);
  const [filter, setFilter] = useState<string>('All');
  const navigate = useNavigate();
  const activeGameId = useSession((s) => s.activeGameId);

  useEffect(() => {
    api.get('/api/bots').then((r) => setRecords(Object.fromEntries(r.bots.map((b: { id: string; record: Rec }) => [b.id, b.record])))).catch(() => {});
  }, []);

  const groups = ['All', 'Beginner', 'Easy', 'Medium', 'Hard', 'Very Hard', 'Expert'];
  const list = useMemo(() => BOTS.filter((b) => filter === 'All' || b.difficulty === filter), [filter]);
  const beaten = Object.values(records).filter((r) => r.wins > 0).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Play Bots</h1>
          <p className="page-sub">Twenty Stockfish-powered opponents, each with its own playing style. You have beaten {beaten} of 20.</p>
        </div>
        <Seg options={groups.map((g) => ({ value: g, label: g }))} value={filter} onChange={setFilter} />
      </div>
      {activeGameId && (
        <div className="offer-bar" style={{ marginBottom: 16 }}>
          <Swords size={16} /> <span className="grow">You have a game in progress.</span>
          <button className="btn btn-sm btn-primary" onClick={() => navigate(`/game/${activeGameId}`)}>Resume</button>
        </div>
      )}
      <div className="auto-grid" style={{ ['--min' as any]: '250px' }}>
        {list.map((b) => {
          const r = records[b.id];
          return (
            <button key={b.id} className="item-card" style={{ ['--rc' as any]: b.color }} onClick={() => setSel(b)}>
              <div className="row" style={{ padding: 14, gap: 14, background: `linear-gradient(120deg, ${b.color}22, transparent 70%)` }}>
                <PlayerIcon id={`bot.${b.id}`} size={64} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row between">
                    <span className="display" style={{ fontWeight: 700, fontSize: '1.05rem' }}>{b.name}</span>
                    <span className="mono tiny muted">#{String(b.number).padStart(2, '0')}</span>
                  </div>
                  <div className="small dim ellipsis">{b.personality}</div>
                  <div className="row" style={{ gap: 6, marginTop: 6 }}>
                    <span className="badge" style={{ color: DIFFICULTY_COLOR[b.difficulty], borderColor: DIFFICULTY_COLOR[b.difficulty] + '66' }}>{b.difficulty}</span>
                    <span className="badge mono">~{b.elo}</span>
                  </div>
                </div>
              </div>
              <div className="row between tiny" style={{ padding: '8px 14px', borderTop: '1px solid var(--line)' }}>
                {r && r.games > 0 ? (
                  <span className="mono"><span className="win">{r.wins}W</span> · <span className="loss">{r.losses}L</span> · {r.draws}D</span>
                ) : (
                  <span className="muted">Not played yet</span>
                )}
                {r && r.wins > 0 && <span style={{ color: 'var(--good)', fontWeight: 700 }}>DEFEATED</span>}
              </div>
            </button>
          );
        })}
      </div>
      {sel && <BotModal bot={sel} record={records[sel.id]} onClose={() => setSel(null)} />}
    </div>
  );
}

function BotModal({ bot, record, onClose }: { bot: BotProfile; record?: Rec; onClose: () => void }) {
  const navigate = useNavigate();
  const [tcId, setTcId] = useState('untimed');
  const [color, setColor] = useState<MatchSettings['color']>('random');
  const [assistance, setAssistance] = useState(true);
  const [takebacks, setTakebacks] = useState(false);
  const [busy, setBusy] = useState(false);
  const tc = TC_OPTIONS.find((t) => t.id === tcId)!;

  const start = async () => {
    setBusy(true);
    const r = await emit('bot:start', { botId: bot.id, settings: { tc: { initial: tc.initial, increment: tc.increment }, color, assistance, takebacks, spectators: true } });
    setBusy(false);
    if (!r.ok) {
      toast({ kind: 'error', title: 'Could not start', body: r.error });
      if (r.gameId) navigate(`/game/${r.gameId}`);
      return;
    }
    useSession.getState().patch({ activeGameId: r.gameId });
    navigate(`/game/${r.gameId}`);
  };
  const winRate = record && record.games ? Math.round((record.wins / record.games) * 100) : null;

  return (
    <Modal open onClose={onClose} wide title={null}>
      <div className="grid g2" style={{ gap: 20 }}>
        <div className="col" style={{ gap: 14 }}>
          <div className="row" style={{ gap: 16 }}>
            <PlayerIcon id={`bot.${bot.id}`} size={96} />
            <div>
              <div className="mono tiny muted">BOT #{String(bot.number).padStart(2, '0')}</div>
              <div className="display" style={{ fontSize: '1.7rem', fontWeight: 700 }}>{bot.name}</div>
              <div className="row" style={{ gap: 6 }}>
                <span className="badge" style={{ color: DIFFICULTY_COLOR[bot.difficulty] }}>{bot.difficulty}</span>
                <span className="badge">~{bot.elo} strength</span>
              </div>
            </div>
          </div>
          <div className="inset" style={{ padding: 12, fontStyle: 'italic' }} >
            <Quote size={14} style={{ color: bot.color, marginRight: 6, verticalAlign: -2 }} />
            {bot.quote}
          </div>
          <div>
            <div className="label">Personality</div>
            <div style={{ fontWeight: 600, marginTop: 4 }}>{bot.personality}</div>
            <p className="dim small" style={{ marginBottom: 0 }}>{bot.description}</p>
          </div>
          <div className="grid g4" style={{ gap: 8 }}>
            {[
              ['Played', record?.games ?? 0],
              ['Wins', record?.wins ?? 0],
              ['Losses', record?.losses ?? 0],
              ['Win rate', winRate === null ? '—' : `${winRate}%`],
            ].map(([k, v]) => (
              <div key={k as string} className="inset" style={{ padding: 10 }}>
                <div className="tiny muted">{k}</div>
                <div className="mono" style={{ fontWeight: 700 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="col" style={{ gap: 14 }}>
          <div className="label">Match setup</div>
          <div className="field">
            <label>Time control</label>
            <Seg options={TC_OPTIONS.map((t) => ({ value: t.id, label: t.id === 'untimed' ? 'Untimed' : tcLabel(t) }))} value={tcId} onChange={setTcId} />
          </div>
          <div className="field">
            <label>Play as</label>
            <Seg options={[{ value: 'white', label: 'White' }, { value: 'random', label: 'Random' }, { value: 'black', label: 'Black' }]} value={color} onChange={(c) => setColor(c as MatchSettings['color'])} />
          </div>
          <div className="setting-row">
            <div><div className="t">Move assistance</div><div className="d">Live move ratings and hints. Hints forfeit move-quality points.</div></div>
            <Switch checked={assistance} onChange={setAssistance} />
          </div>
          <div className="setting-row">
            <div><div className="t">Takebacks</div><div className="d">Undo moves freely. Forfeits move-quality points.</div></div>
            <Switch checked={takebacks} onChange={setTakebacks} />
          </div>
          <button className="btn btn-primary btn-lg" onClick={start} disabled={busy}>
            {busy ? <span className="spinner" style={{ width: 18, height: 18 }} /> : <Play />} Play {bot.name}
          </button>
          <div className="tiny muted"><Bot size={12} style={{ verticalAlign: -2 }} /> Bot games are unrated but award XP and DC Points. Repeat wins against the same bot on the same day give reduced rewards.</div>
        </div>
      </div>
    </Modal>
  );
}
