import type { CognitiveConfig } from "../config/defaults.ts";
import type { EngramStorage } from "../storage/sqlite.ts";
import type { Association, AssociationType, Emotion, Memory } from "./memory.ts";
import { generateId } from "./memory.ts";
import { extractKeywords } from "./search.ts";

type ArousalTier = "high" | "medium" | "low";

const AROUSAL_TIERS: Record<Emotion, ArousalTier> = {
  anxiety: "high",
  surprise: "high",
  joy: "medium",
  frustration: "medium",
  satisfaction: "low",
  curiosity: "low",
  neutral: "low",
};

export function formAssociation(
  storage: EngramStorage,
  sourceId: string,
  targetId: string,
  type: AssociationType,
  strength?: number,
  now?: number,
): Association {
  const assoc: Association = {
    id: generateId(),
    sourceId,
    targetId,
    strength: strength ?? 0.5,
    formedAt: now ?? Date.now(),
    type,
  };

  storage.insertAssociation(assoc);
  return assoc;
}

export function strengthenAssociation(
  storage: EngramStorage,
  associationId: string,
  boost: number = 0.1,
): void {
  storage.updateAssociationStrength(associationId, Math.min(1.0, boost));
}

export function formTemporalAssociations(
  storage: EngramStorage,
  memory: Memory,
  config: CognitiveConfig,
  now?: number,
): Association[] {
  const currentTime = now ?? Date.now();
  const formed: Association[] = [];

  if (memory.context) {
    const contextMemories = storage
      .getMemoriesByContext(memory.context, undefined, config.temporalContextWindow)
      .filter((m) => m.id !== memory.id)
      .sort((a, b) => b.encodedAt - a.encodedAt);

    for (let i = 0; i < contextMemories.length; i++) {
      const other = contextMemories[i]!;
      const positionGap = i + 1;
      const strength = 1 / (1 + positionGap);

      const existing = storage.getAssociationsFrom(memory.id);
      const alreadyLinked = existing.some((a) => a.targetId === other.id);
      if (alreadyLinked) continue;

      const assoc = formAssociation(
        storage,
        memory.id,
        other.id,
        "temporal",
        Math.max(0.1, strength),
        currentTime,
      );
      formed.push(assoc);
    }
  } else {
    const windowMs = 300000;
    const allMemories = storage.getAllMemories();

    for (const other of allMemories) {
      if (other.id === memory.id) continue;

      const timeDiff = Math.abs(memory.encodedAt - other.encodedAt);
      if (timeDiff <= windowMs) {
        const existing = storage.getAssociationsFrom(memory.id);
        const alreadyLinked = existing.some((a) => a.targetId === other.id);
        if (alreadyLinked) continue;

        const strength = 1 - timeDiff / windowMs;
        const assoc = formAssociation(
          storage,
          memory.id,
          other.id,
          "temporal",
          Math.max(0.1, strength * 0.8),
          currentTime,
        );
        formed.push(assoc);
      }
    }
  }

  return formed;
}

export function formSemanticAssociations(
  storage: EngramStorage,
  memory: Memory,
  now?: number,
): Association[] {
  const currentTime = now ?? Date.now();
  const keywords = extractKeywords(memory.content);
  if (keywords.length === 0) return [];

  const allMemories = storage.getAllMemories();
  const formed: Association[] = [];

  for (const other of allMemories) {
    if (other.id === memory.id) continue;

    const otherKeywords = extractKeywords(other.content);
    const overlap = keywords.filter((k) => otherKeywords.includes(k));

    if (overlap.length > 0) {
      const existing = storage.getAssociations(memory.id);
      const alreadyLinked = existing.some(
        (a) =>
          (a.sourceId === memory.id && a.targetId === other.id) ||
          (a.sourceId === other.id && a.targetId === memory.id),
      );
      if (alreadyLinked) continue;

      const strength = overlap.length / Math.max(keywords.length, otherKeywords.length);
      const assoc = formAssociation(
        storage,
        memory.id,
        other.id,
        "semantic",
        Math.max(0.1, strength),
        currentTime,
      );
      formed.push(assoc);
    }
  }

  return formed;
}

