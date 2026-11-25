import { squareXY, type Side } from './types';
import { pieceUrl } from '../cosmetics/pieces';

export function PromotionPicker({ color, square, orientation, pieceSet, onPick }: { color: Side; square: string; orientation: Side; pieceSet: string; onPick: (p: string | null) => void }) {
  const [x, y] = squareXY(square, orientation);
  const down = y === 0; // picker extends downward from the top edge
  const pieces = ['q', 'n', 'r', 'b'] as const;
  return (
    <div className="promo-veil" onPointerDown={(e) => { e.stopPropagation(); onPick(null); }} onPointerUp={(e) => e.stopPropagation()}>
      <div
        className="promo"
        style={{ left: `${x * 12.5}%`, top: down ? 0 : undefined, bottom: down ? undefined : 0 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {(down ? pieces : [...pieces].reverse()).map((p) => (
          <button key={p} aria-label={`Promote to ${p}`} onClick={() => onPick(p)} style={{ backgroundImage: `url("${pieceUrl(pieceSet, color, p)}")` }} />
        ))}
      </div>
    </div>
  );
}
