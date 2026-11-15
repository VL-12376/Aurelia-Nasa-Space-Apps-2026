import * as THREE from "three";

const M = 0.001;

const PUFF_VERT = /* glsl */ `
  attribute float aLife;
  attribute float aSize;
  uniform float uK;
  uniform float uSizeScale;
  varying float vLife;
  void main() {
    vLife = aLife;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float s = aSize * uSizeScale * (1.0 + 2.2 * (1.0 - aLife));
    gl_PointSize = clamp(s * uK / max(-mv.z, 1e-6), 0.0, 420.0);
  }
`;

const PUFF_FRAG = /* glsl */ `
  precision highp float;
  varying float vLife;
  uniform float uOpacity;
  uniform vec3 uTint;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p) * 2.0;
    float soft = smoothstep(1.0, 0.0, d);
    float a = soft * soft * vLife * uOpacity;
    if (a < 0.004) discard;
    // Fresh exhaust glows warm, then cools to grey as it spreads.
    vec3 col = mix(uTint, vec3(1.0, 0.72, 0.45), smoothstep(0.75, 1.0, vLife) * 0.8);
    gl_FragColor = vec4(col, a);
  }
`;

/** A soft particle cloud: exhaust smoke and contrails. Particles grow and fade as they age. */
export class Puffs {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private life: Float32Array;
  private size: Float32Array;
  private vel: Float32Array;
  private next = 0;
  private uniforms: Record<string, { value: unknown }>;

