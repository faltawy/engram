import type { ClockMode } from "../config/defaults.ts";

export interface AccessEntry {
  accessedAt: number;
  clock: number;
}

export interface ClockNow {
  wall: number;
  clock: number;
}

const MIN_WALL_AGE_SECONDS = 1.0;
const MIN_AGENT_AGE_EVENTS = 0.5;

export function accessAges(entries: AccessEntry[], now: ClockNow, mode: ClockMode): number[] {
  if (mode === "agent") {
    return entries.map((e) => Math.max(now.clock - e.clock, MIN_AGENT_AGE_EVENTS));
  }
  return entries.map((e) => Math.max((now.wall - e.accessedAt) / 1000, MIN_WALL_AGE_SECONDS));
}

export function encodeAge(mode: ClockMode): number {
  return mode === "agent" ? MIN_AGENT_AGE_EVENTS : MIN_WALL_AGE_SECONDS;
}
