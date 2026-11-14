import * as THREE from "three";
import { store, type Settings } from "../core/store";

const DENSITY: Record<Settings["starDensity"], number> = { low: 1500, medium: 4000, high: 9000 };

const NEBULA_VERT = /* glsl */ `
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
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = vUv * vec2(uAspect, 1.0) * 1.6 + uMouse * 0.05;
    float t = uTime * 0.012;
    float n = fbm(uv + vec2(t, -t * 0.6) + fbm(uv * 1.4 - t));
    vec3 midnight = vec3(0.031, 0.031, 0.090);
    vec3 cosmic = vec3(0.129, 0.094, 0.239);
    vec3 nebula = vec3(0.459, 0.388, 0.710);
    vec3 col = mix(midnight, cosmic, smoothstep(0.25, 0.75, n));
    col += nebula * pow(smoothstep(0.55, 0.95, n), 2.0) * 0.45;
    float vig = smoothstep(1.2, 0.25, length(vUv - 0.5) * 1.6);
    gl_FragColor = vec4(col * (0.55 + 0.45 * vig), 1.0);
  }
`;

export class CosmicBackground {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
  private stars!: THREE.Points;
  private nebula: THREE.Mesh;
  private uniforms = {
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2() },
    uAspect: { value: 1 },
  };
  private mouse = new THREE.Vector2();
  private start = performance.now();
  private raf = 0;
  private density: Settings["starDensity"] | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    this.nebula = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: NEBULA_VERT,
        fragmentShader: NEBULA_FRAG,
        uniforms: this.uniforms,
        depthWrite: false,
        depthTest: false,
      }),
    );
    this.nebula.frustumCulled = false;
    this.nebula.renderOrder = -1;
    this.scene.add(this.nebula);

    this.camera.position.z = 5;
    this.buildStars(store.get().settings.starDensity);

    window.addEventListener("resize", this.onResize);
    window.addEventListener("pointermove", this.onPointer, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibility);
    store.subscribe(() => this.applySettings());
    this.onResize();
    this.applySettings();
  }

  private buildStars(density: Settings["starDensity"]): void {
    if (this.stars) {
      this.scene.remove(this.stars);
      this.stars.geometry.dispose();
      const mat = this.stars.material as THREE.PointsMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
    const count = DENSITY[density];
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = [new THREE.Color("#f5f4fa"), new THREE.Color("#b8a6e8"), new THREE.Color("#d8d9e0")];
    for (let i = 0; i < count; i++) {
      const r = 80 + Math.random() * 600;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      const c = palette[Math.floor(Math.random() * palette.length)];
      const k = 0.4 + Math.random() * 0.6;
      colors.set([c.r * k, c.g * k, c.b * k], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 3,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        map: this.starSprite(),
        alphaTest: 0.05,
        depthWrite: false,
      }),
    );
    this.scene.add(this.stars);
    this.density = density;
  }

  private starSprite(): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.7)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
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
    this.uniforms.uMouse.value.lerp(this.mouse, 0.04);
    this.stars.rotation.y = t * 0.004;
    this.stars.rotation.x = Math.sin(t * 0.05) * 0.03 + this.uniforms.uMouse.value.y * 0.02;
    this.camera.rotation.y = -this.uniforms.uMouse.value.x * 0.02;
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.loop);
  };

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.uniforms.uAspect.value = w / h;
    if (store.get().settings.reducedMotion) this.renderOnce();
  };

  private onPointer = (e: PointerEvent): void => {
    this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
  };

  private onVisibility = (): void => this.applySettings();
}
