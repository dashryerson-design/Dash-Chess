import { useNavigate } from 'react-router-dom';
import { BOT_BY_ID, CATEGORY_LABEL, END_REASON_LABEL, tcLabel, type ClassCounts, type EndReason, type TimeCategory } from '@dc/shared';
import { PlayerIcon } from '../cosmetics/icons';
import { ClassDot } from './ui';
import { fmtDuration, signed, timeAgo } from '../lib/format';

export interface HistoryGame {
  id: string;
  mode: string;
  rated: number;
  category: TimeCategory;
  tc_initial: number;
  tc_increment: number;
  white_id: string | null;
  black_id: string | null;
  white_bot: string | null;
  black_bot: string | null;
  white_name: string;
  black_name: string;
  white_rating: number | null;
  black_rating: number | null;
  white_delta: number | null;
  black_delta: number | null;
  result: string;
  winner: string | null;
  reason: EndReason;
  opening_name: string | null;
  ply_count: number;
  started_at: number;
  ended_at: number;
  duration_ms: number;
  color: 'w' | 'b';
  score: number;
  xp: number;
  points: number;
  accuracy: number | null;
  counts: ClassCounts | null;
  white_icon: string;
  black_icon: string;
}

export function GameRow({ g, me, compact }: { g: HistoryGame; me?: string; compact?: boolean }) {
  const navigate = useNavigate();
  const mine = g.color;
  const oppSide = mine === 'w' ? 'b' : 'w';
  const oppName = oppSide === 'w' ? g.white_name : g.black_name;
  const oppBot = oppSide === 'w' ? g.white_bot : g.black_bot;
  const oppRating = oppSide === 'w' ? g.white_rating : g.black_rating;
  const delta = mine === 'w' ? g.white_delta : g.black_delta;
  const res = g.score === 1 ? 'win' : g.score === 0 ? 'loss' : 'draw';
  void me;
  return (
    <div className="list-item click" onClick={() => navigate(`/analysis/${g.id}`)}>
      <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: res === 'win' ? 'var(--good)' : res === 'loss' ? 'var(--bad)' : 'var(--text-3)' }} />
      <PlayerIcon id={oppSide === 'w' ? g.white_icon : g.black_icon} size={34} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          <span style={{ fontWeight: 700 }} className="ellipsis">{oppBot ? BOT_BY_ID[oppBot]?.name ?? oppName : oppName}</span>
          {oppRating !== null && <span className="tiny muted mono">({oppRating})</span>}
          {g.rated ? <span className="badge" style={{ color: 'var(--accent)' }}>RANKED</span> : null}
        </div>
        <div className="tiny muted ellipsis">
          {CATEGORY_LABEL[g.category]} {tcLabel({ initial: g.tc_initial, increment: g.tc_increment })} · {END_REASON_LABEL[g.reason]} · {Math.ceil(g.ply_count / 2)} moves
          {!compact && ` · ${fmtDuration(g.duration_ms)}`}
          {!compact && g.opening_name && ` · ${g.opening_name}`}
        </div>
      </div>
      {!compact && g.counts && (
        <div className="row hide-mobile" style={{ gap: 6 }}>
          {(['incredible', 'great', 'bad', 'blunder'] as const).map((c) => (
            <span key={c} className="row tiny mono" style={{ gap: 3 }}><ClassDot cls={c} size={13} />{g.counts![c]}</span>
          ))}
        </div>
      )}
      {g.accuracy !== null && (
        <div className="hide-xs" style={{ textAlign: 'right', width: 62 }}>
          <div className="mono" style={{ fontWeight: 700 }}>{g.accuracy.toFixed(1)}%</div>
          <div className="tiny muted">accuracy</div>
        </div>
      )}
      <div style={{ textAlign: 'right', width: 70 }}>
        <div className={res} style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.82rem' }}>{res}</div>
        <div className="tiny muted">{delta !== null ? <span className={delta >= 0 ? 'win' : 'loss'}>{signed(delta)}</span> : timeAgo(g.ended_at)}</div>
      </div>
    </div>
  );
}
