import type { CognitiveConfig } from "../config/defaults.ts";
import type { EngramStorage } from "../storage/sqlite.ts";
import { baseLevelActivation } from "./activation.ts";
import { formEmotionalAssociations, formCausalAssociations } from "./associations.ts";
import { defaultEmotionWeight } from "./emotional-tag.ts";
import type { Memory, EncodeInput } from "./memory.ts";
import { generateMemoryId } from "./memory.ts";

export function encode(
  storage: EngramStorage,
  input: EncodeInput,
  config: CognitiveConfig,
  now?: number,
): Memory {
  const currentTime = now ?? Date.now();

  const emotion = input.emotion ?? "neutral";
  const emotionWeight = input.emotionWeight ?? defaultEmotionWeight(emotion);

  const id = generateMemoryId(input.content, input.type);

  const initialActivation = baseLevelActivation([currentTime], currentTime, config.decayRate);

  const emotionBoost =
    emotionWeight > 0 ? Math.log(1 + emotionWeight * config.emotionalBoostFactor) : 0;

  const memory: Memory = {
    id,
    type: input.type,
    content: input.content,
    encodedAt: currentTime,
    lastRecalledAt: null,
    recallCount: 0,
    activation: initialActivation + emotionBoost,
    emotion,
    emotionWeight,
    context: input.context ?? null,
    chunkId: null,
    reconsolidationCount: 0,
  };

  storage.transaction(() => {
    storage.insertMemory(memory);
    storage.logAccess(id, "encode", currentTime);
  });

  formEmotionalAssociations(storage, memory, currentTime);
  formCausalAssociations(storage, memory, config, currentTime);

  return memory;
}
