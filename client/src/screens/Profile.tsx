import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { UserPlus, Swords, Eye, Award, BarChart3, Bot, BookOpen, Activity, Copy, Settings as Cog } from 'lucide-react';
import { ACHIEVEMENT_BY_ID, BOTS, CATEGORY_LABEL, PLACEMENT_GAMES, TIME_CATEGORIES, levelFromXp, type ClassCounts, type PublicProfile, type TimeCategory } from '@dc/shared';
import { api } from '../lib/api';
import { emit } from '../lib/socket';
import { useSession, type RatingRow } from '../stores/session';
import { CallingCard, ClassBars, Division, Empty, LineChart, Loading, Progress, Stat } from '../components/ui';
import { PlayerIcon } from '../cosmetics/icons';
import { GameRow, type HistoryGame } from '../components/GameRow';
import { fmtDate, fmtDuration } from '../lib/format';
import { toast, toastError } from '../stores/toasts';

interface Stats {
  games: number; wins: number; losses: number; draws: number; winRate: number; currentStreak: number; bestStreak: number; checkmates: number;
  averageAccuracy: number | null; bestAccuracy: number | null; classes: ClassCounts; favouriteOpening: { name: string; eco: string; n: number; wins: number } | null;
  openings: { name: string; eco: string; n: number; wins: number }[]; averageDurationMs: number; mostPlayedCategory: TimeCategory | null;
  categories: { category: TimeCategory; n: number }[]; botGames: number; botWins: number; onlineGames: number; onlineWins: number; rankedWins: number;
  bots: { bot_id: string; games: number; wins: number; losses: number; draws: number }[]; puzzleRating: number; puzzlesSolved: number; accuracyTrend: { accuracy: number; ended_at: number }[];
}

