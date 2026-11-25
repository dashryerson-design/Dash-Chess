import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, AlertTriangle, Info, Gift, Coins } from 'lucide-react';
import { CLASS_META, RARITY_COLOR, divisionFor, type MoveClass, type Rarity } from '@dc/shared';
import { useToasts } from '../stores/toasts';
import { PlayerIcon } from '../cosmetics/icons';
import { cardCss } from '../cosmetics/environments';

export function Modal({ open, onClose, title, children, footer, wide, closable = true }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean; closable?: boolean }) {
  useEffect(() => {
    if (!open || !closable) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose, closable]);
  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={(e) => closable && e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        {(title || closable) && (
          <div className="modal-head">
            <h2 className="modal-title">{title}</h2>
            {closable && (
              <button className="icon-btn sm" aria-label="Close" onClick={onClose}>
                <X />
              </button>
            )}
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Confirm({ open, title, body, confirmLabel = 'Confirm', danger, onConfirm, onCancel }: { open: boolean; title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </>
      }
    >
      {body && <div className="dim">{body}</div>}
    </Modal>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode; icon?: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={`tab ${value === t.id ? 'on' : ''}`} onClick={() => onChange(t.id)}>
          {t.icon}
          {t.label}
          {t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Seg<T extends string | number>({ options, value, onChange }: { options: { value: T; label: ReactNode; disabled?: boolean }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={String(o.value)} className={value === o.value ? 'on' : ''} disabled={o.disabled} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="switch" aria-label={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

export function Progress({ value, className = '', color }: { value: number; className?: string; color?: string }) {
  return (
    <div className={`progress ${className}`}>
      <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
    </div>
  );
}

export function Spinner({ lg }: { lg?: boolean }) {
  return <div className={`spinner ${lg ? 'lg' : ''}`} />;
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <div className="t">{title}</div>
      {children && <div className="small">{children}</div>}
    </div>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <div className="empty">
      <Spinner />
      {label && <div className="small">{label}</div>}
    </div>
  );
}

export function RarityTag({ rarity }: { rarity: Rarity }) {
  return (
    <span className="rarity" style={{ color: RARITY_COLOR[rarity] }}>
      {rarity}
    </span>
  );
}

/** Angular emblem coloured by tier. */
export function DivisionEmblem({ rating, size = 28 }: { rating: number; size?: number }) {
  const d = divisionFor(rating);
  const pips = d.sub === 'I' ? 3 : d.sub === 'II' ? 2 : d.sub === 'III' ? 1 : 0;
  const id = `de${d.tier.id}${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-label={d.name}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={d.tier.glow} />
          <stop offset="1" stopColor={d.tier.color} stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <path d="M20 2 L35 10 L35 26 L20 38 L5 26 L5 10 Z" fill={`url(#${id})`} stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" />
      <path d="M20 8 L29 13 L29 24 L20 31 L11 24 L11 13 Z" fill="rgba(0,0,0,0.32)" />
      {d.tier.id === 'elite' || d.tier.id === 'grandmaster' || d.tier.id === 'master' ? (
        <path d="M13 22 L15 14 L18 18 L20 12 L22 18 L25 14 L27 22 Z" fill={d.tier.glow} />
      ) : (
        Array.from({ length: pips }, (_, i) => <rect key={i} x={12 + i * 6} y={18} width={4} height={4} transform={`rotate(45 ${14 + i * 6} 20)`} fill={d.tier.glow} />)
      )}
    </svg>
  );
}

export function Division({ rating, size = 22, showRating = false, provisional }: { rating: number; size?: number; showRating?: boolean; provisional?: boolean }) {
  const d = divisionFor(rating);
  return (
    <span className="division" style={{ color: d.tier.glow }}>
      <DivisionEmblem rating={rating} size={size} />
      <span>{provisional ? 'Placement' : d.name}</span>
      {showRating && <span className="mono" style={{ color: 'var(--text-0)' }}>{rating}</span>}
    </span>
  );
}

export function CallingCard({ card, icon, name, sub, right, height = 64, iconSize = 44 }: { card: string; icon: string; name: ReactNode; sub?: ReactNode; right?: ReactNode; height?: number; iconSize?: number }) {
  return (
    <div className="calling-card" style={{ minHeight: height }}>
      <div className="cc-bg" style={{ background: cardCss(card) }} />
      <div className="cc-shade" />
      <div className="cc-content" style={{ minHeight: height }}>
        <PlayerIcon id={icon} size={iconSize} />
        <div className="grow">
          <div style={{ fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }} className="ellipsis">
            {name}
          </div>
          {sub && <div className="small" style={{ color: 'rgba(255,255,255,0.8)', textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>{sub}</div>}
        </div>
        {right}
      </div>
    </div>
  );
}

export function ClassDot({ cls, size = 15 }: { cls: MoveClass; size?: number }) {
  const m = CLASS_META[cls];
  const glyph = cls === 'incredible' ? '!!' : cls === 'great' ? '!' : cls === 'blunder' ? '??' : cls === 'bad' ? '?' : cls === 'okay' ? '?!' : cls === 'good' ? '✓' : '•';
  return (
    <span className="cls-dot" title={m.label} style={{ background: m.color, width: size, height: size, fontSize: size * 0.42 }}>
      {glyph}
    </span>
  );
}

export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return createPortal(
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)}>
          <div className="ti">{t.kind === 'error' ? <AlertTriangle /> : t.kind === 'success' ? <Check /> : t.kind === 'reward' ? <Gift /> : <Info />}</div>
          <div className="grow">
            <div className="tt">{t.title}</div>
            {t.body && <div className="tb">{t.body}</div>}
            {t.action && (
              <button
                className="btn btn-sm btn-primary"
                style={{ marginTop: 8 }}
                onClick={(e) => {
                  e.stopPropagation();
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}

export function Points({ value, size = 15 }: { value: number; size?: number }) {
  return (
    <span className="row" style={{ gap: 5, display: 'inline-flex' }}>
      <Coins style={{ width: size, height: size, color: 'var(--gold)' }} />
      <span className="mono" style={{ fontWeight: 700 }}>{value.toLocaleString()}</span>
    </span>
  );
}

/** Minimal responsive line chart (SVG). */
export function LineChart({ points, height = 160, color = 'var(--accent)', yLabel, fill = true, minSpan = 50 }: { points: { x: number; y: number; label?: string }[]; height?: number; color?: string; yLabel?: (v: number) => string; fill?: boolean; minSpan?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <Empty title="Not enough data yet">Play a few more games to see this chart.</Empty>;
  const W = 600;
  const H = height;
  const pad = { l: 38, r: 10, t: 10, b: 18 };
  let min = Math.min(...points.map((p) => p.y));
  let max = Math.max(...points.map((p) => p.y));
  if (max - min < minSpan) {
    const mid = (max + min) / 2;
    min = mid - minSpan / 2;
    max = mid + minSpan / 2;
  }
  const xs = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const ys = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(p.y).toFixed(1)}`).join(' ');
  const ticks = [min, (min + max) / 2, max];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }} onMouseLeave={() => setHover(null)}>
      <defs>
        <linearGradient id="lcfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={pad.l} x2={W - pad.r} y1={ys(t)} y2={ys(t)} stroke="var(--line)" strokeDasharray="3 4" />
          <text x={pad.l - 6} y={ys(t) + 3} textAnchor="end">
            {yLabel ? yLabel(t) : Math.round(t)}
          </text>
        </g>
      ))}
      {fill && <path d={`${d} L${xs(points.length - 1)},${H - pad.b} L${xs(0)},${H - pad.b} Z`} fill="url(#lcfill)" />}
      <path d={d} fill="none" stroke={color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {points.map((p, i) => (
        <rect key={i} x={xs(i) - (W / points.length) / 2} y={0} width={W / points.length} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
      ))}
      {hover !== null && (
        <g>
          <line x1={xs(hover)} x2={xs(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--line-2)" />
          <circle cx={xs(hover)} cy={ys(points[hover].y)} r="4" fill={color} />
          <text x={Math.min(W - 60, xs(hover) + 6)} y={ys(points[hover].y) - 8} style={{ fill: 'var(--text-0)', fontWeight: 700 }}>
            {points[hover].label ?? Math.round(points[hover].y)}
          </text>
        </g>
      )}
    </svg>
  );
}

/** Horizontal stacked distribution of move classes. */
export function ClassBars({ counts }: { counts: Record<MoveClass, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="col" style={{ gap: 7 }}>
      {(Object.keys(CLASS_META) as MoveClass[]).map((c) => (
        <div key={c} className="row" style={{ gap: 10 }}>
          <ClassDot cls={c} />
          <span className="small" style={{ width: 78 }}>{CLASS_META[c].label}</span>
          <div className="progress grow">
            <i style={{ width: `${(counts[c] / total) * 100}%`, background: CLASS_META[c].color }} />
          </div>
          <span className="mono small" style={{ width: 40, textAlign: 'right' }}>{counts[c]}</span>
        </div>
      ))}
    </div>
  );
}

export function Stat({ k, v, sub }: { k: string; v: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
      {sub && <span className="tiny muted">{sub}</span>}
    </div>
  );
}
