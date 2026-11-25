// Minimal Nostr relay (NIP-01, ephemeral broadcast only) for testing P2P matchmaking locally.
// Usage: node scripts/test-relay.mjs [port]   then open the game with ?relay=ws://localhost:PORT
import { WebSocketServer } from 'ws';
const port = Number(process.argv[2] ?? 7777);
const wss = new WebSocketServer({ port });
const subs = new Map(); // ws -> Map<subId, filters[]>
const match = (ev, f) => (!f.kinds || f.kinds.includes(ev.kind)) && (!f['#x'] || ev.tags.some((t) => t[0] === 'x' && f['#x'].includes(t[1])));
wss.on('connection', (ws) => {
  subs.set(ws, new Map());
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg[0] === 'EVENT') {
      const ev = msg[1];
      ws.send(JSON.stringify(['OK', ev.id, true, '']));
      for (const [client, s] of subs) for (const [id, filters] of s) if (filters.some((f) => match(ev, f))) client.send(JSON.stringify(['EVENT', id, ev]));
    } else if (msg[0] === 'REQ') {
      subs.get(ws).set(msg[1], msg.slice(2));
      ws.send(JSON.stringify(['EOSE', msg[1]]));
    } else if (msg[0] === 'CLOSE') subs.get(ws).delete(msg[1]);
  });
  ws.on('close', () => subs.delete(ws));
});
console.log(`test relay on ws://localhost:${port}`);
