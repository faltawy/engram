import type { CognitiveConfig } from "../config/defaults.ts";
import type { EngramStorage } from "../storage/sqlite.ts";
import {
  formSemanticAssociations,
  formTemporalAssociations,
  formEmotionalAssociations,
  formCausalAssociations,
} from "./associations.ts";
import { encode } from "./encoder.ts";
import { refreshActivations } from "./forgetting.ts";
import type { Memory, ConsolidationLog } from "./memory.ts";
import { generateId } from "./memory.ts";
import { extractKeywords, tokenize } from "./search.ts";

export interface ConsolidationResult {
  memoriesStrengthened: number;
  memoriesPruned: number;
  factsExtracted: number;
  associationsDiscovered: number;
  prunedIds: string[];
  extractedFacts: string[];
  discoveredAssociationPairs: [string, string][];
}

export function consolidate(
  storage: EngramStorage,
  config: CognitiveConfig,
  now?: number,
): ConsolidationResult {
  const currentTime = now ?? Date.now();

  const result: ConsolidationResult = {
    memoriesStrengthened: 0,
    memoriesPruned: 0,
    factsExtracted: 0,
    associationsDiscovered: 0,
    prunedIds: [],
    extractedFacts: [],
    discoveredAssociationPairs: [],
  };

  refreshActivations(storage, config, currentTime);

  const allMemories = storage.getAllMemories();
  for (const memory of allMemories) {
    if (memory.type === "procedural") continue;

    const timestamps = storage.getAccessTimestamps(memory.id);
    const recentAccesses = timestamps.filter((t) => currentTime - t < 86400000);

    if (recentAccesses.length >= 2) {
      storage.logAccess(memory.id, "consolidate", currentTime);
      result.memoriesStrengthened++;
    }
  }

  refreshActivations(storage, config, currentTime);
  const weakMemories = storage.getMemoriesBelowActivation(config.pruningThreshold);
  for (const memory of weakMemories) {
    result.prunedIds.push(memory.id);
    storage.deleteMemory(memory.id);
    result.memoriesPruned++;
  }

  const extractedFacts = extractSemanticFacts(storage, config, currentTime);
  result.factsExtracted = extractedFacts.length;
  result.extractedFacts = extractedFacts;

  const remainingMemories = storage.getAllMemories();
  for (const memory of remainingMemories) {
    const temporalAssocs = formTemporalAssociations(storage, memory, config, currentTime);
    const semanticAssocs = formSemanticAssociations(
      storage,
      memory,
      currentTime,
      remainingMemories,
    );
    const emotionalAssocs = formEmotionalAssociations(
      storage,
      memory,
      currentTime,
      remainingMemories,
    );
    const causalAssocs = formCausalAssociations(storage, memory, config, currentTime);

    for (const assoc of [
      ...temporalAssocs,
      ...semanticAssocs,
      ...emotionalAssocs,
      ...causalAssocs,
    ]) {
      result.associationsDiscovered++;
      result.discoveredAssociationPairs.push([assoc.sourceId, assoc.targetId]);
    }
  }

  storage.deleteWeakAssociations(config.minAssociationStrength);

  const logEntry: ConsolidationLog = {
    id: generateId(),
    ranAt: currentTime,
    memoriesStrengthened: result.memoriesStrengthened,
    memoriesPruned: result.memoriesPruned,
    factsExtracted: result.factsExtracted,
    associationsDiscovered: result.associationsDiscovered,
  };
  storage.logConsolidation(logEntry);

  return result;
}

function extractSemanticFacts(
  storage: EngramStorage,
  config: CognitiveConfig,
  now: number,
): string[] {
  const episodics = storage.getAllMemories("episodic");
  if (episodics.length < config.semanticExtractionThreshold) return [];

  const extracted: string[] = [];

  const keywordGroups = new Map<string, Memory[]>();
  for (const memory of episodics) {
    const keywords = extractKeywords(memory.content, 3);
    for (const keyword of keywords) {
      const group = keywordGroups.get(keyword) ?? [];
      group.push(memory);
      keywordGroups.set(keyword, group);
    }
  }

  for (const [keyword, group] of keywordGroups) {
    if (group.length < config.semanticExtractionThreshold) continue;

    const existing = storage.searchMemories(keyword, 5);
    const alreadyExtracted = existing.some(
      (m) => m.type === "semantic" && m.content.includes(`[extracted]`),
    );
    if (alreadyExtracted) continue;

    const allTokenSets = group.map((m) => new Set(tokenize(m.content)));
    const sharedTokens: string[] = [];
    const firstSet = allTokenSets[0];
    if (firstSet) {
      for (const token of firstSet) {
        if (allTokenSets.every((s) => s.has(token))) {
          sharedTokens.push(token);
        }
      }
    }

    const factContent =
      sharedTokens.length > 1
        ? `[extracted] Pattern observed across ${group.length} episodes: ${sharedTokens.join(", ")}`
        : `[extracted] Recurring theme (${group.length}x): ${keyword}`;

    encode(
      storage,
      {
        content: factContent,
        type: "semantic",
        context: group[0]?.context ?? undefined,
      },
      config,
      now,
    );

    extracted.push(factContent);
  }

  return extracted;
}
