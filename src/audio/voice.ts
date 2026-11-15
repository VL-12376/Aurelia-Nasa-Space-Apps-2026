import { store } from "../core/store";
import type { RoleId } from "../crew/roles";

/**
 * Crew voices use the speech synthesis built into the player's own browser or operating system.
 * Nothing is recorded or downloaded, so there is no third-party audio and no copyright to clear.
 */
interface Profile {
  female: boolean;
  pitch: number;
  rate: number;
}

const PROFILE: Record<RoleId, Profile> = {
  aerospace: { female: true, pitch: 1.05, rate: 1 },
  propulsion: { female: false, pitch: 0.9, rate: 1.02 },
  controller: { female: true, pitch: 0.85, rate: 0.95 },
  science: { female: false, pitch: 1.12, rate: 1.04 },
};

const FEMALE = /zira|hazel|susan|samantha|victoria|karen|moira|tessa|aria|jenny|libby|sonia|female|woman/i;
const MALE = /david|mark|george|daniel|alex|fred|guy|ryan|james|thomas|male|man\b/i;

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

/** Speaks one line as a crew member, replacing anything still being said. */
export function speak(role: RoleId, text: string): void {
  const s = store.get().settings;
  if (!voiceAvailable() || !s.voice || s.muted || s.sfxVolume <= 0) return;
  const u = new SpeechSynthesisUtterance(text);
  const v = pick(role);
  if (v) {
    u.voice = v;
    u.lang = v.lang;
  }
  u.pitch = PROFILE[role].pitch;
  u.rate = PROFILE[role].rate;
  u.volume = Math.min(1, s.sfxVolume * 1.2);
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (voiceAvailable()) speechSynthesis.cancel();
}

/** First sentence only, so long explanations are read on screen and just the headline is spoken. */
export function firstSentence(text: string): string {
  const m = text.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim();
}
