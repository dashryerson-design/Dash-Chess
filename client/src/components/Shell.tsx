import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Swords, Bot, Trophy, BarChart3, Palette, ShoppingBag, User, Users, Settings, History, Bell, Puzzle, BookOpen, GraduationCap, Eye, Star, Menu, X, LogOut, Wifi, WifiOff, Play,
} from 'lucide-react';
import { divisionFor, levelFromXp } from '@dc/shared';
import { useSession } from '../stores/session';
import { PlayerIcon } from '../cosmetics/icons';
import { Division, Points, Progress } from './ui';
import { timeAgo } from '../lib/format';
import { api } from '../lib/api';
import { useRealtime } from '../lib/realtime';
import { IS_P2P } from '../lib/lobby';
import { LobbyStatus } from './LobbyStatus';
import { emit } from '../lib/socket';

const NAV: { to: string; label: string; icon: ReactNode; section?: string }[] = [
  { to: '/', label: 'Home', icon: <Home /> },
  { to: '/play', label: 'Play Online', icon: <Swords /> },
  { to: '/bots', label: 'Play Bots', icon: <Bot /> },
  { to: '/rankings', label: 'DC Rankings', icon: <Trophy />, section: 'Compete' },
  { to: '/leaderboards', label: 'Leaderboards', icon: <BarChart3 /> },
  { to: '/watch', label: 'Watch Live', icon: <Eye /> },
  { to: '/puzzles', label: 'Puzzles', icon: <Puzzle />, section: 'Improve' },
  { to: '/training', label: 'Training', icon: <GraduationCap /> },
  { to: '/explorer', label: 'Opening Explorer', icon: <BookOpen /> },
  { to: '/history', label: 'Match History', icon: <History /> },
  { to: '/customise', label: 'Customisation', icon: <Palette />, section: 'You' },
  { to: '/shop', label: 'Shop', icon: <ShoppingBag /> },
  { to: '/progression', label: 'Progression', icon: <Star /> },
  { to: '/friends', label: 'Friends & Party', icon: <Users /> },
  { to: '/profile', label: 'Profile', icon: <User /> },
  { to: '/settings', label: 'Settings', icon: <Settings /> },
];

const TITLES: Record<string, string> = {
  '': 'Home', play: 'Play Online', bots: 'Play Bots', rankings: 'DC Rankings', leaderboards: 'Leaderboards', watch: 'Watch Live', puzzles: 'Puzzles',
  training: 'Training', explorer: 'Opening Explorer', history: 'Match History', customise: 'Customisation', shop: 'Shop', progression: 'Progression',
  friends: 'Friends & Party', profile: 'Profile', settings: 'Settings', game: 'Match', analysis: 'Game Review', local: 'Local Match',
};

export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="bm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="12" fill="#0d0f14" stroke="url(#bm)" strokeWidth="2" />
      <path d="M14 47h36v5H14zM19 43l4-23 9 9 9-9 4 23z" fill="url(#bm)" />
      <circle cx="23" cy="17" r="3.2" fill="var(--accent-2)" />
      <circle cx="41" cy="17" r="3.2" fill="var(--accent)" />
      <circle cx="32" cy="24" r="3.2" fill="#6b6cff" />
    </svg>
  );
}

