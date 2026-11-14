import * as THREE from "three";
import type { BodyId } from "../science/bodies";

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
  float craters(vec3 p, float scale) {
    vec3 q = p * scale; vec3 i = floor(q); vec3 f = fract(q);
    vec3 c = vec3(hash3(i), hash3(i + 7.3), hash3(i + 13.1));
    float d = length(f - c);
    float r = 0.18 + 0.2 * hash3(i + 3.7);
    return (1.0 - smoothstep(r * 0.5, r, d)) * 0.8;
  }
`;

const VERT = /* glsl */ `
  varying vec3 vObj;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vObj = normalize(position);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vObj;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  uniform int uType;
  uniform float uTime;
  uniform vec3 uSun;
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform vec3 uColC;
  uniform float uBands;
  uniform vec3 uAtmo;
  uniform float uAtmoPower;
  uniform float uHighlight;
  ${NOISE}

  void main() {
    vec3 p = normalize(vObj);
    vec3 n = normalize(vWorldNormal);
    vec3 view = normalize(cameraPosition - vWorldPos);
    vec3 surface;
    float emissive = 0.0;
    float spec = 0.0;

    if (uType == 0) {
      float base = fbm3(p * 4.0);
      surface = mix(uColA, uColB, base);
      surface *= 1.0 - craters(p, 9.0) * 0.5 - craters(p, 20.0) * 0.3;
    } else if (uType == 1) {
      float h = fbm3(p * 2.2 + 3.1);
      float land = smoothstep(0.5, 0.54, h);
      vec3 ocean = mix(vec3(0.015, 0.06, 0.22), vec3(0.06, 0.22, 0.48), smoothstep(0.2, 0.5, h));
      vec3 ground = mix(vec3(0.10, 0.24, 0.12), vec3(0.50, 0.40, 0.26), fbm3(p * 7.0));
      surface = mix(ocean, ground, land);
      float ice = smoothstep(0.82, 0.93, abs(p.y) + (fbm3(p * 5.0) - 0.5) * 0.12);
      surface = mix(surface, vec3(0.92, 0.95, 1.0), ice);
      float cloud = smoothstep(0.55, 0.78, fbm3(p * 3.6 + vec3(uTime * 0.012, 0.0, uTime * 0.006)));
      surface = mix(surface, vec3(1.0), cloud * 0.85);
      spec = (1.0 - land) * (1.0 - cloud);
    } else if (uType == 2) {
      float swirl = fbm3(vec3(p.x * 2.0 + uTime * 0.01, p.y * 5.0, p.z * 2.0) + fbm3(p * 3.0) * 1.5);
      surface = mix(uColA, uColB, smoothstep(0.3, 0.75, swirl));
    } else if (uType == 3) {
      float h = fbm3(p * 3.0 + 1.7);
      surface = mix(uColA, uColB, smoothstep(0.35, 0.65, h));
      surface = mix(surface, uColC, smoothstep(0.55, 0.7, fbm3(p * 8.0)) * 0.35);
      float cap = smoothstep(0.86, 0.93, abs(p.y) + (fbm3(p * 6.0) - 0.5) * 0.08);
      surface = mix(surface, vec3(0.93, 0.93, 0.95), cap);
    } else if (uType == 4 || uType == 5) {
      float warp = fbm3(vec3(p.x * 3.0, p.y * 1.5, p.z * 3.0) + uTime * 0.01) * 0.12;
      float band = sin((p.y + warp) * uBands) * 0.5 + 0.5;
      float fine = fbm3(vec3(p.x * 2.0, p.y * uBands * 1.2, p.z * 2.0));
      surface = mix(uColA, uColB, band);
      surface = mix(surface, uColC, smoothstep(0.45, 0.8, fine) * (uType == 4 ? 0.55 : 0.2));
      if (uType == 4 && uBands > 20.0) {
        vec3 spot = normalize(vec3(0.9, -0.3, 0.3));
        float d = length(p - spot);
        surface = mix(surface, vec3(0.72, 0.3, 0.2), smoothstep(0.28, 0.12, d) * 0.85);
      }
    } else {
      float t = uTime * 0.05;
      float cells = fbm3(p * 5.0 + vec3(t, -t, t * 0.6)) + 0.5 * fbm3(p * 12.0 - vec3(t));
      surface = mix(uColA, uColB, smoothstep(0.35, 1.0, cells));
      emissive = 1.0;
    }

    vec3 col;
    if (emissive > 0.5) {
      col = surface * (1.1 + 0.4 * pow(1.0 - max(dot(n, view), 0.0), 2.0));
    } else {
      float diff = dot(n, normalize(uSun));
      float day = smoothstep(-0.05, 0.3, diff);
      col = surface * (0.05 + 1.05 * max(diff, 0.0));
      col += vec3(0.5, 0.6, 0.9) * pow(max(dot(reflect(-normalize(uSun), n), view), 0.0), 40.0) * spec * day * 0.5;
      float rim = pow(1.0 - max(dot(n, view), 0.0), 3.0);
      col += uAtmo * rim * uAtmoPower * (0.2 + 0.8 * smoothstep(-0.3, 0.4, diff));
    }
    col += vec3(0.72, 0.65, 1.0) * uHighlight * pow(1.0 - max(dot(n, view), 0.0), 2.0);
    gl_FragColor = vec4(col, 1.0);
  }
