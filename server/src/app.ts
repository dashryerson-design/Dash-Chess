import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fstatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { openDb, type DB } from './db';
import { config } from './config';
import { registerRoutes } from './routes';
import { createRealtime, type Realtime } from './realtime';
import { setAnalysisDb } from './engine/analyzer';
import { closePools } from './engine/uci';
import { loadOpenings } from './openings';

export interface App {
  url: string;
  db: DB;
  rt: Realtime;
  close: () => Promise<void>;
}

export async function createApp(opts: { port?: number; dbPath?: string; logger?: boolean } = {}): Promise<App> {
  const db = openDb(opts.dbPath ?? config.dbPath);
  setAnalysisDb(db);
  loadOpenings();

  const app = Fastify({ logger: opts.logger ?? false, trustProxy: process.env.TRUST_PROXY === '1', bodyLimit: 64 * 1024 });
  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: config.isTest ? 100000 : 600, timeWindow: '1 minute' });

  // Basic security headers
  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'same-origin');
  });

  const rt = createRealtime(app.server, db, { corsOrigin: process.env.CORS_ORIGIN });
  registerRoutes(app, db, rt);

  if (fs.existsSync(config.clientDist)) {
    await app.register(fstatic, { root: config.clientDist, wildcard: false, maxAge: '1h' });
    const index = path.join(config.clientDist, 'index.html');
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/socket.io/')) return reply.code(404).send({ error: 'Not found' });
      return reply.type('text/html').send(fs.readFileSync(index));
    });
    // SPA fallback for client routes
    app.get('/*', (req, reply) => {
      const file = path.join(config.clientDist, req.url.split('?')[0]);
      if (file.startsWith(config.clientDist) && fs.existsSync(file) && fs.statSync(file).isFile()) return reply.sendFile(path.relative(config.clientDist, file));
      return reply.type('text/html').send(fs.readFileSync(index));
    });
  }

  const address = await app.listen({ port: opts.port ?? config.port, host: config.host });
  const port = (app.server.address() as { port: number }).port;
  void address;

  // finish reward processing interrupted by a restart
  void rt.games.resumePending();

  return {
    url: `http://127.0.0.1:${port}`,
    db,
    rt,
    close: async () => {
      rt.close();
      await app.close();
      closePools();
      db.close();
    },
  };
}
