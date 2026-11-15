import gsap from "gsap";
import { store } from "./store";

export type ScreenId =
  | "menu"
  | "mode"
  | "multiplayer"
  | "roles"
  | "settings"
  | "hq"
  | "hangar"
  | "map"
  | "briefing"
  | "control"
  | "debrief"
  | "research"
  | "profile"
  | "academy"
  | "leaderboard";

export type ScreenFactory = () => HTMLElement;

class Router {
  private screens = new Map<ScreenId, ScreenFactory>();
  private host!: HTMLElement;
  private current: ScreenId | null = null;
  private busy = false;
  private pending: ScreenId | null = null;
  private leaveHooks: Array<() => void> = [];
  private navListeners: Array<(id: ScreenId) => void> = [];

  /** Lets other systems, such as audio, react to scene changes. */
  onNavigate(fn: (id: ScreenId) => void): void {
    this.navListeners.push(fn);
  }

  mount(host: HTMLElement): void {
    this.host = host;
  }

  /** Register cleanup (timers, WebGL, observers) to run once the current screen is replaced. */
  onLeave(fn: () => void): void {
    this.leaveHooks.push(fn);
  }

  register(id: ScreenId, factory: ScreenFactory): void {
    this.screens.set(id, factory);
  }

  get currentId(): ScreenId | null {
    return this.current;
  }

  navigate(id: ScreenId): void {
    if (this.busy) {
      this.pending = id;
      return;
    }
    const factory = this.screens.get(id);
    if (!factory) throw new Error(`Unknown screen: ${id}`);
    const stale = this.leaveHooks;
    this.leaveHooks = [];
    const next = factory();
    const prev = this.host.firstElementChild as HTMLElement | null;
    const animate = !store.get().settings.reducedMotion;
    this.current = id;
    this.navListeners.forEach((fn) => fn(id));

    const finish = () => {
      this.busy = false;
      const queued = this.pending;
      this.pending = null;
      if (queued && queued !== this.current) this.navigate(queued);
    };

    if (!animate) {
      this.host.replaceChildren(next);
      stale.forEach((fn) => fn());
      return;
    }

    this.busy = true;
    const enter = () => {
      this.host.replaceChildren(next);
      stale.forEach((fn) => fn());
      gsap.fromTo(next, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35, ease: "power2.out", onComplete: finish });
    };
    if (prev) gsap.to(prev, { opacity: 0, duration: 0.18, ease: "power1.in", onComplete: enter });
    else enter();
  }
}

export const router = new Router();
