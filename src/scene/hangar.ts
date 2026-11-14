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

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, owner?: number): THREE.Mesh {
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
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = "hangar-canvas";
    container.append(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x07070f);
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

    // Launch pad and floor markings
    const pad = mesh(new THREE.CylinderGeometry(3.6, 3.9, 0.35, 48), std(0x2a2838, 0.7, 0.45));
    pad.position.y = -0.175;
    this.scene.add(pad);
    for (const [r, o] of [[5.2, 0.55], [7.5, 0.25], [11, 0.12]] as const) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.08, 96), new THREE.MeshBasicMaterial({ color: 0xb8a6e8, transparent: true, opacity: o, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.012;
      this.scene.add(ring);
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
      const hullMat = () => std(hull, 0.35, 0.38);
      const skirt = mesh(new THREE.CylinderGeometry(s.D / 2, s.D / 2 * 1.02, s.engineH, 40), std(COLORS.gun, 0.7, 0.45));
      skirt.position.y = s.engineH / 2;
      sg.add(skirt);

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
        const pts = [[0.1, 1], [0.15, 0.88], [0.12, 0.72], [0.2, 0.55], [0.34, 0.3], [0.5, 0.0]].map(([r, yy]) => new THREE.Vector2(r * d, yy * len));
        const bell = mesh(new THREE.LatheGeometry(pts, 28), std(0x4a4958, 0.9, 0.3, { side: THREE.DoubleSide }), e.index);
        eg.add(bell);
        const chamber = mesh(new THREE.CylinderGeometry(d * 0.22, d * 0.26, len * 0.3, 16), std(COLORS.foil, 0.9, 0.35), e.index);
        chamber.position.y = len * 1.05;
        eg.add(chamber);
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
        const tank = mesh(new THREE.CylinderGeometry(tp.diameter / 2, tp.diameter / 2, tp.height, 48), hullMat(), t.index);
        tank.position.y = cur + tp.height / 2;
        sg.add(tank);
        for (const f of [0.14, 0.86]) {
          const band = mesh(new THREE.CylinderGeometry(tp.diameter / 2 + 0.015, tp.diameter / 2 + 0.015, tp.height * 0.045, 48), std(COLORS.accent, 0.5, 0.35), t.index);
          band.position.y = cur + tp.height * f;
          sg.add(band);
        }
        const seam = mesh(new THREE.CylinderGeometry(tp.diameter / 2 + 0.03, tp.diameter / 2 + 0.03, 0.06, 48), std(COLORS.gun, 0.8, 0.4), t.index);
        seam.position.y = cur + tp.height;
        sg.add(seam);
        cur += tp.height;
      });
      // Empty stage: a short placeholder body so the engine has something to push
      if (!s.tanks.length) cur += 0.8;

      // Adapter to whatever sits above
      const nextD = stageInfo[si + 1]?.D ?? (b ? craftBaseD * 1.15 : 0.3);
      const adapterH = 0.5 + Math.abs(s.D - nextD) * 0.45;
      const adapter = mesh(new THREE.CylinderGeometry(nextD / 2, s.D / 2, adapterH, 40), std(COLORS.gun, 0.6, 0.45));
      adapter.position.y = cur + adapterH / 2;
      sg.add(adapter);
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

    const body = mesh(new THREE.CylinderGeometry(R, R, H, 6), std(COLORS.foil, 0.85, 0.32), busIndex);
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
          const plate = m(new THREE.BoxGeometry(pw, 1.5, 0.035), std(0xffffff, 0.35, 0.28, { map: tex, emissive: 0x0a1230, emissiveIntensity: 0.6 }));
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
      const outer = new THREE.Mesh(new THREE.ConeGeometry(b.d * 0.5, len, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xff8a30, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const inner = new THREE.Mesh(new THREE.ConeGeometry(b.d * 0.28, len * 0.6, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      for (const [c, k] of [[outer, 1], [inner, 0.6]] as const) {
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
      if (!m.isMesh || m.userData.owner === undefined || !(m.material instanceof THREE.MeshStandardMaterial)) return;
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
    this.flames.children.forEach((c, i) => {
      const m = c as THREE.Mesh;
      const k = m.userData.k as number;
      const flick = 0.85 + Math.sin(t * 40 + i * 1.7) * 0.1 + Math.random() * 0.08;
      (m.material as THREE.MeshBasicMaterial).opacity = this.fireK * (k === 1 ? 0.5 : 0.85) * flick;
      m.scale.set(1, flick, 1);
    });
    this.flameLight.intensity = this.fireK * (260 + Math.random() * 40);
    this.flameLight.position.set(0, 1.2, 0);
    if (this.firing && !this.reduced) this.rocket.position.set((Math.random() - 0.5) * 0.012, 0, (Math.random() - 0.5) * 0.012);
    else this.rocket.position.set(0, 0, 0);

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
