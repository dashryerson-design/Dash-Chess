import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Square } from 'chess.js';
import { getPieceGeometry, disposeGeometries } from './geometry';
import { makeNoiseTexture } from './textures';
import { pieceSet } from '../../cosmetics/pieces';
import { boardVisual } from '../../cosmetics/boards';
import { environmentVisual } from '../../cosmetics/environments';
import { diffPieces, type PieceItem } from '../diff';
import { FILES } from '../types';
import type { PieceType } from '../../cosmetics/pieceShapes';

export interface SceneOptions {
  quality: 'low' | 'medium' | 'high';
  shadows: boolean;
  lighting: 'studio' | 'dramatic' | 'soft';
  reflections: boolean;
  effects: boolean;
  cameraSensitivity: number;
  cinematic: boolean;
  animationMs: number;
}

export interface Highlights {
  lastMove: [Square, Square] | null;
  selected: Square | null;
  targets: { to: Square; capture: boolean }[];
  check: Square | null;
  premove: [Square, Square] | null;
  hover: Square | null;
  arrows: { from: Square; to: Square; color: string }[];
  colors: { last: string; select: string; legal: string; premove: string };
  legalStyle: 'dots' | 'rings' | 'squares';
  showLegal: boolean;
  checkEffect: string | null;
  markers: { square: Square; color: string }[];
}

interface PieceMesh {
  item: PieceItem;
  mesh: THREE.Mesh;
  anim: { from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number; arc: number } | null;
}

interface Transient {
  obj: THREE.Object3D;
  t0: number;
  dur: number;
  update: (k: number) => void;
}

