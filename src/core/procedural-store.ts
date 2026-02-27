import type { CognitiveConfig } from "../config/defaults.ts";
import type { EngramStorage } from "../storage/sqlite.ts";
import type { Memory } from "./memory.ts";
import { encode } from "./encoder.ts";

export function encodeProcedural(
  storage: EngramStorage,
  content: string,
  config: CognitiveConfig,
  options?: { context?: string; now?: number },
): Memory {
  return encode(
    storage,
    {
      content,
      type: "procedural",
      context: options?.context,
    },
    config,
    options?.now,
  );
}

export function getSkills(storage: EngramStorage): Memory[] {
  return storage.getAllMemories("procedural");
}

export function promoteToSkill(storage: EngramStorage, memoryId: string): Memory | null {
  const memory = storage.getMemory(memoryId);
  if (!memory) return null;

  memory.type = "procedural";
  storage.updateMemory(memory);

  return memory;
}
