import * as THREE from "three";
import { store, type Settings } from "../core/store";

const DENSITY: Record<Settings["starDensity"], number> = { low: 1400, medium: 3200, high: 6500 };

/* ---------------------------------------------------------------- */
/* Nebula: domain-warped fractal clouds, a faint galactic band, dust */
/* ---------------------------------------------------------------- */

const CLIP_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;

const NEBULA_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uMouse;
  uniform float uAspect;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.02; a *= 0.5; }
    return v;
  }

  float starLayer(vec2 p, float scale, float thresh, float radius) {
    vec2 g = p * scale;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = hash(id);
    if (h < thresh) return 0.0;
    vec2 off = (vec2(hash(id + 1.7), hash(id + 8.3)) - 0.5) * 0.62;
    float d = length(f - off);
    float tw = 0.65 + 0.35 * sin(uTime * (0.8 + h * 3.0) + h * 50.0);
    return smoothstep(radius, 0.0, d) * tw * (0.45 + 0.55 * fract(h * 91.7));
  }

  void main() {
    vec2 uv = (vUv - 0.5) * vec2(uAspect, 1.0) * 1.7 + uMouse * 0.07;
    float t = uTime * 0.009;
    vec2 q = vec2(fbm(uv + vec2(t, 0.0)), fbm(uv + vec2(5.2, 1.3) - t));
    vec2 r = vec2(fbm(uv + 2.6 * q + vec2(1.7, 9.2) + t * 1.4), fbm(uv + 2.6 * q + vec2(8.3, 2.8) - t));
    float n = fbm(uv + 2.3 * r);

    vec3 midnight = vec3(0.031, 0.031, 0.090);
    vec3 cosmic = vec3(0.129, 0.094, 0.239);
    vec3 nebula = vec3(0.459, 0.388, 0.710);
    vec3 lavender = vec3(0.722, 0.651, 0.910);
    vec3 rose = vec3(0.60, 0.26, 0.52);
    vec3 teal = vec3(0.16, 0.40, 0.55);

    vec3 col = mix(midnight, cosmic, smoothstep(0.2, 0.7, n));
    col = mix(col, nebula * 0.8, smoothstep(0.45, 0.92, r.x) * 0.5);
    col += rose * pow(smoothstep(0.5, 1.0, q.y * n * 1.7), 2.0) * 0.32;
    col += teal * pow(smoothstep(0.55, 1.0, r.y), 3.0) * 0.2;
    col += lavender * pow(smoothstep(0.62, 1.0, n), 3.0) * 0.28;

    // A faint diagonal band of distant stars and dust, like looking along the galaxy.
    float d = (uv.y * 0.95 - uv.x * 0.42 + 0.05);
    float band = exp(-d * d * 3.2);
    float lane = smoothstep(0.35, 0.8, fbm(uv * 3.5 + 11.0));
    col += lavender * band * (0.04 + 0.16 * lane) * 0.8;
    col *= 1.0 - band * smoothstep(0.55, 0.9, fbm(uv * 6.0 + 4.0)) * 0.35;

    // Stars scattered over the whole screen at three sizes. Each cell holds at most one star at a jittered position, so there is no visible grid.
    vec2 sp = vUv * vec2(uAspect, 1.0);
    float stars = starLayer(sp, 70.0, 0.80, 0.16) + starLayer(sp + 3.1, 140.0, 0.86, 0.12) + starLayer(sp + 7.7, 260.0, 0.90, 0.10);
    col += vec3(0.85, 0.86, 1.0) * stars * 0.85;

    float vig = smoothstep(1.25, 0.2, length(vUv - 0.5) * 1.6);
    gl_FragColor = vec4(col * (0.55 + 0.45 * vig), 1.0);
  }
