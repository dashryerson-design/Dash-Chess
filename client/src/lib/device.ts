export interface DeviceProfile {
  tier: 'low' | 'medium' | 'high';
  webgl: boolean;
  cores: number;
  memory: number | null;
  mobile: boolean;
  renderer: string;
}

let cached: DeviceProfile | null = null;

/** Lightweight capability probe used to recommend graphics settings. */
export function detectDevice(): DeviceProfile {
  if (cached) return cached;
  const cores = navigator.hardwareConcurrency || 2;
  const memory = (navigator as any).deviceMemory ?? null;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches;
  let webgl = false;
  let renderer = 'unknown';
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    if (gl) {
      webgl = true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'webgl';
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    webgl = false;
  }
  const software = /swiftshader|llvmpipe|software|basic render/i.test(renderer);
  let score = 0;
  score += cores >= 8 ? 2 : cores >= 4 ? 1 : 0;
  score += memory === null ? 1 : memory >= 8 ? 2 : memory >= 4 ? 1 : 0;
  score += mobile ? -1 : 1;
  if (software || !webgl) score = -5;
  const tier = score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low';
  cached = { tier, webgl, cores, memory, mobile, renderer };
  return cached;
}

export function recommendedGraphics(d: DeviceProfile) {
  if (!d.webgl || d.tier === 'low') return { mode: '2d' as const, quality: 'low' as const, shadows: false };
  if (d.tier === 'medium') return { mode: '3d' as const, quality: 'medium' as const, shadows: !d.mobile };
  return { mode: '3d' as const, quality: 'high' as const, shadows: true };
}
