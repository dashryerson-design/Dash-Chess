import { useCallback, useEffect, useState } from 'react';
import { History as HistoryIcon } from 'lucide-react';
import { useSession } from '../stores/session';
import { api } from '../lib/api';
import { Empty, Seg } from '../components/ui';
import { GameRow, type HistoryGame } from '../components/GameRow';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'ranked', label: 'Ranked' },
  { value: 'online', label: 'Online' },
  { value: 'bots', label: 'Bots' },
  { value: 'wins', label: 'Wins' },
  { value: 'losses', label: 'Losses' },
];

export default function History() {
  const me = useSession((s) => s.me);
  const [filter, setFilter] = useState('all');
  const [games, setGames] = useState<HistoryGame[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (offset: number) => {
      if (!me) return;
      setLoading(true);
      try {
        const r = await api.get(`/api/users/${me.username}/games?filter=${filter}&limit=25&offset=${offset}`);
        setGames((g) => (offset ? [...g, ...r.games] : r.games));
        setMore(r.more);
      } finally {
        setLoading(false);
      }
    },
    [me, filter],
  );
  useEffect(() => {
    void load(0);
  }, [load]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Match History</h1>
          <p className="page-sub">Every completed game is stored. Open any match for a move-by-move replay and analysis.</p>
        </div>
        <Seg options={FILTERS} value={filter} onChange={setFilter} />
      </div>
      <div className="panel">
        {games.length === 0 && !loading ? (
          <Empty icon={<HistoryIcon />} title="No games found">Completed games matching this filter will appear here.</Empty>
        ) : (
          <div className="list">{games.map((g) => <GameRow key={g.id} g={g} me={me?.id} />)}</div>
        )}
        {loading && <div className="panel-body"><div className="skeleton" style={{ height: 60 }} /></div>}
        {more && !loading && (
          <div className="panel-body row center"><button className="btn" onClick={() => load(games.length)}>Load more</button></div>
        )}
      </div>
    </div>
  );
}
