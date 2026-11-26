import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSession } from './stores/session';
import { onSettingsSync, useSettings } from './stores/settings';
import { Shell, BrandMark } from './components/Shell';
import { Toasts } from './components/ui';
import { api } from './lib/api';
import { unlockAudio, configureSound } from './lib/sound';

const load_Auth = () => import('./screens/Auth');
const load_Hub = () => import('./screens/Hub');
const load_Play = () => import('./screens/Play');
const load_Bots = () => import('./screens/Bots');
const load_Game = () => import('./screens/Game');
const load_LocalGame = () => import('./screens/LocalGame');
const load_Analysis = () => import('./screens/Analysis');
const load_Rankings = () => import('./screens/Rankings');
const load_Leaderboards = () => import('./screens/Leaderboards');
const load_Customise = () => import('./screens/Customise');
const load_Shop = () => import('./screens/Shop');
const load_Profile = () => import('./screens/Profile');
const load_Friends = () => import('./screens/Friends');
const load_History = () => import('./screens/History');
const load_SettingsScreen = () => import('./screens/Settings');
const load_Progression = () => import('./screens/Progression');
const load_Puzzles = () => import('./screens/Puzzles');
const load_Training = () => import('./screens/Training');
const load_Explorer = () => import('./screens/Explorer');
const load_Watch = () => import('./screens/Watch');
/** All screens, fetched in the background after start-up so later navigation never waits on (or fails at) the network. */
const ALL_SCREENS = [load_Auth, load_Hub, load_Play, load_Bots, load_Game, load_LocalGame, load_Analysis, load_Rankings, load_Leaderboards, load_Customise, load_Shop, load_Profile, load_Friends, load_History, load_SettingsScreen, load_Progression, load_Puzzles, load_Training, load_Explorer, load_Watch];
const Auth = lazy(load_Auth);
const Hub = lazy(load_Hub);
const Play = lazy(load_Play);
const Bots = lazy(load_Bots);
const Game = lazy(load_Game);
const LocalGame = lazy(load_LocalGame);
const Analysis = lazy(load_Analysis);
const Rankings = lazy(load_Rankings);
const Leaderboards = lazy(load_Leaderboards);
const Customise = lazy(load_Customise);
const Shop = lazy(load_Shop);
const Profile = lazy(load_Profile);
const Friends = lazy(load_Friends);
const History = lazy(load_History);
const SettingsScreen = lazy(load_SettingsScreen);
const Progression = lazy(load_Progression);
const Puzzles = lazy(load_Puzzles);
const Training = lazy(load_Training);
const Explorer = lazy(load_Explorer);
const Watch = lazy(load_Watch);

import { loadBoard3D } from './board/BoardView';

export function LoadingScreen({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="loading-screen">
      <div className="loading-inner">
        <BrandMark size={56} />
        <div className="display upper small muted" style={{ letterSpacing: '0.3em' }}>{label}</div>
        <div className="loading-bar"><i /></div>
      </div>
    </div>
  );
}

/** Recovers from a screen that failed to load (e.g. the site was updated while the tab was open). */
class ScreenBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }
  componentDidCatch(err: unknown) {
    const chunk = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(String((err as Error)?.message ?? err));
    // a new version was deployed: reload once to pick it up (guarded so it can never loop)
    if (chunk && sessionStorage.getItem('dc.chunkReload') !== '1') {
      sessionStorage.setItem('dc.chunkReload', '1');
      location.reload();
    }
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', textAlign: 'center' }}>
        <div>
          <h2 className="display">Something went wrong</h2>
          <p className="muted">This screen couldn't load.</p>
          <button className="btn btn-primary" onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}

function PageFallback() {
  return (
    <div className="page">
      <div className="skeleton" style={{ height: 34, width: 260, marginBottom: 20 }} />
      <div className="skeleton" style={{ height: 220 }} />
    </div>
  );
}

export function App() {
  const { status, me, load } = useSession();
  const loc = useLocation();

  useEffect(() => {
    void load();
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    onSettingsSync((s) => {
      if (useSession.getState().status === 'ready') void api.patch('/api/me/settings', { settings: s }).catch(() => {});
    });
  }, [load]);

  // pull synced settings once after login
  useEffect(() => {
    if (status === 'ready' && me && me.settings && Object.keys(me.settings).length) useSettings.getState().replace(me.settings as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, me?.id]);

  // equipped UI theme + sound pack
  useEffect(() => {
    document.documentElement.dataset.theme = me?.equipped.theme ? me.equipped.theme.split('.')[1] : 'electric';
    if (me) configureSound({}, me.equipped.sound);
  }, [me?.equipped.theme, me?.equipped.sound, me]);

  // warm every screen once signed in, so navigating (e.g. Home after a match) is instant and update-proof
  useEffect(() => {
    if (status !== 'ready') return;
    sessionStorage.removeItem('dc.chunkReload');
    const idle = (window as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 300));
    idle(() => [...ALL_SCREENS, loadBoard3D].forEach((l) => void (l as () => Promise<unknown>)().catch(() => {})));
  }, [status]);

  if (status === 'loading') return <LoadingScreen />;

  if (status === 'guest') {
    // shared replays are viewable without an account
    if (loc.pathname.startsWith('/analysis/'))
      return (
        <Suspense fallback={<LoadingScreen />}>
          <div className="main" style={{ height: '100%' }}>
            <Routes>
              <Route path="/analysis/:id" element={<Analysis />} />
            </Routes>
          </div>
          <Toasts />
        </Suspense>
      );
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Auth />
        <Toasts />
      </Suspense>
    );
  }

  return (
    <Shell>
      <ScreenBoundary resetKey={loc.pathname}>
      <Suspense fallback={<PageFallback />}>
        <div key={loc.pathname.split('/')[1] || 'home'} className="route-fade">
        <Routes>
          <Route path="/" element={<Hub />} />
          <Route path="/play" element={<Play />} />
          <Route path="/bots" element={<Bots />} />
          <Route path="/game/:id" element={<Game />} />
          <Route path="/local" element={<LocalGame />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/analysis/:id" element={<Analysis />} />
          <Route path="/rankings" element={<Rankings />} />
          <Route path="/leaderboards" element={<Leaderboards />} />
          <Route path="/customise" element={<Customise />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/:name" element={<Profile />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/progression" element={<Progression />} />
          <Route path="/puzzles" element={<Puzzles />} />
          <Route path="/training" element={<Training />} />
          <Route path="/explorer" element={<Explorer />} />
          <Route path="/watch" element={<Watch />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </div>
      </Suspense>
      </ScreenBoundary>
      <Toasts />
    </Shell>
  );
}
