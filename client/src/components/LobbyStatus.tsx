import { useEffect, useRef, useState } from 'react';
import { Users, WifiOff, Radio } from 'lucide-react';
import { useLobby } from '../lib/lobby';

/** Top-bar chip showing the serverless lobby connection, with a details popover. */
export function LobbyStatus() {
  const l = useLobby();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);
  const state = !l.started ? 'starting' : l.relaysOpen === 0 ? 'offline' : l.players.length ? 'ok' : 'alone';
  const color = state === 'ok' ? 'var(--good)' : state === 'alone' ? 'var(--warn)' : state === 'offline' ? 'var(--bad)' : 'var(--text-2)';
  const label = state === 'ok' ? `${l.players.length + 1} online` : state === 'alone' ? 'Only you online' : state === 'offline' ? 'Lobby offline' : 'Connecting…';
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="chip-stat" style={{ cursor: 'pointer', borderColor: color }} onClick={() => setOpen((o) => !o)} aria-label="Online lobby status">
        {state === 'offline' ? <WifiOff style={{ color }} /> : <Users style={{ color }} />}
        <span className="hide-xs">{label}</span>
      </button>
      {open && (
        <div className="popover" style={{ width: 320 }}>
          <div className="panel-head"><h3 className="panel-title"><Radio /> Online lobby</h3></div>
          <div className="panel-body col" style={{ gap: 8 }}>
            <div className="row between small"><span className="muted">Signal relays connected</span><b>{l.relaysOpen} / {l.relaysTotal}</b></div>
            <div className="row between small"><span className="muted">Direct connections</span><b>{l.peers}</b></div>
            <div className="row between small"><span className="muted">Other players online</span><b>{l.players.length}</b></div>
            {state === 'offline' && <div className="small" style={{ color: 'var(--bad)' }}>Can't reach any relay. Check your internet connection, VPN or ad-blocker, and that your network allows WebSockets.</div>}
            {state === 'alone' && <div className="small muted">Connected and waiting. When your friend opens the site, they appear here within about 10–20 seconds. If they never appear, one of your networks may block direct connections (common on school, work or some mobile networks).</div>}
            {l.players.map((p) => (
              <div key={p.pid} className="row small" style={{ gap: 8 }}>
                <span className={`status-dot ${p.status}`} /> <b className="grow">{p.name}</b> <span className="muted">{p.rating}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
