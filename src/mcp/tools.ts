import type { CognitiveConfig } from "../config/defaults.ts";
import { formAssociation } from "../core/associations.ts";
import { discoverChunks } from "../core/chunking.ts";
import { consolidate } from "../core/consolidation.ts";
import { isValidEmotion } from "../core/emotional-tag.ts";
import { encode } from "../core/encoder.ts";
import type { EngramEngine } from "../core/engine.ts";
import { refreshActivations } from "../core/forgetting.ts";
import { isValidMemoryType, MemoryType, Emotion, AssociationType } from "../core/memory.ts";
import { recall } from "../core/recall.ts";
import { reconsolidate, type ReconsolidationContext } from "../core/reconsolidation.ts";
import {
  pushFocus,
  popFocus,
  getFocus,
  clearFocus,
  focusUtilization,
} from "../core/working-memory.ts";
import type { EngramStorage } from "../storage/sqlite.ts";

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function errorResult(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

export function handleStore(
  engine: EngramEngine,
  args: { action: string; [key: string]: unknown },
): ToolResult {
  switch (args.action) {
    case "encode":
      return handleEncode(engine.storage, engine.config, args as any, engine.projectContext);
    case "encode_batch":
      return handleEncodeBatch(engine.storage, engine.config, args as any, engine.projectContext);
    case "reconsolidate":
      return handleReconsolidate(engine.storage, engine.config, args as any);
    case "forget":
      return handleForget(engine.storage, args as any);
    case "associate":
      return handleAssociate(engine.storage, args as any);
    default:
      return errorResult(`Unknown store action: ${args.action}`);
  }
}

export function handleRecall(
  engine: EngramEngine,
  args: { action?: string; [key: string]: unknown },
): ToolResult {
  const action = args.action ?? "recall";
  switch (action) {
    case "recall":
      return handleRecallQuery(engine.storage, engine.config, args as any, engine.projectContext);
    case "inspect":
      return handleInspect(engine.storage, args as any);
    case "list":
      return handleList(engine.storage, args as any, engine.projectContext);
    case "stats":
      return handleStats(engine.storage, engine.config);
    case "contexts":
      return handleContexts(engine.storage);
    default:
      return errorResult(`Unknown recall action: ${action}`);
  }
}

export function handleManage(
  engine: EngramEngine,
  args: { action: string; [key: string]: unknown },
): ToolResult {
  switch (args.action) {
    case "consolidate":
      return handleConsolidate(engine.storage, engine.config);
    case "focus_push":
      return handleFocusPush(engine.storage, engine.config, args as any);
    case "focus_pop":
      return handleFocusPop(engine.storage);
    case "focus_get":
      return handleFocusGet(engine.storage, engine.config);
    case "focus_clear":
      return handleFocusClear(engine.storage);
    case "recall_to_focus":
      return handleRecallToFocus(engine.storage, engine.config, args as any, engine.projectContext);
    case "session_begin":
      return handleSessionBegin(engine, args as any);
    case "session_end":
      return handleSessionEnd(engine.storage, engine.config);
    default:
      return errorResult(`Unknown manage action: ${args.action}`);
  }
}

function handleEncode(
  storage: EngramStorage,
  config: CognitiveConfig,
  args: {
    content: string;
    type?: string;
    emotion?: string;
    emotionWeight?: number;
    context?: string;
  },
  defaultContext?: string | null,
): ToolResult {
  if (!args.content) return errorResult("'content' is required for encode.");
  const typeStr = args.type ?? "semantic";
  if (!isValidMemoryType(typeStr)) {
    return errorResult(`Invalid type '${typeStr}'. Valid: ${Object.values(MemoryType).join(", ")}`);
  }

  const emotionStr = args.emotion ?? "neutral";
  if (!isValidEmotion(emotionStr)) {
    return errorResult(
      `Invalid emotion '${emotionStr}'. Valid: ${Object.values(Emotion).join(", ")}`,
    );
  }

  const memory = encode(
    storage,
    {
      content: args.content,
      type: typeStr,
      emotion: emotionStr,
      emotionWeight: args.emotionWeight,
      context: args.context ?? defaultContext ?? undefined,
    },
    config,
  );

  return textResult(JSON.stringify({ id: memory.id }));
}

function handleEncodeBatch(
  storage: EngramStorage,
  config: CognitiveConfig,
  args: {
    memories: Array<{
      content: string;
      type?: string;
      emotion?: string;
      emotionWeight?: number;
      context?: string;
    }>;
  },
  defaultContext?: string | null,
): ToolResult {
  if (!args.memories?.length) return errorResult("'memories' is required for encode_batch.");
  const ids: string[] = [];
  const errors: string[] = [];

  storage.transaction(() => {
    for (let i = 0; i < args.memories.length; i++) {
      const m = args.memories[i]!;
      const typeStr = m.type ?? "semantic";
      if (!isValidMemoryType(typeStr)) {
        errors.push(`[${i}] Invalid type '${typeStr}'`);
        continue;
      }
      const emotionStr = m.emotion ?? "neutral";
      if (!isValidEmotion(emotionStr)) {
        errors.push(`[${i}] Invalid emotion '${emotionStr}'`);
        continue;
      }
      const memory = encode(
        storage,
        {
          content: m.content,
          type: typeStr,
          emotion: emotionStr,
          emotionWeight: m.emotionWeight,
          context: m.context ?? defaultContext ?? undefined,
        },
        config,
      );
      ids.push(memory.id);
    }
  });

  if (errors.length > 0) {
    return textResult(JSON.stringify({ stored: ids, errors }));
  }
  return textResult(JSON.stringify({ stored: ids }));
}

function handleRecallQuery(
  storage: EngramStorage,
  config: CognitiveConfig,
  args: {
    cue: string;
    limit?: number;
    type?: string;
    context?: string;
    associative?: boolean;
    verbose?: boolean;
    format?: "full" | "content" | "ids";
  },
  defaultContext?: string | null,
): ToolResult {
  if (!args.cue) return errorResult("'cue' is required for recall.");
  const typeFilter = args.type && isValidMemoryType(args.type) ? args.type : undefined;

  const results = recall(storage, args.cue, config, {
    limit: args.limit ?? 5,
    type: typeFilter,
    context: args.context ?? defaultContext ?? undefined,
    associative: args.associative ?? true,
  });

  if (results.length === 0) {
    return textResult("No memories found above retrieval threshold.");
  }

  const format = args.format ?? "full";

  if (format === "ids") {
    return textResult(JSON.stringify(results.map((r) => r.memory.id)));
  }
  if (format === "content") {
    return textResult(JSON.stringify(results.map((r) => r.memory.content)));
  }

  const formatted = args.verbose
    ? results.map((r) => ({
        id: r.memory.id,
        content: r.memory.content,
        type: r.memory.type,
        activation: r.activation,
        spreadingActivation: r.spreadingActivation,
        latency: r.latency,
        emotion: r.memory.emotion,
        emotionWeight: r.memory.emotionWeight,
        recallCount: r.memory.recallCount,
        context: r.memory.context,
      }))
    : results.map((r) => ({
        id: r.memory.id,
        content: r.memory.content,
        context: r.memory.context,
        activation: r.activation,
      }));

  return textResult(JSON.stringify(formatted));
}

function handleList(
  storage: EngramStorage,
  args: {
    type?: string;
    context?: string;
    limit?: number;
    offset?: number;
    format?: "full" | "content" | "ids";
  },
  defaultContext?: string | null,
): ToolResult {
  const limit = args.limit ?? 20;
  const offset = args.offset ?? 0;
  const typeFilter = args.type && isValidMemoryType(args.type) ? args.type : undefined;
  const context = args.context ?? defaultContext ?? undefined;

  let results;
  if (context) {
    results = storage.getMemoriesByContext(context, typeFilter, limit + offset);
  } else {
    results = storage.getAllMemories(typeFilter).slice(0, limit + offset);
  }
  results = results.slice(offset, offset + limit);

  if (results.length === 0) {
    return textResult("No memories found.");
  }

  const format = args.format ?? "full";

  if (format === "ids") {
    return textResult(JSON.stringify(results.map((m) => m.id)));
  }
  if (format === "content") {
    return textResult(JSON.stringify(results.map((m) => m.content)));
  }

  return textResult(
    JSON.stringify(
      results.map((m) => ({
        id: m.id,
        content: m.content,
        type: m.type,
        context: m.context,
        activation: m.activation,
      })),
    ),
  );
}

function handleFocusPush(
  storage: EngramStorage,
  config: CognitiveConfig,
  args: { content: string; memoryRef?: string },
): ToolResult {
  if (!args.content) return errorResult("'content' is required for focus_push.");
  const { slot, evicted } = pushFocus(storage, args.content, config, {
    memoryRef: args.memoryRef,
  });

  return textResult(
    JSON.stringify({
      slot: slot.slot,
      content: slot.content,
      evicted: evicted ? { slot: evicted.slot, content: evicted.content } : null,
    }),
  );
}

function handleFocusPop(storage: EngramStorage): ToolResult {
  const popped = popFocus(storage);
  if (!popped) {
    return textResult("Working memory is empty.");
  }
  return textResult(JSON.stringify({ slot: popped.slot, content: popped.content }));
}

function handleFocusGet(storage: EngramStorage, config: CognitiveConfig): ToolResult {
  const slots = getFocus(storage);
  const { used, capacity } = focusUtilization(storage, config);

  return textResult(
    JSON.stringify({
      used,
      capacity,
      slots: slots.map((s) => ({
        slot: s.slot,
        content: s.content,
        memoryRef: s.memoryRef,
      })),
    }),
  );
}

function handleFocusClear(storage: EngramStorage): ToolResult {
  const count = clearFocus(storage);
  return textResult(`Cleared ${count} items from working memory.`);
}

function handleRecallToFocus(
  storage: EngramStorage,
  config: CognitiveConfig,
  args: { cue: string; limit?: number; type?: string; context?: string },
  defaultContext?: string | null,
): ToolResult {
  if (!args.cue) return errorResult("'cue' is required for recall_to_focus.");
  const typeFilter = args.type && isValidMemoryType(args.type) ? args.type : undefined;
  const limit = args.limit ?? 3;

  const results = recall(storage, args.cue, config, {
    limit,
    type: typeFilter,
    context: args.context ?? defaultContext ?? undefined,
    associative: true,
  });

  const loaded: string[] = [];
  for (const r of results) {
    pushFocus(storage, r.memory.content, config, {
      memoryRef: r.memory.id,
    });
    loaded.push(r.memory.id);
  }

  const { used, capacity } = focusUtilization(storage, config);
  return textResult(JSON.stringify({ loaded, focus: { used, capacity } }));
}

function handleConsolidate(storage: EngramStorage, config: CognitiveConfig): ToolResult {
  const result = consolidate(storage, config);
  const chunks = discoverChunks(storage, config);

  return textResult(
    JSON.stringify({
      memoriesStrengthened: result.memoriesStrengthened,
      memoriesPruned: result.memoriesPruned,
      factsExtracted: result.factsExtracted,
      associationsDiscovered: result.associationsDiscovered,
      chunksFormed: chunks.length,
      extractedFacts: result.extractedFacts,
      prunedIds: result.prunedIds,
    }),
  );
}

function handleStats(storage: EngramStorage, config: CognitiveConfig): ToolResult {
  const { atRisk } = refreshActivations(storage, config);
  const { used, capacity } = focusUtilization(storage, config);
  const lastConsolidation = storage.getLastConsolidation();

  return textResult(
    JSON.stringify({
      workingMemory: { used, capacity },
      episodic: storage.getMemoryCount("episodic"),
      semantic: storage.getMemoryCount("semantic"),
      procedural: storage.getMemoryCount("procedural"),
      associations: storage.getAssociationCount(),
      atRisk,
      lastConsolidation: lastConsolidation
        ? {
            ranAt: lastConsolidation.ranAt,
            memoriesStrengthened: lastConsolidation.memoriesStrengthened,
            memoriesPruned: lastConsolidation.memoriesPruned,
          }
        : null,
    }),
  );
}

function handleInspect(storage: EngramStorage, args: { id: string }): ToolResult {
  if (!args.id) return errorResult("'id' is required for inspect.");
  const match = storage.findMemoryByIdOrPrefix(args.id);

  if (!match) {
    return errorResult(`No memory found matching "${args.id}".`);
  }

  const accessLog = storage.getAccessLog(match.id);
  const associations = storage.getAssociations(match.id);

  return textResult(
    JSON.stringify({
      id: match.id,
      type: match.type,
      content: match.content,
      encodedAt: match.encodedAt,
      lastRecalledAt: match.lastRecalledAt,
      recallCount: match.recallCount,
      activation: match.activation,
      emotion: match.emotion,
      emotionWeight: match.emotionWeight,
      context: match.context,
      chunkId: match.chunkId,
      reconsolidationCount: match.reconsolidationCount,
      accessCount: accessLog.length,
      associationCount: associations.length,
      associations: associations.map((a) => ({
        id: a.id,
        targetId: a.sourceId === match.id ? a.targetId : a.sourceId,
        strength: a.strength,
        type: a.type,
      })),
    }),
  );
}

function handleForget(storage: EngramStorage, args: { id: string }): ToolResult {
  if (!args.id) return errorResult("'id' is required for forget.");
  const memory = storage.findMemoryByIdOrPrefix(args.id);
  if (!memory) {
    return errorResult(`No memory found matching "${args.id}".`);
  }
  storage.deleteMemory(memory.id);
  return textResult(JSON.stringify({ forgotten: memory.id }));
}

function handleAssociate(
  storage: EngramStorage,
  args: {
    sourceId: string;
    targetId: string;
    associationType?: string;
    strength?: number;
  },
): ToolResult {
  if (!args.sourceId || !args.targetId) {
    return errorResult("'sourceId' and 'targetId' are required for associate.");
  }
  const source = storage.findMemoryByIdOrPrefix(args.sourceId);
  if (!source) return errorResult(`No memory found matching "${args.sourceId}".`);
  const target = storage.findMemoryByIdOrPrefix(args.targetId);
  if (!target) return errorResult(`No memory found matching "${args.targetId}".`);
  if (source.id === target.id) {
    return errorResult("Cannot associate a memory with itself.");
  }

  const validTypes = Object.values(AssociationType) as string[];
  const type = args.associationType ?? "semantic";
  if (!validTypes.includes(type)) {
    return errorResult(`Invalid association type '${type}'. Valid: ${validTypes.join(", ")}`);
  }

  const assoc = formAssociation(
    storage,
    source.id,
    target.id,
    type as AssociationType,
    args.strength ?? 0.8,
  );

  return textResult(
    JSON.stringify({
      id: assoc.id,
      sourceId: assoc.sourceId,
      targetId: assoc.targetId,
      type: assoc.type,
      strength: assoc.strength,
    }),
  );
}

function handleContexts(storage: EngramStorage): ToolResult {
  const contexts = storage.getContexts();
  if (contexts.length === 0) {
    return textResult("No contexts found.");
  }
  return textResult(JSON.stringify(contexts));
}

function handleSessionBegin(engine: EngramEngine, args: { context?: string }): ToolResult {
  const { storage, config } = engine;
  const context = args.context ?? engine.projectContext ?? null;
  const session = storage.beginSession(context);

  const briefing = context
    ? recall(storage, context, config, { limit: 5, context })
    : recall(storage, "recent work", config, { limit: 5 });

  const focus = getFocus(storage);
  const { atRisk } = refreshActivations(storage, config);

  return textResult(
    JSON.stringify({
      sessionId: session.id,
      context,
      briefing: briefing.map((r) => ({
        id: r.memory.id,
        content: r.memory.content,
        type: r.memory.type,
      })),
      workingMemory: focus.map((s) => s.content),
      counts: {
        episodic: storage.getMemoryCount("episodic"),
        semantic: storage.getMemoryCount("semantic"),
        procedural: storage.getMemoryCount("procedural"),
        atRisk,
      },
      lastConsolidation: storage.getLastConsolidation()?.ranAt ?? null,
    }),
  );
}

function handleSessionEnd(storage: EngramStorage, config: CognitiveConfig): ToolResult {
  const active = storage.getActiveSession();
  const result = consolidate(storage, config);
  const chunks = discoverChunks(storage, config);
  const session = active ? storage.endSession(active.id) : null;

  return textResult(
    JSON.stringify({
      sessionId: session?.id ?? null,
      eventsThisSession: session ? (session.endClock ?? 0) - session.startClock : null,
      consolidation: {
        memoriesStrengthened: result.memoriesStrengthened,
        memoriesPruned: result.memoriesPruned,
        factsExtracted: result.factsExtracted,
        associationsDiscovered: result.associationsDiscovered,
        chunksFormed: chunks.length,
      },
    }),
  );
}

function handleReconsolidate(
  storage: EngramStorage,
  config: CognitiveConfig,
  args: {
    id: string;
    newContext?: string;
    currentEmotion?: string;
    currentEmotionWeight?: number;
  },
): ToolResult {
  if (!args.id) return errorResult("'id' is required for reconsolidate.");
  const memory = storage.findMemoryByIdOrPrefix(args.id);
  if (!memory) {
    return errorResult(`No memory found with id "${args.id}".`);
  }

  const validEmotion =
    args.currentEmotion && isValidEmotion(args.currentEmotion) ? args.currentEmotion : undefined;

  const context: ReconsolidationContext = {
    newContext: args.newContext,
    currentEmotion: validEmotion,
    currentEmotionWeight: args.currentEmotionWeight,
  };

  const updated = reconsolidate(storage, memory, context, config);

  return textResult(
    JSON.stringify({
      id: updated.id,
      context: updated.context,
      reconsolidationCount: updated.reconsolidationCount,
    }),
  );
}
