import { store } from "../core/store";

/**
 * AURELIA's sound is generated live with the Web Audio API: no recordings, no samples and no
 * third-party tracks. That keeps it free of any copyright or licensing obligations and keeps the
 * download small. The music is generative, so it never loops the same way twice.
 */

export type Mood = "menu" | "map" | "hangar" | "flight" | "debrief";
export type Sfx = "click" | "hover" | "confirm" | "error" | "launch" | "countdown" | "separation" | "alert" | "success" | "failure" | "build" | "ignite";

interface MoodDef {
  /** Chords as MIDI notes. */
  chords: number[][];
  chordSeconds: number;
  padCutoff: number;
  padGain: number;
  bells: number;
  bellScale: number[];
  pulse: "none" | "arp" | "heart";
  bpm: number;
  drone: number;
}

const MOODS: Record<Mood, MoodDef> = {
  menu: {
    chords: [[50, 53, 57, 60, 64], [46, 53, 57, 62, 65], [43, 50, 53, 58, 62], [48, 55, 59, 62, 64]],
    chordSeconds: 14, padCutoff: 1100, padGain: 0.55, bells: 0.5, bellScale: [62, 65, 69, 72, 74, 77, 81], pulse: "none", bpm: 60, drone: 38,
  },
  map: {
    chords: [[45, 52, 56, 59, 64], [41, 48, 52, 57, 59], [38, 45, 49, 52, 57], [40, 47, 52, 56, 59]],
    chordSeconds: 16, padCutoff: 1500, padGain: 0.5, bells: 0.65, bellScale: [69, 71, 73, 76, 78, 81, 83], pulse: "none", bpm: 60, drone: 33,
  },
  hangar: {
    chords: [[36, 48, 51, 55, 58], [32, 44, 48, 51, 55], [41, 48, 51, 56, 60], [43, 50, 53, 58, 62]],
    chordSeconds: 12, padCutoff: 900, padGain: 0.42, bells: 0.25, bellScale: [60, 63, 65, 67, 70, 72, 75], pulse: "arp", bpm: 96, drone: 24,
  },
  flight: {
    chords: [[40, 47, 52, 55, 59], [36, 43, 48, 52, 55], [38, 45, 50, 53, 57], [35, 42, 47, 51, 54]],
    chordSeconds: 10, padCutoff: 700, padGain: 0.5, bells: 0.15, bellScale: [64, 67, 71, 74, 76], pulse: "heart", bpm: 66, drone: 28,
  },
  debrief: {
    chords: [[50, 57, 60, 64, 69], [43, 50, 55, 59, 62], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60]],
    chordSeconds: 14, padCutoff: 1300, padGain: 0.5, bells: 0.4, bellScale: [62, 64, 67, 69, 72, 74, 76], pulse: "none", bpm: 60, drone: 38,
  },
};

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private delaySend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private thrustGain!: GainNode;
  private nextChordAt = 0;
  private mood: Mood | null = null;
  private pendingMood: Mood | null = null;
  private chordIndex = 0;
  private nextStepAt = 0;
  private step = 0;
  private chordGains = new Set<GainNode>();
  private droneGain: GainNode | null = null;
  private droneOsc: OscillatorNode[] = [];
  private lastHover = 0;

  get ready(): boolean {
    return this.ctx !== null;
  }

  /** Browsers only allow sound after a click or key press, so this is called from the first one. */
  start(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master = ctx.createGain();
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(4.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.8;
    this.reverb.connect(wet).connect(this.musicBus);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.9;
    this.reverbSend.connect(this.reverb);

    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.46;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const dl = ctx.createBiquadFilter();
    dl.type = "lowpass";
    dl.frequency.value = 2400;
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0.5;
    this.delaySend.connect(delay);
    delay.connect(dl).connect(fb).connect(delay);
    dl.connect(this.reverbSend);
    dl.connect(this.musicBus);

    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Engine rumble: looped noise, always running, silent until thrust is set.
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 90;
    bp.Q.value = 0.6;
    this.thrustGain = ctx.createGain();
    this.thrustGain.gain.value = 0;
    src.connect(lp).connect(this.thrustGain);
    src.connect(bp).connect(this.thrustGain);
    this.thrustGain.connect(this.sfxBus);
    src.start();

    this.applySettings();
    window.setInterval(() => this.schedule(), 250);
    if (this.pendingMood || !this.mood) this.setMood(this.pendingMood ?? "menu");
  }

  applySettings(): void {
    if (!this.ctx) return;
    const s = store.get().settings;
    const t = this.ctx.currentTime;
    const m = s.muted ? 0 : s.musicVolume;
    const f = s.muted ? 0 : s.sfxVolume;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setTargetAtTime(m * 0.85, t, 0.15);
    this.sfxBus.gain.cancelScheduledValues(t);
    this.sfxBus.gain.setTargetAtTime(f, t, 0.1);
    this.master.gain.value = 0.9;
  }

  setMood(mood: Mood): void {
    if (!this.ctx) {
      this.pendingMood = mood;
      return;
    }
    if (this.mood === mood) return;
    const t = this.ctx.currentTime;
    // Fade out whatever is still sounding so the new scene's music takes over smoothly.
    for (const g of this.chordGains) {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + 3);
    }
    this.chordGains.clear();
    this.mood = mood;
    this.chordIndex = 0;
    this.nextChordAt = t + 0.3;
    this.nextStepAt = t + 0.6;
    this.step = 0;
    this.setDrone(MOODS[mood].drone);
  }

  /** 0 to 1: how hard the engines are firing. */
  setThrust(level: number): void {
    if (!this.ctx) return;
    this.thrustGain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.55, this.ctx.currentTime, 0.25);
  }

  /* ----- scheduling ----- */

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.mood || ctx.state !== "running") return;
    const def = MOODS[this.mood];
    const horizon = ctx.currentTime + 1.4;
    while (this.nextChordAt < horizon) {
      this.playChord(def, def.chords[this.chordIndex % def.chords.length], this.nextChordAt);
      this.chordIndex++;
      this.nextChordAt += def.chordSeconds;
    }
    const beat = 60 / def.bpm;
    const stepLen = def.pulse === "arp" ? beat / 4 : beat / 2;
    while (this.nextStepAt < horizon) {
      this.playStep(def, this.nextStepAt, this.step++);
      this.nextStepAt += stepLen;
    }
  }

  private playChord(def: MoodDef, notes: number[], at: number): void {
    const ctx = this.ctx!;
    const dur = def.chordSeconds;
    const chordGain = ctx.createGain();
    chordGain.gain.value = 1;
    this.chordGains.add(chordGain);
    window.setTimeout(() => this.chordGains.delete(chordGain), (dur + 8) * 1000);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(def.padCutoff * 0.6, at);
    lp.frequency.linearRampToValueAtTime(def.padCutoff * 1.25, at + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(def.padCutoff * 0.7, at + dur + 3);
    lp.connect(chordGain);
    chordGain.connect(this.musicBus);
    chordGain.connect(this.reverbSend);

    notes.forEach((note, i) => {
      const env = ctx.createGain();
      const peak = (def.padGain / notes.length) * (i === 0 ? 1.2 : 0.9);
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(peak, at + dur * 0.28);
      env.gain.setValueAtTime(peak, at + dur * 0.65);
      env.gain.exponentialRampToValueAtTime(0.0001, at + dur + 4);
      env.connect(lp);
      for (const [type, detune] of [["sawtooth", -7], ["sawtooth", 7], ["triangle", 0]] as const) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = mtof(note);
        o.detune.value = detune + (Math.random() - 0.5) * 4;
        const vib = ctx.createOscillator();
        vib.frequency.value = 0.12 + Math.random() * 0.2;
        const vg = ctx.createGain();
        vg.gain.value = 5;
        vib.connect(vg).connect(o.detune);
        const g = ctx.createGain();
        g.gain.value = type === "triangle" ? 0.9 : 0.35;
        o.connect(g).connect(env);
        o.start(at);
        vib.start(at);
        o.stop(at + dur + 4.2);
        vib.stop(at + dur + 4.2);
      }
    });
  }

  private playStep(def: MoodDef, at: number, n: number): void {
    const chord = def.chords[Math.max(0, this.chordIndex - 1) % def.chords.length];
    if (def.pulse === "arp") {
      // Soft sequenced plucks that give the hangar a working-machinery feel.
      const pattern = [0, 2, 1, 3, 2, 4, 1, 3];
      if (n % 2 === 0 || Math.random() < 0.3) {
        const note = chord[pattern[n % pattern.length] % chord.length] + 12;
        this.pluck(mtof(note), at, 0.05, 0.5);
      }
    } else if (def.pulse === "heart" && n % 4 === 0) {
      this.thump(at, 0.5);
      this.thump(at + 0.22, 0.28);
    }
    if (Math.random() < def.bells / 4 && n % 2 === 0) {
      const note = def.bellScale[Math.floor(Math.random() * def.bellScale.length)];
      this.bell(mtof(note), at + Math.random() * 0.2, 0.05 + Math.random() * 0.04);
    }
  }

  private pluck(freq: number, at: number, vol: number, dur: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(2600, at);
    f.frequency.exponentialRampToValueAtTime(400, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(f).connect(g);
    g.connect(this.musicBus);
    g.connect(this.delaySend);
    g.connect(this.reverbSend);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  private bell(freq: number, at: number, vol: number): void {
    const ctx = this.ctx!;
    for (const [mult, v, decay] of [[1, 1, 4], [2.756, 0.35, 2.2], [5.4, 0.12, 1.2]] as const) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol * v, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
      o.connect(g);
      g.connect(this.musicBus);
      g.connect(this.delaySend);
      g.connect(this.reverbSend);
      o.start(at);
      o.stop(at + decay + 0.1);
    }
  }

  private thump(at: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(95, at);
    o.frequency.exponentialRampToValueAtTime(38, at + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol * 0.55, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
    o.connect(g).connect(this.musicBus);
    o.start(at);
    o.stop(at + 0.4);
  }

  private setDrone(note: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    if (this.droneGain) {
      const old = this.droneGain;
      old.gain.cancelScheduledValues(t);
      old.gain.setValueAtTime(old.gain.value, t);
      old.gain.linearRampToValueAtTime(0, t + 3);
      const oldOsc = this.droneOsc;
      window.setTimeout(() => oldOsc.forEach((o) => o.stop()), 3500);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 5);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 180;
    g.connect(this.musicBus);
    lp.connect(g);
    this.droneGain = g;
    this.droneOsc = [];
    for (const [mult, detune] of [[1, 0], [1.5, 4], [2, -5]] as const) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = mtof(note) * mult;
      o.detune.value = detune;
      const og = ctx.createGain();
      og.gain.value = mult === 1 ? 1 : 0.35;
      o.connect(og).connect(lp);
      o.start();
      this.droneOsc.push(o);
    }
  }

  /* ----- sound effects ----- */

  sfx(name: Sfx): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    switch (name) {
      case "click":
        this.blip(880, 0.06, "sine", 0.18, t, 1320);
        break;
      case "hover": {
        const now = performance.now();
        if (now - this.lastHover < 70) return;
        this.lastHover = now;
        this.blip(1800, 0.025, "sine", 0.05, t);
        break;
      }
      case "confirm":
        this.blip(660, 0.09, "sine", 0.2, t);
        this.blip(990, 0.16, "sine", 0.2, t + 0.08);
        break;
      case "build":
        this.blip(220, 0.1, "square", 0.08, t, 440);
        this.blip(440, 0.2, "triangle", 0.18, t + 0.09);
        this.blip(660, 0.3, "sine", 0.18, t + 0.18);
        break;
      case "error":
        this.blip(180, 0.2, "sawtooth", 0.14, t, 120);
        break;
      case "countdown":
        this.blip(1000, 0.12, "sine", 0.22, t);
        break;
      case "ignite":
        this.noise(1.6, 400, 0.5, t, true);
        this.blip(55, 1.4, "sawtooth", 0.2, t, 40);
        break;
      case "launch":
        this.noise(4, 900, 0.7, t, true);
        this.blip(48, 3.5, "sawtooth", 0.3, t, 36);
        this.blip(96, 3, "triangle", 0.12, t, 70);
        break;
      case "separation":
        this.noise(0.25, 2400, 0.4, t, false);
        this.blip(90, 0.35, "square", 0.22, t, 50);
        this.blip(1200, 0.08, "sine", 0.12, t + 0.12);
        break;
      case "alert":
        for (let i = 0; i < 3; i++) {
          this.blip(880, 0.14, "square", 0.1, t + i * 0.34);
          this.blip(660, 0.14, "square", 0.1, t + i * 0.34 + 0.17);
        }
        break;
      case "success":
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.blip(f, 0.9, "triangle", 0.16, t + i * 0.14, undefined, true));
        break;
      case "failure":
        [440, 392, 329.63, 261.63].forEach((f, i) => this.blip(f, 0.8, "sawtooth", 0.09, t + i * 0.28, f * 0.97, true));
        break;
    }
  }

  private blip(freq: number, dur: number, type: OscillatorType, vol: number, at: number, slideTo?: number, wet = false): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + Math.min(0.015, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.sfxBus);
    if (wet) g.connect(this.reverbSend);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  private noise(dur: number, cutoff: number, vol: number, at: number, swell: boolean): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(swell ? 120 : cutoff, at);
    if (swell) f.frequency.exponentialRampToValueAtTime(cutoff, at + dur * 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + (swell ? dur * 0.4 : 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(at);
    src.stop(at + dur + 0.1);
  }

  private makeImpulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
    }
    return buf;
  }
}

