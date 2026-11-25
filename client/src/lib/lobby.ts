import { useEffect, useState } from 'react';

export const IS_P2P = import.meta.env.VITE_P2P === '1';

export interface LobbyPlayer {
  pid: string;
  name: string;
  icon: string;
  level: number;
  rating: number;
  status: 'online' | 'playing' | 'searching';
}
export interface LobbyInfo {
  started: boolean;
  relaysOpen: number;
  relaysTotal: number;
  players: LobbyPlayer[];
  peers: number;
}

const EMPTY: LobbyInfo = { started: false, relaysOpen: 0, relaysTotal: 0, players: [], peers: 0 };

/** Live view of the peer-to-peer lobby (serverless build only). */
export function useLobby(): LobbyInfo {
  const [info, setInfo] = useState<LobbyInfo>(EMPTY);
  useEffect(() => {
    if (!IS_P2P) return;
    let alive = true;
    const tick = () =>
      import('../local/p2p').then((m) => {
        if (!alive) return;
        const s = m.lobbyStatus();
        setInfo({ ...s, players: m.lobbyPlayers().map((p) => ({ pid: p.pid, name: p.name, icon: p.icon, level: p.level, rating: p.rating, status: p.status })) });
      });
    void tick();
    const t = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return info;
}
