import { describe, expect, it } from "vitest";
import { decodeDesign, encodeDesign } from "./designCode";
import { TEMPLATES } from "./templates";
import { PART_BY_ID } from "./parts";

const b64 = (obj: unknown) => "AUR1-" + btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

describe("design codes", () => {
  it("round-trips every starter template with its metadata", () => {
    for (const t of TEMPLATES) {
      const res = decodeDesign(encodeDesign(t.design, { missionId: t.missionId, launcher: "Test" }));
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.design).toEqual(t.design);
        expect(res.meta).toEqual({ missionId: t.missionId, launcher: "Test" });
      }
    }
  });

  it("tolerates surrounding whitespace and line breaks", () => {
    const code = encodeDesign(TEMPLATES[0].design);
    expect(decodeDesign(`  ${code.slice(0, 20)}\n${code.slice(20)} `).ok).toBe(true);
  });

  it("sanitises and truncates names, and handles non-ASCII", () => {
    const res = decodeDesign(b64({ n: "<b>Very  rocket with a really long name</b>", p: [] }));
    expect(res.ok && res.design.name.length <= 24 && !res.design.name.includes("<")).toBe(true);
    const round = decodeDesign(encodeDesign({ name: "Étoile ★", parts: [] }));
    expect(round.ok && round.design.name).toBe("Étoile ★");
  });

  it("rejects malformed input without throwing", () => {
    const bad = ["", "hello", "AUR1-", "AUR1-%%%", "AUR1-bm90anNvbg", b64([]), b64({ n: "x" }), b64({ n: "x", p: "no" }), b64({ n: 5, p: [] }), b64({ n: "x", p: [["bus-s"]] }), b64({ n: "x", p: [["bus-s", "s9"]] })];
    for (const code of bad) expect(decodeDesign(code).ok, code).toBe(false);
    expect(decodeDesign(undefined as unknown as string).ok).toBe(false);
  });

  it("rejects unknown parts, prototype keys, bad placement, too many parts and two buses", () => {
    expect(decodeDesign(b64({ n: "x", p: [["warp-drive", "s1"]] }))).toMatchObject({ ok: false, reason: expect.stringContaining("Unknown part") });
    expect(decodeDesign(b64({ n: "x", p: [["constructor", "s1"]] })).ok).toBe(false);
    expect(decodeDesign(b64({ n: "x", p: [["bus-s", "s1"]] })).ok).toBe(false);
    expect(decodeDesign(b64({ n: "x", p: Array(61).fill(["kestrel-1", "s1"]) })).ok).toBe(false);
    expect(decodeDesign(b64({ n: "x", p: [["bus-s", "craft"], ["bus-m", "craft"]] })).ok).toBe(false);
  });

  it("rejects launch-vehicle parts", () => {
    const id = "test-launcher-part";
    PART_BY_ID[id] = { ...PART_BY_ID["kestrel-1"], id, launcher: true } as unknown as (typeof PART_BY_ID)[string];
    try {
      expect(decodeDesign(b64({ n: "x", p: [[id, "s1"]] })).ok).toBe(false);
    } finally {
      delete PART_BY_ID[id];
    }
  });
});
