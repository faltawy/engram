import type { CognitiveConfig } from "../config/defaults.ts";
import type { EngramStorage } from "../storage/sqlite.ts";
import type { Memory, RecallResult } from "./memory.ts";
import { computeActivation, spreadingActivationStrength } from "./activation.ts";
import { getSpreadingActivationTargets } from "./associations.ts";
import { getWorkingMemoryIds } from "./working-memory.ts";

export function recall(
  storage: EngramStorage,
  cue: string,
  config: CognitiveConfig,
  options?: {
    limit?: number;
    associative?: boolean;
    type?: Memory["type"];
    context?: string;
    now?: number;
    deterministic?: boolean;
  },
): RecallResult[] {
  const now = options?.now ?? Date.now();
  const limit = options?.limit ?? 10;
  const associative = options?.associative ?? true;

  const seedIds = new Set<string>();

  const wmIds = getWorkingMemoryIds(storage);
  for (const id of wmIds) seedIds.add(id);

  const ftsIds = storage.searchFTS(cue, limit * 2);
  for (const id of ftsIds) seedIds.add(id);

  if (options?.context) {
    const contextMatches = storage.getMemoriesByContext(options.context, options?.type, limit * 2);
    for (const m of contextMatches) seedIds.add(m.id);
  }

  const topByActivation = storage.getTopMemoriesByActivation(
    limit,
    options?.type,
    options?.context,
  );
  for (const m of topByActivation) {
    seedIds.add(m.id);
  }

  const candidateIds = new Set<string>(seedIds);
  const graphBoosts = new Map<string, number>();

  if (associative) {
    for (const seedId of seedIds) {
      const targets = getSpreadingActivationTargets(storage, seedId, config);
      const isWmSeed = wmIds.includes(seedId);
      const primingWeight = isWmSeed ? config.workingMemoryPrimingWeight : 1.0;

      for (const t of targets) {
        candidateIds.add(t.memoryId);
        const existing = graphBoosts.get(t.memoryId) ?? 0;
        graphBoosts.set(t.memoryId, existing + t.activationBoost * primingWeight);
      }
    }
  }

  const candidateMap = new Map<string, Memory>();
  for (const id of candidateIds) {
    const m = storage.getMemory(id);
    if (!m) continue;
    if (options?.type && m.type !== options.type) continue;
    if (options?.context && (!m.context || !m.context.startsWith(options.context))) continue;
    candidateMap.set(m.id, m);
  }

  if (candidateMap.size === 0) return [];

  const results: RecallResult[] = [];

  for (const memory of candidateMap.values()) {
    const timestamps = storage.getAccessTimestamps(memory.id);

    let spreadingSum = graphBoosts.get(memory.id) ?? 0;
    if (associative && spreadingSum === 0) {
      const assocFrom = storage.getAssociationsFrom(memory.id);
      const assocTo = storage.getAssociationsTo(memory.id);
      const allAssocs = [...assocFrom, ...assocTo];

      for (const assoc of allAssocs) {
        const otherId = assoc.sourceId === memory.id ? assoc.targetId : assoc.sourceId;
        const fanCount = storage.getFanCount(otherId);
        const strength = spreadingActivationStrength(config.maxSpreadingActivation, fanCount);
        spreadingSum += assoc.strength * strength;
      }
    }

    const { activation, latency } = computeActivation(timestamps, now, config, {
      spreadingSum,
      noiseOverride: options?.deterministic ? 0 : undefined,
      emotionWeight: memory.emotionWeight,
    });

    if (activation <= config.retrievalThreshold) continue;

    results.push({
      memory,
      activation,
      spreadingActivation: spreadingSum,
      latency,
    });
  }

  results.sort((a, b) => b.activation - a.activation);

  for (const result of results.slice(0, limit)) {
    storage.logAccess(result.memory.id, "recall", now);
    result.memory.recallCount++;
    result.memory.lastRecalledAt = now;
    const newTimestamps = storage.getAccessTimestamps(result.memory.id);
    const recomputed = computeActivation(newTimestamps, now, config, {
      spreadingSum: result.spreadingActivation,
      noiseOverride: 0,
      emotionWeight: result.memory.emotionWeight,
    });
    result.memory.activation = recomputed.activation;
    storage.updateMemory(result.memory);
  }

  return results.slice(0, limit);
}
