import * as THREE from "three";
import { store } from "../core/store";

const NOISE = /* glsl */ `
  float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise3(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float fbm3(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise3(p); p *= 2.03; a *= 0.5; } return v; }
`;

const EARTH_VERT = /* glsl */ `
  varying vec3 vObj;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  void main() {
    vObj = normalize(position);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const EARTH_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vObj;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  uniform float uTime;
  uniform vec3 uSun;
  ${NOISE}
  void main() {
    vec3 p = normalize(vObj);
    float h = fbm3(p * 2.2 + 3.1);
    float land = smoothstep(0.5, 0.54, h);
    vec3 ocean = mix(vec3(0.015, 0.06, 0.22), vec3(0.06, 0.22, 0.48), smoothstep(0.2, 0.5, h));
    vec3 ground = mix(vec3(0.10, 0.24, 0.12), vec3(0.50, 0.40, 0.26), fbm3(p * 7.0));
    ground = mix(ground, vec3(0.62, 0.56, 0.42), smoothstep(0.62, 0.8, h));
    vec3 surface = mix(ocean, ground, land);
    float ice = smoothstep(0.82, 0.93, abs(p.y) + (fbm3(p * 5.0) - 0.5) * 0.12);
    surface = mix(surface, vec3(0.92, 0.95, 1.0), ice);

    float cloud = smoothstep(0.55, 0.78, fbm3(p * 3.6 + vec3(uTime * 0.012, 0.0, uTime * 0.006)));
    surface = mix(surface, vec3(1.0), cloud * 0.85);

    vec3 n = normalize(vWorldNormal);
    float diff = dot(n, normalize(uSun));
    float day = smoothstep(-0.08, 0.25, diff);
    vec3 lit = surface * (0.04 + 1.05 * max(diff, 0.0));

    float cities = step(0.7, fbm3(p * 22.0)) * land * (1.0 - cloud);
    vec3 night = vec3(1.0, 0.78, 0.42) * cities * 0.9;
    vec3 col = mix(surface * 0.025 + night, lit, day);

    float spec = pow(max(dot(reflect(-normalize(uSun), n), normalize(vViewDir)), 0.0), 40.0) * (1.0 - land) * (1.0 - cloud) * day;
    col += vec3(0.5, 0.6, 0.9) * spec * 0.6;

    float rim = pow(1.0 - max(dot(n, normalize(vViewDir)), 0.0), 3.0);
    col += vec3(0.25, 0.45, 1.0) * rim * 0.7 * (0.25 + 0.75 * smoothstep(-0.3, 0.4, diff));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const ATMO_VERT = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATMO_FRAG = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    float i = pow(max(0.0, 0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.5);
    gl_FragColor = vec4(0.35, 0.52, 1.0, 1.0) * i * 1.05;
  }
`;

export interface Widget {
  dispose(): void;
}

/** Earth and Moon with a satellite in low orbit. Procedural, no texture downloads. */
export function createEarthMoonWidget(container: HTMLElement): Widget {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "width:100%;height:100%;display:block";
  container.append(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.5, 5.2);
  camera.lookAt(0, 0, 0);

  const sun = new THREE.Vector3(4, 1.5, 3).normalize();
  const uniforms = { uTime: { value: 0 }, uSun: { value: sun } };

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 96),
    new THREE.ShaderMaterial({ vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG, uniforms }),
  );
  earth.rotation.z = THREE.MathUtils.degToRad(23.4);
  scene.add(earth);

  scene.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(1.14, 64, 64),
      new THREE.ShaderMaterial({ vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, blending: THREE.AdditiveBlending, side: THREE.BackSide, transparent: true, depthWrite: false }),
    ),
  );

  const light = new THREE.DirectionalLight(0xffffff, 2.4);
  light.position.copy(sun).multiplyScalar(10);
  scene.add(light, new THREE.AmbientLight(0x241a40, 0.6));

  const moonPivot = new THREE.Object3D();
  moonPivot.rotation.set(THREE.MathUtils.degToRad(5), 0, THREE.MathUtils.degToRad(-8));
  scene.add(moonPivot);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.27, 48, 48), new THREE.MeshStandardMaterial({ color: 0x9d9aa6, roughness: 1, metalness: 0 }));
  moon.position.x = 2.6;
  moonPivot.add(moon);

  const ring = (radius: number, color: number, opacity: number, tilt: number) => {
    const pts = Array.from({ length: 129 }, (_, i) => {
      const a = (i / 128) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    line.rotation.z = tilt;
    return line;
  };
  moonPivot.add(ring(2.6, 0xb8a6e8, 0.18, 0));

  const satPivot = new THREE.Object3D();
  satPivot.rotation.set(0, 0, THREE.MathUtils.degToRad(52));
  scene.add(satPivot);
  satPivot.add(ring(1.32, 0xd8d9e0, 0.35, 0));
  const sat = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 12), new THREE.MeshBasicMaterial({ color: 0xf5f4fa }));
  sat.position.x = 1.32;
  satPivot.add(sat);
  const satGlow = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xb8a6e8, transparent: true, opacity: 0.7, depthWrite: false }));
  satGlow.scale.setScalar(0.16);
  sat.add(satGlow);

  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the whole Moon orbit in frame on narrow panels.
    camera.position.z = camera.aspect < 1.6 ? 5.2 * (1.6 / camera.aspect) ** 0.9 : 5.2;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(() => {
    resize();
    if (store.get().settings.reducedMotion) draw(0);
  });
  observer.observe(container);
  resize();

  const draw = (t: number) => {
    uniforms.uTime.value = t;
    earth.rotation.y = t * 0.05;
    moonPivot.rotation.y = -t * 0.018;
    moon.rotation.y = t * 0.02;
    satPivot.rotation.y = -t * 0.35;
    renderer.render(scene, camera);
  };

  let raf = 0;
  const start = performance.now();
  const loop = () => {
    draw((performance.now() - start) / 1000);
    raf = requestAnimationFrame(loop);
  };
  if (store.get().settings.reducedMotion) draw(8);
  else loop();

  return {
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      canvas.remove();
    },
  };
}
