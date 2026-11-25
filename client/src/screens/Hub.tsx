import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Zap, Trophy, Bot, Users, Puzzle, MonitorSmartphone, Target, ChevronRight, Swords, Clock3 } from 'lucide-react';
import { CATEGORY_LABEL, divisionFor, levelFromXp, type TimeCategory } from '@dc/shared';
import { useSession } from '../stores/session';
import { api } from '../lib/api';
import { CallingCard, Division, Points, Progress, Empty } from '../components/ui';
import { PlayerIcon } from '../cosmetics/icons';
import { Board2D } from '../board/Board2D';
import { GameRow, type HistoryGame } from '../components/GameRow';

interface ChallengePeriod {
  period: 'daily' | 'weekly';
  challenges: { id: string; name: string; target: number; progress: number; completed: boolean; points: number; xp: number }[];
}

const HERO_FEN = 'r2q1rk1/pb2bppp/1pn1pn2/2pp4/3P4/1PN1PN2/PBQ1BPPP/R3K2R w KQ - 0 10';

export default function Hub() {
  const { me, ratings, friends, activeGameId } = useSession();
  const navigate = useNavigate();
  const [games, setGames] = useState<HistoryGame[] | null>(null);
  const [challenges, setChallenges] = useState<ChallengePeriod[] | null>(null);
  const [daily, setDaily] = useState<{ id: string; rating: number } | null>(null);

  useEffect(() => {
    if (!me) return;
    api.get(`/api/users/${me.username}/games?limit=5`).then((r) => setGames(r.games)).catch(() => setGames([]));
    api.get('/api/challenges').then((r) => setChallenges(r.periods)).catch(() => setChallenges([]));
    api.get('/api/puzzles/daily').then((r) => setDaily(r.puzzle)).catch(() => {});
  }, [me?.username]);

  if (!me) return null;
  const lvl = levelFromXp(me.xp);
  const div = divisionFor(me.rating);
  const best = ratings ? (Object.values(ratings).sort((a, b) => b.games - a.games)[0] ?? null) : null;
  const online = friends.friends.filter((f) => f.status !== 'offline');

  const modes = [
    { icon: <Zap />, t: 'Quick Play', d: 'Jump into a casual game instantly.', to: '/play?mode=quick' },
    { icon: <Trophy />, t: 'Ranked', d: 'Climb the divisions. Every game counts.', to: '/play?mode=ranked' },
    { icon: <Bot />, t: 'Play Bots', d: '20 opponents from Rookie to DC Champion.', to: '/bots' },
    { icon: <Users />, t: 'Friends & Private', d: 'Parties, invites and custom matches.', to: '/play?mode=private' },
    { icon: <Puzzle />, t: 'Puzzles', d: 'Sharpen your tactics daily.', to: '/puzzles' },
    { icon: <MonitorSmartphone />, t: 'Local Match', d: 'Pass and play on one device.', to: '/local' },
  ];

  return (
    <div className="page">
      <div className="hub-grid">
        <div className="col" style={{ gap: 18 }}>
          <section className="hero">
            <div className="hero-board">
              <Board2D fen={HERO_FEN} orientation="w" movable={null} showCoordinates={false} />
            </div>
            <div className="upper tiny" style={{ color: 'var(--accent)', fontWeight: 700, position: 'relative' }}>Welcome back, {me.username}</div>
            <h1>
              Ready for your <span className="grad-text">next move?</span>
            </h1>
            <p>
              {activeGameId
                ? 'You have a match in progress. Your clock may be running.'
                : `You're ${div.name}${div.nextAt ? `, ${div.nextAt - me.rating} rating from ${div.nextName}` : ''}. Queue up and keep climbing.`}
            </p>
            <div className="row wrap" style={{ position: 'relative' }}>
              {activeGameId ? (
                <button className="btn btn-primary btn-lg" onClick={() => navigate(`/game/${activeGameId}`)}>
                  <Swords /> Resume match
                </button>
              ) : (
                <button className="btn btn-primary btn-lg" onClick={() => navigate('/play?mode=ranked')}>
                  <Trophy /> Play ranked
                </button>
              )}
              <button className="btn btn-lg" onClick={() => navigate('/bots')}>
                <Bot /> Challenge a bot
              </button>
            </div>
          </section>

          <div className="auto-grid" style={{ ['--min' as any]: '190px' }}>
            {modes.map((m) => (
              <button key={m.t} className="mode-card" onClick={() => navigate(m.to)}>
                <span className="mglow" />
                <span className="mi">{m.icon}</span>
                <span className="mt">{m.t}</span>
                <span className="md">{m.d}</span>
              </button>
            ))}
          </div>

          <section className="panel">
            <div className="panel-head">
              <h3 className="panel-title"><Clock3 /> Recent matches</h3>
              <Link to="/history" className="btn btn-sm btn-ghost">View all <ChevronRight /></Link>
            </div>
            {games === null ? (
              <div className="panel-body"><div className="skeleton" style={{ height: 120 }} /></div>
            ) : games.length === 0 ? (
              <Empty icon={<Swords />} title="No matches yet">Your completed games will appear here, with ratings and move analysis.</Empty>
            ) : (
              <div className="list">
                {games.map((g) => <GameRow key={g.id} g={g} me={me.id} compact />)}
              </div>
            )}
          </section>
        </div>

        <div className="col" style={{ gap: 18 }}>
          <section className="panel" style={{ overflow: 'hidden' }}>
            <CallingCard card={me.equipped.card} icon={me.equipped.icon} name={me.username} sub={`Level ${lvl.level} · Joined ${new Date(me.createdAt).toLocaleDateString()}`} height={86} iconSize={58} />
            <div className="panel-body col" style={{ gap: 14 }}>
              <div>
                <div className="row between small">
                  <span className="muted upper tiny" style={{ fontWeight: 700 }}>Level {lvl.level}</span>
                  <span className="mono tiny muted">{lvl.xpIntoLevel.toLocaleString()} / {lvl.xpForNext.toLocaleString()} XP</span>
                </div>
                <Progress value={lvl.progress} className="lg" />
              </div>
              <div>
                <div className="row between">
                  <Division rating={me.rating} size={30} />
                  <span className="display mono" style={{ fontSize: '1.4rem', fontWeight: 700 }}>{me.rating}</span>
                </div>
                <Progress value={div.progress} color={div.tier.color} />
                <div className="tiny muted" style={{ marginTop: 4 }}>
                  {div.nextAt ? `${div.nextAt - me.rating} to ${div.nextName}` : 'Top division reached'}
                  {best && best.games > 0 && ` · Most played: ${CATEGORY_LABEL[best.category as TimeCategory]} ${best.rating}`}
                </div>
              </div>
              <div className="row between">
                <span className="muted small">DC Points</span>
                <Points value={me.points} />
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3 className="panel-title"><Target /> Challenges</h3>
              <Link to="/progression?tab=challenges" className="btn btn-sm btn-ghost">All <ChevronRight /></Link>
            </div>
            <div className="panel-body col" style={{ gap: 12 }}>
              {challenges === null && <div className="skeleton" style={{ height: 90 }} />}
              {challenges?.[0]?.challenges.map((c) => (
                <div key={c.id}>
                  <div className="row between small">
                    <span style={{ fontWeight: 600, color: c.completed ? 'var(--good)' : undefined }}>{c.name}</span>
                    <span className="mono tiny muted">{Math.min(c.progress, c.target)}/{c.target}</span>
                  </div>
                  <Progress value={c.progress / c.target} color={c.completed ? 'var(--good)' : undefined} />
                </div>
              ))}
            </div>
          </section>

          {daily && (
            <section className="panel panel-pad row between">
              <div>
                <div className="panel-title" style={{ marginBottom: 4 }}><Puzzle /> Daily puzzle</div>
                <div className="small muted">Rated {daily.rating}. Find the winning line.</div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/puzzles?daily=1')}>Solve</button>
            </section>
          )}

          <section className="panel">
            <div className="panel-head">
              <h3 className="panel-title"><Users /> Friends online <span className="muted small">{online.length}</span></h3>
              <Link to="/friends" className="btn btn-sm btn-ghost">Manage <ChevronRight /></Link>
            </div>
            {online.length === 0 ? (
              <Empty title="No friends online">Add friends to see when they are playing.</Empty>
            ) : (
              <div className="list">
                {online.slice(0, 6).map((f) => (
                  <Link key={f.id} to={`/profile/${f.username}`} className="list-item click">
                    <PlayerIcon id={f.icon} size={32} />
                    <div className="grow">
                      <div style={{ fontWeight: 600 }}>{f.username}</div>
                      <div className="tiny muted">Level {f.level} · {f.rating}</div>
                    </div>
                    <span className={`status-dot ${f.status}`} />
                    <span className="tiny muted" style={{ textTransform: 'capitalize' }}>{f.status}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
