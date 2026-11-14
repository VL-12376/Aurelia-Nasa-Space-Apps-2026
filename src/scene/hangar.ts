import * as THREE from "three";
import gsap from "gsap";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { STAGE_TARGETS, bus, part, partsIn, type Design, type Target } from "../spacecraft/design";
import type { AntennaPart, BatteryPart, EnginePart, SciencePart, SolarPart, StructurePart, SystemsPart, TankPart } from "../spacecraft/parts";
import { store } from "../core/store";

export interface HangarCallbacks {
  onPick: (index: number | null) => void;
}

const COLORS = {
  hull: [0xe8e9f0, 0xcfc8ee, 0xf0e2b8],
  accent: 0x7563b5,
  dark: 0x1d1b2a,
  gun: 0x3a3947,
  foil: 0xc9a24b,
  cell: 0x1d2f63,
};

function std(color: number, metalness = 0.55, roughness = 0.4, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
}

/* ---------- procedural surface textures (cached; generated once) ---------- */

let hullTexCache: THREE.CanvasTexture | null = null;
let hullBumpCache: THREE.CanvasTexture | null = null;
let foilTexCache: THREE.CanvasTexture | null = null;
let padTexCache: THREE.CanvasTexture | null = null;

function rand(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

/** Painted aluminium skin: welded panel seams, rivet rows, a stripe, the AURELIA wordmark and soot near the bottom. */
function hullTextures(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  if (hullTexCache && hullBumpCache) return { map: hullTexCache, bump: hullBumpCache };
  const W = 1024;
  const H = 512;
  const paint = (bumpOnly: boolean): HTMLCanvasElement => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    const r = rand(7);
    g.fillStyle = bumpOnly ? "#808080" : "#f2f1f6";
    g.fillRect(0, 0, W, H);
    if (!bumpOnly) {
      // Subtle tonal variation between panels.
      for (let px = 0; px < 8; px++) for (let py = 0; py < 4; py++) {
        const v = 232 + Math.floor(r() * 22);
        g.fillStyle = `rgb(${v},${v},${v + 4})`;
        g.fillRect(px * (W / 8), py * (H / 4), W / 8, H / 4);
      }
    }
    // Seams
    g.lineWidth = bumpOnly ? 5 : 2;
    g.strokeStyle = bumpOnly ? "#202020" : "rgba(60,58,80,0.65)";
    for (let i = 0; i <= 8; i++) {
      g.beginPath();
      g.moveTo((W / 8) * i, 0);
      g.lineTo((W / 8) * i, H);
      g.stroke();
    }
    for (let j = 0; j <= 4; j++) {
      g.beginPath();
      g.moveTo(0, (H / 4) * j);
      g.lineTo(W, (H / 4) * j);
      g.stroke();
    }
    // Rivets along every seam
    g.fillStyle = bumpOnly ? "#f0f0f0" : "rgba(70,68,95,0.85)";
    for (let i = 0; i <= 8; i++) for (let k = 0; k < H; k += 16) {
      g.beginPath();
      g.arc((W / 8) * i + 7, k + 8, 2.2, 0, Math.PI * 2);
      g.arc((W / 8) * i - 7, k + 8, 2.2, 0, Math.PI * 2);
      g.fill();
    }
    for (let j = 0; j <= 4; j++) for (let k = 0; k < W; k += 16) {
      g.beginPath();
      g.arc(k + 8, (H / 4) * j + 7, 2.2, 0, Math.PI * 2);
      g.arc(k + 8, (H / 4) * j - 7, 2.2, 0, Math.PI * 2);
      g.fill();
    }
    if (!bumpOnly) {
      // Accent stripe
      g.fillStyle = "#7563b5";
      g.fillRect(0, H * 0.46, W, 18);
      g.fillStyle = "#b8a6e8";
      g.fillRect(0, H * 0.46 + 22, W, 4);
      // Wordmark, repeated around the body
      g.fillStyle = "#2a2548";
      g.font = "600 46px Georgia, serif";
      g.textBaseline = "middle";
      for (const x of [W * 0.12, W * 0.62]) {
        g.save();
        g.translate(x, H * 0.18);
        g.fillText("A U R E L I A", 0, 0);
        g.restore();
      }
      // Service panels and warning labels
      g.fillStyle = "#c9c7d6";
      g.fillRect(W * 0.38, H * 0.6, 70, 46);
      g.strokeStyle = "#8a86a4";
      g.lineWidth = 2;
      g.strokeRect(W * 0.38, H * 0.6, 70, 46);
      g.fillStyle = "#d25b6a";
      g.fillRect(W * 0.8, H * 0.7, 56, 14);
      // Soot and heat staining toward the lower edge
      const grad = g.createLinearGradient(0, H, 0, H * 0.62);
      grad.addColorStop(0, "rgba(20,16,26,0.5)");
      grad.addColorStop(1, "rgba(20,16,26,0)");
      g.fillStyle = grad;
      g.fillRect(0, H * 0.62, W, H * 0.38);
      // Streaks
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(30,26,40,${0.03 + r() * 0.05})`;
        g.fillRect(r() * W, H * (0.45 + r() * 0.5), 2 + r() * 3, 30 + r() * 120);
      }
    }
    return c;
  };
  const mk = (cv: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(cv);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  hullTexCache = mk(paint(false), true);
  hullBumpCache = mk(paint(true), false);
  return { map: hullTexCache, bump: hullBumpCache };
}

/** Crinkled gold thermal blanket. */
function foilTexture(): THREE.CanvasTexture {
  if (foilTexCache) return foilTexCache;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const r = rand(21);
  g.fillStyle = "#c79a3c";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 700; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const l = 12 + r() * 40;
    const a = r() * Math.PI;
    g.strokeStyle = r() > 0.5 ? `rgba(255,224,150,${0.12 + r() * 0.25})` : `rgba(110,72,20,${0.12 + r() * 0.25})`;
    g.lineWidth = 1 + r() * 2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  foilTexCache = new THREE.CanvasTexture(c);
  foilTexCache.colorSpace = THREE.SRGBColorSpace;
  foilTexCache.wrapS = foilTexCache.wrapT = THREE.RepeatWrapping;
  return foilTexCache;
}

/** Hazard stripes and concentric guide rings for the launch pad. */
function padTexture(): THREE.CanvasTexture {
  if (padTexCache) return padTexCache;
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const g = c.getContext("2d")!;
  g.fillStyle = "#1c1b2a";
  g.fillRect(0, 0, 1024, 1024);
  g.translate(512, 512);
  g.strokeStyle = "rgba(184,166,232,0.55)";
  g.lineWidth = 3;
  for (const r of [120, 220, 330, 420]) {
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
  }
  // Hazard ring: alternating wedges
  for (let i = 0; i < 48; i++) {
    g.fillStyle = i % 2 ? "#e0b341" : "#14131f";
    g.beginPath();
    g.arc(0, 0, 490, (i / 48) * Math.PI * 2, ((i + 1) / 48) * Math.PI * 2);
    g.arc(0, 0, 462, ((i + 1) / 48) * Math.PI * 2, (i / 48) * Math.PI * 2, true);
    g.closePath();
    g.fill();
  }
  // Radial flame-trench lines
  g.strokeStyle = "rgba(255,255,255,0.08)";
  g.lineWidth = 2;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * 130, Math.sin(a) * 130);
    g.lineTo(Math.cos(a) * 440, Math.sin(a) * 440);
    g.stroke();
  }
  padTexCache = new THREE.CanvasTexture(c);
  padTexCache.colorSpace = THREE.SRGBColorSpace;
  padTexCache.anisotropy = 8;
  return padTexCache;
}

/** Clear-coated painted hull for tanks. The texture repeats with the tank's size so panels stay square. */
function hullPaint(color: number, tint: number, circumference: number, height: number): THREE.MeshPhysicalMaterial {
  const { map, bump } = hullTextures();
  const m = map.clone();
  const b = bump.clone();
  const rx = Math.max(1, Math.round(circumference / 3.2));
  const ry = Math.max(1, Math.round(height / 2.6));
  for (const t of [m, b]) t.repeat.set(rx, ry);
  m.needsUpdate = b.needsUpdate = true;
  return new THREE.MeshPhysicalMaterial({ color, map: m, bumpMap: b, bumpScale: 0.9, metalness: 0.28, roughness: 0.36, clearcoat: 0.7, clearcoatRoughness: 0.22, envMapIntensity: 1.1, emissive: tint, emissiveIntensity: 0 });
}

const PLUME_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vObj;
  void main() {
    vUv = uv;
    vObj = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Exhaust plume: turbulent flame that cools from white-blue at the nozzle to orange, with shock diamonds along the core.
const PLUME_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vObj;
  uniform float uTime;
  uniform float uK;
  uniform float uCore;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    // vUv.y runs from the nozzle (1 at the cone's base) to the tip (0).
    float along = 1.0 - vUv.y;
    float ang = vUv.x * 6.2831;
    float n = noise(vec2(ang * 3.0 + uTime * 2.0, along * 9.0 - uTime * 22.0)) * 0.6 + noise(vec2(ang * 7.0 - uTime * 3.0, along * 20.0 - uTime * 40.0)) * 0.4;
    float body = pow(1.0 - along, 0.8 + (1.0 - uCore) * 0.8) * (0.55 + 0.7 * n);
    float edge = smoothstep(0.0, 0.25, 1.0 - along);
    float diamonds = pow(max(0.0, sin(along * 34.0 - uTime * 2.0)), 6.0) * (1.0 - along) * 0.8 * uCore;
    vec3 hot = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.95, 0.85), along);
    vec3 cool = mix(vec3(1.0, 0.55, 0.15), vec3(0.8, 0.22, 0.06), along);
    vec3 col = mix(hot, cool, smoothstep(0.0, 0.7, along + (1.0 - uCore) * 0.35));
    col += vec3(1.0, 0.9, 0.7) * diamonds;
    float a = body * edge * uK;
    gl_FragColor = vec4(col * a * 1.6, a);
  }
`;

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], owner?: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (owner !== undefined) m.userData.owner = owner;
  return m;
}

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w = 256, h = 256, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

function clusterPositions(n: number, radius: number): [number, number][] {
  if (n === 1) return [[0, 0]];
  const ring = n <= 4 ? n : n - 1;
  const out: [number, number][] = [];
  if (n > 4) out.push([0, 0]);
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2 + (n === 2 ? 0 : Math.PI / 2);
    out.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  return out;
}

export interface Built {
  group: THREE.Group;
  /** Stage and craft groups, so the exploded view can separate them. */
  sections: THREE.Group[];
  height: number;
  engineBases: { pos: THREE.Vector3; d: number; len: number }[];
}

export class HangarScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
  private controls: OrbitControls;
  private rocket = new THREE.Group();
  private gantry = new THREE.Group();
  private flames = new THREE.Group();
  private flameLight = new THREE.PointLight(0xff9a40, 0, 40, 1.6);
  private selectionBox: THREE.Box3Helper | null = null;
  private scanner: THREE.Mesh;
  private pulseRing!: THREE.Mesh;
  private smoke!: THREE.Points;
  private smokeData: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number }[] = [];
  private beacons: THREE.Mesh[] = [];
  private plumeUniforms: { uTime: { value: number }; uK: { value: number } } = { uTime: { value: 0 }, uK: { value: 0 } };
  private dust: THREE.Points;
  private sections: THREE.Group[] = [];
  private explode = { v: 0, target: 0 };
  private firing = false;
  private fireK = 0;
  private height = 12;
  private fitted = 0;
  private selected: number | null = null;
  private hovered: number | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private down = { x: 0, y: 0 };
  private observer: ResizeObserver;
  private raf = 0;
  private t0 = performance.now();
  private reduced = store.get().settings.reducedMotion;
  private camTween = { y: 6, dist: 30 };

  constructor(private container: HTMLElement, private cb: HangarCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = "hangar-canvas";
    container.append(this.renderer.domElement);

    // No solid background: the page's live starfield shows through behind the hangar.
    this.scene.fog = new THREE.FogExp2(0x080817, 0.011);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;
    pmrem.dispose();

    this.buildHangar();
    this.scene.add(this.rocket, this.gantry, this.flames, this.flameLight);

    this.scanner = new THREE.Mesh(
      new THREE.TorusGeometry(4.6, 0.035, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0xb8a6e8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.scanner.rotation.x = Math.PI / 2;
    this.scene.add(this.scanner);

    const dustGeo = new THREE.BufferGeometry();
    const n = 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 50, Math.random() * 36, (Math.random() - 0.5) * 50], i * 3);
    dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xcfc8ff, size: 0.12, transparent: true, opacity: 0.35, depthWrite: false }));
    this.scene.add(this.dust);

    // Smoke particles (soft round sprites), recycled while the engines fire.
    const smokeCount = 360;
    const sPos = new Float32Array(smokeCount * 3);
    for (let i = 0; i < smokeCount; i++) {
      this.smokeData.push({ x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, life: Math.random() });
      sPos[i * 3 + 1] = -50;
    }
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
    const puff = document.createElement("canvas");
    puff.width = puff.height = 64;
    const pg = puff.getContext("2d")!;
    const grd = pg.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,240,225,0.9)");
    grd.addColorStop(0.5, "rgba(210,200,215,0.35)");
    grd.addColorStop(1, "rgba(200,195,210,0)");
    pg.fillStyle = grd;
    pg.fillRect(0, 0, 64, 64);
    this.smoke = new THREE.Points(sGeo, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(puff), size: 3.4, transparent: true, opacity: 0, depthWrite: false, color: 0xe9e3f2 }));
    this.smoke.frustumCulled = false;
    this.scene.add(this.smoke);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 80;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.screenSpacePanning = true;
    this.controls.autoRotateSpeed = 0.7;
    this.controls.target.set(0, 7, 0);
    this.camera.position.set(15, 19, 23.4);

    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointermove", this.onMove);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.loop();
  }

  /* ---------- environment ---------- */

  private buildHangar(): void {
    const floorTex = canvasTexture((ctx, w, h) => {
      ctx.fillStyle = "#12111f";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(184,166,232,0.22)";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);
      ctx.strokeStyle = "rgba(184,166,232,0.08)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo((w / 4) * i, 0);
        ctx.lineTo((w / 4) * i, h);
        ctx.moveTo(0, (h / 4) * i);
        ctx.lineTo(w, (h / 4) * i);
        ctx.stroke();
      }
    }, 256, 256, [24, 24]);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ map: floorTex, color: 0xffffff, metalness: 0.7, roughness: 0.32 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Launch pad: hazard ring, guide rings and flame-trench lines, with lit edge strips.
    const pad = mesh(new THREE.CylinderGeometry(3.9, 4.1, 0.35, 64), [std(0x2a2838, 0.8, 0.4), new THREE.MeshPhysicalMaterial({ map: padTexture(), metalness: 0.75, roughness: 0.3, clearcoat: 0.5 }), std(0x1a1926, 0.8, 0.4)]);
    pad.position.y = -0.175;
    this.scene.add(pad);
    const padGlow = new THREE.Mesh(new THREE.TorusGeometry(4.0, 0.035, 8, 96), new THREE.MeshBasicMaterial({ color: 0xb8a6e8 }));
    padGlow.rotation.x = Math.PI / 2;
    padGlow.position.y = 0.02;
    this.scene.add(padGlow);
    this.pulseRing = new THREE.Mesh(new THREE.RingGeometry(0.98, 1, 96), new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.pulseRing.rotation.x = -Math.PI / 2;
    this.pulseRing.position.y = 0.03;
    this.scene.add(this.pulseRing);
    for (const [r, o] of [[5.2, 0.55], [7.5, 0.25], [11, 0.12]] as const) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.08, 96), new THREE.MeshBasicMaterial({ color: 0xb8a6e8, transparent: true, opacity: o, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.012;
      this.scene.add(ring);
    }
    // Four spotlights on posts around the pad, like real pad lighting.
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const px = Math.cos(a) * 9;
      const pz = Math.sin(a) * 9;
      const post = mesh(new THREE.CylinderGeometry(0.1, 0.14, 6, 10), std(0x2b2a3d, 0.85, 0.35));
      post.position.set(px, 3, pz);
      this.scene.add(post);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.4), new THREE.MeshBasicMaterial({ color: 0xe8e4ff }));
      lamp.position.set(px, 6.1, pz);
      lamp.lookAt(0, 8, 0);
      this.scene.add(lamp);
      const spot = new THREE.SpotLight(0xdcd6ff, 220, 60, 0.38, 0.7, 1.4);
      spot.position.set(px, 6.1, pz);
      spot.target.position.set(0, 9, 0);
      this.scene.add(spot, spot.target);
    }

    // Walls with panel lines
    const wallTex = canvasTexture((ctx, w, h) => {
      ctx.fillStyle = "#14122a";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(117,99,181,0.35)";
      ctx.lineWidth = 3;
      ctx.strokeRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(117,99,181,0.12)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(0, (h / 8) * i);
        ctx.lineTo(w, (h / 8) * i);
        ctx.stroke();
      }
    }, 256, 256, [10, 5]);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, metalness: 0.5, roughness: 0.55 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(120, 56), wallMat);
    back.position.set(0, 28, -34);
    this.scene.add(back);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(120, 56), wallMat);
      side.position.set(sx * 46, 28, -4);
      side.rotation.y = -sx * Math.PI / 2;
      this.scene.add(side);
    }

    // Steel columns and roof trusses
    const steel = std(0x2b2a3d, 0.8, 0.4);
    for (const sx of [-1, 1]) {
      for (let i = -3; i <= 2; i++) {
        const col = mesh(new THREE.BoxGeometry(1.2, 52, 1.2), steel);
        col.position.set(sx * 30, 26, i * 11 - 10);
        col.castShadow = false;
        this.scene.add(col);
      }
    }
    for (let i = -3; i <= 2; i++) {
      const beam = mesh(new THREE.BoxGeometry(62, 1.0, 1.0), steel);
      beam.position.set(0, 50, i * 11 - 10);
      beam.castShadow = false;
      this.scene.add(beam);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(6, 0.25, 1.6), new THREE.MeshBasicMaterial({ color: 0xd8d4ff }));
      lamp.position.set(0, 49, i * 11 - 10);
      this.scene.add(lamp);
    }
    // Glowing window band on the back wall
    const band = new THREE.Mesh(new THREE.PlaneGeometry(100, 3.2), new THREE.MeshBasicMaterial({ color: 0x6d5fc0, transparent: true, opacity: 0.55 }));
    band.position.set(0, 38, -33.9);
    this.scene.add(band);

    // Lighting
    this.scene.add(new THREE.HemisphereLight(0x8c7fd0, 0x07070f, 0.55));
    const key = new THREE.DirectionalLight(0xf2f0ff, 2.2);
    key.position.set(18, 42, 26);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -22;
    key.shadow.camera.right = 22;
    key.shadow.camera.top = 40;
    key.shadow.camera.bottom = -6;
    key.shadow.camera.near = 5;
    key.shadow.camera.far = 120;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8a7bff, 1.5);
    rim.position.set(-26, 18, -18);
    this.scene.add(rim);
    const fill = new THREE.PointLight(0x7563b5, 120, 70, 1.6);
    fill.position.set(-12, 6, 14);
    this.scene.add(fill);

    // Volumetric light shafts under the roof lamps
    for (let i = -3; i <= 2; i += 2) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(7.5, 48, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xb8a6ff, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }),
      );
      cone.position.set(0, 25, i * 11 - 10);
      this.scene.add(cone);
    }
  }

  private buildGantry(height: number): void {
    for (const c of [...this.gantry.children]) {
      this.gantry.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
    }
    const steel = std(0x3b3a52, 0.85, 0.35);
    const accent = new THREE.MeshBasicMaterial({ color: 0xb8a6e8 });
    const H = height + 5;
    const w = 1.8;
    const x = -6.2;
    const post = (px: number, pz: number) => {
      const p = mesh(new THREE.BoxGeometry(0.16, H, 0.16), steel);
      p.position.set(x + px, H / 2, pz);
      this.gantry.add(p);
    };
    post(-w / 2, -w / 2);
    post(w / 2, -w / 2);
    post(-w / 2, w / 2);
    post(w / 2, w / 2);
    for (let y = 1.5; y < H; y += 2.5) {
      for (const [px, pz, sx, sz] of [[0, -w / 2, w, 0.1], [0, w / 2, w, 0.1], [-w / 2, 0, 0.1, w], [w / 2, 0, 0.1, w]] as const) {
        const r = mesh(new THREE.BoxGeometry(sx, 0.08, sz), steel);
        r.position.set(x + px, y, pz);
        this.gantry.add(r);
      }
      const d = mesh(new THREE.BoxGeometry(0.06, 2.9, 0.06), steel);
      d.position.set(x, y + 1.25, -w / 2);
      d.rotation.z = 0.62;
      this.gantry.add(d);
    }
    // Service arms reaching to the vehicle, with status lights
    for (let y = 6; y < H - 2; y += 9) {
      const arm = mesh(new THREE.BoxGeometry(5, 0.3, 0.7), steel);
      arm.position.set(x + 3.4, y, 0);
      this.gantry.add(arm);
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), accent);
      light.position.set(x + 5.9, y + 0.3, 0);
      this.gantry.add(light);
    }
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), new THREE.MeshBasicMaterial({ color: 0xef8a9a }));
    beacon.position.set(x, H + 0.3, 0);
    this.gantry.add(beacon);
    this.beacons = [beacon];
  }

  /* ---------- rocket ---------- */

  /** Builds the vehicle model from a design. Pure: it needs no hangar instance, so mission views reuse it. */
  static build(design: Design): Built {
    const root = new THREE.Group();
    const sections: THREE.Group[] = [];
    const engineBases: Built["engineBases"] = [];
    const activeStages = STAGE_TARGETS.filter((t) => partsIn(design, t).length > 0);
    const b = bus(design);

    // Stage 1 must clear the pad, so find how far the nozzles protrude.
    let protrusion = 0;
    const stageInfo = activeStages.map((t) => {
      const items = partsIn(design, t);
      const tanks = items.filter((x) => x.part.category === "tank");
      const engines = items.filter((x) => x.part.category === "engine");
      const D = tanks.length ? Math.max(...tanks.map((x) => (x.part as TankPart).diameter)) : engines.length ? Math.max(...engines.map((x) => (x.part as EnginePart).diameter)) * 1.7 + 0.2 : 1;
      const engLen = engines.length ? Math.max(...engines.map((x) => (x.part as EnginePart).length)) : 0.3;
      return { t, items, tanks, engines, D: Math.max(D, 0.9), engineH: engLen * 0.72 + 0.25, engLen };
    });
    if (stageInfo[0]) protrusion = Math.max(0, stageInfo[0].engLen - (stageInfo[0].engineH - 0.2));
    let y = stageInfo.length ? protrusion + 0.15 : 1.4;
    const craftBaseD = b ? b.size : 1;

    stageInfo.forEach((s, si) => {
      const sg = new THREE.Group();
      sg.position.y = y;
      sg.userData.baseY = y;
      const hull = COLORS.hull[Math.min(si, 2)];
      const skirt = mesh(new THREE.CylinderGeometry(s.D / 2, s.D / 2 * 1.02, s.engineH, 40), std(COLORS.gun, 0.8, 0.38));
      skirt.position.y = s.engineH / 2;
      sg.add(skirt);
      // Thrust structure: a ring of reinforcing ribs and a darker base plate around the engines.
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const rib = mesh(new THREE.BoxGeometry(0.05, s.engineH * 0.9, 0.12), std(0x23222f, 0.8, 0.4));
        rib.position.set(Math.cos(a) * (s.D / 2 + 0.01), s.engineH / 2, Math.sin(a) * (s.D / 2 + 0.01));
        rib.rotation.y = -a;
        sg.add(rib);
      }

      // Engines
      const ringR = Math.max(s.D * 0.28, s.engines.length > 1 ? 0.55 : 0);
      const maxD = s.engines.length ? Math.max(...s.engines.map((e) => (e.part as EnginePart).diameter)) : 0;
      const fit = s.engines.length > 1 ? Math.min(1, ((s.D / 2) * 0.92) / (ringR + maxD / 2)) : 1;
      const spots = clusterPositions(s.engines.length, ringR);
      s.engines.forEach((e, i) => {
        const ep = e.part as EnginePart;
        const d = ep.diameter * fit;
        const len = ep.length;
        const eg = new THREE.Group();
        // A bell contour: narrow throat, rapid expansion, then a gentle flare. Ribs run along its length.
        const pts: THREE.Vector2[] = [];
        for (let k = 0; k <= 18; k++) {
          const u = k / 18; // 0 = exit, 1 = throat
          const rr = 0.1 + 0.4 * Math.pow(1 - u, 0.62) * (1 - 0.12 * Math.sin(u * Math.PI));
          pts.push(new THREE.Vector2(rr * d, u * len));
        }
        const bellMat = new THREE.MeshPhysicalMaterial({ color: 0x5a5868, metalness: 0.95, roughness: 0.28, side: THREE.DoubleSide, clearcoat: 0.3, envMapIntensity: 1.3, emissive: 0xff5a1a, emissiveIntensity: 0 });
        bellMat.userData.bell = true;
        const bell = mesh(new THREE.LatheGeometry(pts, 36), bellMat, e.index);
        eg.add(bell);
        // Cooling-channel ribs and a heated throat band.
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * Math.PI * 2;
          const rib = mesh(new THREE.BoxGeometry(0.018 * d, len * 0.82, 0.018 * d), std(0x8a8899, 0.9, 0.3), e.index);
          rib.position.set(Math.cos(a) * d * 0.27, len * 0.46, Math.sin(a) * d * 0.27);
          rib.rotation.set(Math.sin(a) * 0.2, -a, -Math.cos(a) * 0.2);
          eg.add(rib);
        }
        const lip = mesh(new THREE.TorusGeometry(0.5 * d, 0.02 * d + 0.01, 8, 36), std(0xb9b7c6, 0.95, 0.25), e.index);
        lip.rotation.x = Math.PI / 2;
        eg.add(lip);
        const chamber = mesh(new THREE.CylinderGeometry(d * 0.22, d * 0.26, len * 0.3, 20), std(COLORS.foil, 0.95, 0.3, { map: foilTexture(), envMapIntensity: 1.4 }), e.index);
        chamber.position.y = len * 1.05;
        eg.add(chamber);
        // Turbopump and feed lines
        const pump = mesh(new THREE.CylinderGeometry(d * 0.12, d * 0.12, len * 0.36, 16), std(0x3c3b4c, 0.85, 0.32), e.index);
        pump.position.set(d * 0.3, len * 1.02, 0);
        eg.add(pump);
        const pipe = mesh(new THREE.TorusGeometry(d * 0.17, d * 0.018, 8, 20, Math.PI), std(0xc9c8d6, 0.9, 0.3), e.index);
        pipe.position.set(d * 0.15, len * 1.2, 0);
        eg.add(pipe);
        const [px, pz] = spots[i] ?? [0, 0];
        const topY = s.engineH - 0.05;
        eg.position.set(px, topY - len, pz);
        sg.add(eg);
        if (si === 0) engineBases.push({ pos: new THREE.Vector3(px, y + topY - len, pz), d, len });
      });

      // Tanks
      let cur = s.engineH;
      s.tanks.forEach((t) => {
        const tp = t.part as TankPart;
        const tank = mesh(new THREE.CylinderGeometry(tp.diameter / 2, tp.diameter / 2, tp.height, 64), hullPaint(hull, 0xb8a6e8, Math.PI * tp.diameter, tp.height), t.index);
        tank.position.y = cur + tp.height / 2;
        sg.add(tank);
        // Domed ends make each tank read as a pressure vessel rather than a plain cylinder.
        for (const sign of [-1, 1]) {
          const dome = mesh(new THREE.SphereGeometry(tp.diameter / 2, 40, 12, 0, Math.PI * 2, 0, Math.PI / 2), hullPaint(hull, 0xb8a6e8, Math.PI * tp.diameter * 0.5, tp.diameter * 0.3), t.index);
          dome.scale.y = 0.16;
          dome.position.y = cur + (sign > 0 ? tp.height : 0);
          if (sign < 0) dome.rotation.x = Math.PI;
          sg.add(dome);
        }
        for (const f of [0.14, 0.86]) {
          const band = mesh(new THREE.CylinderGeometry(tp.diameter / 2 + 0.018, tp.diameter / 2 + 0.018, tp.height * 0.045, 64), new THREE.MeshPhysicalMaterial({ color: COLORS.accent, metalness: 0.6, roughness: 0.28, clearcoat: 0.8 }), t.index);
          band.position.y = cur + tp.height * f;
          sg.add(band);
        }
        const seam = mesh(new THREE.CylinderGeometry(tp.diameter / 2 + 0.035, tp.diameter / 2 + 0.035, 0.07, 64), std(COLORS.gun, 0.85, 0.35), t.index);
        seam.position.y = cur + tp.height;
        sg.add(seam);
        // Vertical feed line (a raised external conduit) and its brackets.
        const conduit = mesh(new THREE.CylinderGeometry(0.035, 0.035, tp.height * 0.96, 10), std(0xb8b6c8, 0.9, 0.3), t.index);
        conduit.position.set(tp.diameter / 2 + 0.05, cur + tp.height / 2, 0);
        sg.add(conduit);
        for (let k = 1; k < 4; k++) {
          const clamp = mesh(new THREE.TorusGeometry(0.05, 0.015, 6, 12), std(0x2a2938, 0.8, 0.4), t.index);
          clamp.position.set(tp.diameter / 2 + 0.05, cur + (tp.height * k) / 4, 0);
          clamp.rotation.x = Math.PI / 2;
          sg.add(clamp);
        }
        cur += tp.height;
      });
      // Empty stage: a short placeholder body so the engine has something to push
      if (!s.tanks.length) cur += 0.8;

      // Adapter to whatever sits above
      const nextD = stageInfo[si + 1]?.D ?? (b ? craftBaseD * 1.15 : 0.3);
      const adapterH = 0.5 + Math.abs(s.D - nextD) * 0.45;
      const adapter = mesh(new THREE.CylinderGeometry(nextD / 2, s.D / 2, adapterH, 48), new THREE.MeshPhysicalMaterial({ color: COLORS.gun, metalness: 0.75, roughness: 0.34, clearcoat: 0.4 }));
      adapter.position.y = cur + adapterH / 2;
      sg.add(adapter);
      // Separation ring with a thin glowing line, where the stages part.
      const sepRing = new THREE.Mesh(new THREE.TorusGeometry(s.D / 2 + 0.01, 0.018, 6, 64), new THREE.MeshBasicMaterial({ color: 0xb8a6e8 }));
      sepRing.rotation.x = Math.PI / 2;
      sepRing.position.y = cur + adapterH;
      sg.add(sepRing);
      cur += adapterH;
      root.add(sg);
      sections.push(sg);
      y += cur;
    });

    // Spacecraft
    const craft = new THREE.Group();
    craft.userData.baseY = y;
    sections.push(craft);
    if (b) {
      HangarScene.buildCraft(craft, design, b);
      craft.position.y = y;
      y += craftHeight(design, b);
    } else if (stageInfo.length) {
      // Nose cap so an unfinished stack still looks sealed
      const cap = mesh(new THREE.ConeGeometry(stageInfo[stageInfo.length - 1].D * 0.5, 1.6, 40), std(COLORS.hull[2], 0.4, 0.4));
      cap.position.y = y + 0.8;
      craft.position.y = 0;
      craft.add(cap);
      y += 1.6;
    }
    root.add(craft);
    return { group: root, sections, height: Math.max(y, 3), engineBases };
  }

  private static buildCraft(g: THREE.Group, design: Design, b: StructurePart): void {
    const items = partsIn(design, "craft" as Target);
    const hasShield = items.some((x) => (x.part as SystemsPart).style === "shield");
    const shieldH = hasShield ? 0.35 : 0;
    const H = b.size * 0.95;
    const R = b.size / 2;
    const busIndex = design.parts.findIndex((r) => part(r).category === "structure");
    const base = shieldH;

    const body = mesh(new THREE.CylinderGeometry(R, R, H, 6), new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: foilTexture(), metalness: 0.9, roughness: 0.3, clearcoat: 0.5, envMapIntensity: 1.5 }), busIndex);
    body.position.y = base + H / 2;
    g.add(body);
    for (const yy of [0.04, 0.96]) {
      const plate = mesh(new THREE.CylinderGeometry(R * 1.04, R * 1.04, 0.07, 6), std(0xcfd0da, 0.8, 0.3), busIndex);
      plate.position.y = base + H * yy;
      g.add(plate);
    }

    let faceCount = 0;
    let topCount = 0;
    const solarSide = [0, 0];
    const apothem = R * Math.cos(Math.PI / 6);
    const faceAngle = (k: number) => Math.PI / 6 + (k % 6) * (Math.PI / 3);
    const placeOnFace = (obj: THREE.Object3D, out: number, yFrac: number) => {
      const a = faceAngle(faceCount++);
      obj.position.set(Math.cos(a) * (apothem + out), base + H * yFrac, -Math.sin(a) * (apothem + out));
      obj.rotation.y = a;
      g.add(obj);
    };

    const planeFor = (owner: number) => (geo: THREE.BufferGeometry, mat: THREE.Material) => mesh(geo, mat, owner);

    for (const it of items) {
      const p = it.part;
      const m = planeFor(it.index);
      if (p.category === "solar") {
        const sp = p as SolarPart;
        const side = solarSide[0] <= solarSide[1] ? -1 : 1;
        const stack = solarSide[side < 0 ? 0 : 1]++;
        const plates = sp.size * 2;
        const pw = 0.75 + b.size * 0.25;
        const wing = new THREE.Group();
        const tex = canvasTexture((ctx, w, h) => {
          ctx.fillStyle = "#16265a";
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = "rgba(160,190,255,0.55)";
          ctx.lineWidth = 1.5;
          for (let i = 0; i <= 8; i++) {
            ctx.beginPath();
            ctx.moveTo((w / 8) * i, 0);
            ctx.lineTo((w / 8) * i, h);
            ctx.stroke();
          }
          for (let i = 0; i <= 4; i++) {
            ctx.beginPath();
            ctx.moveTo(0, (h / 4) * i);
            ctx.lineTo(w, (h / 4) * i);
            ctx.stroke();
          }
        }, 256, 128);
        const boom = m(new THREE.CylinderGeometry(0.03, 0.03, plates * (pw + 0.06) + 0.2, 8), std(0x9a9aa8, 0.8, 0.4));
        boom.rotation.z = Math.PI / 2;
        boom.position.x = (plates * (pw + 0.06) + 0.2) / 2;
        wing.add(boom);
        for (let i = 0; i < plates; i++) {
          const plate = m(new THREE.BoxGeometry(pw, 1.5, 0.035), new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: tex, metalness: 0.75, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x0a1230, emissiveIntensity: 0.6, envMapIntensity: 1.6 }));
          plate.position.set(0.15 + pw / 2 + i * (pw + 0.06), 0, 0);
          wing.add(plate);
        }
        wing.position.set(side * (apothem + 0.05), base + H * 0.5, Math.ceil(stack / 2) * (stack % 2 ? 1 : -1) * 1.7);
        if (side < 0) wing.scale.x = -1;
        g.add(wing);
      } else if (p.category === "battery") {
        const bp = p as BatteryPart;
        const s = 0.26 + Math.pow(bp.wh / 9600, 0.33) * 0.42;
        const box = m(new THREE.BoxGeometry(s * 0.7, s, s), std(0x2e2c40, 0.7, 0.4, { emissive: 0x3d8a5a, emissiveIntensity: 0.15 }));
        placeOnFace(box, s * 0.35, 0.28);
        const stripe = m(new THREE.BoxGeometry(0.02, s * 0.6, s * 0.7), new THREE.MeshBasicMaterial({ color: 0x8fd6b0 }));
        stripe.position.set(s * 0.36, 0, 0);
        box.add(stripe);
      } else if (p.category === "antenna") {
        const ap = p as AntennaPart;
        const k = topCount++;
        const ox = (k % 2 ? 1 : -1) * Math.min(R * 0.5, 0.35) * (k > 1 ? 1.6 : 1);
        const top = base + H;
        if (ap.style === "patch") {
          const d = m(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 20), std(0xdcdce6, 0.5, 0.4));
          d.position.set(ox, top + 0.05, 0);
          g.add(d);
        } else {
          const r = ap.style === "hga" ? 0.95 : 0.55;
          const mast = m(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), std(0x9a9aa8, 0.8, 0.4));
          mast.position.set(ox, top + 0.35, 0);
          g.add(mast);
          const dish = m(new THREE.SphereGeometry(r, 28, 10, 0, Math.PI * 2, 0, Math.PI / 3.2), std(0xf2f2f8, 0.4, 0.3, { side: THREE.DoubleSide }));
          dish.position.set(ox, top + 0.7 + r * 0.8, 0);
          dish.rotation.set(-Math.PI / 2.6, 0.3 * (k % 2 ? 1 : -1), 0);
          g.add(dish);
          const feed = m(new THREE.CylinderGeometry(0.02, 0.02, r * 0.9, 6), std(0x9a9aa8, 0.8, 0.4));
          feed.position.set(ox, top + 0.7 + r * 1.2, r * 0.35);
          feed.rotation.x = Math.PI / 2.6;
          g.add(feed);
        }
      } else if (p.category === "science") {
        const sp = p as SciencePart;
        const holder = new THREE.Group();
        if (sp.style === "camera") {
          holder.add(m(new THREE.BoxGeometry(0.3, 0.28, 0.3), std(0x24223a, 0.6, 0.4)));
          const lens = m(new THREE.CylinderGeometry(0.1, 0.12, 0.22, 20), std(0x0b0b14, 0.9, 0.2));
          lens.rotation.z = Math.PI / 2;
          lens.position.x = 0.2;
          holder.add(lens);
          const glass = new THREE.Mesh(new THREE.CircleGeometry(0.085, 20), new THREE.MeshBasicMaterial({ color: 0x7fc8ff }));
          glass.rotation.y = Math.PI / 2;
          glass.position.x = 0.315;
          holder.add(glass);
        } else if (sp.style === "spectrometer") {
          holder.add(m(new THREE.BoxGeometry(0.28, 0.3, 0.42), std(0x2b294a, 0.6, 0.4)));
          const tube = m(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 16), std(0xc9c9d6, 0.8, 0.3));
          tube.rotation.z = Math.PI / 2;
          tube.position.x = 0.35;
          holder.add(tube);
        } else if (sp.style === "seismometer") {
          const puck = m(new THREE.CylinderGeometry(0.22, 0.26, 0.16, 20), std(0x34324e, 0.7, 0.35));
          puck.rotation.z = Math.PI / 2;
          holder.add(puck);
          const dome = m(new THREE.SphereGeometry(0.14, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0xd8d9e0, 0.6, 0.3));
          dome.rotation.z = -Math.PI / 2;
          dome.position.x = 0.1;
          holder.add(dome);
        } else {
          holder.add(m(new THREE.BoxGeometry(0.3, 0.3, 0.3), std(0x2b294a, 0.6, 0.4)));
          const arm = m(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8), std(0xb8b8c6, 0.8, 0.35));
          arm.position.set(0.3, -0.25, 0);
          arm.rotation.z = Math.PI / 3.2;
          holder.add(arm);
        }
        placeOnFace(holder, 0.14, 0.6);
      } else if (p.category === "systems") {
        const sp = p as SystemsPart;
        if (sp.style === "tracker" || sp.style === "imu") {
          const body = m(new THREE.CylinderGeometry(0.09, 0.11, 0.22, 16), std(0x1b1a2b, 0.7, 0.35));
          body.rotation.z = Math.PI / 2;
          const holder = new THREE.Group();
          holder.add(body);
          const eye = new THREE.Mesh(new THREE.CircleGeometry(0.06, 14), new THREE.MeshBasicMaterial({ color: sp.style === "imu" ? 0xb8a6e8 : 0xf0c674 }));
          eye.rotation.y = Math.PI / 2;
          eye.position.x = 0.12;
          holder.add(eye);
          placeOnFace(holder, 0.1, 0.84);
        } else if (sp.style === "legs") {
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
            const leg = m(new THREE.CylinderGeometry(0.035, 0.05, 1.5, 8), std(0xb5b5c4, 0.8, 0.35));
            leg.position.set(Math.cos(a) * (R + 0.45), base - 0.3, Math.sin(a) * (R + 0.45));
            leg.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
            g.add(leg);
            const foot = m(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 16), std(0x6b6a7c, 0.7, 0.4));
            foot.position.set(Math.cos(a) * (R + 1.05), base - 1.02, Math.sin(a) * (R + 1.05));
            g.add(foot);
          }
        } else {
          const shield = m(new THREE.CylinderGeometry(R * 1.35, R * 1.05, shieldH * 1.2, 36), std(0x4a2f22, 0.2, 0.9));
          shield.position.y = shieldH / 2;
          g.add(shield);
        }
      }
    }
  }

  /* ---------- public API ---------- */

  setDesign(design: Design, newIndex?: number): void {
    const prevH = this.height;
    this.rocket.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose());
    });
    this.rocket.clear();
    this.flames.clear();
    const built = HangarScene.build(design);
    this.rocket.add(built.group);
    this.sections = built.sections;
    this.height = built.height;
    this.buildGantry(built.height);
    this.buildFlames(built.engineBases);
    this.setSelected(this.selected !== null && this.selected < design.parts.length ? this.selected : null);

    if (Math.abs(prevH - built.height) > Math.max(2, prevH * 0.12) || !this.fitted) this.fit(!!this.fitted);
    this.fitted = 1;

    if (!this.reduced) {
      // Scan ring sweeps up the stack so changes feel assembled, not swapped.
      const mat = this.scanner.material as THREE.MeshBasicMaterial;
      gsap.killTweensOf([this.scanner.position, mat]);
      this.scanner.position.y = 0.05;
      mat.opacity = 0.9;
      gsap.to(this.scanner.position, { y: built.height, duration: 1.1, ease: "power1.inOut" });
      gsap.to(mat, { opacity: 0, duration: 0.35, delay: 0.85 });
      if (newIndex !== undefined) {
        this.rocket.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.userData.owner === newIndex && m.material instanceof THREE.MeshStandardMaterial) {
            const mt = m.material;
            mt.emissive.set(0xb8a6e8);
            mt.emissiveIntensity = 1.4;
            gsap.to(mt, { emissiveIntensity: 0, duration: 1.2, ease: "power2.out" });
            const s = m.scale.clone();
            m.scale.multiplyScalar(0.55);
            gsap.to(m.scale, { x: s.x, y: s.y, z: s.z, duration: 0.6, ease: "back.out(2)" });
          }
        });
      }
    }
  }

  private buildFlames(bases: Built["engineBases"]): void {
    for (const b of bases) {
      const len = Math.max(4, b.len * 3.2);
      const mk = (radius: number, length: number, core: number) =>
        new THREE.Mesh(
          new THREE.ConeGeometry(radius, length, 28, 12, true),
          new THREE.ShaderMaterial({ vertexShader: PLUME_VERT, fragmentShader: PLUME_FRAG, uniforms: { uTime: this.plumeUniforms.uTime, uK: this.plumeUniforms.uK, uCore: { value: core } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
        );
      const outer = mk(b.d * 0.52, len, 0.0);
      const inner = mk(b.d * 0.3, len * 0.62, 1.0);
      for (const [c, k] of [[outer, 1], [inner, 0.62]] as const) {
        c.rotation.x = Math.PI;
        c.position.copy(b.pos);
        c.position.y += 0.1 - (len * k) / 2;
        c.userData.k = k;
        this.flames.add(c);
      }
    }
  }

  private fit(animate: boolean): void {
    const H = this.height;
    const dist = Math.max(24, H * 1.9 + 14);
    const tgtY = H * 0.45;
    if (!animate || this.reduced) {
      const dir = this.camera.position.clone().sub(this.controls.target).normalize();
      this.controls.target.set(0, tgtY, 0);
      this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
      return;
    }
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.camTween.y = this.controls.target.y;
    this.camTween.dist = this.camera.position.distanceTo(this.controls.target);
    gsap.to(this.camTween, {
      y: tgtY,
      dist,
      duration: 1.1,
      ease: "power2.inOut",
      onUpdate: () => {
        this.controls.target.set(0, this.camTween.y, 0);
        this.camera.position.copy(this.controls.target).addScaledVector(dir, this.camTween.dist);
      },
    });
  }

  resetCamera(): void {
    const d = this.camera.position.distanceTo(this.controls.target);
    const dir = new THREE.Vector3(0.5, 0.4, 0.78).normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(dir, d);
    this.fit(true);
  }

  setExploded(on: boolean): void {
    this.explode.target = on ? 1 : 0;
  }

  setAutoRotate(on: boolean): void {
    this.controls.autoRotate = on;
  }

  setFire(on: boolean): void {
    this.firing = on;
  }

  select(index: number | null): void {
    this.setSelected(index);
  }

  private setSelected(index: number | null): void {
    this.selected = index;
    if (this.selectionBox) {
      this.scene.remove(this.selectionBox);
      this.selectionBox.dispose();
      this.selectionBox = null;
    }
    if (index === null) return;
    const box = new THREE.Box3();
    this.rocket.updateMatrixWorld(true);
    this.rocket.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.userData.owner === index) box.expandByObject(o);
    });
    if (box.isEmpty()) return;
    box.expandByScalar(0.12);
    this.selectionBox = new THREE.Box3Helper(box, new THREE.Color(0xb8a6e8));
    this.scene.add(this.selectionBox);
  }

  /* ---------- input ---------- */

  private pick(e: PointerEvent): number | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    for (const hit of this.raycaster.intersectObject(this.rocket, true)) {
      const owner = hit.object.userData.owner as number | undefined;
      if (owner !== undefined) return owner;
    }
    return null;
  }

  private onDown = (e: PointerEvent): void => {
    this.down = { x: e.clientX, y: e.clientY };
  };

  private onUp = (e: PointerEvent): void => {
    if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5) return;
    const idx = this.pick(e);
    this.setSelected(idx);
    this.cb.onPick(idx);
  };

  private onMove = (e: PointerEvent): void => {
    if (e.buttons) return;
    const idx = this.pick(e);
    if (idx === this.hovered) return;
    this.hovered = idx;
    this.renderer.domElement.style.cursor = idx === null ? "grab" : "pointer";
    this.rocket.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.owner === undefined || !(m.material instanceof THREE.MeshStandardMaterial) || m.material.userData.bell) return;
      if (gsap.isTweening(m.material)) return;
      m.material.emissive.set(0xb8a6e8);
      m.material.emissiveIntensity = m.userData.owner === idx ? 0.35 : 0;
    });
  };

  /* ---------- frame ---------- */

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the vehicle clear of the left palette and right panels on wide screens.
    this.camera.setViewOffset(w, h, w > 1100 ? 20 : 0, 0, w, h);
    this.camera.updateProjectionMatrix();
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const t = (performance.now() - this.t0) / 1000;

    // Exploded view
    this.explode.v += (this.explode.target - this.explode.v) * 0.08;
    const gap = Math.max(2.2, this.height * 0.12);
    this.sections.forEach((s, i) => (s.position.y = (s.userData.baseY as number) + this.explode.v * gap * i));

    // Static fire
    this.fireK += ((this.firing ? 1 : 0) - this.fireK) * 0.12;
    this.plumeUniforms.uTime.value = t;
    this.plumeUniforms.uK.value = this.fireK * (0.9 + Math.sin(t * 40) * 0.06 + Math.random() * 0.05);
    this.flames.children.forEach((c, i) => {
      const flick = 0.92 + Math.sin(t * 38 + i * 1.7) * 0.05 + Math.random() * 0.04;
      c.scale.set(1, flick, 1);
    });
    this.flameLight.intensity = this.fireK * (260 + Math.random() * 40);
    this.flameLight.position.set(0, 1.2, 0);
    if (this.firing && !this.reduced) this.rocket.position.set((Math.random() - 0.5) * 0.012, 0, (Math.random() - 0.5) * 0.012);
    else this.rocket.position.set(0, 0, 0);

    // Engine bells glow cherry-red while firing.
    this.rocket.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material instanceof THREE.MeshPhysicalMaterial && m.material.userData.bell) m.material.emissiveIntensity = this.fireK * 0.55;
    });

    // Exhaust smoke: a ground-hugging cloud that billows outward from the pad while the engines run.
    const sp = this.smoke.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this.smokeData.length; i++) {
      const p = this.smokeData[i];
      p.life -= 0.012;
      if (p.life <= 0) {
        if (this.fireK > 0.3) {
          const a = Math.random() * Math.PI * 2;
          p.x = Math.cos(a) * 0.6;
          p.z = Math.sin(a) * 0.6;
          p.y = 0.3 + Math.random() * 0.4;
          p.vx = Math.cos(a) * (0.05 + Math.random() * 0.07);
          p.vz = Math.sin(a) * (0.05 + Math.random() * 0.07);
          p.vy = 0.01 + Math.random() * 0.025;
          p.life = 1;
        } else p.y = -50;
      } else {
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;
        p.vx *= 0.995;
        p.vz *= 0.995;
      }
      sp.setXYZ(i, p.x, p.y, p.z);
    }
    sp.needsUpdate = true;
    (this.smoke.material as THREE.PointsMaterial).opacity = 0.35 * Math.min(1, this.fireK * 2 + 0.05);

    // Pad scan pulse and gantry beacons.
    const pk = (t * 0.35) % 1;
    this.pulseRing.scale.setScalar(1 + pk * 10);
    (this.pulseRing.material as THREE.MeshBasicMaterial).opacity = (1 - pk) * 0.35;
    this.beacons.forEach((b, i) => ((b.material as THREE.MeshBasicMaterial).color.setHex(Math.sin(t * 3 + i) > 0 ? 0xef8a9a : 0x4a2530)));

    if (this.selectionBox) this.selectionBox.visible = Math.sin(t * 5) > -0.6;

    // Drifting dust motes
    const pos = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + 0.0025;
      if (y > 36) y = 0;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointermove", this.onMove);
    gsap.killTweensOf(this.camTween);
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => {
        (x as THREE.MeshStandardMaterial).map?.dispose();
        x.dispose();
      });
    });
    this.scene.environment?.dispose();
    this.renderer.dispose();
    el.remove();
  }
}

/** Height of the spacecraft module above its base, for stacking. */
function craftHeight(design: Design, b: StructurePart): number {
  const items = partsIn(design, "craft" as Target);
  const hasShield = items.some((x) => (x.part as SystemsPart).style === "shield");
  const hasDish = items.some((x) => (x.part as AntennaPart).category === "antenna" && (x.part as AntennaPart).style !== "patch");
  return b.size * 0.95 + (hasShield ? 0.35 : 0) + (hasDish ? 1.6 : 0.2);
}
