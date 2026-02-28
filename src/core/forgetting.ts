import type { CognitiveConfig } from "../config/defaults.ts";
import type { EngramStorage } from "../storage/sqlite.ts";
import { baseLevelActivation } from "./activation.ts";

// R(t) = e^{-t/S}
export function ebbinghausRetention(
  timeSinceLastRecall: number,
  strength: number
): number {
  if (strength <= 0) return 0;
  return Math.exp(-timeSinceLastRecall / strength);
}

export function memoryStrength(
  recallCount: number,
  emotionWeight: number,
  associationCount: number,
  emotionalBoostFactor: number
): number {
  const recallStrength = 1 + recallCount * 0.8;
  const emotionalStrength = 1 + emotionWeight * emotionalBoostFactor;
  const associativeStrength = 1 + Math.log(1 + associationCount) * 0.5;
  return recallStrength * emotionalStrength * associativeStrength;
}

export function refreshActivations(
  storage: EngramStorage,
  config: CognitiveConfig,
  now?: number
): { updated: number; atRisk: number } {
  const currentTime = now ?? Date.now();
  const memories = storage.getAllMemories();
  let updated = 0;
  let atRisk = 0;

  for (const memory of memories) {
    if (memory.type === "procedural") continue;

    const timestamps = storage.getAccessTimestamps(memory.id);
    const newActivation = baseLevelActivation(
      timestamps,
      currentTime,
      config.decayRate
    );

    const emotionBoost =
      memory.emotionWeight > 0
        ? Math.log(1 + memory.emotionWeight * config.emotionalBoostFactor)
        : 0;

    const finalActivation = newActivation + emotionBoost;

    if (Math.abs(finalActivation - memory.activation) > 0.001) {
      memory.activation = finalActivation;
      storage.updateMemory(memory);
      updated++;
    }

    if (finalActivation < config.retrievalThreshold) {
      atRisk++;
    }
  }

  return { updated, atRisk };
}
