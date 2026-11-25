import { bootLocalServer, localApi, newLocalSocket } from './server';
import { setApiTransport } from '../lib/api';
import { setSocketFactory } from '../lib/socket';
import { createRouterSocket, apiOverride } from './p2p';

export async function bootP2P() {
  await bootLocalServer();
  setApiTransport(async (m, u, b) => (await apiOverride(m, u, b)) ?? localApi(m, u, b));
  setSocketFactory(() => createRouterSocket(newLocalSocket()) as any);
}
