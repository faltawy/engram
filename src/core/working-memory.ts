import type { CognitiveConfig } from "../config/defaults.ts";
import type { EngramStorage } from "../storage/sqlite.ts";
import type { WorkingMemorySlot } from "./memory.ts";

export function pushFocus(
  storage: EngramStorage,
  content: string,
  config: CognitiveConfig,
  options?: { memoryRef?: string; now?: number }
): { slot: WorkingMemorySlot; evicted: WorkingMemorySlot | null } {
  const now = options?.now ?? Date.now();
  const currentSlots = storage.getWorkingMemory();

  let evicted: WorkingMemorySlot | null = null;

  if (currentSlots.length >= config.workingMemoryCapacity) {
    const oldest = currentSlots.reduce((min, s) =>
      s.pushedAt < min.pushedAt ? s : min
    );
    evicted = oldest;
    storage.removeWorkingMemorySlot(oldest.slot);
  }

  const usedSlots = new Set(storage.getWorkingMemory().map((s) => s.slot));
  let nextSlot = 0;
  while (usedSlots.has(nextSlot)) nextSlot++;

  const slot: WorkingMemorySlot = {
    slot: nextSlot,
    memoryRef: options?.memoryRef ?? null,
    content,
    pushedAt: now,
  };

  storage.pushWorkingMemory(slot);
  return { slot, evicted };
}

export function popFocus(storage: EngramStorage): WorkingMemorySlot | null {
  const slots = storage.getWorkingMemory();
  if (slots.length === 0) return null;

  const newest = slots.reduce((max, s) =>
    s.pushedAt > max.pushedAt ? s : max
  );

  storage.removeWorkingMemorySlot(newest.slot);
  return newest;
}

export function getFocus(storage: EngramStorage): WorkingMemorySlot[] {
  return storage.getWorkingMemory();
}

export function clearFocus(storage: EngramStorage): number {
  const count = storage.getWorkingMemoryCount();
  storage.clearWorkingMemory();
  return count;
}

export function getWorkingMemoryIds(storage: EngramStorage): string[] {
  return storage
    .getWorkingMemory()
    .filter((s) => s.memoryRef !== null)
    .map((s) => s.memoryRef!);
}

export function focusUtilization(
  storage: EngramStorage,
  config: CognitiveConfig
): { used: number; capacity: number; utilization: number } {
  const used = storage.getWorkingMemoryCount();
  return {
    used,
    capacity: config.workingMemoryCapacity,
    utilization: used / config.workingMemoryCapacity,
  };
}
