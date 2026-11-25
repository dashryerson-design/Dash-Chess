import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ withCredentials: true, transports: ['websocket', 'polling'], reconnectionDelay: 500, reconnectionDelayMax: 4000 });
  }
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}

export interface AckResult {
  ok: boolean;
  error?: string;
  [k: string]: any;
}

/** Emit with acknowledgement + timeout. */
export function emit<T extends AckResult = AckResult>(event: string, payload: unknown = {}, timeout = 12000): Promise<T> {
  const s = getSocket();
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) resolve({ ok: false, error: s.connected ? 'The server did not respond.' : 'Not connected to the server.' } as T);
    }, timeout);
    s.emit(event, payload, (res: T) => {
      done = true;
      clearTimeout(t);
      resolve(res ?? ({ ok: false, error: 'No response' } as T));
    });
  });
}
