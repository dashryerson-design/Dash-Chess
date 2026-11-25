import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, TrendingUp, Calendar, Shield } from 'lucide-react';
import { CATEGORY_LABEL, DIVISION_CONFIG, PLACEMENT_GAMES, TIME_CATEGORIES, divisionFor, seasonLabel, type TimeCategory } from '@dc/shared';
import { useSession } from '../stores/session';
import { api } from '../lib/api';
import { Division, DivisionEmblem, Empty, LineChart, Progress, Seg } from '../components/ui';
import { GameRow, type HistoryGame } from '../components/GameRow';
import { fmtDate } from '../lib/format';

export default function Rankings() {
  const { me, ratings } = useSession();
  const navigate = useNavigate();
  const [cat, setCat] = useState<TimeCategory>(() => {
    if (!ratings) return 'blitz';
    return (Object.values(ratings).sort((a, b) => b.games - a.games)[0]?.category ?? 'blitz') as TimeCategory;
  });
  const [history, setHistory] = useState<{ rating_after: number; created_at: number }[] | null>(null);
  const [games, setGames] = useState<HistoryGame[] | null>(null);
  const [season, setSeason] = useState<{ current: { key: string; label: string; endsAt: number }; seasons: { season: string; games: number; wins: number; peak: number; current: number }[] } | null>(null);

  useEffect(() => {
    if (!me) return;
    setHistory(null);
    api.get(`/api/users/${me.username}/rating-history?category=${cat}`).then((r) => setHistory(r.history)).catch(() => setHistory([]));
  }, [me?.username, cat]);
  useEffect(() => {
    if (!me) return;
    api.get(`/api/users/${me.username}/games?filter=ranked&limit=8`).then((r) => setGames(r.games)).catch(() => setGames([]));
    api.get('/api/seasons/me').then(setSeason).catch(() => {});
  }, [me?.username]);

  if (!me || !ratings) return null;
  const overall = divisionFor(me.rating);
  const cur = season?.seasons.find((s) => s.season === season.current.key);
  const days = season ? Math.max(0, Math.ceil((season.current.endsAt - Date.now()) / 86400000)) : 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">DC Rankings</h1>
          <p className="page-sub">Elo-based DC Rating per time control. The first {PLACEMENT_GAMES} rated games in each are placement matches.</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/play?mode=ranked')}><Trophy /> Play ranked</button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)', gap: 18 }}>
        <div className="panel panel-pad col" style={{ gap: 14, alignItems: 'center', textAlign: 'center', background: `radial-gradient(400px 200px at 50% 0%, ${overall.tier.color}33, transparent 70%), linear-gradient(180deg, var(--bg-2), var(--bg-1))` }}>
          <div className="label">Overall DC Rating</div>
          <DivisionEmblem rating={me.rating} size={110} />
          <div className="display" style={{ fontSize: '1.6rem', fontWeight: 700, color: overall.tier.glow }}>{overall.name}</div>
          <div className="display mono" style={{ fontSize: '2.6rem', fontWeight: 700, lineHeight: 1 }}>{me.rating}</div>
          <div style={{ width: '100%' }}>
            <Progress value={overall.progress} color={overall.tier.color} className="lg" />
            <div className="tiny muted" style={{ marginTop: 6 }}>{overall.nextAt ? `${overall.nextAt - me.rating} points to ${overall.nextName}` : 'Highest division'} · Peak {me.peakRating}</div>
          </div>
          <div className="tiny muted">Overall rating is the games-weighted average of your category ratings.</div>
        </div>

        <div className="grid g2" style={{ gap: 12 }}>
          {TIME_CATEGORIES.map((c) => {
            const r = ratings[c];
            const d = divisionFor(r.rating);
            const placement = r.games < PLACEMENT_GAMES;
            return (
              <button key={c} className="item-card" style={{ ['--rc' as any]: d.tier.color, padding: 14, gap: 8 }} onClick={() => setCat(c)}>
                <div className="row between" style={{ width: '100%' }}>
                  <span className="label">{CATEGORY_LABEL[c]}</span>
                  {cat === c && <span className="badge" style={{ color: 'var(--accent)' }}>SELECTED</span>}
                </div>
                <div className="row between" style={{ width: '100%' }}>
                  <Division rating={r.rating} size={30} provisional={placement} />
                  <span className="display mono" style={{ fontSize: '1.5rem', fontWeight: 700 }}>{r.rating}</span>
                </div>
                {placement ? (
                  <>
                    <Progress value={r.games / PLACEMENT_GAMES} color="var(--warn)" />
                    <div className="tiny" style={{ color: 'var(--warn)' }}>Placement {r.games}/{PLACEMENT_GAMES}</div>
                  </>
                ) : (
                  <>
                    <Progress value={d.progress} color={d.tier.color} />
                    <div className="tiny muted">{d.nextAt ? `${d.nextAt - r.rating} to ${d.nextName}` : 'Top division'}</div>
                  </>
                )}
                <div className="tiny mono muted">{r.games} games · <span className="win">{r.wins}W</span> <span className="loss">{r.losses}L</span> {r.draws}D · peak {r.peak}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 18, marginTop: 18 }}>
        <div className="panel">
          <div className="panel-head">
            <h3 className="panel-title"><TrendingUp /> Rating history</h3>
            <Seg options={TIME_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} value={cat} onChange={setCat} />
          </div>
          <div className="panel-body">
            {history === null ? (
              <div className="skeleton" style={{ height: 200 }} />
            ) : history.length < 2 ? (
              <Empty icon={<TrendingUp />} title={`No ${CATEGORY_LABEL[cat]} history yet`}>Play rated {CATEGORY_LABEL[cat].toLowerCase()} games to chart your progress.</Empty>
            ) : (
              <LineChart height={220} points={[{ x: 0, y: history[0] ? (history[0] as any).rating_before : 1000, label: 'Start' }, ...history.map((h, i) => ({ x: i + 1, y: h.rating_after, label: `${h.rating_after} · ${fmtDate(h.created_at)}` }))]} />
            )}
          </div>
        </div>
        <div className="col" style={{ gap: 18 }}>
          <div className="panel panel-pad">
            <h3 className="panel-title" style={{ marginBottom: 10 }}><Calendar /> {season ? season.current.label : 'Season'}</h3>
            <div className="small dim">Ends in {days} days. Finish with 5+ ranked games to earn season rewards based on your peak division (DC Points, plus an exclusive calling card from Gold upwards).</div>
            <div className="grid g3" style={{ gap: 8, marginTop: 12 }}>
              <div className="inset" style={{ padding: 10 }}><div className="tiny muted">Games</div><div className="mono" style={{ fontWeight: 700 }}>{cur?.games ?? 0}</div></div>
              <div className="inset" style={{ padding: 10 }}><div className="tiny muted">Wins</div><div className="mono" style={{ fontWeight: 700 }}>{cur?.wins ?? 0}</div></div>
              <div className="inset" style={{ padding: 10 }}><div className="tiny muted">Peak</div><div className="mono" style={{ fontWeight: 700 }}>{cur?.peak || '—'}</div></div>
            </div>
            {season && season.seasons.filter((s) => s.season !== season.current.key).length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="label">Past seasons</div>
                {season.seasons.filter((s) => s.season !== season.current.key).map((s) => (
                  <div key={s.season} className="row between small" style={{ marginTop: 6 }}>
                    <span>{seasonLabel(s.season)}</span>
                    <Division rating={s.peak} size={16} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="panel panel-pad">
            <h3 className="panel-title" style={{ marginBottom: 10 }}><Shield /> Divisions</h3>
            <div className="col" style={{ gap: 6 }}>
              {[...DIVISION_CONFIG].reverse().map((t) => (
                <div key={t.id} className="row small" style={{ gap: 10, opacity: overall.tier.id === t.id ? 1 : 0.75 }}>
                  <DivisionEmblem rating={t.min} size={20} />
                  <span style={{ fontWeight: overall.tier.id === t.id ? 800 : 500, color: overall.tier.id === t.id ? t.glow : undefined }} className="grow">{t.name}{t.subdivisions === 3 ? ' I–III' : ''}</span>
                  <span className="mono muted">{t.min}{Number.isFinite(t.max) ? `–${t.max}` : '+'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head"><h3 className="panel-title"><Trophy /> Recent ranked matches</h3></div>
        {games === null ? <div className="panel-body"><div className="skeleton" style={{ height: 120 }} /></div> : games.length === 0 ? (
          <Empty icon={<Trophy />} title="No ranked games yet">Your ranked results and rating changes will appear here.</Empty>
        ) : (
          <div className="list">{games.map((g) => <GameRow key={g.id} g={g} me={me.id} />)}</div>
        )}
      </div>
    </div>
  );
}