  constructor(private count: number, sizeScale: number, tint = 0xd8d2e4, opacity = 0.55) {
    this.pos = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.size = new Float32Array(count);
    this.vel = new Float32Array(count * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute("aLife", new THREE.BufferAttribute(this.life, 1));
    g.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1));
    this.uniforms = { uK: { value: 600 }, uSizeScale: { value: sizeScale }, uOpacity: { value: opacity }, uTint: { value: new THREE.Color(tint) } };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: PUFF_VERT, fragmentShader: PUFF_FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false }));
    this.points.frustumCulled = false;
  }

  /** Pixels of point size per unit of world size at distance 1: viewport height / (2 tan(fov/2)). */
  setView(viewportPx: number, fovDeg: number): void {
    this.uniforms.uK.value = viewportPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  setOpacity(o: number): void {
    this.uniforms.uOpacity.value = o;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number): void {
    const i = this.next++ % this.count;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = 1;
    this.size[i] = size;
  }

  /** Moves particles, ages them, and optionally shifts them all (to follow a moving frame of reference). */
  step(dt: number, fadePerSecond: number, drag: number, shift?: THREE.Vector3): void {
    const d = Math.pow(drag, dt * 60);
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -1e9;
        continue;
      }
      this.life[i] = Math.max(0, this.life[i] - fadePerSecond * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] *= d;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt - (shift?.x ?? 0);
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt - (shift?.y ?? 0);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt - (shift?.z ?? 0);
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.aLife as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.3, "rgba(255,255,255,0.5)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/**
 * The launch complex: pad, service tower with swing arms, floodlights and the ground smoke cloud
 * that blooms while the engines run. Built in metres and scaled to the scene's kilometres. The
 * group's local +Y axis points straight up from the pad.
 */
export class LaunchSite {
  readonly group = new THREE.Group();
  private smoke: Puffs;
  private flash: THREE.Sprite;
  private trench: THREE.Mesh;
  private glow: THREE.CanvasTexture;
  private spawnAcc = 0;
  private lampSprites: THREE.Sprite[] = [];

  constructor(towerHeightM: number) {
    const root = new THREE.Group();
    root.scale.setScalar(M);
    this.group.add(root);

    const concrete = new THREE.MeshStandardMaterial({ color: 0x3a3848, roughness: 0.85, metalness: 0.15 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x8a889c, roughness: 0.45, metalness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x14131f, roughness: 0.9, metalness: 0.2 });

    // Ground apron and the pad itself
    const apron = new THREE.Mesh(new THREE.CircleGeometry(140, 64), new THREE.MeshStandardMaterial({ color: 0x2a3322, roughness: 1, metalness: 0 }));
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.4;
    root.add(apron);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(24, 26, 1.6, 48), concrete);
    pad.position.y = -0.8;
    root.add(pad);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(24.5, 0.35, 8, 64), new THREE.MeshBasicMaterial({ color: 0xb8a6e8 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    root.add(ring);
    this.trench = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    this.trench.rotation.x = -Math.PI / 2;
    this.trench.position.y = 0.06;
    root.add(this.trench);
    // Launch mount legs
    for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.6, 4, 1.6), dark);
      leg.position.set(x, 2, z);
      root.add(leg);
    }

    // Service tower with swing arms reaching to the rocket
    const H = Math.max(towerHeightM * 1.08, 45);
    const tx = -17;
    for (const [dx, dz] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, H, 0.9), steel);
      post.position.set(tx + dx, H / 2, dz);
      root.add(post);
    }
    for (let y = 4; y < H; y += 6) {
      for (const [sx, sz, px, pz] of [[4.8, 0.45, 0, -2.4], [4.8, 0.45, 0, 2.4], [0.45, 4.8, -2.4, 0], [0.45, 4.8, 2.4, 0]] as const) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.4, sz), steel);
        rail.position.set(tx + px, y, pz);
        root.add(rail);
      }
    }
    for (const f of [0.34, 0.6, 0.86]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(14, 1.2, 1.6), steel);
      arm.position.set(tx + 9, H * f, 0);
      root.add(arm);
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 14, 8), steel);
    mast.position.set(tx, H + 7, 0);
    root.add(mast);
    const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: (this.glow = glowTexture()), color: 0xff5a6a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    beacon.scale.setScalar(5);
    beacon.position.set(tx, H + 14, 0);
    root.add(beacon);
    this.lampSprites.push(beacon);

    // Floodlight poles around the pad
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const px = Math.cos(a) * 62;
      const pz = Math.sin(a) * 62;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 30, 8), steel);
      pole.position.set(px, 15, pz);
      root.add(pole);
      const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xfff1d8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      lamp.scale.setScalar(16);
      lamp.position.set(px, 31, pz);
      root.add(lamp);
      this.lampSprites.push(lamp);
    }

    // The flash of the engines on the ground, and the smoke they blow outward.
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xff9a40, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    this.flash.position.set(0, 6, 0);
    root.add(this.flash);
    this.smoke = new Puffs(320, M, 0xcfc8da, 0.6);
    root.add(this.smoke.points);
  }

  setView(viewportPx: number, fovDeg: number): void {
    this.smoke.setView(viewportPx, fovDeg);
  }

  /** altKm: height of the rocket; level: engine power 0 to 1; dt in seconds of real time. */
  update(altKm: number, level: number, dt: number, t: number): void {
    const near = altKm < 2.5;
    const power = near ? level : 0;
    // Ground flash dies away as the rocket climbs.
    const m = this.flash.material as THREE.SpriteMaterial;
    m.opacity = power * (1 - Math.min(1, altKm / 0.35)) * 0.85;
    this.flash.scale.setScalar(70 + 30 * Math.sin(t * 24));
    (this.trench.material as THREE.MeshBasicMaterial).color.setHex(power > 0.05 && altKm < 0.3 ? 0xff7a20 : 0x000000);

    if (power > 0.05) {
      // Spawn rate falls off with altitude; the blast is strongest at the pad.
      this.spawnAcc += dt * 140 * power * Math.max(0.15, 1 - altKm / 1.6);
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        const a = Math.random() * Math.PI * 2;
        const sp = 18 + Math.random() * 38;
        this.smoke.emit(Math.cos(a) * 4, 2 + Math.random() * 3, Math.sin(a) * 4, Math.cos(a) * sp, 1.5 + Math.random() * 7, Math.sin(a) * sp, 26 + Math.random() * 28);
      }
    }
    this.smoke.step(dt, 0.14, 0.985);
    this.lampSprites.forEach((s, i) => ((s.material as THREE.SpriteMaterial).opacity = i === 0 ? 0.5 + 0.5 * Math.sin(t * 3) : 0.9));
  }

  dispose(): void {
    this.smoke.dispose();
    this.glow.dispose();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose());
    });
  }
}