const SQ = 1;
export function squareToWorld(sq: string): THREE.Vector3 {
  const f = FILES.indexOf(sq[0]);
  const r = Number(sq[1]) - 1;
  return new THREE.Vector3((f - 3.5) * SQ, 0, (3.5 - r) * SQ);
}
function worldToSquare(x: number, z: number): Square | null {
  const f = Math.floor(x / SQ + 4);
  const r = Math.floor(4 - z / SQ);
  if (f < 0 || f > 7 || r < 0 || r > 7) return null;
  return (FILES[f] + (r + 1)) as Square;
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export class ChessScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private boardGroup = new THREE.Group();
  private envGroup = new THREE.Group();
  private pieceGroup = new THREE.Group();
  private fxGroup = new THREE.Group();
  private pieces: PieceMesh[] = [];
  private materials: Record<'w' | 'b', THREE.Material> | null = null;
  private hlCanvas = document.createElement('canvas');
  private hlTexture: THREE.CanvasTexture;
  private hlMesh: THREE.Mesh;
  private squaresMesh: THREE.Mesh | null = null;
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private frame = 0;
  private running = false;
  private transients: Transient[] = [];
  private dragging: PieceMesh | null = null;
  private pointer: { x: number; y: number; id: number; moved: boolean; sq: Square | null; pieceDrag: boolean } | null = null;
  private orientation: 'w' | 'b' = 'w';
  private camAnim: { from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number } | null = null;
  private lastInteraction = performance.now();
  private keyLight!: THREE.DirectionalLight;
  private disposed = false;
  private pmrem: THREE.PMREMGenerator | null = null;
  private envTexture: THREE.Texture | null = null;
  private animatedPieces = false;
  private particles: THREE.Points | null = null;
  private fen = '';
  private cosmetics = { pieceSet: '', board: '', environment: '' };
  private resizeObs: ResizeObserver;

  onSquareDown: (sq: Square) => boolean = () => false; // return true if a piece drag should start
  onSquareUp: (from: Square | null, to: Square | null, wasDrag: boolean) => void = () => {};
  onHover: (sq: Square | null) => void = () => {};

  constructor(private container: HTMLElement, private opts: SceneOptions) {
    const q = opts.quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: q !== 'low', alpha: false, powerPreference: q === 'high' ? 'high-performance' : 'default' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = opts.shadows;
    this.renderer.shadowMap.type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
    this.camera.position.set(0, 10.5, 9.5);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 22;
    this.controls.minPolarAngle = 0.05;
    this.controls.maxPolarAngle = 1.32;
    this.controls.rotateSpeed = 0.6 * opts.cameraSensitivity;
    this.controls.zoomSpeed = 0.8 * opts.cameraSensitivity;
    this.controls.target.set(0, 0, 0);
    this.controls.addEventListener('change', () => this.requestRender());
    this.controls.addEventListener('start', () => (this.lastInteraction = performance.now()));

    this.scene.add(this.envGroup, this.boardGroup, this.pieceGroup, this.fxGroup);

    // highlight overlay (single canvas texture, redrawn on change)
    this.hlCanvas.width = this.hlCanvas.height = q === 'low' ? 512 : 1024;
    this.hlTexture = new THREE.CanvasTexture(this.hlCanvas);
    this.hlTexture.colorSpace = THREE.SRGBColorSpace;
    this.hlTexture.anisotropy = 4;
    this.hlMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(8 * SQ, 8 * SQ),
      new THREE.MeshBasicMaterial({ map: this.hlTexture, transparent: true, depthWrite: false, toneMapped: false }),
    );
    this.hlMesh.rotation.x = -Math.PI / 2;
    this.hlMesh.position.y = 0.004;
    this.hlMesh.renderOrder = 2;
    this.boardGroup.add(this.hlMesh);

    if (opts.reflections) {
      this.pmrem = new THREE.PMREMGenerator(this.renderer);
      this.envTexture = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environment = this.envTexture;
      this.scene.environmentIntensity = 0.55;
    }

    this.bindPointer();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
  }

  // ------------------------------------------------------------------ setup
  setCosmetics(c: { pieceSet: string; board: string; environment: string }) {
    const changed = c.pieceSet !== this.cosmetics.pieceSet || c.board !== this.cosmetics.board || c.environment !== this.cosmetics.environment;
    if (!changed) return;
    const pieceChanged = c.pieceSet !== this.cosmetics.pieceSet;
    const boardChanged = c.board !== this.cosmetics.board;
    const envChanged = c.environment !== this.cosmetics.environment;
    this.cosmetics = { ...c };
    if (envChanged) this.buildEnvironment();
    if (boardChanged || envChanged) this.buildBoard();
    if (pieceChanged) {
      this.buildMaterials();
      const fen = this.fen;
      this.clearPieces();
      if (fen) {
        this.fen = '';
        this.setPosition(fen, false);
      }
    }
    this.requestRender();
  }

  private buildEnvironment() {
    disposeGroup(this.envGroup);
    const ev = environmentVisual(this.cosmetics.environment).three;
    const q = this.opts.quality;
    // gradient sky
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, ev.top);
    grad.addColorStop(1, ev.bottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = tex;
    this.scene.fog = new THREE.FogExp2(ev.fog, ev.fogDensity);

    const lightScale = this.opts.lighting === 'dramatic' ? 1.25 : this.opts.lighting === 'soft' ? 0.8 : 1;
    const amb = new THREE.HemisphereLight(ev.ambient, ev.bottom, ev.ambientIntensity * (this.opts.lighting === 'soft' ? 2.2 : this.opts.lighting === 'dramatic' ? 0.9 : 1.6));
    this.envGroup.add(amb);
    const key = new THREE.DirectionalLight(ev.key, ev.keyIntensity * lightScale);
    key.position.set(-4, 11, 6);
    key.castShadow = this.opts.shadows;
    if (this.opts.shadows) {
      const s = q === 'high' ? 2048 : 1024;
      key.shadow.mapSize.set(s, s);
      key.shadow.camera.left = -6;
      key.shadow.camera.right = 6;
      key.shadow.camera.top = 6;
      key.shadow.camera.bottom = -6;
      key.shadow.camera.near = 2;
      key.shadow.camera.far = 30;
      key.shadow.bias = -0.0005;
      key.shadow.normalBias = 0.02;
      key.shadow.radius = 3;
    }
    this.keyLight = key;
    this.envGroup.add(key);
    const rim = new THREE.DirectionalLight(ev.rim, (this.opts.lighting === 'dramatic' ? 1.6 : 0.9) * lightScale);
    rim.position.set(5, 6, -7);
    this.envGroup.add(rim);
    if (this.opts.lighting !== 'soft' && q !== 'low') {
      const fill = new THREE.PointLight(ev.accent ?? ev.rim, 6, 14, 2);
      fill.position.set(0, 4, 0);
      this.envGroup.add(fill);
    }

    // floor
    if (ev.floor !== 'none') {
      const floorMat =
        ev.floor === 'grid'
          ? new THREE.MeshBasicMaterial({ map: gridTexture(ev.floorColor), transparent: true, opacity: 0.9, depthWrite: false })
          : new THREE.MeshStandardMaterial({
              color: ev.floorColor,
              roughness: ev.floor === 'stage' ? 0.35 : 0.9,
              metalness: ev.floor === 'stage' ? 0.2 : 0,
              map: ev.floor === 'wood' ? makeNoiseTexture('wood', '#4a2c17', '#2a170b', 512) : ev.floor === 'sand' ? makeNoiseTexture('sand', '#c9bea2', '#a39678', 512) : ev.floor === 'stone' ? makeNoiseTexture('marble', '#3a3026', '#1a140e', 512) : null,
            });
      const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 48), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.62;
      floor.receiveShadow = this.opts.shadows && ev.floor !== 'grid';
      const map = (floorMat as THREE.MeshStandardMaterial).map;
      if (map) {
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        map.repeat.set(10, 10);
      }
      this.envGroup.add(floor);
      if (ev.floor === 'stage') {
        const ring = new THREE.Mesh(new THREE.RingGeometry(7.4, 7.55, 96), new THREE.MeshBasicMaterial({ color: ev.accent ?? ev.rim, transparent: true, opacity: 0.35 }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = -0.6;
        this.envGroup.add(ring);
      }
    }

    // particles
    this.particles = null;
    if (ev.particles !== 'none' && q !== 'low') {
      const n = ev.particles === 'stars' ? (q === 'high' ? 1800 : 900) : 260;
      const pos = new Float32Array(n * 3);
      let seed = 42;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < n; i++) {
        if (ev.particles === 'stars') {
          const r = 30 + rnd() * 50;
          const th = rnd() * Math.PI * 2;
          const ph = Math.acos(2 * rnd() - 1);
          pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
          pos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) - 5;
          pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
        } else {
          pos[i * 3] = (rnd() - 0.5) * 24;
          pos[i * 3 + 1] = rnd() * 8;
          pos[i * 3 + 2] = (rnd() - 0.5) * 24;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: ev.particles === 'embers' ? '#ffb24a' : ev.particles === 'dust' ? '#fff0d0' : '#ffffff',
        size: ev.particles === 'stars' ? 0.18 : 0.05,
        transparent: true,
        opacity: ev.particles === 'stars' ? 0.9 : 0.5,
        depthWrite: false,
        fog: ev.particles !== 'stars',
      });
      this.particles = new THREE.Points(geo, mat);
      this.envGroup.add(this.particles);
    }
  }

  private buildBoard() {
    for (const child of [...this.boardGroup.children]) {
      if (child === this.hlMesh) continue;
      this.boardGroup.remove(child);
      disposeObject(child);
    }
    const bv = boardVisual(this.cosmetics.board);
    const t = bv.three;
    // frame
    const frameMat = new THREE.MeshStandardMaterial({ color: t.frame, roughness: 0.45, metalness: Math.min(0.6, t.metalness + 0.1) });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(8 * SQ + 0.9, 0.5, 8 * SQ + 0.9), frameMat);
    frame.position.y = -0.25;
    frame.receiveShadow = this.opts.shadows;
    frame.castShadow = this.opts.shadows;
    this.boardGroup.add(frame);
    if (t.emissive) {
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(8 * SQ + 0.94, 0.04, 8 * SQ + 0.94),
        new THREE.MeshBasicMaterial({ color: t.emissive, toneMapped: false }),
      );
      edge.position.y = -0.48;
      this.boardGroup.add(edge);
    }
    // squares texture
    const size = this.opts.quality === 'low' ? 512 : 1024;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    const s = size / 8;
    for (let r = 0; r < 8; r++)
      for (let f = 0; f < 8; f++) {
        g.fillStyle = (r + f) % 2 === 1 ? t.dark : t.light;
        g.fillRect(f * s, r * s, s, s);
      }
    paintBoardTexture(g, size, bv.texture, t);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: t.roughness,
      metalness: t.metalness,
      emissive: t.grid ? new THREE.Color(t.grid) : new THREE.Color(0),
      emissiveMap: t.grid ? tex : null,
      emissiveIntensity: t.grid ? 0.35 : 0,
    });
    this.squaresMesh = new THREE.Mesh(new THREE.PlaneGeometry(8 * SQ, 8 * SQ), mat);
    this.squaresMesh.rotation.x = -Math.PI / 2;
    this.squaresMesh.position.y = 0.001;
    this.squaresMesh.receiveShadow = this.opts.shadows;
    this.boardGroup.add(this.squaresMesh);
    // coordinates on the frame
    const coords = coordinateTexture(bv.three.light);
    const cm = new THREE.Mesh(new THREE.PlaneGeometry(8 * SQ + 0.9, 8 * SQ + 0.9), new THREE.MeshBasicMaterial({ map: coords, transparent: true, depthWrite: false }));
    cm.rotation.x = -Math.PI / 2;
    cm.position.y = 0.0005;
    this.boardGroup.add(cm);
  }

  private buildMaterials() {
    if (this.materials) {
      this.materials.w.dispose();
      this.materials.b.dispose();
    }
    const set = pieceSet(this.cosmetics.pieceSet);
    const q = this.opts.quality;
    this.animatedPieces = false;
    const make = (c: 'w' | 'b'): THREE.Material => {
      const p = set.three(c);
      if (p.animated) this.animatedPieces = true;
      const common = {
        color: new THREE.Color(p.color),
        roughness: p.roughness,
        metalness: p.metalness,
        emissive: new THREE.Color(p.emissive ?? '#000000'),
        emissiveIntensity: p.emissiveIntensity ?? 0,
        transparent: p.opacity !== undefined,
        opacity: p.opacity ?? 1,
      };
      let map: THREE.Texture | null = null;
      if (p.texture === 'wood' || p.texture === 'marble') map = makeNoiseTexture(p.texture, p.color, p.vein ?? '#000', 256, true);
      if (q === 'low') return new THREE.MeshLambertMaterial({ color: common.color, emissive: common.emissive, emissiveIntensity: common.emissiveIntensity, transparent: common.transparent, opacity: common.opacity, map });
      if (q === 'high' && (p.clearcoat || p.transmission)) {
        return new THREE.MeshPhysicalMaterial({
          ...common,
          map,
          color: map ? new THREE.Color('#ffffff') : common.color,
          clearcoat: p.clearcoat ?? 0,
          clearcoatRoughness: 0.2,
          ior: 1.5,
          specularIntensity: 1,
          depthWrite: !p.transmission,
        });
      }
      return new THREE.MeshStandardMaterial({ ...common, map, color: map ? new THREE.Color('#ffffff') : common.color, depthWrite: !p.transmission });
    };
    this.materials = { w: make('w'), b: make('b') };
  }

  // ------------------------------------------------------------------ pieces
  private clearPieces() {
    for (const p of this.pieces) this.pieceGroup.remove(p.mesh);
    this.pieces = [];
  }

  private createMesh(item: PieceItem): THREE.Mesh {
    const fam = pieceSet(this.cosmetics.pieceSet).family;
    const geo = getPieceGeometry(fam, item.type as PieceType, this.opts.quality);
    const mesh = new THREE.Mesh(geo, this.materials![item.color]);
    mesh.castShadow = this.opts.shadows;
    mesh.receiveShadow = this.opts.shadows && this.opts.quality === 'high';
    // knights face the opponent, turned so their profile reads clearly from the player's camera
    if (item.type === 'n') mesh.rotation.y = item.color === 'w' ? -Math.PI / 2 + 0.75 : Math.PI / 2 + 0.75;
    if (fam === 'geometric' && item.type !== 'n') mesh.rotation.y = 0;
    mesh.position.copy(squareToWorld(item.square));
    mesh.userData.square = item.square;
    return mesh;
  }

  setPosition(fen: string, animate = true) {
    if (fen === this.fen) return;
    this.fen = fen;
    if (!this.materials) this.buildMaterials();
    const prevItems = this.pieces.map((p) => p.item);
    const { pieces, captured } = diffPieces(prevItems, fen);
    const byId = new Map(this.pieces.map((p) => [p.item.id, p]));
    const next: PieceMesh[] = [];
    const now = performance.now();
    for (const it of pieces) {
      const existing = byId.get(it.id);
      if (existing) {
        byId.delete(it.id);
        const typeChanged = existing.item.type !== it.type;
        if (typeChanged) {
          // promotion: swap geometry
          this.pieceGroup.remove(existing.mesh);
          const m = this.createMesh({ ...it, square: existing.item.square });
          this.pieceGroup.add(m);
          existing.mesh = m;
        }
        if (existing.item.square !== it.square) {
          const to = squareToWorld(it.square);
          if (animate && this.opts.animationMs > 0 && this.dragging !== existing) {
            const dist = existing.mesh.position.distanceTo(to);
            existing.anim = { from: existing.mesh.position.clone(), to, t0: now, dur: this.opts.animationMs * (1 + Math.min(1, dist / 6) * 0.6), arc: it.type === 'n' ? 0.55 : Math.min(0.25, dist * 0.04) };
          } else existing.mesh.position.copy(to);
        }
        existing.item = it;
        next.push(existing);
      } else {
        const m = this.createMesh(it);
        this.pieceGroup.add(m);
        next.push({ item: it, mesh: m, anim: null });
      }
    }
    // captured pieces: animate out
    for (const [, p] of byId) {
      if (animate && this.opts.animationMs > 0) this.animateCapture(p.mesh);
      else this.pieceGroup.remove(p.mesh);
    }
    void captured;
    this.pieces = next;
    this.dragging = null;
    this.requestRender();
  }

  private animateCapture(mesh: THREE.Mesh) {
    const mat = (mesh.material as THREE.Material).clone() as THREE.MeshStandardMaterial;
    mat.transparent = true;
    mesh.material = mat;
    const start = mesh.position.clone();
    this.transients.push({
      obj: mesh,
      t0: performance.now(),
      dur: 450,
      update: (k) => {
        mesh.position.y = start.y - k * 0.4;
        mesh.scale.setScalar(1 - k * 0.5);
        mat.opacity = 1 - k;
        if (k >= 1) {
          this.pieceGroup.remove(mesh);
          mat.dispose();
        }
      },
    });
  }

  effect(kind: string, sq: Square, color = '#ffffff') {
    if (!this.opts.effects) return;
    const pos = squareToWorld(sq);
    if (kind === 'ripple' || kind === 'spark' || kind === 'comet' || kind === 'royal') {
      const col = kind === 'royal' ? '#ffd36a' : kind === 'spark' ? '#fff3b0' : color;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, depthWrite: false, toneMapped: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pos.x, 0.02, pos.z);
      this.fxGroup.add(ring);
      this.transients.push({
        obj: ring,
        t0: performance.now(),
        dur: 650,
        update: (k) => {
          ring.scale.setScalar(1 + k * 1.4);
          (ring.material as THREE.MeshBasicMaterial).opacity = 1 - k;
          if (k >= 1) {
            this.fxGroup.remove(ring);
            disposeObject(ring);
          }
        },
      });
      return;
    }
    // capture effects: particle burst
    const n = this.opts.quality === 'low' ? 24 : 60;
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    const v: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      p[i * 3] = pos.x;
      p[i * 3 + 1] = 0.3;
      p[i * 3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2;
      const up = kind === 'vortex' ? 0.5 : 1.5 + Math.random() * 2;
      v.push(new THREE.Vector3(Math.cos(a) * (1 + Math.random() * 2), up, Math.sin(a) * (1 + Math.random() * 2)));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const col = kind === 'lightning' ? '#bfe0ff' : kind === 'vortex' ? '#a57bff' : kind === 'burst' ? '#ffb34a' : kind === 'shatter' ? '#e6f0ff' : '#cccccc';
    const mat = new THREE.PointsMaterial({ color: col, size: kind === 'shatter' ? 0.09 : 0.07, transparent: true, depthWrite: false, toneMapped: false });
    const pts = new THREE.Points(geo, mat);
    this.fxGroup.add(pts);
    if (kind === 'lightning') {
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.08, 6, 6), new THREE.MeshBasicMaterial({ color: '#dff0ff', transparent: true, toneMapped: false }));
      bolt.position.set(pos.x, 3, pos.z);
      this.fxGroup.add(bolt);
      this.transients.push({
        obj: bolt,
        t0: performance.now(),
        dur: 300,
        update: (k) => {
          (bolt.material as THREE.MeshBasicMaterial).opacity = k < 0.5 ? 1 : 2 - 2 * k;
          if (k >= 1) {
            this.fxGroup.remove(bolt);
            disposeObject(bolt);
          }
        },
      });
    }
    const t0 = performance.now();
    this.transients.push({
      obj: pts,
      t0,
      dur: 700,
      update: (k) => {
        const arr = geo.attributes.position.array as Float32Array;
        const dt = k * 0.7;
        for (let i = 0; i < n; i++) {
          if (kind === 'vortex') {
            const ang = dt * 10 + i;
            const r = 0.5 * (1 - k);
            arr[i * 3] = pos.x + Math.cos(ang) * r;
            arr[i * 3 + 1] = 0.2 + dt * 1.2;
            arr[i * 3 + 2] = pos.z + Math.sin(ang) * r;
          } else {
            arr[i * 3] = pos.x + v[i].x * dt * 0.6;
            arr[i * 3 + 1] = 0.3 + v[i].y * dt - 4.9 * dt * dt;
            arr[i * 3 + 2] = pos.z + v[i].z * dt * 0.6;
          }
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = 1 - k;
        if (k >= 1) {
          this.fxGroup.remove(pts);
          disposeObject(pts);
        }
      },
    });
    this.requestRender();
  }

  // ------------------------------------------------------------------ highlights (2D canvas on the board)
  setHighlights(h: Highlights) {
    const c = this.hlCanvas;
    const g = c.getContext('2d')!;
    const size = c.width;
    const s = size / 8;
    g.clearRect(0, 0, size, size);
    const rect = (sq: string, color: string) => {
      const f = FILES.indexOf(sq[0]);
      const r = 8 - Number(sq[1]);
      g.fillStyle = color;
      g.fillRect(f * s, r * s, s, s);
    };
    const center = (sq: string) => [(FILES.indexOf(sq[0]) + 0.5) * s, (8 - Number(sq[1]) + 0.5) * s] as const;
    if (h.lastMove) for (const sq of h.lastMove) rect(sq, h.colors.last);
    if (h.premove) for (const sq of h.premove) rect(sq, h.colors.premove);
    if (h.selected) rect(h.selected, h.colors.select);
    for (const m of h.markers) rect(m.square, m.color);
    if (h.check && h.checkEffect) {
      const [x, y] = center(h.check);
      const grd = g.createRadialGradient(x, y, 0, x, y, s * 0.6);
      grd.addColorStop(0, 'rgba(255,40,40,0.95)');
      grd.addColorStop(0.5, 'rgba(255,40,40,0.45)');
      grd.addColorStop(1, 'rgba(255,40,40,0)');
      g.fillStyle = grd;
      g.fillRect(x - s, y - s, s * 2, s * 2);
    }
    if (h.hover) {
      const f = FILES.indexOf(h.hover[0]);
      const r = 8 - Number(h.hover[1]);
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = s * 0.06;
      g.strokeRect(f * s + g.lineWidth / 2, r * s + g.lineWidth / 2, s - g.lineWidth, s - g.lineWidth);
    }
    if (h.showLegal) {
      for (const t of h.targets) {
        const [x, y] = center(t.to);
        g.fillStyle = h.colors.legal;
        g.strokeStyle = h.colors.legal;
        if (t.capture) {
          g.lineWidth = s * 0.08;
          g.beginPath();
          g.arc(x, y, s * 0.44, 0, Math.PI * 2);
          g.stroke();
        } else if (h.legalStyle === 'squares') rect(t.to, h.colors.legal);
        else if (h.legalStyle === 'rings') {
          g.lineWidth = s * 0.06;
          g.beginPath();
          g.arc(x, y, s * 0.17, 0, Math.PI * 2);
          g.stroke();
        } else {
          g.beginPath();
          g.arc(x, y, s * 0.15, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    for (const a of h.arrows) {
      const [x1, y1] = center(a.from);
      const [x2, y2] = center(a.to);
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const len = Math.hypot(x2 - x1, y2 - y1) - s * 0.2;
      const ex = x1 + Math.cos(ang) * len;
      const ey = y1 + Math.sin(ang) * len;
      g.strokeStyle = a.color;
      g.fillStyle = a.color;
      g.lineWidth = s * 0.16;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(ex - Math.cos(ang) * s * 0.2, ey - Math.sin(ang) * s * 0.2);
      g.stroke();
      const hw = s * 0.26;
      g.beginPath();
      g.moveTo(ex + Math.cos(ang) * s * 0.1, ey + Math.sin(ang) * s * 0.1);
      g.lineTo(ex - Math.cos(ang) * hw + Math.cos(ang + Math.PI / 2) * hw, ey - Math.sin(ang) * hw + Math.sin(ang + Math.PI / 2) * hw);
      g.lineTo(ex - Math.cos(ang) * hw - Math.cos(ang + Math.PI / 2) * hw, ey - Math.sin(ang) * hw - Math.sin(ang + Math.PI / 2) * hw);
      g.fill();
    }
    this.hlTexture.needsUpdate = true;
    this.requestRender();
  }

  // ------------------------------------------------------------------ camera
  setOrientation(side: 'w' | 'b', immediate = false) {
    const changed = side !== this.orientation;
    this.orientation = side;
    const target = this.viewPosition('player');
    if (immediate || !changed) {
      if (immediate) {
        this.camera.position.copy(target);
        this.controls.update();
      }
    } else this.camAnim = { from: this.camera.position.clone(), to: target, t0: performance.now(), dur: 900 };
    this.requestRender();
  }

  private viewPosition(view: string): THREE.Vector3 {
    const z = this.orientation === 'w' ? 1 : -1;
    switch (view) {
      case 'top':
        return new THREE.Vector3(0, 15, 0.01 * z);
      case 'side':
        return new THREE.Vector3(12 * (this.orientation === 'w' ? -1 : 1), 6, 0.5 * z);
      case 'low':
        return new THREE.Vector3(0, 4.2, 11 * z);
      default:
        return new THREE.Vector3(0, 10.5, 9.5 * z);
    }
  }

  setView(view: 'player' | 'top' | 'side' | 'low') {
    this.camAnim = { from: this.camera.position.clone(), to: this.viewPosition(view), t0: performance.now(), dur: 800 };
    this.requestRender();
  }

  setOptions(o: Partial<SceneOptions>) {
    Object.assign(this.opts, o);
    this.controls.rotateSpeed = 0.6 * this.opts.cameraSensitivity;
    this.controls.zoomSpeed = 0.8 * this.opts.cameraSensitivity;
    this.requestRender();
  }

  // ------------------------------------------------------------------ input
  private ndc(e: PointerEvent): THREE.Vector2 {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private hitPlane(e: PointerEvent, y = 0): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    this.plane.constant = -y;
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.plane, p) ? p : null;
  }

  private squareAtEvent(e: PointerEvent): Square | null {
    // prefer hitting a piece (tall pieces occlude squares from low angles)
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const hits = this.raycaster.intersectObjects(this.pieceGroup.children, false);
    if (hits.length) {
      const sq = hits[0].object.userData.square as Square | undefined;
      if (sq) return sq;
    }
    const p = this.hitPlane(e);
    return p ? worldToSquare(p.x, p.z) : null;
  }

  private bindPointer() {
    const el = this.renderer.domElement;
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const sq = this.squareAtEvent(e);
      const pieceDrag = sq ? this.onSquareDown(sq) : false;
      this.pointer = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, sq, pieceDrag };
      if (pieceDrag) {
        this.controls.enabled = false;
        this.dragging = this.pieces.find((p) => p.item.square === sq) ?? null;
        el.setPointerCapture(e.pointerId);
      }
      this.lastInteraction = performance.now();
    };
    const move = (e: PointerEvent) => {
      const p = this.pointer;
      if (!p) {
        return;
      }
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) p.moved = true;
      if (p.pieceDrag && this.dragging && p.moved) {
        const hit = this.hitPlane(e, 0.35);
        if (hit) {
          this.dragging.anim = null;
          this.dragging.mesh.position.set(hit.x, 0.35, hit.z);
          this.onHover(worldToSquare(hit.x, hit.z));
          this.requestRender();
        }
      }
    };
    const up = (e: PointerEvent) => {
      const p = this.pointer;
      this.pointer = null;
      this.controls.enabled = true;
      if (!p) return;
      const sq = this.squareAtEventForDrop(e, p.pieceDrag && p.moved);
      if (p.pieceDrag && p.moved) {
        const dragged = this.dragging;
        this.onHover(null);
        this.onSquareUp(p.sq, sq, true);
        // if the position did not change (rejected), snap back
        if (dragged && this.dragging === dragged) {
          dragged.mesh.position.copy(squareToWorld(dragged.item.square));
          this.dragging = null;
        }
        this.requestRender();
        return;
      }
      this.dragging = null;
      if (!p.moved) this.onSquareUp(p.sq, sq, false);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', () => {
      this.pointer = null;
      this.controls.enabled = true;
      if (this.dragging) this.dragging.mesh.position.copy(squareToWorld(this.dragging.item.square));
      this.dragging = null;
    });
  }

  private squareAtEventForDrop(e: PointerEvent, drag: boolean): Square | null {
    if (drag) {
      const p = this.hitPlane(e, 0.35);
      return p ? worldToSquare(p.x, p.z) : null;
    }
    return this.squareAtEvent(e);
  }

  // ------------------------------------------------------------------ render loop
  requestRender() {
    if (this.disposed) return;
    if (!this.running) {
      this.running = true;
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  private tick = (now: number) => {
    if (this.disposed) return;
    let busy = false;
    for (const p of this.pieces) {
      if (!p.anim) continue;
      const k = Math.min(1, (now - p.anim.t0) / p.anim.dur);
      const e = ease(k);
      p.mesh.position.lerpVectors(p.anim.from, p.anim.to, e);
      p.mesh.position.y = Math.sin(Math.PI * k) * p.anim.arc;
      p.mesh.userData.square = p.item.square;
      if (k >= 1) p.anim = null;
      else busy = true;
    }
    for (const t of this.transients) {
      const k = Math.min(1, (now - t.t0) / t.dur);
      t.update(k);
    }
    this.transients = this.transients.filter((t) => now - t.t0 < t.dur);
    if (this.transients.length) busy = true;
    if (this.camAnim) {
      const k = Math.min(1, (now - this.camAnim.t0) / this.camAnim.dur);
      this.camera.position.lerpVectors(this.camAnim.from, this.camAnim.to, ease(k));
      if (k >= 1) this.camAnim = null;
      busy = true;
    }
    if (this.opts.cinematic && now - this.lastInteraction > 6000 && !this.pointer) {
      const a = 0.00012 * 16;
      const x = this.camera.position.x;
      const z = this.camera.position.z;
      this.camera.position.x = x * Math.cos(a) - z * Math.sin(a);
      this.camera.position.z = x * Math.sin(a) + z * Math.cos(a);
      busy = true;
    }
    if (this.particles) {
      this.particles.rotation.y += 0.0004;
      busy = true;
    }
    if (this.animatedPieces && this.materials) {
      const pulse = 0.35 + Math.sin(now / 600) * 0.2;
      (this.materials.w as THREE.MeshStandardMaterial).emissiveIntensity = pulse;
      (this.materials.b as THREE.MeshStandardMaterial).emissiveIntensity = pulse + 0.1;
      busy = true;
    }
    const damping = this.controls.update();
    this.renderer.render(this.scene, this.camera);
    if (busy || damping) this.frame = requestAnimationFrame(this.tick);
    else this.running = false;
  };

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h;
    // keep the whole board visible on narrow/portrait screens
    this.camera.fov = w / h < 1 ? 34 + (1 - w / h) * 26 : 34;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObs.disconnect();
    this.controls.dispose();
    disposeGroup(this.envGroup);
    disposeGroup(this.boardGroup);
    disposeGroup(this.fxGroup);
    this.materials?.w.dispose();
    this.materials?.b.dispose();
    this.hlTexture.dispose();
    this.envTexture?.dispose();
    this.pmrem?.dispose();
    disposeGeometries();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

// ------------------------------------------------------------------ helpers
function disposeObject(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      for (const k of ['map', 'emissiveMap'] as const) (mat as any)[k]?.dispose?.();
      mat.dispose();
    }
  });
}
function disposeGroup(g: THREE.Group) {
  for (const c of [...g.children]) {
    g.remove(c);
    disposeObject(c);
  }
}

