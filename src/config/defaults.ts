export type ClockMode = "agent" | "wall";

export interface CognitiveConfig {
  clockMode: ClockMode;
  strengthenWindowEvents: number;
  decayRate: number;
  retrievalThreshold: number;
  latencyFactor: number;
  latencyExponent: number;
  activationNoise: number;
  workingMemoryCapacity: number;
  maxSpreadingActivation: number;
  minAssociationStrength: number;
  emotionalBoostFactor: number;
  pruningThreshold: number;
  associationFormationThreshold: number;
  retrievalStrengtheningBoost: number;
  reconsolidationBlendRate: number;
  chunkingSimilarityThreshold: number;
  semanticExtractionThreshold: number;
  temporalContextWindow: number;
  recallSpreadingDepth: number;
  workingMemoryPrimingWeight: number;
  dbPath: string;
}

export const DEFAULT_CONFIG: CognitiveConfig = {
  clockMode: "agent",
  strengthenWindowEvents: 100,
  decayRate: 0.5,
  retrievalThreshold: -3.0,
  latencyFactor: 1.0,
  latencyExponent: 1.0,
  activationNoise: 0.25,
  workingMemoryCapacity: 7,
  maxSpreadingActivation: 1.5,
  minAssociationStrength: 0.1,
  emotionalBoostFactor: 2.0,
  pruningThreshold: -2.0,
  associationFormationThreshold: 2,
  retrievalStrengtheningBoost: 0.1,
  reconsolidationBlendRate: 0.1,
  chunkingSimilarityThreshold: 0.6,
  semanticExtractionThreshold: 3,
  temporalContextWindow: 10,
  recallSpreadingDepth: 3,
  workingMemoryPrimingWeight: 0.5,
  dbPath: "~/.engram/memory.db",
};

export function resolveDbPath(dbPath: string): string {
  if (dbPath.startsWith("~")) {
    const home = process.env.HOME || process.env.USERPROFILE || "/tmp";
    return dbPath.replace("~", home);
  }
  return dbPath;
}

export function loadConfig(overrides?: Partial<CognitiveConfig>): CognitiveConfig {
  const config = { ...DEFAULT_CONFIG, ...overrides };

  if (process.env.ENGRAM_DB_PATH) config.dbPath = process.env.ENGRAM_DB_PATH;
  if (process.env.ENGRAM_DECAY_RATE) config.decayRate = Number(process.env.ENGRAM_DECAY_RATE);
  if (process.env.ENGRAM_WM_CAPACITY)
    config.workingMemoryCapacity = Number(process.env.ENGRAM_WM_CAPACITY);
  if (process.env.ENGRAM_RETRIEVAL_THRESHOLD)
    config.retrievalThreshold = Number(process.env.ENGRAM_RETRIEVAL_THRESHOLD);
  if (process.env.ENGRAM_CLOCK_MODE === "agent" || process.env.ENGRAM_CLOCK_MODE === "wall")
    config.clockMode = process.env.ENGRAM_CLOCK_MODE;

  return config;
}