`;

interface Style {
  type: number;
  a: string;
  b: string;
  c?: string;
  bands?: number;
  atmo?: string;
  atmoPower?: number;
  /** Stylised display radius (not to scale). */
  radius: number;
  /** Axial tilt in degrees, for visual interest. */
  tilt: number;
}

export const STYLE: Record<BodyId, Style> = {
  sun: { type: 6, a: "#ff8a1f", b: "#ffe9a0", radius: 2.3, tilt: 0 },
  mercury: { type: 0, a: "#4d4743", b: "#a39b92", radius: 0.38, tilt: 0 },
  venus: { type: 2, a: "#b88a45", b: "#f0dca8", atmo: "#ffd9a0", atmoPower: 0.5, radius: 0.62, tilt: 177 },
  earth: { type: 1, a: "#000", b: "#000", atmo: "#4f85ff", atmoPower: 0.7, radius: 0.68, tilt: 23.4 },
  moon: { type: 0, a: "#6e6b72", b: "#bdb9c2", radius: 0.2, tilt: 0 },
  mars: { type: 3, a: "#7d3a22", b: "#c9693a", c: "#3a2018", atmo: "#e8956a", atmoPower: 0.25, radius: 0.46, tilt: 25 },
  ceres: { type: 0, a: "#3f3c3c", b: "#8c8782", radius: 0.2, tilt: 4 },
  jupiter: { type: 4, a: "#c8a27a", b: "#efe0c8", c: "#8d5b3f", bands: 26, atmo: "#e8cfa5", atmoPower: 0.2, radius: 1.75, tilt: 3 },
  saturn: { type: 4, a: "#d9bf8c", b: "#f3e6c0", c: "#a8895a", bands: 14, atmo: "#f1dfae", atmoPower: 0.2, radius: 1.45, tilt: 27 },
  uranus: { type: 5, a: "#7fc8d4", b: "#b5e6ec", c: "#5fa7b8", bands: 6, atmo: "#9fe2ee", atmoPower: 0.5, radius: 1.0, tilt: 82 },
  neptune: { type: 5, a: "#2c4fc4", b: "#4f7bf0", c: "#1d3499", bands: 9, atmo: "#6f9bff", atmoPower: 0.55, radius: 0.98, tilt: 28 },
};

export function createBodyMaterial(id: BodyId): THREE.ShaderMaterial {
  const s = STYLE[id];
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uType: { value: s.type },
      uTime: { value: 0 },
      uSun: { value: new THREE.Vector3(1, 0.3, 0.6).normalize() },
      uColA: { value: new THREE.Color(s.a) },
      uColB: { value: new THREE.Color(s.b) },
      uColC: { value: new THREE.Color(s.c ?? s.b) },
      uBands: { value: s.bands ?? 10 },
      uAtmo: { value: new THREE.Color(s.atmo ?? "#000000") },
      uAtmoPower: { value: s.atmoPower ?? 0 },
      uHighlight: { value: 0 },
    },
  });
}

export function createBodyMesh(id: BodyId, radius = STYLE[id].radius, segments = 64): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(radius, segments, segments), createBodyMaterial(id));
}

const RING_FRAG = /* glsl */ `
  varying vec3 vObj;
  uniform vec3 uSun;
  void main() {
    float r = length(vObj.xy);
    float t = smoothstep(1.25, 2.35, r);
    float band = 0.55 + 0.45 * sin(r * 38.0) * sin(r * 11.0 + 1.0);
    float gap = smoothstep(1.92, 1.95, r) * (1.0 - smoothstep(2.0, 2.04, r));
    float alpha = (1.0 - smoothstep(0.95, 1.0, t)) * smoothstep(0.0, 0.06, t) * band * (1.0 - gap * 0.9);
    vec3 col = mix(vec3(0.82, 0.74, 0.58), vec3(0.95, 0.9, 0.78), band);
    gl_FragColor = vec4(col, alpha * 0.85);
  }
`;

const RING_VERT = /* glsl */ `
  varying vec3 vObj;
  void main() {
    vObj = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Saturn's rings, sized relative to the planet's radius. */
export function createRings(planetRadius: number): THREE.Mesh {
  const geo = new THREE.RingGeometry(planetRadius * 1.25, planetRadius * 2.35, 160, 1);
  // Normalise so the shader can work in planet-radius units.
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) / planetRadius, pos.getY(i) / planetRadius, 0);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      uniforms: { uSun: { value: new THREE.Vector3(1, 0, 0) } },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  mesh.scale.setScalar(planetRadius);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

const GLOW_VERT = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const GLOW_FRAG = /* glsl */ `
  varying vec3 vNormal;
  uniform vec3 uColor;
  uniform float uStrength;
  void main() {
    float i = pow(max(0.0, 0.75 - dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0);
    gl_FragColor = vec4(uColor, 1.0) * i * uStrength;
  }
`;

export function createGlow(radius: number, color: string, strength = 1.2): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 48),
    new THREE.ShaderMaterial({
      vertexShader: GLOW_VERT,
      fragmentShader: GLOW_FRAG,
      uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    }),
  );
}
