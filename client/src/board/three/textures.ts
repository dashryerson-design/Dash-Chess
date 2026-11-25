import * as THREE from 'three';

function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, oct = 4) {
  let v = 0;
  let a = 0.5;
  for (let i = 0; i < oct; i++) {
    v += a * noise(x, y);
    x *= 2;
    y *= 2;
    a *= 0.5;
  }
  return v;
}

const cache = new Map<string, THREE.CanvasTexture>();

/** Procedural wood / marble / sand textures, generated once and cached. */
export function makeNoiseTexture(kind: 'wood' | 'marble' | 'sand', base: string, vein: string, size = 256, pieces = false): THREE.CanvasTexture {
  const key = `${kind}|${base}|${vein}|${size}|${pieces}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const b = new THREE.Color(base);
  const vn = new THREE.Color(vein);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let t = 0;
      if (kind === 'wood') {
        const n = fbm(u * 4, v * 24, 3);
        t = (Math.sin((u * 30 + n * 6) * Math.PI) * 0.5 + 0.5) * 0.55;
      } else if (kind === 'marble') {
        const n = fbm(u * 5, v * 5, 5);
        t = Math.pow(1 - Math.abs(Math.sin((u * 3 + v * 2 + n * 4) * Math.PI)), 6) * 0.9;
      } else {
        t = fbm(u * 40, v * 40, 2) * 0.5 + Math.sin(v * 120 + fbm(u * 6, v * 6) * 8) * 0.08;
      }
      const i = (y * size + x) * 4;
      img.data[i] = (b.r + (vn.r - b.r) * t) * 255;
      img.data[i + 1] = (b.g + (vn.g - b.g) * t) * 255;
      img.data[i + 2] = (b.b + (vn.b - b.b) * t) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  cache.set(key, tex);
  return tex;
}
