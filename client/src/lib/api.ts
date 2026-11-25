/** Small fetch wrapper. All state-changing calls carry the client header required by the server's CSRF guard. */
export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

type Transport = (method: string, url: string, body?: unknown) => Promise<{ status: number; json: any }>;
let transport: Transport | null = null;
/** In the serverless (P2P) build, API calls are served by the in-page server. */
export function setApiTransport(t: Transport) {
  transport = t;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  if (transport) {
    const r = await transport(method, url, body);
    if (r.status >= 400) throw new ApiError(r.json?.error ?? `Request failed (${r.status})`, r.status);
    return r.json as T;
  }
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'content-type': 'application/json', 'x-dc-client': '1' } : { 'x-dc-client': '1' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  if (!res.ok) throw new ApiError(data?.error ?? data?.message ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

export const api = {
  get: <T = any>(url: string) => request<T>('GET', url),
  post: <T = any>(url: string, body: unknown = {}) => request<T>('POST', url, body),
  patch: <T = any>(url: string, body: unknown = {}) => request<T>('PATCH', url, body),
  del: <T = any>(url: string) => request<T>('DELETE', url),
};
