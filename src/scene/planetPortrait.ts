import * as THREE from "three";
import { store } from "../core/store";
import type { BodyId } from "../science/bodies";
import { STYLE, createBodyMesh, createGlow, createRings, updateRings } from "./planetMaterial";

/** A small rotating close-up of the selected world, shown in the info panel. */
export class PlanetPortrait {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private holder = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private rings: THREE.Mesh | null = null;
  private sunDir = new THREE.Vector3(0.8, 0.25, 0.6).normalize();
  private raf = 0;
  private start = performance.now();
  private observer: ResizeObserver;
  private reduced = store.get().settings.reducedMotion;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.style.cssText = "width:100%;height:100%;display:block";
    container.append(this.renderer.domElement);
    this.scene.add(this.holder);
    this.camera.position.set(0, 0.4, 7);
    this.camera.lookAt(0, 0, 0);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.loop();
  }

  show(id: BodyId): void {
    this.holder.clear();
    const r = STYLE[id].radius;
    const scale = 1.55 / r; // normalise every world to a similar on-screen size
    const group = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.rotation.z = THREE.MathUtils.degToRad(STYLE[id].tilt);
    this.mesh = createBodyMesh(id, r, 96);
    // The group is scaled up, so the shader's bump strength needs the on-screen (world) radius.
    (this.mesh.material as THREE.ShaderMaterial).uniforms.uRadius.value = r * scale;
    tilt.add(this.mesh);
    this.rings = null;
    if (id === "saturn") {
      this.rings = createRings(r);
      tilt.add(this.rings);
    }
    if ((STYLE[id].atmoPower ?? 0) > 0.1) tilt.add(createGlow(r * 1.1, STYLE[id].atmo ?? "#ffffff", 0.9));
    if (id === "sun") tilt.add(createGlow(r * 1.25, "#ff9a3c", 1.4));
    group.add(tilt);
    group.scale.setScalar(scale);
    // Saturn's rings extend far beyond the planet, so pull the camera back for it.
    this.camera.position.z = id === "saturn" ? 9.5 : 7;
    this.holder.add(group);
    (this.mesh.material as THREE.ShaderMaterial).uniforms.uSun.value.copy(this.sunDir);
    this.draw();
  }

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.draw();
  }

  private draw(): void {
    if (this.mesh) {
      const t = (performance.now() - this.start) / 1000;
      (this.mesh.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      if (!this.reduced) this.mesh.rotation.y = t * 0.25;
    }
    if (this.rings) updateRings(this.rings, this.sunDir.clone().multiplyScalar(200));
    this.renderer.render(this.scene, this.camera);
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.reduced) this.draw();
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose());
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