`;

/* ---------------------------------------------------------------- */
/* Twinkling stars with bright diffraction spikes                    */
/* ---------------------------------------------------------------- */

const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPx;
  varying vec3 vColor;
  varying float vTw;
  varying float vSize;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = 0.62 + 0.38 * sin(uTime * (0.7 + aPhase * 2.2) + aPhase * 60.0);
    vTw = tw;
    vColor = aColor;
    vSize = aSize;
    gl_PointSize = aSize * uPx * (0.9 + 0.25 * tw);
  }
`;

const STAR_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vTw;
  varying float vSize;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p) * 2.0;
    float core = pow(clamp(1.0 - d, 0.0, 1.0), 2.4);
    float spike = 0.0;
    if (vSize > 5.0) {
      spike = max(0.0, 1.0 - abs(p.x) * 16.0) * max(0.0, 1.0 - abs(p.y) * 2.4) + max(0.0, 1.0 - abs(p.y) * 16.0) * max(0.0, 1.0 - abs(p.x) * 2.4);
      spike *= 0.45;
    }
    float a = (core + spike) * vTw;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

/* ---------------------------------------------------------------- */
/* Streaks: shooting stars, a slow comet and a passing satellite     */
/* ---------------------------------------------------------------- */

const STREAK_VERT = /* glsl */ `
  uniform vec2 uHead;
  uniform vec2 uDir;
  uniform float uLen;
  uniform float uWid;
  uniform float uAspect;
  varying vec2 vP;
  void main() {
    vec2 dirA = normalize(vec2(uDir.x * uAspect, uDir.y));
    vec2 perp = vec2(-dirA.y, dirA.x);
    vec2 off = -dirA * position.x * uLen + perp * position.y * uWid;
    off.x /= uAspect;
    gl_Position = vec4(uHead + off, 0.9998, 1.0);
    vP = position.xy;
  }
`;

const STREAK_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vP;
  uniform vec3 uColor;
  uniform float uAlpha;
  uniform float uHeadGlow;
  void main() {
    float along = vP.x;
    float across = abs(vP.y);
    float tail = pow(clamp(1.0 - along, 0.0, 1.0), 2.4) * pow(clamp(1.0 - across, 0.0, 1.0), 1.6);
    float head = exp(-along * 70.0) * exp(-across * across * 3.0) * uHeadGlow;
    float a = (tail * 0.85 + head) * uAlpha;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

/* ---------------------------------------------------------------- */
/* A distant ringed planet that drifts across the lower corner       */
/* ---------------------------------------------------------------- */

const PLANET_VERT = /* glsl */ `
  uniform vec2 uC;
  uniform float uR;
  uniform float uAspect;
  varying vec2 vP;
  void main() {
    vec2 p = position.xy * 4.4;
    vP = p;
    vec2 off = p * uR;
    off.x /= uAspect;
    gl_Position = vec4(uC + off, 0.9997, 1.0);
  }
`;

const PLANET_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vP;
  uniform float uTime;
  uniform float uOpacity;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }

  void main() {
    vec2 p = vP;
    float r = length(p);
    vec3 lightDir = normalize(vec3(-0.55, 0.45, 0.7));
    vec4 outc = vec4(0.0);

    // Rings: a tilted annulus, hidden where the planet is in front.
    vec2 rp = vec2(p.x, p.y / 0.24);
    float rr = length(rp);
    float ringBand = smoothstep(1.32, 1.38, rr) * (1.0 - smoothstep(2.05, 2.1, rr));
    float gaps = 0.55 + 0.45 * sin(rr * 46.0) * sin(rr * 13.0 + 1.0);
    gaps *= 1.0 - smoothstep(1.62, 1.66, rr) * (1.0 - smoothstep(1.7, 1.74, rr)) * 0.85;
    float ringA = ringBand * gaps * 0.78;
    bool behind = (p.y > 0.0 && r < 1.0);
    if (behind) ringA = 0.0;
    vec3 ringCol = mix(vec3(0.72, 0.65, 0.9), vec3(0.9, 0.82, 0.78), noise(vec2(rr * 8.0, 0.0)));
    float ringLit = 0.45 + 0.55 * smoothstep(-0.9, 0.9, -p.x * 0.6 + p.y * 0.2 + 0.2);
    outc = vec4(ringCol * ringLit, ringA);

    if (r < 1.0) {
      float z = sqrt(1.0 - r * r);
      vec3 n = normalize(vec3(p, z));
      float diff = clamp(dot(n, lightDir), 0.0, 1.0);
      float lat = p.y;
      float bands = sin(lat * 14.0 + noise(vec2(p.x * 3.0 + uTime * 0.02, lat * 5.0)) * 2.4) * 0.5 + 0.5;
      vec3 c1 = vec3(0.36, 0.29, 0.62);
      vec3 c2 = vec3(0.78, 0.66, 0.84);
      vec3 c3 = vec3(0.2, 0.15, 0.36);
      vec3 base = mix(mix(c1, c2, bands), c3, smoothstep(0.55, 1.0, abs(lat)) * 0.6);
      float rim = pow(1.0 - z, 3.0);
      vec3 col = base * (0.08 + 0.95 * diff) + vec3(0.55, 0.45, 0.9) * rim * 0.45 * (0.3 + diff);
      outc = vec4(col, 1.0);
      if (p.y < 0.0 && ringBand > 0.0) outc = mix(outc, vec4(ringCol * ringLit, 1.0), ringA);
    } else {
      float halo = exp(-(r - 1.0) * 9.0) * 0.4 * smoothstep(-0.8, 0.8, dot(normalize(p), lightDir.xy));
      outc.rgb += vec3(0.5, 0.4, 0.95) * halo;
      outc.a = max(outc.a, halo);
    }
    if (outc.a < 0.004) discard;
    gl_FragColor = vec4(outc.rgb, outc.a * uOpacity);
  }