export function formEmotionalAssociations(
  storage: EngramStorage,
  memory: Memory,
  now?: number,
): Association[] {
  if (memory.emotion === "neutral" || memory.emotionWeight <= 0.3) return [];

  const currentTime = now ?? Date.now();
  const allMemories = storage.getAllMemories();
  const formed: Association[] = [];
  const memoryTier = AROUSAL_TIERS[memory.emotion];

  for (const other of allMemories) {
    if (other.id === memory.id) continue;
    if (other.emotion === "neutral" || other.emotionWeight <= 0.3) continue;

    const existing = storage.getAssociations(memory.id);
    const alreadyLinked = existing.some(
      (a) =>
        a.type === "emotional" &&
        ((a.sourceId === memory.id && a.targetId === other.id) ||
          (a.sourceId === other.id && a.targetId === memory.id)),
    );
    if (alreadyLinked) continue;

    let strength: number;
    if (memory.emotion === other.emotion) {
      strength = 1 - Math.abs(memory.emotionWeight - other.emotionWeight);
    } else if (AROUSAL_TIERS[other.emotion] === memoryTier) {
      strength = 0.3 * (1 - Math.abs(memory.emotionWeight - other.emotionWeight));
    } else {
      continue;
    }

    if (strength < 0.1) continue;

    const assoc = formAssociation(storage, memory.id, other.id, "emotional", strength, currentTime);
    formed.push(assoc);
  }

  return formed;
}

export function formCausalAssociations(
  storage: EngramStorage,
  memory: Memory,
  config: CognitiveConfig,
  now?: number,
): Association[] {
  if (!memory.context) return [];

  const currentTime = now ?? Date.now();
  const contextMemories = storage
    .getMemoriesByContext(memory.context, undefined, config.temporalContextWindow)
    .filter((m) => m.id !== memory.id && m.encodedAt < memory.encodedAt)
    .sort((a, b) => b.encodedAt - a.encodedAt);

  const formed: Association[] = [];

  for (let i = 0; i < contextMemories.length; i++) {
    const source = contextMemories[i]!;
    const sequenceGap = i + 1;
    const strength = 1 / (1 + sequenceGap);

    const existing = storage.getAssociations(memory.id);
    const alreadyLinked = existing.some(
      (a) =>
        a.type === "causal" &&
        ((a.sourceId === source.id && a.targetId === memory.id) ||
          (a.sourceId === memory.id && a.targetId === source.id)),
    );
    if (alreadyLinked) continue;

    const assoc = formAssociation(storage, source.id, memory.id, "causal", strength, currentTime);
    formed.push(assoc);
  }

  return formed;
}

export function recordCoRecall(
  storage: EngramStorage,
  memoryIds: string[],
  now?: number,
): Association[] {
  const currentTime = now ?? Date.now();
  const formed: Association[] = [];

  for (let i = 0; i < memoryIds.length; i++) {
    for (let j = i + 1; j < memoryIds.length; j++) {
      const srcId = memoryIds[i]!;
      const tgtId = memoryIds[j]!;
      const existing = storage.getAssociations(srcId);
      const link = existing.find(
        (a) =>
          (a.sourceId === srcId && a.targetId === tgtId) ||
          (a.sourceId === tgtId && a.targetId === srcId),
      );

      if (link) {
        const newStrength = Math.min(1.0, link.strength + 0.1);
        storage.updateAssociationStrength(link.id, newStrength);
      } else {
        const assoc = formAssociation(storage, srcId, tgtId, "co-recall", 0.3, currentTime);
        formed.push(assoc);
      }
    }
  }

  return formed;
}

export function getSpreadingActivationTargets(
  storage: EngramStorage,
  sourceId: string,
  config: CognitiveConfig,
  maxDepth: number = config.recallSpreadingDepth,
): { memoryId: string; activationBoost: number; depth: number }[] {
  const visited = new Set<string>([sourceId]);
  const results: { memoryId: string; activationBoost: number; depth: number }[] = [];

  let frontier = [{ id: sourceId, boost: 1.0 }];

  for (let depth = 1; depth <= maxDepth; depth++) {
    const nextFrontier: { id: string; boost: number }[] = [];

    for (const { id, boost } of frontier) {
      const associations = storage.getAssociations(id);

      for (const assoc of associations) {
        const targetId = assoc.sourceId === id ? assoc.targetId : assoc.sourceId;
        if (visited.has(targetId)) continue;
        visited.add(targetId);

        const fanCount = storage.getFanCount(id);
        const spreadStrength = Math.max(
          0,
          config.maxSpreadingActivation - Math.log(Math.max(1, fanCount)),
        );
        const activationBoost = boost * assoc.strength * spreadStrength;

        if (activationBoost > 0.01) {
          results.push({ memoryId: targetId, activationBoost, depth });
          nextFrontier.push({ id: targetId, boost: activationBoost });
        }
      }
    }

    frontier = nextFrontier;
  }

  return results;
}
