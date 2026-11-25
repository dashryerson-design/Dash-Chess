import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, RefreshCw } from 'lucide-react';
import { tcLabel, type SeatInfo, type TimeControl } from '@dc/shared';
import { api } from '../lib/api';
import { BoardView } from '../board/BoardView';
import { Empty } from '../components/ui';
import { PlayerIcon } from '../cosmetics/icons';

interface Live { id: string; mode: string; white: SeatInfo; black: SeatInfo; fen: string; moves: number; tc: TimeControl; spectators: number }

export default function Watch() {
  const [games, setGames] = useState<Live[] | null>(null);
  const navigate = useNavigate();
  const load = () => api.get('/api/games/live').then((r) => setGames(r.games)).catch(() => setGames([]));
  useEffect(() => {
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Watch Live</h1>
          <p className="page-sub">Games in progress that allow spectators. Updates every few seconds.</p>
        </div>
        <button className="btn" onClick={load}><RefreshCw /> Refresh</button>
      </div>
      {games === null ? <div className="skeleton" style={{ height: 240 }} /> : games.length === 0 ? (
        <div className="panel"><Empty icon={<Eye />} title="No live games right now">Check back soon, or start one yourself.</Empty></div>
      ) : (
        <div className="auto-grid" style={{ ['--min' as any]: '240px' }}>
          {games.map((g) => (
            <button key={g.id} className="item-card" style={{ ['--rc' as any]: 'var(--accent)' }} onClick={() => navigate(`/game/${g.id}`)}>
              <div style={{ padding: 10 }}>
                <BoardView mode="2d" fen={g.fen} orientation="w" movable={null} showCoordinates={false} />
              </div>
              <div className="ic-body">
                <div className="row"><PlayerIcon id={g.white.icon} size={20} /><span className="small" style={{ fontWeight: 600 }}>{g.white.name}</span><span className="tiny muted">{g.white.rating ?? ''}</span></div>
                <div className="row"><PlayerIcon id={g.black.icon} size={20} /><span className="small" style={{ fontWeight: 600 }}>{g.black.name}</span><span className="tiny muted">{g.black.rating ?? ''}</span></div>
                <div className="tiny muted">{g.mode} · {g.tc.initial ? tcLabel(g.tc) : 'untimed'} · move {Math.ceil(g.moves / 2)} · <Eye size={11} /> {g.spectators}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
