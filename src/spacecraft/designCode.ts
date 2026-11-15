import type { Design, PartRef, Target } from "./design";
import { PART_BY_ID } from "./parts";

export interface DesignMeta {
  missionId?: string;
  orbit?: string;
  launcher?: string;
}

export type DecodeResult = { ok: true; design: Design; meta: DesignMeta } | { ok: false; reason: string };

export const CODE_PREFIX = "AUR1-";
export const MAX_NAME_LENGTH = 24;
export const MAX_PARTS = 60;
const MAX_CODE_LENGTH = 4000;
const MAX_META_LENGTH = 40;
const TARGETS: readonly string[] = ["s1", "s2", "s3", "craft"];
const META_KEYS = ["missionId", "orbit", "launcher"] as const;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function cleanText(value: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function encodeDesign(design: Design, meta: DesignMeta = {}): string {
  const payload: Record<string, unknown> = {
    n: cleanText(design.name, MAX_NAME_LENGTH),
    p: design.parts.map((r) => [r.partId, r.target]),
  };
  if (meta.missionId) payload.m = meta.missionId;
  if (meta.orbit) payload.o = meta.orbit;
  if (meta.launcher) payload.l = meta.launcher;
  return CODE_PREFIX + toBase64Url(JSON.stringify(payload));
}

export function decodeDesign(code: string): DecodeResult {
  try {
    if (typeof code !== "string") return { ok: false, reason: "That is not a design code." };
    const text = code.replace(/\s+/g, "");
    if (!text.startsWith(CODE_PREFIX)) return { ok: false, reason: `Design codes start with ${CODE_PREFIX.slice(0, -1)}.` };
    if (text.length > MAX_CODE_LENGTH) return { ok: false, reason: "That code is too long to be a design." };
    const body = text.slice(CODE_PREFIX.length);
    if (!body || !/^[A-Za-z0-9_-]+$/.test(body)) return { ok: false, reason: "The code is damaged: it contains characters a design code never uses." };

    let data: unknown;
    try {
      data = JSON.parse(fromBase64Url(body));
    } catch {
      return { ok: false, reason: "The code is damaged and could not be read." };
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, reason: "The code does not contain a design." };
    const { n, p, m, o, l } = data as Record<string, unknown>;
    if (typeof n !== "string") return { ok: false, reason: "The design has no name." };
    if (!Array.isArray(p)) return { ok: false, reason: "The design has no part list." };
    if (p.length > MAX_PARTS) return { ok: false, reason: `A design holds at most ${MAX_PARTS} parts.` };

    const parts: PartRef[] = [];
    let buses = 0;
    for (const entry of p) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || typeof entry[1] !== "string") return { ok: false, reason: "A part entry is malformed." };
      const [partId, target] = entry as [string, string];
      if (!Object.prototype.hasOwnProperty.call(PART_BY_ID, partId)) return { ok: false, reason: `Unknown part "${cleanText(partId, 30)}".` };
      const def = PART_BY_ID[partId];
      if ((def as { launcher?: boolean }).launcher) return { ok: false, reason: `"${def.name}" is launch-vehicle hardware and cannot be part of a shared design.` };
      if (!TARGETS.includes(target)) return { ok: false, reason: `Unknown placement "${cleanText(target, 10)}".` };
      if ((def.slot === "craft") !== (target === "craft")) return { ok: false, reason: `${def.name} cannot be placed in ${target === "craft" ? "the spacecraft" : "a stage"}.` };
      if (def.category === "structure" && ++buses > 1) return { ok: false, reason: "A design can have only one spacecraft bus." };
      parts.push({ partId, target: target as Target });
    }

    const meta: DesignMeta = {};
    const rawMeta: Record<(typeof META_KEYS)[number], unknown> = { missionId: m, orbit: o, launcher: l };
    for (const key of META_KEYS) {
      const v = rawMeta[key];
      if (v === undefined) continue;
      if (typeof v !== "string") return { ok: false, reason: "The code's extra details are malformed." };
      const cleaned = cleanText(v, MAX_META_LENGTH);
      if (cleaned) meta[key] = cleaned;
    }

    const name = cleanText(n, MAX_NAME_LENGTH) || "Shared design";
    return { ok: true, design: { name, parts }, meta };
  } catch {
    return { ok: false, reason: "The code could not be read." };
  }
}
