import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, RotateCcw, Search, Sparkles, Award, Target, Gift, Home } from 'lucide-react';
import { ACHIEVEMENT_BY_ID, CHALLENGE_BY_ID, COSMETIC_BY_ID, END_REASON_LABEL, CLASS_META, type GameRewards, type GameState, type MoveRating, type Side } from '@dc/shared';
import { Modal, ClassBars, ClassDot, Points, Spinner } from './ui';
import { PlayerIcon } from '../cosmetics/icons';
import { api } from '../lib/api';
import { fmtDuration, signed, fmtEval } from '../lib/format';

interface Props {
  open: boolean;
  onClose: () => void;
  state: GameState;
  rewards: GameRewards | null;
  analysisReady: number;
  onRematch: () => void;
  rematchPending: boolean;
}

export function ResultsModal({ open, onClose, state, rewards, analysisReady, onRematch, rematchPending }: Props) {
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState<{ ratings: MoveRating[]; accuracy: { w: number; b: number } } | null>(null);
  const res = state.result!;
  const me = state.yourColor;

  useEffect(() => {
    if (!open || res.reason === 'aborted') return;
    let stop = false;
    const fetchIt = () =>
      api
        .get(`/api/games/${state.id}`)
        .then((r) => !stop && r.game?.analysis && setAnalysis(r.game.analysis))
        .catch(() => {});
    void fetchIt();
    return () => {
      stop = true;
    };
  }, [open, state.id, analysisReady, rewards, res.reason]);

  const title = res.reason === 'aborted' ? 'Game aborted' : res.winner === null ? 'Draw' : me ? (res.winner === me ? 'Victory' : 'Defeat') : `${res.winner === 'w' ? 'White' : 'Black'} wins`;
  const color = res.reason === 'aborted' || res.winner === null ? 'var(--text-1)' : !me ? 'var(--text-0)' : res.winner === me ? 'var(--good)' : 'var(--bad)';
  const mine = (analysis?.ratings ?? []).filter((r) => r.color === me);
  const best = mine.filter((r) => ['incredible', 'great'].includes(r.cls)).sort((a, b) => (a.cls === 'incredible' ? -1 : 1) - (b.cls === 'incredible' ? -1 : 1))[0] ?? mine.filter((r) => r.cls === 'good').sort((a, b) => a.loss - b.loss)[0];
  const worst = [...mine].sort((a, b) => b.loss - a.loss)[0];
  const keyMoments = (analysis?.ratings ?? []).filter((r) => r.cls === 'incredible' || r.cls === 'great' || r.cls === 'blunder').slice(0, 6);
  const seat = (s: Side) => (s === 'w' ? state.white : state.black);

  return (
    <Modal open={open} onClose={onClose} wide title={null}>
      <div className="col" style={{ gap: 18 }}>
        <div style={{ textAlign: 'center' }}>
          <div className="display upper" style={{ fontSize: '2.2rem', fontWeight: 700, color, letterSpacing: '0.12em' }}>{title}</div>
          <div className="muted">{END_REASON_LABEL[res.reason]} · {state.moves.length ? `${Math.ceil(state.moves.length / 2)} moves` : 'no moves'} · {fmtDuration(Date.now() - state.startedAt)}</div>
        </div>

        <div className="grid g2" style={{ gap: 12 }}>
          {(['w', 'b'] as Side[]).map((s) => {
            const st = seat(s);
            const delta = res.ratingDelta?.[s];
            const won = res.winner === s;
            return (
              <div key={s} className="inset row" style={{ padding: 12, borderColor: won ? 'rgba(63,207,142,0.45)' : undefined }}>
                <PlayerIcon id={st.icon} size={44} />
                <div className="grow">
                  <div style={{ fontWeight: 700 }}>{st.name} {won && <Trophy size={14} style={{ color: 'var(--gold)', verticalAlign: -2 }} />}</div>
                  <div className="tiny muted">{s === 'w' ? 'White' : 'Black'}{analysis ? ` · ${analysis.accuracy[s].toFixed(1)}% accuracy` : ''}</div>
                </div>
                {delta !== undefined && (
                  <div style={{ textAlign: 'right' }}>
                    <div className={`mono ${delta >= 0 ? 'win' : 'loss'}`} style={{ fontWeight: 800, fontSize: '1.1rem' }}>{signed(delta)}</div>
                    <div className="tiny muted mono">{res.ratingAfter?.[s]}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {me && res.reason !== 'aborted' && (
          <div className="grid g2" style={{ gap: 12 }}>
            <div className="inset" style={{ padding: 14 }}>
              <div className="label" style={{ marginBottom: 10 }}>Rewards</div>
              {!rewards ? (
                <div className="row muted small"><Spinner /> Analysing your moves…</div>
              ) : (
                <div className="col" style={{ gap: 10 }}>
                  <div className="row between">
                    <span className="dim">XP earned</span>
                    <span className="mono" style={{ fontWeight: 800, color: 'var(--accent)' }}>+{rewards.xp}</span>
                  </div>
                  <div className="row between">
                    <span className="dim">DC Points</span>
                    <span className="row" style={{ gap: 6 }}>+<Points value={rewards.points} /></span>
                  </div>
                  <div className="tiny muted">Moves: +{rewards.pointsFromMoves} · Result: +{rewards.pointsFromResult}{rewards.points > rewards.pointsFromMoves + rewards.pointsFromResult ? ` · Bonuses: +${rewards.points - rewards.pointsFromMoves - rewards.pointsFromResult}` : ''}</div>
                  {rewards.levelAfter > rewards.levelBefore && (
                    <div className="row" style={{ color: 'var(--gold)', fontWeight: 700 }}><Sparkles size={16} /> Level up! Now level {rewards.levelAfter}</div>
                  )}
                  {rewards.achievements.map((a) => (
                    <div key={a} className="row small"><Award size={15} style={{ color: 'var(--accent-2)' }} /> {ACHIEVEMENT_BY_ID[a]?.name ?? a}</div>
                  ))}
                  {rewards.challenges.map((c) => (
                    <div key={c} className="row small"><Target size={15} style={{ color: 'var(--good)' }} /> Challenge complete: {CHALLENGE_BY_ID[c]?.name ?? c}</div>
                  ))}
                  {rewards.items.map((i) => (
                    <div key={i} className="row small"><Gift size={15} style={{ color: 'var(--gold)' }} /> Unlocked: {COSMETIC_BY_ID[i]?.name ?? i}</div>
                  ))}
                  {rewards.notes.map((n, k) => (
                    <div key={k} className="tiny muted">{n}</div>
                  ))}
                </div>
              )}
            </div>
            <div className="inset" style={{ padding: 14 }}>
              <div className="label" style={{ marginBottom: 10 }}>Your moves {rewards?.accuracy !== null && rewards?.accuracy !== undefined && <span style={{ color: 'var(--text-0)' }}> · {rewards.accuracy.toFixed(1)}% accuracy</span>}</div>
              {rewards?.counts ? <ClassBars counts={rewards.counts} /> : <div className="row muted small"><Spinner /> Waiting for engine analysis…</div>}
            </div>
          </div>
        )}

        {analysis && me && (best || worst) && (
          <div className="grid g2" style={{ gap: 12 }}>
            {best && (
              <div className="inset" style={{ padding: 12 }}>
                <div className="label">Best move</div>
                <div className="row" style={{ marginTop: 6 }}>
                  <ClassDot cls={best.cls} size={20} />
                  <span style={{ fontWeight: 700 }}>{Math.floor(best.ply / 2) + 1}{best.color === 'w' ? '.' : '...'} {best.san}</span>
                  <span className="tiny muted">{CLASS_META[best.cls].label} · {fmtEval(best.evalPlayed)}</span>
                </div>
              </div>
            )}
            {worst && worst.loss > 0.05 && (
              <div className="inset" style={{ padding: 12 }}>
                <div className="label">Biggest mistake</div>
                <div className="row" style={{ marginTop: 6 }}>
                  <ClassDot cls={worst.cls} size={20} />
                  <span style={{ fontWeight: 700 }}>{Math.floor(worst.ply / 2) + 1}{worst.color === 'w' ? '.' : '...'} {worst.san}</span>
                  <span className="tiny muted">Best was {worst.bestSan}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {keyMoments.length > 0 && (
          <div>
            <div className="label" style={{ marginBottom: 8 }}>Key moments</div>
            <div className="row wrap" style={{ gap: 8 }}>
              {keyMoments.map((k) => (
                <button key={k.ply} className="badge" style={{ cursor: 'pointer', padding: '5px 9px' }} onClick={() => navigate(`/analysis/${state.id}?ply=${k.ply}`)}>
                  <ClassDot cls={k.cls} size={14} /> {Math.floor(k.ply / 2) + 1}{k.color === 'w' ? '.' : '...'} {k.san}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="row wrap" style={{ justifyContent: 'center', gap: 10 }}>
          {res.reason !== 'aborted' && (
            <button className="btn btn-primary" onClick={() => navigate(`/analysis/${state.id}`)}>
              <Search /> Review game
            </button>
          )}
          {me && (
            <button className="btn" onClick={onRematch} disabled={rematchPending}>
              <RotateCcw /> {rematchPending ? 'Rematch offered…' : state.rematchOffer && state.rematchOffer !== me ? 'Accept rematch' : 'Rematch'}
            </button>
          )}
          <button className="btn" onClick={() => navigate(state.mode === 'bot' ? '/bots' : '/play')}>New game</button>
          <button className="btn btn-ghost" onClick={() => navigate('/')}>
            <Home /> Home
          </button>
        </div>
      </div>
    </Modal>
  );
}
