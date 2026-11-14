import type { Design } from "./design";

const ref = (partId: string, target: "s1" | "s2" | "s3" | "craft") => ({ partId, target });

export interface Template {
  id: string;
  name: string;
  blurb: string;
  /** Mission this layout is meant to satisfy, for the tests. */
  missionId: string;
  design: Design;
}

/** Starter layouts built only from the unlocked part set. */
export const TEMPLATES: readonly Template[] = [
  {
    id: "light-launcher",
    name: "Light satellite launcher",
    blurb: "Two stages and a compact bus for First Light Satellite.",
    missionId: "s1-first-satellite",
    design: {
      name: "Dawnline",
      parts: [
        ref("kestrel-1", "s1"), ref("kestrel-1", "s1"), ref("tank-l", "s1"),
        ref("ember-1", "s2"), ref("tank-m", "s2"),
        ref("bus-s", "craft"), ref("solar-m", "craft"), ref("bat-s", "craft"), ref("ant-uhf", "craft"),
      ],
    },
  },
  {
    id: "earth-watch",
    name: "Earth observer",
    blurb: "Mid-size bus with a camera and star tracker for Earth Watch.",
    missionId: "s1-earth-watch",
    design: {
      name: "Meridian",
      parts: [
        ref("kestrel-1", "s1"), ref("kestrel-1", "s1"), ref("tank-l", "s1"),
        ref("ember-1", "s2"), ref("tank-m", "s2"),
        ref("bus-m", "craft"), ref("solar-m", "craft"), ref("bat-m", "craft"), ref("ant-uhf", "craft"), ref("nav-star", "craft"), ref("sci-cam", "craft"),
      ],
    },
  },
  {
    id: "lunar-orbiter",
    name: "Lunar orbiter (needs research)",
    blurb: "Three stages, an inertial platform and a spectrometer for Selene Orbiter. Uses parts that must be researched first.",
    missionId: "s2-lunar-orbiter",
    design: {
      name: "Selene",
      parts: [
        ref("kestrel-1", "s1"), ref("kestrel-1", "s1"), ref("kestrel-1", "s1"), ref("kestrel-1", "s1"), ref("kestrel-1", "s1"), ref("kestrel-1", "s1"), ref("kestrel-1", "s1"), ref("kestrel-1", "s1"),
        ref("tank-xl", "s1"),
        ref("kestrel-v", "s2"), ref("kestrel-v", "s2"), ref("tank-l", "s2"),
        ref("vesper", "s3"), ref("tank-m", "s3"),
        ref("bus-l", "craft"), ref("solar-l", "craft"), ref("bat-m", "craft"), ref("ant-uhf", "craft"), ref("nav-imu", "craft"), ref("sci-cam", "craft"), ref("sci-spec", "craft"),
      ],
    },
  },
];