function Notifications() {
  const { notifications, unread, loadNotifications, patch } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);
  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      await loadNotifications();
      if (useSession.getState().unread) {
        await api.post('/api/notifications/read').catch(() => {});
        patch({ unread: 0 });
      }
    }
  };
  const describe = (n: (typeof notifications)[number]): { text: string; to?: string } => {
    const p = n.payload as any;
    switch (n.type) {
      case 'friend_request': return { text: `${p.from} sent you a friend request`, to: '/friends' };
      case 'friend_accepted': return { text: `${p.from} accepted your friend request`, to: '/friends' };
      case 'party_invite': return { text: `${p.from} invited you to a party (code ${p.code})`, to: '/friends' };
      case 'achievement': return { text: `Achievement unlocked: ${p.name}`, to: '/progression' };
      case 'level_up': return { text: `You reached level ${p.level}${p.points ? ` (+${p.points} DC Points)` : ''}`, to: '/progression' };
      case 'season_reward': return { text: `${p.label}: finished ${p.division}, +${p.points} DC Points`, to: '/rankings' };
      default: return { text: String(p.message ?? 'Notification') };
    }
  };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn" aria-label="Notifications" onClick={toggle}>
        <Bell />
        {unread > 0 && <span className="dot" />}
      </button>
      {open && (
        <div className="popover">
          <div className="panel-head">
            <h3 className="panel-title">Notifications</h3>
          </div>
          {notifications.length === 0 ? (
            <div className="empty"><Bell /><div className="t">You're all caught up</div></div>
          ) : (
            <div className="list">
              {notifications.map((n) => {
                const d = describe(n);
                return (
                  <div key={n.id} className="list-item click" onClick={() => { if (d.to) navigate(d.to); setOpen(false); }}>
                    <div className="grow">
                      <div className="small" style={{ fontWeight: n.read ? 500 : 700 }}>{d.text}</div>
                      <div className="tiny muted">{timeAgo(n.createdAt)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={{ placeItems: 'end stretch', padding: 0 }}>
      <div className="modal" style={{ width: '100%', borderRadius: '14px 14px 0 0', maxHeight: '80vh' }}>
        <div className="modal-head">
          <h2 className="modal-title">Menu</h2>
          <button className="icon-btn sm" onClick={onClose}><X /></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className="nav-item" onClick={onClose}>
              {n.icon}
              {n.label}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  useRealtime();
  const { me, ratings, connected, unread, friends, queue, activeGameId, logout } = useSession();
  const loc = useLocation();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const seg = loc.pathname.split('/')[1] ?? '';
  const title = TITLES[seg] ?? 'DC Chess';
  const inGame = seg === 'game' || seg === 'local';
  if (!me) return null;
  const lvl = levelFromXp(me.xp);
  const online = friends.friends.filter((f) => f.status !== 'offline').length;
  const provisional = ratings ? Object.values(ratings).every((r) => r.games === 0) : true;

  return (
    <div className="app">
      <div className="app-bg" />
      <aside className="sidebar">
        <Link to="/" className="brand">
          <BrandMark />
          <div>
            <div className="brand-name">DC CHESS</div>
            <div className="brand-sub">DASH CHESS</div>
          </div>
        </Link>
        <button className="nav-play" onClick={() => navigate(activeGameId ? `/game/${activeGameId}` : '/play')}>
          <Play size={16} /> {activeGameId ? 'RESUME MATCH' : 'PLAY'}
        </button>
        {NAV.map((n) => (
          <div key={n.to}>
            {n.section && <div className="nav-label">{n.section}</div>}
            <NavLink to={n.to} end={n.to === '/'} className="nav-item">
              {n.icon}
              {n.label}
              {n.to === '/friends' && online > 0 && <span className="nav-badge">{online}</span>}
            </NavLink>
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <button className="nav-item" style={{ background: 'none', border: 0, cursor: 'pointer', marginTop: 12 }} onClick={() => void logout()}>
          <LogOut /> Log out
        </button>
      </aside>

      <header className="topbar">
        <button className="icon-btn show-mobile" aria-label="Menu" onClick={() => setMenu(true)}>
          <Menu />
        </button>
        <div className="topbar-title hide-mobile">{title}</div>
        {queue.searching && (
          <button className="chip-stat" onClick={() => navigate('/play')} style={{ borderColor: 'rgba(255,178,46,0.5)', cursor: 'pointer' }}>
            <span className="status-dot searching" /> Searching…
          </button>
        )}
        <div style={{ flex: 1 }} />
        {IS_P2P ? (
          <LobbyStatus />
        ) : (
          <span className="chip-stat hide-xs" title={connected ? 'Connected' : 'Reconnecting…'}>
            {connected ? <Wifi style={{ color: 'var(--good)' }} /> : <WifiOff style={{ color: 'var(--bad)' }} />}
          </span>
        )}
        <Link to="/rankings" className="chip-stat hide-mobile" title="Overall DC Rating">
          <Division rating={me.rating} size={20} provisional={provisional} />
          <span className="mono">{me.rating}</span>
        </Link>
        <Link to="/shop" className="chip-stat" title="DC Points">
          <Points value={me.points} />
        </Link>
        <Notifications />
        <Link to="/profile" className="player-chip" aria-label="Your profile">
          <PlayerIcon id={me.equipped.icon} size={34} />
          <div className="hide-xs" style={{ minWidth: 110 }}>
            <div className="row between" style={{ gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: '0.88rem' }} className="ellipsis">{me.username}</span>
              <span className="tiny" style={{ color: 'var(--accent)', fontWeight: 700 }}>LV {lvl.level}</span>
            </div>
            <Progress value={lvl.progress} className="thin" />
            <div className="tiny muted mono" style={{ marginTop: 2 }}>{lvl.xpIntoLevel} / {lvl.xpForNext} XP</div>
          </div>
        </Link>
      </header>

      <main className="main" id="main">{children}</main>

      {!inGame && (
        <nav className="mobile-nav">
          <NavLink to="/" end><Home />Home</NavLink>
          <NavLink to="/play"><Swords />Play</NavLink>
          <NavLink to="/bots"><Bot />Bots</NavLink>
          <NavLink to="/friends"><Users />Social{unread > 0 ? '' : ''}</NavLink>
          <button onClick={() => setMenu(true)}><Menu />More</button>
        </nav>
      )}
      <MobileMenu open={menu} onClose={() => setMenu(false)} />
    </div>
  );
}

export function useDivisionName(rating: number) {
  return divisionFor(rating).name;
}
