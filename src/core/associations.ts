import type { CognitiveConfig } from "../config/defaults.ts";
import type { EngramStorage } from "../storage/sqlite.ts";
import type { Association, AssociationType, Memory } from "./memory.ts";
import { generateId } from "./memory.ts";
import { extractKeywords } from "./search.ts";

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
  windowMs: number = 300000,
  now?: number,
): Association[] {
  const currentTime = now ?? Date.now();
  const allMemories = storage.getAllMemories();
  const formed: Association[] = [];

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
  maxDepth: number = 2,
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
