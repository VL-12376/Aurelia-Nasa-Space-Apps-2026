import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import gsap from "gsap";
import { store } from "../core/store";
import { BODY_INFO, BODY_ORDER, type BodyId } from "../science/bodies";
import { STYLE, createBodyMesh, createGlow, createRings } from "./planetMaterial";

/**
 * Game scene scale (NOT real): orbit distances are compressed with a power law and planet
 * sizes are exaggerated so every world stays visible and clickable.
 */
const orbitRadiusFor = (au: number) => 8 * Math.pow(au, 0.55);
const MIN_DIST = 2.2;
const MAX_DIST = 150;
const DEFAULT_OFFSET = new THREE.Vector3(0, 30, 46);

interface Entry {
  id: BodyId;
  group: THREE.Group;
  mesh: THREE.Mesh;
  pick: THREE.Mesh;
  orbit?: THREE.LineLoop;
  orbitRadius: number;
  omega: number;
  phase: number;
  spin: number;
  parent?: BodyId;
  label: HTMLButtonElement;
}

export interface SolarCallbacks {
  onSelect: (id: BodyId | null) => void;
  onZoom: (norm: number) => void;
}

const PHASES: Partial<Record<BodyId, number>> = { mercury: 0.6, venus: 2.4, earth: 4.1, mars: 5.4, ceres: 1.2, jupiter: 3.2, saturn: 0.2, uranus: 5.0, neptune: 2.0 };