`;

interface Streak {
  mesh: THREE.Mesh;
  uniforms: Record<string, { value: unknown }>;
  active: boolean;
  t0: number;
  dur: number;
  from: THREE.Vector2;
  to: THREE.Vector2;
  peak: number;
  blink: boolean;
}

export class CosmicBackground {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
  private layers: THREE.Points[] = [];
  private nebula: THREE.Mesh;
  private planet: THREE.Mesh;
  private streaks: Streak[] = [];
  private starUniforms = { uTime: { value: 0 }, uPx: { value: 1 } };
  private planetUniforms = { uC: { value: new THREE.Vector2(0.74, -0.56) }, uR: { value: 0.16 }, uAspect: { value: 1 }, uTime: { value: 0 }, uOpacity: { value: 0.65 } };
  private uniforms = {
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2() },
    uAspect: { value: 1 },
  };
  private mouse = new THREE.Vector2();
  private start = performance.now();
  private raf = 0;
  private density: Settings["starDensity"] | null = null;
  private nextMeteor = 4;
  private nextComet = 40;
  private nextSat = 14;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    this.nebula = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ vertexShader: CLIP_VERT, fragmentShader: NEBULA_FRAG, uniforms: this.uniforms, depthWrite: false, depthTest: false }),
    );
    this.nebula.frustumCulled = false;
    this.nebula.renderOrder = -2;
    this.scene.add(this.nebula);

    this.planet = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({ vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG, uniforms: this.planetUniforms, transparent: true, depthWrite: false, depthTest: false }),
    );
    this.planet.frustumCulled = false;
    this.planet.renderOrder = 5;
    this.scene.add(this.planet);

    for (let i = 0; i < 4; i++) this.streaks.push(this.makeStreak());

    this.camera.position.z = 5;
    this.buildStars(store.get().settings.starDensity);

    window.addEventListener("resize", this.onResize);
    window.addEventListener("pointermove", this.onPointer, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibility);
    store.subscribe(() => this.applySettings());
    this.onResize();
    this.applySettings();
  }

  private makeStreak(): Streak {
    const geo = new THREE.PlaneGeometry(1, 2);
    geo.translate(0.5, 0, 0);
    const uniforms = {
      uHead: { value: new THREE.Vector2() },
      uDir: { value: new THREE.Vector2(1, 0) },
      uLen: { value: 0.2 },
      uWid: { value: 0.003 },
      uAspect: this.uniforms.uAspect,
      uColor: { value: new THREE.Color("#f5f4fa") },
      uAlpha: { value: 0 },
      uHeadGlow: { value: 1 },
    };
    const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: STREAK_VERT, fragmentShader: STREAK_FRAG, uniforms, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    mesh.visible = false;
    this.scene.add(mesh);
    return { mesh, uniforms, active: false, t0: 0, dur: 1, from: new THREE.Vector2(), to: new THREE.Vector2(), peak: 1, blink: false };
  }

  private launch(kind: "meteor" | "comet" | "satellite", now: number): void {
    const s = this.streaks.find((x) => !x.active);
    if (!s) return;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const u = s.uniforms;
    const side = Math.random() < 0.5 ? -1 : 1;
    if (kind === "meteor") {
      s.from.set(rnd(-0.2, 1.1) * side, rnd(0.3, 1.1));
      const ang = rnd(-0.9, -0.35);
      s.to.copy(s.from).add(new THREE.Vector2(Math.cos(ang) * -side, Math.sin(ang)).multiplyScalar(rnd(0.9, 1.6)));
      s.dur = rnd(0.7, 1.3);
      s.peak = rnd(0.7, 1);
      u.uLen.value = rnd(0.16, 0.3);
      u.uWid.value = 0.0035;
      u.uColor.value = new THREE.Color(Math.random() < 0.3 ? "#b8a6e8" : "#f5f4fa");
      u.uHeadGlow.value = 1.2;
      s.blink = false;
    } else if (kind === "comet") {
      s.from.set(side * 1.3, rnd(0.2, 0.8));
      s.to.set(-side * 1.3, rnd(-0.3, 0.5));
      s.dur = rnd(34, 46);
      s.peak = 0.55;
      u.uLen.value = 0.42;
      u.uWid.value = 0.012;
      u.uColor.value = new THREE.Color("#a9c4ff");
      u.uHeadGlow.value = 2.4;
      s.blink = false;
    } else {
      s.from.set(side * 1.1, rnd(-0.6, 0.7));
      s.to.set(-side * 1.1, s.from.y + rnd(-0.35, 0.35));
      s.dur = rnd(24, 34);
      s.peak = 0.9;
      u.uLen.value = 0.012;
      u.uWid.value = 0.0035;
      u.uColor.value = new THREE.Color("#fff6d8");
      u.uHeadGlow.value = 1.6;
      s.blink = true;
    }
    s.t0 = now;
    s.active = true;
    s.mesh.visible = true;
    (u.uDir.value as THREE.Vector2).copy(s.to).sub(s.from).normalize();
  }

  private buildStars(density: Settings["starDensity"]): void {
    for (const l of this.layers) {
      this.scene.remove(l);
      l.geometry.dispose();
      (l.material as THREE.Material).dispose();
    }
    this.layers = [];
    const total = DENSITY[density];
    const palette = [new THREE.Color("#f5f4fa"), new THREE.Color("#b8a6e8"), new THREE.Color("#d8d9e0"), new THREE.Color("#9fb7ff"), new THREE.Color("#ffd9b0")];
    // Far, middle and near layers move at different speeds, which gives the field real depth.
    const specs = [
      { share: 0.62, depth: 600, size: [1.4, 3.2] },
      { share: 0.3, depth: 300, size: [2.2, 4.6] },
      { share: 0.08, depth: 140, size: [4, 9] },
    ];
    const px = this.renderer.getPixelRatio();
    this.starUniforms.uPx.value = px;
    for (const spec of specs) {
      const count = Math.max(40, Math.floor(total * spec.share));
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const sizes = new Float32Array(count);
      const phases = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        // Spread stars evenly across the whole view (with margin for wide screens and parallax) so no part of the screen is empty.
        const d = spec.depth * (0.8 + Math.random() * 0.4);
        const tx = (Math.random() * 2 - 1) * 1.9;
        const ty = (Math.random() * 2 - 1) * 1.0;
        const scale = d / Math.hypot(tx, ty, 1);
        positions[i * 3] = tx * scale;
        positions[i * 3 + 1] = ty * scale;
        positions[i * 3 + 2] = -scale;
        const c = palette[Math.floor(Math.random() * palette.length)];
        const k = 0.5 + Math.random() * 0.5;
        colors.set([c.r * k, c.g * k, c.b * k], i * 3);
        sizes[i] = spec.size[0] + Math.pow(Math.random(), 3) * (spec.size[1] - spec.size[0]);
        phases[i] = Math.random();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
      geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
      geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
      const pts = new THREE.Points(
        geo,
        new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: this.starUniforms, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }),
      );
      pts.frustumCulled = false;
      pts.renderOrder = 1;
      this.scene.add(pts);
      this.layers.push(pts);
    }
    this.density = density;
  }

  private applySettings(): void {
    const { reducedMotion, starDensity } = store.get().settings;
    if (starDensity !== this.density) this.buildStars(starDensity);
    cancelAnimationFrame(this.raf);
    if (reducedMotion || document.hidden) this.renderOnce();
    else this.loop();
  }

  private renderOnce(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private loop = (): void => {
    const t = (performance.now() - this.start) / 1000;
    this.uniforms.uTime.value = t;
    this.starUniforms.uTime.value = t;
    this.planetUniforms.uTime.value = t;
    const m = this.uniforms.uMouse.value;
    m.lerp(this.mouse, 0.04);

    // Rotation stays small and oscillates, so the field gently sways but never drifts out of view.
    this.layers.forEach((l, i) => {
      const depth = i + 1;
      l.rotation.y = Math.sin(t * 0.02 + i) * 0.025 * depth - m.x * 0.015 * depth;
      l.rotation.x = Math.sin(t * 0.03 + i * 2) * 0.015 * depth + m.y * 0.012 * depth;
      l.rotation.z = Math.sin(t * 0.015) * 0.01 * depth;
    });
    this.camera.rotation.y = 0;

    // The planet drifts slowly and breathes in size, as if the viewer were slowly moving.
    this.planetUniforms.uC.value.set(0.74 - Math.sin(t * 0.011) * 0.05 - m.x * 0.015, -0.56 + Math.cos(t * 0.013) * 0.03 - m.y * 0.01);
    this.planetUniforms.uR.value = 0.155 + Math.sin(t * 0.02) * 0.004;

    this.spawn(t);
    this.updateStreaks(t);
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.loop);
  };

  private spawn(t: number): void {
    if (t > this.nextMeteor) {
      this.launch("meteor", t);
      this.nextMeteor = t + 3 + Math.random() * 7;
    }
    if (t > this.nextComet) {
      this.launch("comet", t);
      this.nextComet = t + 75 + Math.random() * 60;
    }
    if (t > this.nextSat) {
      this.launch("satellite", t);
      this.nextSat = t + 30 + Math.random() * 30;
    }
  }

  private updateStreaks(t: number): void {
    for (const s of this.streaks) {
      if (!s.active) continue;
      const k = (t - s.t0) / s.dur;
      if (k >= 1) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      const head = s.uniforms.uHead.value as THREE.Vector2;
      head.lerpVectors(s.from, s.to, k);
      const fade = Math.min(1, k * 8, (1 - k) * 8);
      const blink = s.blink ? 0.55 + 0.45 * Math.sin(t * 5) : 1;
      s.uniforms.uAlpha.value = s.peak * fade * blink;
    }
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.uniforms.uAspect.value = w / h;
    this.planetUniforms.uAspect.value = w / h;
    if (store.get().settings.reducedMotion) this.renderOnce();
  };

  private onPointer = (e: PointerEvent): void => {
    this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
  };

  private onVisibility = (): void => this.applySettings();
}
