import { useEffect, useMemo, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { BookOpen, ChevronLeft, RotateCw, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { BoardView } from '../board/BoardView';
import { useElementSize } from '../lib/useSize';
import { useSettings } from '../stores/settings';
import { moveSound } from '../lib/sound';

interface MoveStat { uci: string; san: string; opening: { eco: string; name: string } | null; white: number; black: number; draws: number }

export default function Explorer() {
  const [line, setLine] = useState<{ uci: string; san: string }[]>([]);
  const [data, setData] = useState<{ opening: { eco: string; name: string } | null; moves: MoveStat[] } | null>(null);
  const [orientation, setOrientation] = useState<'w' | 'b'>('w');
  const [lastName, setLastName] = useState<string | null>(null);
  const [boxRef, box] = useElementSize<HTMLDivElement>();
  const mode3d = useSettings((s) => s.graphics.mode === '3d');

  const fen = useMemo(() => {
    const c = new Chess();
    for (const m of line) c.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci[4] });
    return c.fen();
  }, [line]);

  useEffect(() => {
    setData(null);
    api.get(`/api/openings?fen=${encodeURIComponent(fen)}`).then((r) => {
      setData(r);
      if (r.opening) setLastName(`${r.opening.eco} ${r.opening.name}`);
      else if (!line.length) setLastName(null);
    }).catch(() => setData({ opening: null, moves: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen]);

  const play = (uci: string) => {
    const c = new Chess(fen);
    const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    moveSound(m.san);
    setLine((l) => [...l, { uci, san: m.san }]);
  };
  const onMove = (from: Square, to: Square, promo?: string) => {
    const c = new Chess(fen);
    try {
      const m = c.move({ from, to, promotion: promo });
      play(m.from + m.to + (m.promotion ?? ''));
      return true;
    } catch {
      return false;
    }
  };

  const size = mode3d ? null : Math.max(240, Math.min(box.width, box.height));
  const last = line.length ? ([line[line.length - 1].uci.slice(0, 2), line[line.length - 1].uci.slice(2, 4)] as [Square, Square]) : null;
  const totalGames = (m: MoveStat) => m.white + m.black + m.draws;

  return (
    <div className="game-layout" style={{ gridTemplateColumns: 'minmax(0,1fr) 400px' }}>
      <div className="board-col">
        <div className="board-wrap" ref={boxRef} style={{ minHeight: mode3d ? 380 : undefined }}>
          <div style={{ width: size ?? '100%', height: size ?? '100%' }}>
            <BoardView fen={fen} orientation={orientation} movable="both" onMove={onMove} lastMove={last} moveKey={line.length} />
          </div>
        </div>
        <div className="row">
          <button className="icon-btn" onClick={() => setLine((l) => l.slice(0, -1))} disabled={!line.length}><ChevronLeft /></button>
          <button className="icon-btn" onClick={() => setLine([])}><RefreshCw /></button>
          <button className="icon-btn" onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))}><RotateCw /></button>
        </div>
      </div>
      <div className="side-col">
        <div className="panel panel-pad">
          <h3 className="panel-title" style={{ marginBottom: 6 }}><BookOpen /> Opening explorer</h3>
          <div style={{ fontWeight: 700 }}>{data?.opening ? `${data.opening.eco} · ${data.opening.name}` : lastName ? <span className="muted">{lastName} (out of book)</span> : 'Starting position'}</div>
          <div className="small muted" style={{ marginTop: 6 }}>{line.map((m, i) => `${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${m.san}`).join(' ') || 'Click a move or play on the board.'}</div>
        </div>
        <div className="panel" style={{ flex: 1, overflow: 'auto' }}>
          <table className="table">
            <thead><tr><th>Move</th><th>Opening</th><th style={{ width: 140 }}>DC Chess games</th></tr></thead>
            <tbody>
              {data?.moves.map((m) => {
                const n = totalGames(m);
                return (
                  <tr key={m.uci} className="click" onClick={() => play(m.uci)}>
                    <td style={{ fontWeight: 700 }}>{m.san}</td>
                    <td className="small ellipsis" style={{ maxWidth: 160 }}>{m.opening ? <><span className="mono muted">{m.opening.eco}</span> {m.opening.name}</> : <span className="muted">—</span>}</td>
                    <td>
                      {n ? (
                        <>
                          <div className="tiny mono muted">{n} games</div>
                          <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${(m.white / n) * 100}%`, background: '#e9ebef' }} />
                            <div style={{ width: `${(m.draws / n) * 100}%`, background: '#7b8496' }} />
                            <div style={{ width: `${(m.black / n) * 100}%`, background: '#2a2d35' }} />
                          </div>
                        </>
                      ) : <span className="tiny muted">no games yet</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data && data.moves.length === 0 && <div className="empty small">No book moves or recorded games from this position.</div>}
        </div>
        <div className="tiny muted">Opening names from the CC0 lichess chess-openings dataset. Statistics come from games played on this DC Chess server.</div>
      </div>
    </div>
  );
}
