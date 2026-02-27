import type { CognitiveConfig } from "../config/defaults.ts";
import type { EngramStorage } from "../storage/sqlite.ts";
import type { Memory } from "./memory.ts";

export interface ReconsolidationContext {
  newContext?: string;
  currentEmotion?: Memory["emotion"];
  currentEmotionWeight?: number;
}

export function reconsolidate(
  storage: EngramStorage,
  memory: Memory,
  recallContext: ReconsolidationContext,
  config: CognitiveConfig,
): Memory {
  const blendRate = config.reconsolidationBlendRate;

  if (recallContext.newContext && memory.context) {
    if (!memory.context.includes(recallContext.newContext)) {
      memory.context = `${memory.context}, ${recallContext.newContext}`;
    }
  } else if (recallContext.newContext && !memory.context) {
    memory.context = recallContext.newContext;
  }

  if (recallContext.currentEmotion && recallContext.currentEmotion !== memory.emotion) {
    const blendedWeight =
      memory.emotionWeight * (1 - blendRate) +
      (recallContext.currentEmotionWeight ?? 0.5) * blendRate;

    if (blendRate > 0.3 || memory.emotionWeight < 0.2) {
      memory.emotion = recallContext.currentEmotion;
    }
    memory.emotionWeight = blendedWeight;
  }

  memory.reconsolidationCount++;
  storage.updateMemory(memory);

  return memory;
}
