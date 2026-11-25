import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STAUNTON_PROFILES, KNIGHT_HEAD, GEOMETRIC, type Family, type PieceType } from '../../cosmetics/pieceShapes';

/** Profile units (0..100, y down, base at 92) -> world units (1 = one square). */
const Y = (y: number) => (92 - y) / 100;
const R = (r: number) => r / 100;

const cache = new Map<string, THREE.BufferGeometry>();

function lathe(pts: [number, number][], segments: number): THREE.BufferGeometry {
  const v = pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, R(r)), Y(y)));
  return new THREE.LatheGeometry(v, segments);
}

function sphere(r: number, y: number, seg: number, x = 0, z = 0) {
  const g = new THREE.SphereGeometry(R(r), seg, Math.max(6, Math.round(seg * 0.7)));
  g.translate(x, Y(y), z);
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

/** Minimal SVG path parser (M, L, C, Z with absolute coordinates) -> THREE.Shape */
export function pathToShape(d: string): THREE.Shape {
  const shape = new THREE.Shape();
  const tokens = d.match(/[MLCZ]|-?\d*\.?\d+/gi) ?? [];
  let i = 0;
  let cmd = '';
  const num = () => Number(tokens[i++]);
  const pt = () => {
    const x = num();
    const y = num();
    return [R(x), Y(y)] as const;
  };
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[MLCZ]/i.test(t)) {
      cmd = t.toUpperCase();
      i++;
      if (cmd === 'Z') {
        shape.closePath();
        continue;
      }
    }
    if (cmd === 'M') {
      const [x, y] = pt();
      shape.moveTo(x, y);
      cmd = 'L';
    } else if (cmd === 'L') {
      const [x, y] = pt();
      shape.lineTo(x, y);
    } else if (cmd === 'C') {
      const [x1, y1] = pt();
      const [x2, y2] = pt();
      const [x, y] = pt();
      shape.bezierCurveTo(x1, y1, x2, y2, x, y);
    } else i++;
  }
  return shape;
}

function extrude(d: string, depth: number, bevel: boolean, curveSegments: number) {
  const g = new THREE.ExtrudeGeometry(pathToShape(d), {
    depth,
    bevelEnabled: bevel,
    bevelThickness: 0.025,
    bevelSize: 0.018,
    bevelSegments: 2,
    curveSegments,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    return g;
  });
  const merged = mergeGeometries(prepared, false)!;
  merged.computeBoundingSphere();
  return merged;
}

function staunton(t: PieceType, seg: number): THREE.BufferGeometry {
  const s = seg;
  const base = (pts: [number, number][]) => lathe([[0, 92], ...pts], s);
  switch (t) {
    case 'p':
      return merge([base(STAUNTON_PROFILES.p), sphere(14.5, 39.5, s)]);
    case 'r': {
      const parts = [base(STAUNTON_PROFILES.r)];
      const n = 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        parts.push(box(0.085, 0.14, 0.07, Math.cos(a) * 0.2, Y(24), Math.sin(a) * 0.2, -a + Math.PI / 2));
      }
      return merge(parts);
    }
    case 'n': {
      const head = extrude(KNIGHT_HEAD, 0.26, true, Math.max(6, Math.round(s / 3)));
      return merge([base(STAUNTON_PROFILES.n), head]);
    }
    case 'b':
      return merge([
        base(STAUNTON_PROFILES.b),
        lathe([[0, 53.5], [7, 53], [12.5, 50.5], [14, 45.5], [14.6, 40], [12.8, 33], [8.8, 26.5], [4, 21.5], [0, 19]], s),
        sphere(5.2, 15.5, Math.max(8, s / 2)),
      ]);
    case 'q': {
      const parts = [base(STAUNTON_PROFILES.q)];
      const wall = new THREE.CylinderGeometry(0.215, 0.225, 0.1, s, 1, true);
      wall.translate(0, Y(20.5), 0);
      parts.push(wall);
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        parts.push(sphere(3.6, 13.5, 8, Math.cos(a) * 0.21, Math.sin(a) * 0.21));
      }
      parts.push(lathe([[0, 25], [12, 22], [8, 14], [0, 12]], s));
      parts.push(sphere(4.4, 8, Math.max(8, s / 2)));
      return merge(parts);
    }
    case 'k':
      return merge([
        base(STAUNTON_PROFILES.k),
        lathe([[0, 25.5], [20.5, 25.5], [18, 20.5], [12, 17], [0, 15.5]], s),
        box(0.064, 0.16, 0.064, 0, Y(9.5), 0),
        box(0.18, 0.06, 0.064, 0, Y(9), 0),
      ]);
  }
}

function geometric(t: PieceType, quality: string): THREE.BufferGeometry {
  const facets = quality === 'low' ? 6 : 8;
  switch (t) {
    case 'p': {
      const ico = new THREE.IcosahedronGeometry(0.14, 1);
      ico.translate(0, Y(43), 0);
      return merge([lathe([[0, 91], [21, 91], [11, 58], [0, 58]], facets), ico]);
    }
    case 'r': {
      const parts = [lathe([[0, 91], [24, 91], [19, 40], [24, 40], [24, 25], [0, 25]], facets)];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        parts.push(box(0.11, 0.09, 0.11, Math.cos(a) * 0.17, Y(21), Math.sin(a) * 0.17, -a));
      }
      return merge(parts);
    }
    case 'n':
      return merge([lathe([[0, 91], [26, 91], [24, 84], [0, 84]], facets), extrude((GEOMETRIC.n.prims[0] as { d: string }).d, 0.26, true, 4)]);
    case 'b': {
      const top = new THREE.OctahedronGeometry(0.05);
      top.translate(0, Y(9), 0);
      return merge([lathe([[0, 91], [22, 91], [9, 60], [17, 40], [0, 12]], facets), top]);
    }
    case 'q': {
      const parts = [lathe([[0, 91], [25, 91], [18, 58], [24, 30], [0, 30]], facets)];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const cone = new THREE.ConeGeometry(0.05, 0.2, 4);
        cone.translate(Math.cos(a) * 0.16, Y(20), Math.sin(a) * 0.16);
        parts.push(cone);
      }
      const tip = new THREE.OctahedronGeometry(0.06);
      tip.translate(0, Y(10), 0);
      parts.push(tip);
      return merge(parts);
    }
    case 'k':
      return merge([
        lathe([[0, 91], [24, 91], [16, 42], [20, 42], [20, 30], [0, 30]], facets),
        box(0.07, 0.27, 0.07, 0, Y(16.5), 0),
        box(0.22, 0.07, 0.07, 0, Y(13.5), 0),
      ]);
  }
}

export function getPieceGeometry(family: Family, t: PieceType, quality: 'low' | 'medium' | 'high'): THREE.BufferGeometry {
  const k = `${family}|${t}|${quality}`;
  let g = cache.get(k);
  if (!g) {
    const seg = quality === 'high' ? 40 : quality === 'medium' ? 28 : 16;
    g = family === 'staunton' ? staunton(t, seg) : geometric(t, quality);
    g.userData.shared = true;
    cache.set(k, g);
  }
  return g;
}

export function disposeGeometries() {
  for (const g of cache.values()) g.dispose();
  cache.clear();
}
