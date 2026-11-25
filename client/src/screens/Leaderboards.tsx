import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Crown, Medal } from 'lucide-react';
import { CATEGORY_LABEL } from '@dc/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import { Division, Empty, Tabs } from '../components/ui';
import { PlayerIcon } from '../cosmetics/icons';

type Board = 'overall' | 'bullet' | 'blitz' | 'rapid' | 'classical' | 'level' | 'season';
interface Entry { position: number; id: string; username: string; icon: string; card: string; level: number; rating: number; division: string; value: number }

export default function Leaderboards() {
  const [type, setType] = useState<Board>('overall');
  const [data, setData] = useState<{ entries: Entry[]; myPosition: number | null; season?: { label: string; endsAt: number }; p2p?: boolean; cloud?: boolean } | null>(null);
  const me = useSession((s) => s.me);
  const navigate = useNavigate();

  useEffect(() => {
    setData(null);
    api.get(`/api/leaderboard?type=${type}`).then(setData).catch(() => setData({ entries: [], myPosition: null }));
  }, [type]);

  const valueLabel = type === 'level' ? 'Level' : type === 'season' ? 'Season peak' : 'Rating';
  const podiumColor = ['#ffcf5a', '#c9d3e0', '#d0905a'];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Leaderboards</h1>
          <p className="page-sub">
            {data?.cloud ? `Global leaderboard, updated live.${data.myPosition ? ` You are #${data.myPosition}.` : ''}` : data?.p2p ? 'Players online right now. There is no central server, so rankings are built live from everyone currently in the lobby.' : data?.myPosition ? `You are ranked #${data.myPosition} on this board.` : 'Top 100 players. Only players with rated games appear on rating boards.'}
          </p>
        </div>
      </div>
      <Tabs
        value={type}
        onChange={setType}
        tabs={[
          { id: 'overall', label: 'Global DC Rating' },
          { id: 'bullet', label: CATEGORY_LABEL.bullet },
          { id: 'blitz', label: CATEGORY_LABEL.blitz },
          { id: 'rapid', label: CATEGORY_LABEL.rapid },
          { id: 'classical', label: CATEGORY_LABEL.classical },
          { id: 'level', label: 'Highest level' },
          { id: 'season', label: data?.season?.label ?? 'Season' },
        ]}
      />
      {data === null ? (
        <div className="skeleton" style={{ height: 320 }} />
      ) : data.entries.length === 0 ? (
        <div className="panel"><Empty icon={<BarChart3 />} title="Nobody here yet">Be the first: play {type === 'level' ? 'any game' : 'a rated game'} to claim the top spot.</Empty></div>
      ) : (
        <>
          <div className="grid g3" style={{ marginBottom: 18 }}>
            {data.entries.slice(0, 3).map((e, i) => (
              <button key={e.id} className="item-card" style={{ ['--rc' as any]: podiumColor[i], padding: 18, alignItems: 'center', textAlign: 'center', gap: 8 }} onClick={() => navigate(`/profile/${e.username}`)}>
                <div className="row" style={{ gap: 6, color: podiumColor[i], fontWeight: 800 }}>{i === 0 ? <Crown size={18} /> : <Medal size={18} />} #{e.position}</div>
                <PlayerIcon id={e.icon} size={64} />
                <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>{e.username}</div>
                <Division rating={e.rating} size={18} />
                <div className="display mono" style={{ fontSize: '1.4rem', fontWeight: 700 }}>{type === 'level' ? `LV ${e.level}` : e.value}</div>
              </button>
            ))}
          </div>
          <div className="panel" style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr><th style={{ width: 60 }}>#</th><th>Player</th><th className="hide-mobile">Division</th><th>{valueLabel}</th><th className="hide-xs">Level</th></tr>
              </thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.id} className={`click ${e.id === me?.id ? 'me' : ''}`} onClick={() => navigate(`/profile/${e.username}`)}>
                    <td className="mono" style={{ fontWeight: 700, color: e.position <= 3 ? podiumColor[e.position - 1] : undefined }}>{e.position}</td>
                    <td><div className="row"><PlayerIcon id={e.icon} size={30} /><span style={{ fontWeight: 600 }}>{e.username}</span></div></td>
                    <td className="hide-mobile"><Division rating={e.rating} size={18} /></td>
                    <td className="mono" style={{ fontWeight: 700 }}>{type === 'level' ? `${e.value.toLocaleString()} XP` : e.value}</td>
                    <td className="mono hide-xs">{e.level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