export default function Profile() {
  const { name } = useParams();
  const { me, friends, loadFriends } = useSession();
  const navigate = useNavigate();
  const username = name ?? me?.username;
  const [data, setData] = useState<{ profile: PublicProfile; ratings: Record<TimeCategory, RatingRow>; stats: Stats; achievements: { achievement_id: string; unlocked_at: number }[]; status: string; activeGameId: string | null } | null>(null);
  const [games, setGames] = useState<HistoryGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    setData(null);
    setError(null);
    api.get(`/api/users/${username}`).then(setData).catch((e) => setError(e.message));
    api.get(`/api/users/${username}/games?limit=6`).then((r) => setGames(r.games)).catch(() => setGames([]));
  }, [username]);

  if (error) return <div className="page"><Empty title="Player not found">{error}</Empty></div>;
  if (!data || !me) return <Loading label="Loading profile…" />;
  const { profile: p, stats: s, ratings } = data;
  const isMe = p.id === me.id;
  const lvl = levelFromXp(p.xp);
  const isFriend = friends.friends.some((f) => f.id === p.id);
  const pending = friends.outgoing.some((f) => f.id === p.id);

  const addFriend = async () => {
    try {
      const r = await api.post('/api/friends/request', { username: p.username });
      toast({ kind: 'success', title: r.accepted ? 'You are now friends' : 'Friend request sent' });
      void loadFriends();
    } catch (e) {
      toastError(e);
    }
  };
  const challenge = async () => {
    const r = await emit('challenge:create', { to: p.id, settings: { tc: { initial: 300, increment: 3 }, color: 'random', rated: false, spectators: true } });
    if (!r.ok) toast({ kind: 'error', title: 'Could not challenge', body: r.error });
    else toast({ kind: 'success', title: 'Challenge sent', body: `5 + 3 casual. Waiting for ${p.username}.` });
  };

  const wPct = s.games ? (s.wins / s.games) * 100 : 0;
  const dPct = s.games ? (s.draws / s.games) * 100 : 0;
  const unlocked = data.achievements.length;

  return (
    <div className="page">
      <div className="panel" style={{ overflow: 'hidden', marginBottom: 18 }}>
        <CallingCard
          card={p.card}
          icon={p.icon}
          height={150}
          iconSize={96}
          name={<span className="display" style={{ fontSize: '1.9rem' }}>{p.username}</span>}
          sub={
            <span className="row wrap" style={{ gap: 12 }}>
              <span>Level {p.level}</span>
              <span className="row" style={{ gap: 6 }}><span className={`status-dot ${data.status}`} /> <span style={{ textTransform: 'capitalize' }}>{data.status}</span></span>
              <span>Joined {fmtDate(p.createdAt)}</span>
            </span>
          }
          right={
            <div className="col hide-mobile" style={{ alignItems: 'flex-end', gap: 6 }}>
              <Division rating={p.rating} size={34} />
              <span className="display mono" style={{ fontSize: '1.8rem', fontWeight: 700, textShadow: '0 2px 6px rgba(0,0,0,0.6)' }}>{p.rating}</span>
              <span className="tiny" style={{ color: 'rgba(255,255,255,0.8)' }}>Peak {p.peakRating}</span>
            </div>
          }
        />
        <div className="panel-body row wrap between" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 18 }}>
            <div style={{ width: 220 }}>
              <div className="row between tiny"><span className="muted">Level {lvl.level}</span><span className="mono muted">{lvl.xpIntoLevel}/{lvl.xpForNext} XP</span></div>
              <Progress value={lvl.progress} />
            </div>
            <button className="tiny muted mono" style={{ background: 'none', border: 0, cursor: 'pointer' }} title="Copy player ID" onClick={() => { void navigator.clipboard?.writeText(p.id); toast({ kind: 'success', title: 'Player ID copied' }); }}>
              ID {p.id} <Copy size={11} />
            </button>
          </div>
          <div className="row">
            {isMe ? (
              <>
                <button className="btn" onClick={() => navigate('/customise')}>Customise profile</button>
                <button className="btn btn-ghost" onClick={() => navigate('/settings')}><Cog /> Settings</button>
              </>
            ) : (
              <>
                {data.activeGameId && <button className="btn" onClick={() => navigate(`/game/${data.activeGameId}`)}><Eye /> Watch</button>}
                {!isFriend && <button className="btn" disabled={pending} onClick={addFriend}><UserPlus /> {pending ? 'Request sent' : 'Add friend'}</button>}
                <button className="btn btn-primary" onClick={challenge} disabled={data.status === 'offline' || data.status === 'playing'}><Swords /> Challenge</button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 18 }}>
        {TIME_CATEGORIES.map((c) => {
          const r = ratings[c];
          return (
            <div key={c} className="panel panel-pad col" style={{ gap: 6 }}>
              <span className="label">{CATEGORY_LABEL[c]}</span>
              <div className="row between"><Division rating={r.rating} size={22} provisional={r.games < PLACEMENT_GAMES} /><span className="display mono" style={{ fontWeight: 700, fontSize: '1.3rem' }}>{r.rating}</span></div>
              <span className="tiny muted mono">{r.games} rated · peak {r.peak}</span>
            </div>
          );
        })}
      </div>

      {s.games === 0 ? (
        <div className="panel"><Empty icon={<BarChart3 />} title="No games played yet">{isMe ? 'Play a game to start building your statistics.' : `${p.username} has not completed any games yet.`}</Empty></div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 18 }}>
          <div className="col" style={{ gap: 18 }}>
            <div className="panel panel-pad">
              <h3 className="panel-title" style={{ marginBottom: 14 }}><BarChart3 /> Overview</h3>
              <div className="grid g4" style={{ gap: 14 }}>
                <Stat k="Games" v={s.games} />
                <Stat k="Win rate" v={`${s.winRate}%`} />
                <Stat k="Accuracy" v={s.averageAccuracy !== null ? `${s.averageAccuracy}%` : '—'} sub={s.bestAccuracy ? `best ${s.bestAccuracy.toFixed(1)}%` : undefined} />
                <Stat k="Checkmates" v={s.checkmates} />
                <Stat k="Streak" v={s.currentStreak} sub={`best ${s.bestStreak}`} />
                <Stat k="Avg duration" v={fmtDuration(s.averageDurationMs)} />
                <Stat k="Most played" v={s.mostPlayedCategory ? CATEGORY_LABEL[s.mostPlayedCategory] : '—'} />
                <Stat k="Puzzles" v={s.puzzlesSolved} sub={`rating ${s.puzzleRating}`} />
              </div>
              <div style={{ marginTop: 16 }}>
                <div className="row between tiny" style={{ marginBottom: 6 }}>
                  <span className="win">{s.wins} wins</span><span className="muted">{s.draws} draws</span><span className="loss">{s.losses} losses</span>
                </div>
                <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'var(--bad)' }}>
                  <div style={{ width: `${wPct}%`, background: 'var(--good)' }} />
                  <div style={{ width: `${dPct}%`, background: 'var(--text-3)' }} />
                </div>
              </div>
              <div className="grid g3" style={{ gap: 10, marginTop: 14 }}>
                <div className="inset" style={{ padding: 10 }}><div className="tiny muted">Online</div><div className="mono">{s.onlineWins}/{s.onlineGames} won</div></div>
                <div className="inset" style={{ padding: 10 }}><div className="tiny muted">Ranked wins</div><div className="mono">{s.rankedWins}</div></div>
                <div className="inset" style={{ padding: 10 }}><div className="tiny muted">Vs bots</div><div className="mono">{s.botWins}/{s.botGames} won</div></div>
              </div>
            </div>
            <div className="panel panel-pad">
              <h3 className="panel-title" style={{ marginBottom: 10 }}><Activity /> Accuracy trend</h3>
              <LineChart height={150} minSpan={20} yLabel={(v) => `${Math.round(v)}%`} points={s.accuracyTrend.map((a, i) => ({ x: i, y: a.accuracy, label: `${a.accuracy.toFixed(1)}% · ${fmtDate(a.ended_at)}` }))} />
            </div>
            <div className="panel">
              <div className="panel-head"><h3 className="panel-title"><Swords /> Recent games</h3></div>
              {games && games.length ? <div className="list">{games.map((g) => <GameRow key={g.id} g={g} />)}</div> : <Empty title="No games" />}
            </div>
          </div>
          <div className="col" style={{ gap: 18 }}>
            <div className="panel panel-pad">
              <h3 className="panel-title" style={{ marginBottom: 12 }}>Move quality</h3>
              <ClassBars counts={s.classes} />
            </div>
            <div className="panel panel-pad">
              <h3 className="panel-title" style={{ marginBottom: 12 }}><BookOpen /> Favourite openings</h3>
              {s.openings.length === 0 ? <div className="small muted">No named openings yet.</div> : s.openings.map((o) => (
                <div key={o.name} style={{ marginBottom: 10 }}>
                  <div className="row between small"><span className="ellipsis" style={{ fontWeight: 600 }}><span className="mono muted">{o.eco}</span> {o.name}</span><span className="mono muted">{o.n}</span></div>
                  <Progress value={o.n / s.openings[0].n} />
                  <div className="tiny muted">{Math.round((o.wins / o.n) * 100)}% wins</div>
                </div>
              ))}
            </div>
            <div className="panel">
              <div className="panel-head"><h3 className="panel-title"><Bot /> Performance against bots</h3></div>
              {s.bots.length === 0 ? <Empty title="No bot games yet" /> : (
                <table className="table">
                  <thead><tr><th>Bot</th><th>W</th><th>L</th><th>D</th></tr></thead>
                  <tbody>
                    {BOTS.filter((b) => s.bots.some((x) => x.bot_id === b.id)).map((b) => {
                      const r = s.bots.find((x) => x.bot_id === b.id)!;
                      return (
                        <tr key={b.id}>
                          <td><div className="row"><PlayerIcon id={`bot.${b.id}`} size={24} />{b.name}</div></td>
                          <td className="mono win">{r.wins}</td><td className="mono loss">{r.losses}</td><td className="mono">{r.draws}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="panel panel-pad">
              <h3 className="panel-title" style={{ marginBottom: 12 }}><Award /> Achievements <span className="muted small">{unlocked}</span></h3>
              {unlocked === 0 ? <div className="small muted">None unlocked yet.</div> : (
                <div className="row wrap" style={{ gap: 6 }}>
                  {data.achievements.map((a) => <span key={a.achievement_id} className="badge" title={ACHIEVEMENT_BY_ID[a.achievement_id]?.description}><Award /> {ACHIEVEMENT_BY_ID[a.achievement_id]?.name ?? a.achievement_id}</span>)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
