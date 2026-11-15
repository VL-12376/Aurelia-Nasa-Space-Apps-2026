import { store } from "../core/store";
import type { RoleId } from "../crew/roles";
import lines from "./crewLines.json";
import { toast } from "../core/dom";

/**
 * Original crew recordings use four public-domain dataset voices. Unscripted lines
 * use device speech. A single queue keeps both sources from talking over each other.
 */
interface Profile {
  female: boolean;
  pitch: number;
  rate: number;
}

const PROFILE: Record<RoleId, Profile> = {
  aerospace: { female: true, pitch: 1.05, rate: 1 },
  propulsion: { female: false, pitch: 0.9, rate: 1.02 },
  controller: { female: true, pitch: 1, rate: 0.97 },
  science: { female: false, pitch: 1, rate: 1 },
};

const FEMALE = /zira|hazel|susan|samantha|victoria|karen|moira|tessa|aria|jenny|libby|sonia|female|woman/i;
const MALE = /david|mark|george|daniel|alex|fred|guy|ryan|james|thomas|\bmale\b|man\b/i;

export const voiceAvailable = (): boolean => typeof window !== "undefined" && "speechSynthesis" in window;

function pick(role: RoleId): SpeechSynthesisVoice | null {
  const all = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  if (!all.length) return null;
  const wantFemale = PROFILE[role].female;
  const matching = all.filter((v) => (wantFemale ? FEMALE : MALE).test(v.name));
  const pool = matching.length ? matching : all;
  // Two roles of the same gender take different voices where the system has more than one.
  const rank = (["aerospace", "controller", "propulsion", "science"] as RoleId[]).filter((r) => PROFILE[r].female === wantFemale).indexOf(role);
  return pool[rank % pool.length];
}

interface QueuedLine {
  role: RoleId;
  text: string;
  clip?: string;
  resolve(): void;
}

const queue: QueuedLine[] = [];
let current: QueuedLine | null = null;
let recording: HTMLAudioElement | null = null;
let utterance: SpeechSynthesisUtterance | null = null;
let warned = false;

export function crewLine(role: RoleId, id: string): string {
  const line = lines.find((l) => l.role === role && l.id === id);
  if (!line) throw new Error(`Unknown crew audio line: ${role}/${id}`);
  return line.text;
}

function finish(line: QueuedLine): void {
  if (current !== line) return;
  recording = null;
  utterance = null;
  current = null;
  line.resolve();
  playNext();
}

function deviceSpeech(line: QueuedLine): void {
  if (!voiceAvailable()) {
    if (!warned) { warned = true; toast("Device speech is unavailable. Crew dialogue remains on screen."); }
    finish(line);
    return;
  }
  const u = new SpeechSynthesisUtterance(line.text);
  utterance = u;
  const v = pick(line.role);
  if (v) { u.voice = v; u.lang = v.lang; }
  u.pitch = PROFILE[line.role].pitch;
  u.rate = PROFILE[line.role].rate;
  u.volume = Math.min(1, store.get().settings.sfxVolume * 1.2);
  u.onend = () => finish(line);
  u.onerror = (event) => {
    console.warn("Crew device speech failed.", event.error);
    if (!warned) { warned = true; toast("Crew speech could not play. Dialogue remains on screen."); }
    finish(line);
  };
  speechSynthesis.speak(u);
}

function playNext(): void {
  if (current || !queue.length) return;
  const line = queue.shift()!;
  current = line;
  const s = store.get().settings;
  if (!s.voice || s.muted || s.sfxVolume <= 0) { finish(line); return; }
  if (!line.clip) { deviceSpeech(line); return; }
  const audio = new Audio(line.clip);
  recording = audio;
  audio.volume = Math.min(1, s.sfxVolume * 1.2);
  audio.onended = () => finish(line);
  const failed = (error: unknown) => {
    if (current !== line || recording !== audio) return;
    audio.pause();
    audio.onended = null;
    audio.onerror = null;
    recording = null;
    console.warn("Crew recording could not play.", error);
    if (!warned) { warned = true; toast("Crew recording unavailable. Trying device speech; dialogue remains on screen."); }
    deviceSpeech(line);
  };
  audio.onerror = failed;
  void audio.play().catch(failed);
}

/** Queues a line; resolves when it finishes, is skipped, or is stopped. */
export function speak(role: RoleId, text: string): Promise<void> {
  const match = lines.find((l) => l.role === role && l.text === text);
  return new Promise((resolve) => {
    queue.push({ role, text, clip: match ? `${import.meta.env.BASE_URL}crew-audio/${role}-${match.id}.wav` : undefined, resolve });
    playNext();
  });
}

export function refreshVoiceSettings(): void {
  const s = store.get().settings;
  if (!s.voice || s.muted || s.sfxVolume <= 0) {
    stopSpeaking();
  } else if (recording) {
    recording.volume = Math.min(1, s.sfxVolume * 1.2);
  }

  store.subscribe(refreshVoiceSettings);
}

export function stopSpeaking(): void {
  const active = current;
  current = null;
  if (recording) {
    recording.onended = null;
    recording.onerror = null;
    recording.pause();
    recording = null;
  }
  if (utterance) { utterance.onend = null; utterance.onerror = null; utterance = null; }
  if (voiceAvailable()) speechSynthesis.cancel();
  active?.resolve();
  queue.splice(0).forEach((line) => line.resolve());
}

/** First sentence only, so long explanations are read on screen and just the headline is spoken. */
export function firstSentence(text: string): string {
  const m = text.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim();
}
