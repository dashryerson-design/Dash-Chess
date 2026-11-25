import { useEffect, useState } from 'react';
import { Lock, Check, Volume2, Box, Square } from 'lucide-react';
import { RARITY_COLOR, unlockLabel, type Cosmetic } from '@dc/shared';
import { pieceUrl } from '../cosmetics/pieces';
import { boardUrl } from '../cosmetics/boards';
import { environmentVisual, THEME_SWATCH } from '../cosmetics/environments';
import { PlayerIcon } from '../cosmetics/icons';
import { CallingCard, RarityTag, Points } from './ui';
import { BoardView } from '../board/BoardView';
import { play } from '../lib/sound';
import { useSession } from '../stores/session';
import '../board/board.css';

const PREVIEW_FEN = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 1 5';

function EffectDemo({ kind, type }: { kind: string; type: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1400);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="board2d" style={{ width: '70%', maxWidth: 140 }}>
      <div className="board2d-squares" style={{ backgroundImage: `url("${boardUrl('board.tournament')}")`, backgroundSize: '400% 400%' }}>
        {type === 'checkEffect' ? (
          <div className={`hl check fx-${kind}`} style={{ width: '50%', height: '50%', transform: 'translate(50%, 50%)' }} />
        ) : null}
        <div className="piece" style={{ width: '50%', height: '50%', transform: 'translate(50%, 50%)', backgroundImage: `url("${pieceUrl('pieces.classic', 'w', type === 'checkEffect' ? 'k' : 'n')}")`, opacity: type === 'captureEffect' ? (tick % 2 ? 0 : 1) : 1, transition: 'opacity 0.3s' }} />
        {type !== 'checkEffect' && (
          <div key={tick} className={`fx fx-${kind}`} style={{ width: '50%', height: '50%', transform: 'translate(50%, 50%)' }}>
            <i /><i /><i />
          </div>
        )}
      </div>
    </div>
  );
}

/** Small preview used inside item cards. */
export function ItemPreview({ item }: { item: Cosmetic }) {
  const kind = item.id.split('.')[1];
  switch (item.type) {
    case 'pieces':
      return (
        <div className="row" style={{ gap: 0 }}>
          {(['k', 'q', 'n'] as const).map((t, i) => (
            <img key={t} src={pieceUrl(item.id, i === 1 ? 'b' : 'w', t)} style={{ width: 52, height: 52, filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.5))' }} alt="" />
          ))}
        </div>
      );
    case 'board':
      return <div style={{ width: '78%', aspectRatio: '2 / 1', backgroundImage: `url("${boardUrl(item.id)}")`, backgroundSize: '100% 400%', borderRadius: 4, boxShadow: '0 8px 20px rgba(0,0,0,0.5)' }} />;
    case 'background':
      return (
        <div style={{ position: 'absolute', inset: 0, background: environmentVisual(item.id).css, display: 'grid', placeItems: 'center' }}>
          <div style={{ width: '38%', aspectRatio: '1', backgroundImage: `url("${boardUrl('board.wood')}")`, backgroundSize: '100% 100%', transform: 'perspective(300px) rotateX(50deg)', boxShadow: '0 20px 30px rgba(0,0,0,0.6)' }} />
        </div>
      );
    case 'icon':
      return <PlayerIcon id={item.id} size={72} />;
    case 'card':
      return (
        <div style={{ width: '92%' }}>
          <CallingCard card={item.id} icon="icon.knight" name="Player" sub="Level 12" height={58} iconSize={36} />
        </div>
      );
    case 'moveEffect':
    case 'captureEffect':
    case 'checkEffect':
      return <EffectDemo kind={kind} type={item.type} />;
    case 'sound':
      return (
        <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); play('move', item.id); setTimeout(() => play('capture', item.id), 350); setTimeout(() => play('check', item.id), 750); }}>
          <Volume2 /> Play sample
        </button>
      );
    case 'theme': {
      const [a, b] = THEME_SWATCH[item.id] ?? ['#3d7bff', '#8b5cff'];
      return (
        <div className="col" style={{ gap: 8, width: '70%' }}>
          <div style={{ height: 30, borderRadius: 6, background: `linear-gradient(135deg, ${a}, ${b})`, boxShadow: `0 6px 18px ${a}55` }} />
          <div className="row" style={{ gap: 6 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: a }} />
            <div style={{ flex: 2, height: 6, borderRadius: 3, background: '#2a2f3c' }} />
          </div>
        </div>
      );
    }
  }
}

