/**
 * In-page replacement for socket.io's Server, plus client sockets.
 * A "connection" is a pair of callbacks, so the same server can serve the local UI and remote
 * peers whose traffic arrives over WebRTC.
 */
type Handler = (...a: any[]) => void;

let sidSeq = 0;

export class ServerSocket {
  id = `s${++sidSeq}`;
  data: any = {};
  rooms = new Set<string>();
  handlers = new Map<string, Handler[]>();
  connected = true;
  constructor(private server: Server, public handshake: { headers: Record<string, string>; address: string; auth: Record<string, unknown> }, private deliver: (ev: string, payload: unknown) => void) {}
  on(ev: string, fn: Handler) {
    if (!this.handlers.has(ev)) this.handlers.set(ev, []);
    this.handlers.get(ev)!.push(fn);
    return this;
  }
  emit(ev: string, payload?: unknown) {
    if (this.connected) this.deliver(ev, payload);
    return true;
  }
  join(room: string) {
    this.rooms.add(room);
    const r = this.server.sockets.adapter.rooms;
    if (!r.has(room)) r.set(room, new Set());
    r.get(room)!.add(this.id);
  }
  leave(room: string) {
    this.rooms.delete(room);
    const set = this.server.sockets.adapter.rooms.get(room);
    set?.delete(this.id);
    if (set && !set.size) this.server.sockets.adapter.rooms.delete(room);
  }
  /** called by the transport when the client emits */
  receive(ev: string, payload: unknown, ack?: (r: unknown) => void) {
    for (const h of this.handlers.get(ev) ?? []) h(payload, ack);
  }
  disconnect() {
    if (!this.connected) return;
    this.connected = false;
    for (const r of [...this.rooms]) this.leave(r);
    this.server.sockets.sockets.delete(this.id);
    for (const h of this.handlers.get('disconnect') ?? []) h('client namespace disconnect');
  }
}

export class Server {
  private mws: ((s: ServerSocket, next: (err?: Error) => void) => void)[] = [];
  private onConn: ((s: ServerSocket) => void)[] = [];
  sockets = { adapter: { rooms: new Map<string, Set<string>>() }, sockets: new Map<string, ServerSocket>() };
  constructor(_http?: unknown, _opts?: unknown) {}
  use(fn: (s: ServerSocket, next: (err?: Error) => void) => void) {
    this.mws.push(fn);
  }
  on(ev: string, fn: (s: ServerSocket) => void) {
    if (ev === 'connection') this.onConn.push(fn);
  }
  to(room: string) {
    return {
      emit: (ev: string, payload?: unknown) => {
        for (const sid of this.sockets.adapter.rooms.get(room) ?? []) this.sockets.sockets.get(sid)?.emit(ev, payload);
      },
    };
  }
  close() {
    for (const s of [...this.sockets.sockets.values()]) s.disconnect();
  }
  /** Opens a connection. Returns the server-side socket, or an Error if middleware rejected it. */
  connect(handshake: ServerSocket['handshake'], deliver: (ev: string, payload: unknown) => void): ServerSocket | Error {
    const s = new ServerSocket(this, handshake, deliver);
    let err: Error | undefined;
    for (const mw of this.mws) {
      mw(s, (e) => (err = e));
      if (err) return err;
    }
    this.sockets.sockets.set(s.id, s);
    for (const f of this.onConn) f(s);
    return s;
  }
}

/** Client-side socket with the socket.io-client surface the UI uses. */
export class ClientSocket {
  private handlers = new Map<string, Set<Handler>>();
  connected = false;
  id = '';
  constructor(private opener: (deliver: (ev: string, payload: unknown) => void) => { send: (ev: string, payload: unknown, ack?: (r: unknown) => void) => void; close: () => void } | Error) {
    setTimeout(() => this.connect(), 0);
  }
  private conn: ReturnType<ClientSocket['opener']> | null = null;
  on(ev: string, fn: Handler) {
    if (!this.handlers.has(ev)) this.handlers.set(ev, new Set());
    this.handlers.get(ev)!.add(fn);
    return this;
  }
  off(ev: string, fn?: Handler) {
    if (fn) this.handlers.get(ev)?.delete(fn);
    else this.handlers.delete(ev);
    return this;
  }
  once(ev: string, fn: Handler) {
    const w = (...a: any[]) => {
      this.off(ev, w);
      fn(...a);
    };
    return this.on(ev, w);
  }
  fire(ev: string, ...a: unknown[]) {
    for (const h of [...(this.handlers.get(ev) ?? [])]) h(...a);
  }
  emit(ev: string, payload?: unknown, ack?: (r: unknown) => void) {
    if (!this.connected || !this.conn || this.conn instanceof Error) {
      ack?.({ ok: false, error: 'Not connected.' });
      return this;
    }
    const copy = payload === undefined ? undefined : JSON.parse(JSON.stringify(payload));
    this.conn.send(ev, copy, ack ? (r) => setTimeout(() => ack(r), 0) : undefined);
    return this;
  }
  connect() {
    if (this.connected) return this;
    this.conn = this.opener((ev, payload) => setTimeout(() => this.fire(ev, payload === undefined ? undefined : JSON.parse(JSON.stringify(payload))), 0));
    if (this.conn instanceof Error) {
      this.fire('connect_error', this.conn);
      return this;
    }
    this.connected = true;
    this.id = `c${++sidSeq}`;
    this.fire('connect');
    return this;
  }
  disconnect() {
    if (!this.connected) return this;
    this.connected = false;
    if (this.conn && !(this.conn instanceof Error)) this.conn.close();
    this.conn = null;
    this.fire('disconnect', 'io client disconnect');
    return this;
  }
  /** transport closed from the other side */
  lost() {
    if (!this.connected) return;
    this.connected = false;
    this.conn = null;
    this.fire('disconnect', 'transport close');
  }
}

export function localSocket(io: Server, cookie: () => string) {
  return new ClientSocket((deliver) => {
    const s = io.connect({ headers: { cookie: cookie() }, address: 'local', auth: {} }, deliver);
    if (s instanceof Error) return s;
    return { send: (ev, p, ack) => setTimeout(() => s.receive(ev, p, ack), 0), close: () => s.disconnect() };
  });
}