export class SolarSystemScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(48, 1, 0.1, 1200);
  private controls: OrbitControls;
  private entries = new Map<BodyId, Entry>();
  private labelLayer = document.createElement("div");
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pickables: THREE.Mesh[] = [];
  private orbitLines: THREE.LineLoop[] = [];
  private raf = 0;
  private last = performance.now();
  private elapsed = 0;
  private timeScale = 1;
  private paused = false;
  private selected: BodyId | null = null;
  private hovered: BodyId | null = null;
  private follow: BodyId | null = null;
  private lastFollowPos = new THREE.Vector3();
  private fly: { t: number; dur: number; fromTarget: THREE.Vector3; fromCam: THREE.Vector3; dir: THREE.Vector3; dist: number; id: BodyId | null } | null = null;
  private down = { x: 0, y: 0, t: 0 };
  private observer: ResizeObserver;
  private lastZoom = -1;
  private labelsVisible = true;
  private reduced = store.get().settings.reducedMotion;
  private sunDir = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  constructor(private container: HTMLElement, private cb: SolarCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.className = "solar-canvas";
    container.append(this.renderer.domElement);

    this.labelLayer.className = "solar-labels";
    container.append(this.labelLayer);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = MIN_DIST;
    this.controls.maxDistance = MAX_DIST;
    this.controls.zoomSpeed = 0.8;
    this.controls.screenSpacePanning = true;
    this.controls.listenToKeyEvents(window);
    this.controls.keyPanSpeed = 14;

    this.buildStars();
    this.buildSun();
    for (const id of BODY_ORDER) if (id !== "sun") this.buildBody(id);
    this.buildBelt();

    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("dblclick", this.onDouble);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();

    this.paused = this.reduced;
    if (this.reduced) {
      this.camera.position.copy(DEFAULT_OFFSET);
    } else {
      // Opening shot: pull in from deep space.
      this.camera.position.set(0, 160, 260);
      this.startFly(null, DEFAULT_OFFSET.length(), DEFAULT_OFFSET.clone().normalize(), 3.2);
    }
    this.controls.update();
    this.loop();
  }

  /* ---------- building ---------- */

  private buildStars(): void {
    const count = 3200;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(500 + Math.random() * 200);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xf5f4fa, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.85 })));

    // A few faint constellation lines for depth.
    const segs: number[] = [];
    for (let c = 0; c < 14; c++) {
      let p = new THREE.Vector3().randomDirection().multiplyScalar(560);
      const steps = 3 + Math.floor(Math.random() * 3);
      for (let s = 0; s < steps; s++) {
        const q = p.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 50)).setLength(560);
        segs.push(p.x, p.y, p.z, q.x, q.y, q.z);
        p = q;
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(segs, 3));
    this.scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xb8a6e8, transparent: true, opacity: 0.1 })));
  }

  private makeEntry(id: BodyId, group: THREE.Group, mesh: THREE.Mesh, orbitRadius: number, parent?: BodyId): Entry {
    const r = STYLE[id].radius;
    const pick = new THREE.Mesh(new THREE.SphereGeometry(Math.max(r * 1.5, id === "moon" ? 0.5 : 0.95), 12, 12), new THREE.MeshBasicMaterial({ visible: false }));
    pick.userData.id = id;
    group.add(pick);
    this.pickables.push(pick);

    const label = document.createElement("button");
    label.className = "solar-label";
    label.textContent = BODY_INFO[id].name.toUpperCase();
    label.addEventListener("click", () => this.select(id));
    this.labelLayer.append(label);

    const au = BODY_INFO[id].semiMajorAu;
    const entry: Entry = {
      id, group, mesh, pick, orbitRadius,
      omega: id === "moon" ? (Math.PI * 2) / 14 : au > 0 ? (Math.PI * 2) / (90 * Math.pow(Math.pow(au, 1.5), 0.75)) : 0,
      phase: PHASES[id] ?? 0.5,
      spin: id === "jupiter" || id === "saturn" ? 0.4 : id === "venus" ? -0.03 : 0.12,
      parent,
      label,
    };
    this.entries.set(id, entry);
    return entry;
  }

  private buildSun(): void {
    const group = new THREE.Group();
    const mesh = createBodyMesh("sun", STYLE.sun.radius, 64);
    group.add(mesh, createGlow(STYLE.sun.radius * 1.35, "#ff9a3c", 1.5));
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,210,140,0.9)");
    g.addColorStop(0.25, "rgba(255,150,60,0.35)");
    g.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sprite.scale.setScalar(16);
    group.add(sprite);
    this.scene.add(group);
    this.makeEntry("sun", group, mesh, 0);
  }

  private buildBody(id: BodyId): void {
    const style = STYLE[id];
    const info = BODY_INFO[id];
    const isMoon = id === "moon";
    const orbitRadius = isMoon ? 1.5 : orbitRadiusFor(info.semiMajorAu);

    const group = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.rotation.z = THREE.MathUtils.degToRad(style.tilt);
    const mesh = createBodyMesh(id, style.radius, id === "moon" || id === "ceres" ? 40 : 64);
    tilt.add(mesh);
    if (style.atmoPower && style.atmoPower > 0.1) tilt.add(createGlow(style.radius * 1.12, style.atmo ?? "#ffffff", 0.9));
    if (id === "saturn") tilt.add(createRings(style.radius));
    group.add(tilt);

    const entry = this.makeEntry(id, group, mesh, orbitRadius, isMoon ? "earth" : undefined);
    if (isMoon) this.entries.get("earth")!.group.add(group);
    else {
      this.scene.add(group);
      const pts = Array.from({ length: 257 }, (_, i) => {
        const a = (i / 256) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * orbitRadius, 0, Math.sin(a) * orbitRadius);
      });
      const orbit = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xb8a6e8, transparent: true, opacity: 0.22 }));
      this.scene.add(orbit);
      this.orbitLines.push(orbit);
      entry.orbit = orbit;
    }
  }

  private buildBelt(): void {
    const count = 3000;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 12.6 + Math.random() * 3.4;
      pos.set([Math.cos(a) * r, (Math.random() - 0.5) * 0.35, Math.sin(a) * r], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xa9a2b8, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.55 })));
  }

  /* ---------- public controls ---------- */

  select(id: BodyId | null, animate = true): void {
    this.selected = id;
    this.cb.onSelect(id);
    for (const e of this.entries.values()) e.label.classList.toggle("selected", e.id === id);
    for (const e of this.entries.values()) if (e.orbit) (e.orbit.material as THREE.LineBasicMaterial).opacity = e.id === id ? 0.7 : 0.22;
    if (id === null) return;
    const info = STYLE[id];
    const dist = Math.max(info.radius * 6.5 + 3, 5.5);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    // Keep the camera slightly above the orbital plane so the planet is readable.
    if (dir.y < 0.2) dir.y = 0.2;
    this.startFly(id, dist, dir.normalize(), animate && !this.reduced ? 1.6 : 0.01);
  }

  resetView(): void {
    this.select(null);
    for (const e of this.entries.values()) e.label.classList.remove("selected");
    this.startFly(null, DEFAULT_OFFSET.length(), DEFAULT_OFFSET.clone().normalize(), this.reduced ? 0.01 : 1.8);
  }

  setTimeScale(v: number): void {
    this.timeScale = v;
  }

  togglePause(): boolean {
    this.paused = !this.paused;
    return this.paused;
  }

  toggleOrbits(): boolean {
    const visible = !this.orbitLines[0]?.visible;
    this.orbitLines.forEach((l) => (l.visible = visible));
    return visible;
  }

  toggleLabels(): boolean {
    this.labelsVisible = !this.labelsVisible;
    this.labelLayer.style.display = this.labelsVisible ? "" : "none";
    return this.labelsVisible;
  }

  /** Slider position 0 (closest) to 1 (farthest) on a logarithmic scale. */
  setZoom(norm: number): void {
    const dist = Math.exp(Math.log(MIN_DIST) + (Math.log(MAX_DIST) - Math.log(MIN_DIST)) * norm);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
  }

  zoomBy(factor: number): void {
    const off = this.camera.position.clone().sub(this.controls.target);
    const len = THREE.MathUtils.clamp(off.length() * factor, MIN_DIST, MAX_DIST);
    this.camera.position.copy(this.controls.target).add(off.setLength(len));
  }

  /* ---------- camera flight ---------- */

  private startFly(id: BodyId | null, dist: number, dir: THREE.Vector3, dur: number): void {
    this.follow = null;
    this.fly = { t: 0, dur, fromTarget: this.controls.target.clone(), fromCam: this.camera.position.clone(), dir, dist, id };
  }

  private bodyPos(id: BodyId, out: THREE.Vector3): THREE.Vector3 {
    return this.entries.get(id)!.group.getWorldPosition(out);
  }

  /* ---------- input ---------- */

  private onDown = (e: PointerEvent): void => {
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    // Taking manual control cancels a flight in progress.
    this.fly = null;
    if (this.selected && !this.follow) this.follow = this.selected;
    if (this.follow) this.bodyPos(this.follow, this.lastFollowPos);
  };

  private onUp = (e: PointerEvent): void => {
    const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
    if (moved > 6 || performance.now() - this.down.t > 600) return;
    const hit = this.pickAt(e);
    if (hit) this.select(hit);
  };

  private onMove = (e: PointerEvent): void => {
    if (e.buttons) return;
    const hit = this.pickAt(e);
    if (hit !== this.hovered) {
      this.hovered = hit;
      this.renderer.domElement.style.cursor = hit ? "pointer" : "grab";
      for (const en of this.entries.values()) en.label.classList.toggle("hover", en.id === hit);
      for (const en of this.entries.values()) {
        const u = (en.mesh.material as THREE.ShaderMaterial).uniforms.uHighlight;
        if (u) u.value = en.id === hit && en.id !== "sun" ? 0.5 : 0;
      }
    }
  };

  private onDouble = (): void => {
    if (!this.hovered) this.resetView();
  };

  private pickAt(e: PointerEvent): BodyId | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    return hits.length ? (hits[0].object.userData.id as BodyId) : null;
  }

  /* ---------- frame loop ---------- */

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Re-centre the scene in the space left of the info panel on wide screens.
    const shift = w > 900 ? 185 : 0;
    this.camera.setViewOffset(w, h, shift, 0, w, h);
    this.camera.updateProjectionMatrix();
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    if (!this.paused) this.elapsed += dt * this.timeScale;
    this.updateBodies(dt);
    this.updateCamera(dt);
    this.controls.update();
    this.updateLabels();
    this.reportZoom();
    this.renderer.render(this.scene, this.camera);
  };

  private updateBodies(dt: number): void {
    for (const e of this.entries.values()) {
      if (e.id === "sun") {
        (e.mesh.material as THREE.ShaderMaterial).uniforms.uTime.value = this.elapsed;
        continue;
      }
      const a = e.phase + e.omega * this.elapsed;
      e.group.position.set(Math.cos(a) * e.orbitRadius, 0, Math.sin(a) * e.orbitRadius);
      if (!this.paused) e.mesh.rotation.y += e.spin * dt * this.timeScale;
    }
    for (const e of this.entries.values()) {
      if (e.id === "sun") continue;
      const u = (e.mesh.material as THREE.ShaderMaterial).uniforms;
      this.bodyPos(e.id, this.tmp);
      this.sunDir.copy(this.tmp).negate().normalize();
      u.uSun.value.copy(this.sunDir);
      u.uTime.value = this.elapsed;
    }
  }

  private updateCamera(dt: number): void {
    if (this.fly) {
      const f = this.fly;
      f.t += dt;
      const p = Math.min(f.t / f.dur, 1);
      const k = gsap.parseEase("power3.inOut")(p);
      const dest = f.id ? this.bodyPos(f.id, new THREE.Vector3()) : new THREE.Vector3();
      const goalCam = dest.clone().addScaledVector(f.dir, f.dist);
      this.controls.target.lerpVectors(f.fromTarget, dest, k);
      this.camera.position.lerpVectors(f.fromCam, goalCam, k);
      if (p >= 1) {
        this.follow = f.id;
        if (f.id) this.bodyPos(f.id, this.lastFollowPos);
        this.fly = null;
      }
      return;
    }
    if (this.follow) {
      this.bodyPos(this.follow, this.tmp);
      const delta = this.tmp.clone().sub(this.lastFollowPos);
      this.camera.position.add(delta);
      this.controls.target.add(delta);
      this.lastFollowPos.copy(this.tmp);
    }
  }

  private updateLabels(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const camToTarget = this.camera.position.distanceTo(this.controls.target);
    const earthPos = this.bodyPos("earth", new THREE.Vector3());
    for (const e of this.entries.values()) {
      const v = this.bodyPos(e.id, new THREE.Vector3());
      let show = true;
      if (e.id === "moon") show = this.camera.position.distanceTo(earthPos) < 16 || this.selected === "moon";
      const proj = v.clone().project(this.camera);
      const visible = show && proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05;
      e.label.style.display = visible ? "" : "none";
      if (!visible) continue;
      const r = STYLE[e.id].radius;
      // Offset the label below the sphere in screen space, scaled by how big it appears.
      const apparent = (r / Math.max(this.camera.position.distanceTo(v), 0.1)) * h * 0.9;
      e.label.style.transform = `translate(${(proj.x * 0.5 + 0.5) * w}px, ${(-proj.y * 0.5 + 0.5) * h + Math.min(apparent, 120) + 12}px) translate(-50%, 0)`;
      e.label.style.opacity = camToTarget > 120 && e.id !== "sun" ? "0.6" : "1";
    }
  }

  private reportZoom(): void {
    const d = this.camera.position.distanceTo(this.controls.target);
    const norm = (Math.log(d) - Math.log(MIN_DIST)) / (Math.log(MAX_DIST) - Math.log(MIN_DIST));
    const n = THREE.MathUtils.clamp(norm, 0, 1);
    if (Math.abs(n - this.lastZoom) > 0.002) {
      this.lastZoom = n;
      this.cb.onZoom(n);
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("dblclick", this.onDouble);
    this.controls.stopListenToKeyEvents();
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose());
    });
    this.renderer.dispose();
    el.remove();
    this.labelLayer.remove();
  }
}
