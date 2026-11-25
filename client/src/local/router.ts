/** Just enough of Fastify's API for server/src/routes.ts to run in the browser. */
type Handler = (req: any, reply: any) => unknown;
interface Route { method: string; parts: string[]; handler: Handler; pre?: Handler }

const COOKIE_KEY = 'dc.session';
export const getCookie = () => {
  try {
    return localStorage.getItem(COOKIE_KEY) ?? '';
  } catch {
    return '';
  }
};
const setCookieValue = (v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(COOKIE_KEY);
    else localStorage.setItem(COOKIE_KEY, v);
  } catch {
    /* ignore */
  }
};

export class MiniApp {
  routes: Route[] = [];
  hooks: Handler[] = [];
  decorateRequest() {}
  addHook(name: string, fn: Handler) {
    if (name === 'preHandler') this.hooks.push(fn);
  }
  private add(method: string, path: string, a: any, b?: any) {
    const handler = b ?? a;
    const opts = b ? a : {};
    this.routes.push({ method, parts: path.split('/').filter(Boolean), handler, pre: opts?.preHandler });
  }
  get(p: string, a: any, b?: any) { this.add('GET', p, a, b); }
  post(p: string, a: any, b?: any) { this.add('POST', p, a, b); }
  patch(p: string, a: any, b?: any) { this.add('PATCH', p, a, b); }
  delete(p: string, a: any, b?: any) { this.add('DELETE', p, a, b); }

  async inject(method: string, url: string, body?: unknown): Promise<{ status: number; json: any }> {
    const [path, qs] = url.split('?');
    const segs = path.split('/').filter(Boolean).map(decodeURIComponent);
    let route: Route | undefined;
    let params: Record<string, string> = {};
    for (const r of this.routes) {
      if (r.method !== method || r.parts.length !== segs.length) continue;
      const p: Record<string, string> = {};
      if (r.parts.every((part, i) => (part.startsWith(':') ? ((p[part.slice(1)] = segs[i]), true) : part === segs[i]))) {
        route = r;
        params = p;
        break;
      }
    }
    if (!route) return { status: 404, json: { error: 'Not found' } };
    const token = getCookie();
    const req: any = { method, url, body, params, query: Object.fromEntries(new URLSearchParams(qs ?? '')), headers: { 'x-dc-client': '1', 'user-agent': 'browser' }, cookies: token ? { dc_session: token } : {}, userId: null };
    let status = 200;
    let sent: any;
    let done = false;
    const reply: any = {
      code(n: number) { status = n; return reply; },
      send(x: any) { sent = x; done = true; return reply; },
      header() { return reply; },
      setCookie(_n: string, v: string) { setCookieValue(v); return reply; },
      clearCookie() { setCookieValue(null); return reply; },
      type() { return reply; },
    };
    try {
      for (const h of [...this.hooks, ...(route.pre ? [route.pre] : [])]) {
        await h(req, reply);
        if (done) return { status, json: sent };
      }
      const r = await route.handler(req, reply);
      return { status, json: done ? sent : r };
    } catch (e) {
      console.error(e);
      return { status: 500, json: { error: (e as Error).message || 'Error' } };
    }
  }
}
