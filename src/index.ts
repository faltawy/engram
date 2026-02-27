export { EngramEngine } from "./core/engine.ts";
export { EngramStorage } from "./storage/sqlite.ts";
export { encode } from "./core/encoder.ts";
export { recall } from "./core/recall.ts";
export { consolidate, type ConsolidationResult } from "./core/consolidation.ts";
export { reconsolidate, type ReconsolidationContext } from "./core/reconsolidation.ts";
export {
  pushFocus,
  popFocus,
  getFocus,
  clearFocus,
  focusUtilization,
} from "./core/working-memory.ts";
export {
  formAssociation,
  formTemporalAssociations,
  formSemanticAssociations,
  recordCoRecall,
  getSpreadingActivationTargets,
} from "./core/associations.ts";
export { encodeProcedural, getSkills, promoteToSkill } from "./core/procedural-store.ts";
export { discoverChunks, getChunkMembers, type Chunk } from "./core/chunking.ts";
export {
  baseLevelActivation,
  spreadingActivationStrength,
  totalActivation,
  activationNoise,
  canRetrieve,
  retrievalLatency,
  computeActivation,
} from "./core/activation.ts";
export { ebbinghausRetention, memoryStrength, refreshActivations } from "./core/forgetting.ts";
export { tokenize, extractKeywords } from "./core/search.ts";
export { defaultEmotionWeight, isValidEmotion } from "./core/emotional-tag.ts";
export {
  DEFAULT_CONFIG,
  loadConfig,
  resolveDbPath,
  type CognitiveConfig,
} from "./config/defaults.ts";
export {
  MemoryType,
  Emotion,
  AssociationType,
  AccessType,
  generateId,
  generateMemoryId,
} from "./core/memory.ts";
export type {
  Memory,
  EncodeInput,
  AccessLogEntry,
  Association,
  WorkingMemorySlot,
  ConsolidationLog,
  RecallResult,
} from "./core/memory.ts";
