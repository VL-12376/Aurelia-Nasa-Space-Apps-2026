import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import lines from "./crewLines.json";

vi.mock("../core/store", () => ({
  store: {
    get: () => ({ settings: { voice: true, muted: false, sfxVolume: 0.7 } }),
    subscribe: () => () => undefined,
  },
}));

import { crewLine, speak, stopSpeaking } from "./voice";

class Recording {
  static instances: Recording[] = [];
  onended: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  volume = 1;
  pause = vi.fn();
  play = vi.fn(async () => undefined);
  constructor(readonly src: string) { Recording.instances.push(this); }
}

afterEach(() => {
  stopSpeaking();
  vi.unstubAllGlobals();
  Recording.instances = [];
});

describe("crew recordings", () => {
  it("plays character-specific recordings sequentially without interrupting the previous speaker", async () => {
    vi.stubGlobal("Audio", Recording);
    const mira = speak("aerospace", crewLine("aerospace", "poll"));
    const kenji = speak("propulsion", crewLine("propulsion", "poll"));
    expect(Recording.instances).toHaveLength(1);
    expect(Recording.instances[0].src).toContain("aerospace-poll.wav");
    expect(Recording.instances[0].pause).not.toHaveBeenCalled();
    Recording.instances[0].onended!();
    await mira;
    expect(Recording.instances).toHaveLength(2);
    expect(Recording.instances[1].src).toContain("propulsion-poll.wav");
    Recording.instances[1].onended!();
    await kenji;
  });

  it("stops active audio and clears queued dialogue without starting the next speaker", async () => {
    vi.stubGlobal("Audio", Recording);
    const current = speak("controller", crewLine("controller", "poll"));
    const queued = speak("science", crewLine("science", "poll"));
    stopSpeaking();
    await Promise.all([current, queued]);
    expect(Recording.instances).toHaveLength(1);
    expect(Recording.instances[0].pause).toHaveBeenCalledOnce();
    expect(Recording.instances[0].onended).toBeNull();
  });

  it("ships playable original speech for every scripted line, four distinct voices and sub-second countdown clips", () => {
    for (const line of lines) {
      const wav = readFileSync(resolve("public", "crew-audio", `${line.role}-${line.id}.wav`));
      expect(wav.subarray(0, 4).toString()).toBe("RIFF");
      expect(wav.subarray(8, 12).toString()).toBe("WAVE");
      expect(wav.length).toBeGreaterThan(44);
      if (/^count-\d+$/.test(line.id)) expect((wav.length - 44) / wav.readUInt32LE(28)).toBeLessThan(1);
    }
    const samples = ["aerospace", "propulsion", "controller", "science"].map((role) => readFileSync(resolve("public", "crew-audio", `${role}-complete.wav`)).toString("base64"));
    expect(new Set(samples).size).toBe(4);
  });
});