export const audio = new AudioEngine();

/** Wires the engine to the page: starts on the first gesture, adds UI sounds and a mute button. */
export function installAudio(): void {
  const first = () => {
    audio.start();
    window.removeEventListener("pointerdown", first);
    window.removeEventListener("keydown", first);
  };
  window.addEventListener("pointerdown", first);
  window.addEventListener("keydown", first);

  document.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement | null)?.closest("button, select, summary, [role=tab]") as HTMLElement | null;
    if (!el || el.hasAttribute("disabled") || el.id === "audio-toggle") return;
    audio.sfx(el.classList.contains("btn") && !el.classList.contains("ghost") ? "confirm" : "click");
  });
  document.addEventListener("pointerover", (e) => {
    const el = (e.target as HTMLElement | null)?.closest("button, .h-part, .mb-card");
    if (el && !el.hasAttribute("disabled")) audio.sfx("hover");
  });

  const btn = document.createElement("button");
  btn.id = "audio-toggle";
  btn.className = "audio-toggle";
  const paint = () => {
    const muted = store.get().settings.muted;
    btn.textContent = muted ? "🔇" : "🔊";
    btn.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
    btn.title = muted ? "Sound is off. Click to turn it on." : "Sound is on. Click to mute.";
  };
  btn.addEventListener("click", () => {
    audio.start();
    store.updateSettings({ muted: !store.get().settings.muted });
    audio.applySettings();
    paint();
  });
  paint();
  document.body.append(btn);
}
