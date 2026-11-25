export function fmtClock(ms: number): string {
  ms = Math.max(0, ms);
  if (ms < 10_000) {
    const s = Math.floor(ms / 1000);
    const t = Math.floor((ms % 1000) / 100);
    return `0:0${s}.${t}`;
  }
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function timeAgo(t: number): string {
  const d = (Date.now() - t) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)}d ago`;
  return new Date(t).toLocaleDateString();
}

export function fmtDate(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtNum(n: number): string {
  return n.toLocaleString();
}

export function fmtEval(cp: number): string {
  if (Math.abs(cp) >= 9000) {
    const mate = Math.round((10000 - Math.abs(cp)) / 10);
    return `${cp > 0 ? '' : '-'}M${Math.max(1, mate)}`;
  }
  const v = cp / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

export function plural(n: number, w: string) {
  return `${n} ${w}${n === 1 ? '' : 's'}`;
}