export function ItemCard({ item, owned, equipped, selected, onClick, showPrice }: { item: Cosmetic; owned: boolean; equipped: boolean; selected: boolean; onClick: () => void; showPrice?: boolean }) {
  const locked = !owned && item.unlock.kind !== 'shop';
  return (
    <button className={`item-card ${selected ? 'sel' : ''} ${!owned ? 'locked' : ''}`} style={{ ['--rc' as any]: RARITY_COLOR[item.rarity] }} onClick={onClick}>
      <div className="ic-prev">
        <ItemPreview item={item} />
        <div className="ic-bar" />
      </div>
      {equipped && <span className="ic-flag badge" style={{ color: 'var(--good)', background: 'rgba(0,0,0,0.6)' }}><Check /> Equipped</span>}
      {!owned && locked && <span className="ic-flag badge" style={{ background: 'rgba(0,0,0,0.6)' }}><Lock /> Locked</span>}
      <div className="ic-body">
        <div className="row between">
          <span className="ic-name ellipsis">{item.name}</span>
          <RarityTag rarity={item.rarity} />
        </div>
        <div className="tiny muted">
          {owned ? (equipped ? 'Equipped' : 'Owned') : showPrice && item.unlock.kind === 'shop' ? <Points value={item.unlock.price} size={13} /> : unlockLabel(item.unlock)}
        </div>
      </div>
    </button>
  );
}

/** Large interactive preview with 2D / 3D toggle for board-related cosmetics. */
export function ItemStage({ item }: { item: Cosmetic }) {
  const eq = useSession((s) => s.me?.equipped);
  const [mode, setMode] = useState<'2d' | '3d'>('2d');
  const boardRelated = item.type === 'pieces' || item.type === 'board' || item.type === 'background';
  if (!boardRelated) {
    return (
      <div className="preview-stage" style={{ aspectRatio: '4 / 3', display: 'grid', placeItems: 'center', background: `radial-gradient(circle at 50% 40%, ${RARITY_COLOR[item.rarity]}22, transparent 70%), #080a0f` }}>
        <div style={{ transform: 'scale(1.6)', width: '60%', display: 'grid', placeItems: 'center' }}>
          <ItemPreview item={item} />
        </div>
      </div>
    );
  }
  const pieceSet = item.type === 'pieces' ? item.id : eq?.pieces;
  const board = item.type === 'board' ? item.id : eq?.board;
  const env = item.type === 'background' ? item.id : eq?.background;
  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="preview-stage" style={{ aspectRatio: mode === '3d' ? '4 / 3' : '1', background: environmentVisual(env ?? 'background.void').css, padding: mode === '2d' ? '6%' : 0 }}>
        <BoardView key={mode} mode={mode} fen={PREVIEW_FEN} orientation="w" movable="both" pieceSet={pieceSet} boardId={board} environmentId={env} compact />
      </div>
      <div className="row center">
        <div className="btn-group">
          <button className={mode === '2d' ? 'on' : ''} onClick={() => setMode('2d')}><Square size={13} /> 2D</button>
          <button className={mode === '3d' ? 'on' : ''} onClick={() => setMode('3d')}><Box size={13} /> 3D</button>
        </div>
      </div>
      <div className="tiny muted" style={{ textAlign: 'center' }}>Try moving pieces in the preview. Cosmetics are personal: opponents see their own setup.</div>
    </div>
  );
}