function gridTexture(color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.strokeStyle = color;
  g.globalAlpha = 0.8;
  g.lineWidth = 3;
  g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(40, 40);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function coordinateTexture(color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  const size = 1024;
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const border = (0.45 / 8.9) * size;
  const s = (size - border * 2) / 8;
  g.fillStyle = color;
  g.globalAlpha = 0.75;
  g.font = `600 ${Math.round(border * 0.5)}px Inter, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < 8; i++) {
    g.fillText(FILES[i], border + s * (i + 0.5), size - border / 2);
    g.fillText(FILES[i], border + s * (i + 0.5), border / 2);
    g.fillText(String(8 - i), border / 2, border + s * (i + 0.5));
    g.fillText(String(8 - i), size - border / 2, border + s * (i + 0.5));
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function paintBoardTexture(g: CanvasRenderingContext2D, size: number, kind: string, t: { light: string; dark: string; grid?: string; emissive?: string }) {
  const s = size / 8;
  if (kind === 'neon' || kind === 'future') {
    g.strokeStyle = t.grid ?? t.emissive ?? '#3ff3ff';
    g.lineWidth = kind === 'neon' ? size / 300 : size / 500;
    g.shadowColor = g.strokeStyle as string;
    g.shadowBlur = size / 80;
    for (let i = 0; i <= 8; i++) {
      g.beginPath();
      g.moveTo(i * s, 0);
      g.lineTo(i * s, size);
      g.moveTo(0, i * s);
      g.lineTo(size, i * s);
      g.stroke();
    }
    g.shadowBlur = 0;
    return;
  }
  if (kind === 'wood' || kind === 'marble' || kind === 'metal') {
    const img = g.getImageData(0, 0, size, size);
    const d = img.data;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        let v = 0;
        if (kind === 'wood') v = Math.sin((x / size) * 90 + Math.sin(y / 37) * 3 + Math.sin(x / 13) * 0.6) * 0.06;
        else if (kind === 'metal') v = (((x * 7919 + y * 13) % 97) / 97 - 0.5) * 0.06;
        else v = Math.pow(Math.abs(Math.sin((x + y * 0.6) / 40 + Math.sin(y / 23) * 2 + Math.sin(x / 31))), 18) * -0.25;
        d[i] = Math.max(0, Math.min(255, d[i] * (1 + v)));
        d[i + 1] = Math.max(0, Math.min(255, d[i + 1] * (1 + v)));
        d[i + 2] = Math.max(0, Math.min(255, d[i + 2] * (1 + v)));
      }
    g.putImageData(img, 0, 0);
  }
  if (kind === 'sparkle') {
    g.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 120; i++) {
      g.beginPath();
      g.arc((i * 7919) % size, (i * 104729) % size, 1 + (i % 3), 0, Math.PI * 2);
      g.fill();
    }
  }
}
