import * as THREE from "three";
import type { Telemetry } from "../missions/flight";
import { R_EARTH, R_MARS, R_MOON } from "../missions/kinematics";
import type { Design, Target } from "../spacecraft/design";
import { HangarScene } from "./hangar";
import { LaunchSite, Puffs } from "./launchSite";
import { createBodyMesh, createGlow } from "./planetMaterial";

const M_TO_KM = 0.001;
const R_SUN = 696_000;

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

interface Debris {
  group: THREE.Group;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  age: number;
}

/**
 * Cinematic flight view. Everything is drawn relative to the spacecraft (which sits at the origin)
 * so that a 16 m vehicle and a 6,371 km planet can share one scene without losing precision.
 */
export class MissionScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.0008, 1e10);
  private earth: THREE.Mesh;
  private moon: THREE.Mesh;
  private mars: THREE.Mesh;
  private sun: THREE.Mesh;
  private atmos: THREE.Mesh[] = [];
  private bodies: THREE.Mesh[];
  private stars: THREE.Points;
  private vehicle = new THREE.Group();
  private model: THREE.Group | null = null;
  private height = 16;
  private plume = new THREE.Group();
  private plumeCones: THREE.Mesh[] = [];
  private activeKey = "";
  private debris: Debris[] = [];
  private az = 0.5;
  private raf = 0;
  private observer: ResizeObserver;
  private t = 0;
  private lastTel: Telemetry | null = null;
  private plumeK = 0;
  private reduced: boolean;
  private site: LaunchSite | null = null;
  private trail = new Puffs(700, M_TO_KM, 0xe4dfee, 0.5);
  private prevPos: THREE.Vector3 | null = null;
  private fov = 42;
  private readonly skyDay = new THREE.Color(0x4d82c8);
  private readonly skySpace = new THREE.Color(0x02030a);

  constructor(private container: HTMLElement, private design: Design, reducedMotion: boolean) {
    this.reduced = reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: import.meta.env.DEV });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.domElement.className = "mission-canvas";
    container.append(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x02030a);

    const mk = (id: "earth" | "moon" | "mars" | "sun", r: number) => {
      const m = createBodyMesh(id, r, id === "sun" ? 48 : 96);
      m.frustumCulled = false;
      this.scene.add(m);
      return m;
    };
    this.earth = mk("earth", R_EARTH);
    this.moon = mk("moon", R_MOON);
    this.mars = mk("mars", R_MARS);
    this.sun = mk("sun", R_SUN);
    this.bodies = [this.earth, this.moon, this.mars, this.sun];
    for (const [m, color, k] of [[this.earth, "#5f8cff", 1.1], [this.mars, "#e8956a", 0.8]] as const) {
      const g = createGlow(1.035, color, k);
      (g.material as THREE.Material).depthTest = false;
      g.userData.base = k;
      g.renderOrder = -1;
      g.frustumCulled = false;
      m.add(g);
      this.atmos.push(g);
    }

    // Stars follow the camera so they stay at infinity.
    const n = 2600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(5e8);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xf5f4fa, size: 1.6, sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9 }));
    this.stars.renderOrder = -2;
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);

    this.scene.add(new THREE.AmbientLight(0x2a2450, 0.7));
    const key = new THREE.DirectionalLight(0xfff4e6, 3.2);
    key.position.set(1, 0.25, 0.5);
    this.scene.add(key);
    this.scene.add(this.vehicle);
    this.scene.add(this.trail.points);
    this.vehicle.add(this.plume);
    this.buildPlume();

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.loop();
  }

  private buildPlume(): void {
    const outer = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xeaf4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    // Cones have their tip up; flip so the tip trails behind the engine.
    for (const c of [outer, inner]) {
      c.rotation.x = Math.PI;
      c.frustumCulled = false;
      this.plume.add(c);
      this.plumeCones.push(c);
    }
  }

  /** Rebuild the vehicle when a stage is jettisoned, and release the dropped stage as debris. */
  private setActive(active: Target[]): void {
    const key = active.join(",");
    if (key === this.activeKey) return;
    const dropped = this.activeKey ? this.activeKey.split(",").filter((t) => !active.includes(t as Target)) : [];
    const prevModel = this.model;
    const prevH = this.height;
    this.activeKey = key;
    for (const t of dropped) this.spawnDebris(t as Target, prevModel, prevH);

    if (prevModel) {
      this.vehicle.remove(prevModel);
      this.dispose3(prevModel);
    }
    const sub: Design = { ...this.design, parts: this.design.parts.filter((r) => active.includes(r.target)) };
    const built = HangarScene.build(sub);
    this.model = built.group;
    this.height = Math.max(built.height, 3);
    this.model.position.y = -this.height / 2;
    this.vehicle.add(this.model);
    this.plume.position.y = -this.height / 2;
    this.vehicle.scale.setScalar(M_TO_KM);
  }

  private spawnDebris(target: Target, prevModel: THREE.Group | null, prevH: number): void {
    const only: Design = { ...this.design, parts: this.design.parts.filter((r) => r.target === target) };
    if (!only.parts.length) return;
    const built = HangarScene.build(only);
    const g = new THREE.Group();
    g.add(built.group);
    built.group.position.y = -built.height / 2;
    // Start where the dropped stage was: at the bottom of the old stack.
    g.position.copy(this.vehicle.position).add(new THREE.Vector3(0, 0, 0));
    g.quaternion.copy(this.vehicle.quaternion);
    g.scale.setScalar(M_TO_KM);
    const back = new THREE.Vector3(0, -1, 0).applyQuaternion(this.vehicle.quaternion);
    g.position.addScaledVector(back, (prevH / 2) * M_TO_KM);
    this.scene.add(g);
    void prevModel;
    this.debris.push({ group: g, vel: back.multiplyScalar(0.0035), spin: new THREE.Vector3((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.7), age: 0 });
  }

  private dispose3(o: THREE.Object3D): void {
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => {
        (x as THREE.MeshStandardMaterial).map?.dispose();
        x.dispose();
      });
    });
  }

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Nudge the view up so the vehicle sits clear of the bottom panels.
    this.camera.setViewOffset(w, h, 0, Math.round(h * 0.06), w, h);
    this.camera.updateProjectionMatrix();
  }

  /** Push the latest telemetry. Called every frame by the screen. */
  update(tel: Telemetry, active: Target[]): void {
    this.lastTel = tel;
    this.setActive(active);
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    this.t += 1 / 60;
    const tel = this.lastTel;
    if (!tel) return;
    const k = tel.kin;
    const pos = new THREE.Vector3(k.pos[0], k.pos[1], 0);
    const rHat = pos.clone().normalize();
    if (rHat.lengthSq() < 0.5) rHat.set(1, 0, 0);
    const onAscent = tel.view === "ascent" && k.frame === "Earth";
    // At liftoff the vehicle's base, not its middle, rests on the pad; the offset fades as it climbs.
    if (onAscent) pos.addScaledVector(rHat, (this.height / 2) * M_TO_KM * (1 - smooth(0, 4, k.altKm)));
    const delta = this.prevPos ? pos.clone().sub(this.prevPos) : new THREE.Vector3();
    this.prevPos = pos.clone();
    const tHat = new THREE.Vector3(-rHat.y, rHat.x, 0);
    const nHat = new THREE.Vector3(0, 0, 1);

    // Where is every world, relative to the spacecraft?
    for (const b of this.bodies) b.visible = false;
    const sunDir = new THREE.Vector3(1, 0.25, 0.5).normalize();
    const place = (m: THREE.Mesh, p: THREE.Vector3, radius: number, scale = 1) => {
      m.visible = true;
      let s = scale;
      const d = p.length();
      if (s * radius > d - 0.05) s = Math.max((d - 0.05) / radius, 0.01);
      m.scale.setScalar(s);
      m.position.copy(p);
      const u = (m.material as THREE.ShaderMaterial).uniforms;
      u.uSun.value.copy(this.sunDirFor(p, tel, sunDir));
      u.uTime.value = this.t;
    };

    if (k.frame === "Earth") {
      const dist = k.distEarthKm;
      const exaggerate = 1 + 2 * smooth(25_000, 90_000, dist);
      place(this.earth, pos.clone().negate(), R_EARTH, exaggerate);
      if (k.moon) {
        const mp = new THREE.Vector3(k.moon[0], k.moon[1], 0).sub(pos);
        place(this.moon, mp, R_MOON, 1 + 7 * smooth(25_000, 90_000, dist));
      } else {
        // A distant Moon for context: not to scale.
        place(this.moon, new THREE.Vector3(-90_000, 60_000, -30_000), R_MOON, 3);
      }
    } else if (k.frame === "Moon") {
      place(this.moon, pos.clone().negate(), R_MOON, 1);
      place(this.earth, new THREE.Vector3(250_000, 90_000, -40_000).sub(pos.clone().multiplyScalar(0)), R_EARTH, 1.6);
    } else if (k.frame === "Mars") {
      place(this.mars, pos.clone().negate(), R_MARS, 1);
    } else {
      const au = 1.496e8;
      const sunP = pos.clone().negate();
      place(this.sun, sunP, R_SUN, 14);
      if (k.earthSun) place(this.earth, new THREE.Vector3(k.earthSun[0] * au, k.earthSun[1] * au, 0).sub(pos), R_EARTH, 260);
      if (k.marsSun) place(this.mars, new THREE.Vector3(k.marsSun[0] * au, k.marsSun[1] * au, 0).sub(pos), R_MARS, 400);
    }
    const sunLight = this.scene.children.find((c) => (c as THREE.DirectionalLight).isDirectionalLight) as THREE.DirectionalLight | undefined;
    if (sunLight) {
      const d = k.frame === "Sun" ? pos.clone().negate().normalize() : sunDir;
      sunLight.position.copy(d);
    }
    for (const a of this.atmos) {
      a.visible = (a.parent as THREE.Mesh).visible;
      // Inside the atmosphere the haze is faint; from orbit it forms a bright rim.
      (a.material as THREE.ShaderMaterial).uniforms.uStrength.value = (a.userData.base as number) * (0.12 + 0.88 * smooth(60, 320, k.altKm));
    }

    // Vehicle attitude: nose along the velocity, tilting from vertical during ascent.
    let nose: THREE.Vector3;
    const burn = tel.phaseProgress;
    if (tel.view === "ascent") {
      const beta = (Math.PI / 2) * (1 - Math.pow(burn, 0.6));
      nose = tHat.clone().multiplyScalar(Math.cos(beta)).addScaledVector(rHat, Math.sin(beta));
    } else if (tel.view === "moon-descent" || tel.view === "mars-descent") {
      nose = rHat.clone();
    } else {
      const retro = /insertion|descent orbit|capture/i.test(tel.phase);
      nose = tHat.clone().multiplyScalar(retro ? -1 : 1);
    }
    this.vehicle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), nose.normalize());

    // Engine plume: in thin air it spreads wide and pale, as the exhaust expands into the vacuum.
    const target = tel.burning ? 1 : 0;
    this.plumeK += (target - this.plumeK) * 0.12;
    const len = (6 + 22 * Math.min(1, tel.thrustKn / 600)) * this.plumeK;
    const flick = 0.9 + Math.random() * 0.2;
    const spread = 1 + 2.6 * smooth(8, 75, k.altKm);
    this.plumeCones.forEach((c, i) => {
      const l = Math.max(len * (i === 0 ? 1 : 0.55) * flick, 0.001);
      c.scale.set(spread, l, spread);
      c.position.y = -l / 2;
      (c.material as THREE.MeshBasicMaterial).opacity = this.plumeK * (i === 0 ? 0.32 : 0.5) * (1 - 0.35 * smooth(8, 75, k.altKm));
    });

    // Exhaust trail: laid along the path through the atmosphere, then left behind as the world moves past.
    const inAir = onAscent && k.altKm < 90;
    const drawPx = this.renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    if (inAir && this.plumeK > 0.3) {
      const n = Math.min(14, Math.floor(delta.length() / 0.012) + 1);
      for (let j = 0; j < n; j++) {
        const f = (j + Math.random()) / n;
        const e = nose.clone().multiplyScalar(-(this.height / 2) * M_TO_KM * 1.05).addScaledVector(delta, -(1 - f));
        const r = () => (Math.random() - 0.5) * 0.004;
        this.trail.emit(e.x, e.y, e.z, r() - nose.x * 0.01, r() - nose.y * 0.01, r() + (Math.random() - 0.5) * 0.004, 7 + Math.random() * 10);
      }
    }
    this.trail.setOpacity(0.5 * (1 - smooth(40, 90, k.altKm)));
    this.trail.step(1 / 60, 0.17, 0.99, onAscent ? delta : undefined);

    // Sky: blue daylight near the ground thins to black by about 100 km, and the stars come out.
    const sky = onAscent ? 1 - smooth(12, 110, k.altKm) : 0;
    (this.scene.background as THREE.Color).copy(this.skySpace).lerp(this.skyDay, sky);
    (this.stars.material as THREE.PointsMaterial).opacity = 0.9 * (1 - sky * 0.97);

    // Camera: a slow orbit around the vehicle, lifted so the horizon is visible.
    if (!this.reduced) this.az += 0.0022;
    const d = Math.max(this.height * 2.7, 30) * M_TO_KM;
    const base = tHat.clone().multiplyScalar(-Math.cos(this.az)).addScaledVector(nHat, Math.sin(this.az) * 0.9).addScaledVector(rHat, 0.28);
    if (tel.view === "moon-transfer" || tel.view === "helio") base.addScaledVector(rHat, 0.15);
    const chase = base.normalize().multiplyScalar(d);
    let fovTarget = 42;

    // Launch complex: a ground camera watches liftoff from beside the pad, then hands over to the chase camera.
    const padDir = new THREE.Vector3(1, 0, 0);
    if (onAscent && k.altKm < 14) {
      if (!this.site) {
        this.site = new LaunchSite(this.height);
        this.scene.add(this.site.group);
      }
      const padPos = padDir.clone().multiplyScalar(R_EARTH).sub(pos);
      this.site.group.visible = true;
      this.site.group.position.copy(padPos);
      this.site.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), padDir);
      this.site.setView(drawPx, this.fov);
      this.site.update(k.altKm, this.plumeK, 1 / 60, this.t);

      const standoff = Math.min(Math.max(this.height * 3.2, 140), 420) * M_TO_KM;
      const ground = padPos.clone().addScaledVector(nHat, standoff).addScaledVector(padDir, 0.014);
      const w = 1 - smooth(1.2, 5, k.altKm);
      this.camera.position.copy(chase).lerp(ground, w);
      const shake = (tel.burning ? this.plumeK : 0) * w * (this.reduced ? 0 : 0.00012) * (1 - smooth(0.04, 0.7, k.altKm));
      this.camera.position.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shake));
      // Zoom in as the rocket recedes so it stays a good size in frame.
      fovTarget = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan((this.height * 3.4 * M_TO_KM) / Math.max(this.camera.position.length(), 1e-6))), 5, 42);
    } else {
      if (this.site) this.site.group.visible = false;
      this.camera.position.copy(chase);
    }
    this.fov += (fovTarget - this.fov) * 0.12;
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
    this.trail.setView(drawPx, this.fov);
    this.camera.up.copy(k.frame === "Sun" ? nHat : rHat);
    this.camera.lookAt(0, 0, 0);
    this.stars.position.copy(this.camera.position);

    // Jettisoned stages drift away and tumble.
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const db = this.debris[i];
      db.age += 1 / 60;
      db.group.position.addScaledVector(db.vel, 1 / 60 * 6);
      db.group.rotation.x += db.spin.x * 0.01;
      db.group.rotation.y += db.spin.y * 0.01;
      db.group.rotation.z += db.spin.z * 0.01;
      if (db.age > 40) {
        this.scene.remove(db.group);
        this.dispose3(db.group);
        this.debris.splice(i, 1);
      }
    }

    this.renderer.render(this.scene, this.camera);
  };

  private sunDirFor(p: THREE.Vector3, tel: Telemetry, fallback: THREE.Vector3): THREE.Vector3 {
    if (tel.kin.frame !== "Sun") return fallback;
    // Heliocentric: light comes from the Sun's position relative to the body.
    const craftToSun = new THREE.Vector3(-tel.kin.pos[0], -tel.kin.pos[1], 0);
    return craftToSun.sub(p).normalize();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.site?.dispose();
    this.trail.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose());
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
