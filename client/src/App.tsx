import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSession } from './stores/session';
import { onSettingsSync, useSettings } from './stores/settings';
import { Shell, BrandMark } from './components/Shell';
import { Toasts } from './components/ui';
import { api } from './lib/api';
import { unlockAudio, configureSound } from './lib/sound';

const Auth = lazy(() => import('./screens/Auth'));
const Hub = lazy(() => import('./screens/Hub'));
const Play = lazy(() => import('./screens/Play'));
const Bots = lazy(() => import('./screens/Bots'));
const Game = lazy(() => import('./screens/Game'));
const LocalGame = lazy(() => import('./screens/LocalGame'));
const Analysis = lazy(() => import('./screens/Analysis'));
const Rankings = lazy(() => import('./screens/Rankings'));
const Leaderboards = lazy(() => import('./screens/Leaderboards'));
const Customise = lazy(() => import('./screens/Customise'));
const Shop = lazy(() => import('./screens/Shop'));
const Profile = lazy(() => import('./screens/Profile'));
const Friends = lazy(() => import('./screens/Friends'));
const History = lazy(() => import('./screens/History'));
const SettingsScreen = lazy(() => import('./screens/Settings'));
const Progression = lazy(() => import('./screens/Progression'));
const Puzzles = lazy(() => import('./screens/Puzzles'));
const Training = lazy(() => import('./screens/Training'));
const Explorer = lazy(() => import('./screens/Explorer'));
const Watch = lazy(() => import('./screens/Watch'));

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
      <Suspense fallback={<PageFallback />}>
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
      </Suspense>
      <Toasts />
    </Shell>
  );
}
