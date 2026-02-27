import { test, expect, describe } from "bun:test";
import { EngramEngine } from "../src/core/engine.ts";
import { DEFAULT_CONFIG, type CognitiveConfig } from "../src/config/defaults.ts";
import { handleStore, handleRecall, handleManage } from "../src/mcp/tools.ts";
import { pushFocus } from "../src/core/working-memory.ts";

const config: CognitiveConfig = { ...DEFAULT_CONFIG, activationNoise: 0 };

function makeEngine() {
  return EngramEngine.inMemory({ activationNoise: 0 });
}

function parseResult(result: { content: { type: string; text: string }[] }) {
  return JSON.parse(result.content[0]!.text);
}

describe("memory_store", () => {
  test("encode creates a memory", () => {
    const engine = makeEngine();

    const result = handleStore(engine, {
      action: "encode",
      content: "TypeScript is great",
      type: "semantic",
      emotion: "joy",
      context: "project:test",
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.id).toBeDefined();
    expect(Object.keys(data)).toEqual(["id"]);

    engine.close();
  });

  test("encode rejects invalid type", () => {
    const engine = makeEngine();
    const result = handleStore(engine, { action: "encode", content: "test", type: "invalid" });
    expect(result.isError).toBe(true);
    engine.close();
  });

  test("encode rejects invalid emotion", () => {
    const engine = makeEngine();
    const result = handleStore(engine, { action: "encode", content: "test", emotion: "rage" });
    expect(result.isError).toBe(true);
    engine.close();
  });

  test("reconsolidate updates context and emotion", () => {
    const engine = makeEngine();

    const encodeResult = handleStore(engine, {
      action: "encode",
      content: "deployment went wrong",
      emotion: "anxiety",
      context: "project:acme",
    });
    const encoded = parseResult(encodeResult);

    const reconEngine = EngramEngine.inMemory({ activationNoise: 0, reconsolidationBlendRate: 0.5 });
    handleStore(reconEngine, {
      action: "encode",
      content: "deployment went wrong",
      emotion: "anxiety",
      context: "project:acme",
    });
    const all = reconEngine.storage.getAllMemories();
    const id = all[0]!.id;

    const result = handleStore(reconEngine, {
      action: "reconsolidate",
      id,
      newContext: "incident-resolved",
      currentEmotion: "satisfaction",
      currentEmotionWeight: 0.8,
    });
    const data = parseResult(result);

    expect(data.id).toBeDefined();
    expect(data.context).toContain("incident-resolved");
    expect(data.reconsolidationCount).toBe(1);

    engine.close();
    reconEngine.close();
  });

  test("reconsolidate returns error for missing memory", () => {
    const engine = makeEngine();
    const result = handleStore(engine, { action: "reconsolidate", id: "nonexistent" });
    expect(result.isError).toBe(true);
    engine.close();
  });
});

describe("memory_recall", () => {
  test("recall finds encoded memories", () => {
    const engine = makeEngine();

    handleStore(engine, { action: "encode", content: "kubernetes deployment guide" });
    handleStore(engine, { action: "encode", content: "react component patterns" });

    const result = handleRecall(engine, { action: "recall", cue: "kubernetes" });
    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].content).toContain("kubernetes");

    engine.close();
  });

  test("recall returns compact format by default", () => {
    const engine = makeEngine();
    handleStore(engine, { action: "encode", content: "test memory" });

    const result = handleRecall(engine, { cue: "test" });
    const data = parseResult(result);
    expect(data[0]).toHaveProperty("id");
    expect(data[0]).toHaveProperty("content");
    expect(data[0]).toHaveProperty("activation");
    expect(data[0]).not.toHaveProperty("spreadingActivation");
    expect(data[0]).not.toHaveProperty("latency");

    engine.close();
  });

  test("recall returns verbose format when requested", () => {
    const engine = makeEngine();
    handleStore(engine, { action: "encode", content: "test memory" });

    const result = handleRecall(engine, { action: "recall", cue: "test", verbose: true });
    const data = parseResult(result);
    expect(data[0]).toHaveProperty("spreadingActivation");
    expect(data[0]).toHaveProperty("latency");
    expect(data[0]).toHaveProperty("emotionWeight");

    engine.close();
  });

  test("recall returns message when nothing found", () => {
    const engine = makeEngine();
    const result = handleRecall(engine, { cue: "nonexistent" });
    expect(result.content[0]!.text).toBe("No memories found above retrieval threshold.");
    engine.close();
  });

  test("inspect returns full memory lifecycle", () => {
    const engine = makeEngine();

    const encodeResult = handleStore(engine, {
      action: "encode",
      content: "important memory",
      emotion: "anxiety",
      context: "project:critical",
    });
    const encoded = parseResult(encodeResult);

    const result = handleRecall(engine, { action: "inspect", id: encoded.id.slice(0, 8) });
    const data = parseResult(result);

    expect(data.id).toBe(encoded.id);
    expect(data.content).toBe("important memory");
    expect(data.emotion).toBe("anxiety");
    expect(data.context).toBe("project:critical");
    expect(data.accessCount).toBe(1);
    expect(data.associationCount).toBe(0);

    engine.close();
  });

  test("inspect returns error for missing memory", () => {
    const engine = makeEngine();
    const result = handleRecall(engine, { action: "inspect", id: "nonexistent" });
    expect(result.isError).toBe(true);
    engine.close();
  });

  test("stats returns system overview", () => {
    const engine = makeEngine();

    handleStore(engine, { action: "encode", content: "episodic event", type: "episodic" });
    handleStore(engine, { action: "encode", content: "semantic fact", type: "semantic" });
    handleStore(engine, { action: "encode", content: "procedural skill", type: "procedural" });

    const result = handleRecall(engine, { action: "stats" });
    const data = parseResult(result);

    expect(data.episodic).toBe(1);
    expect(data.semantic).toBe(1);
    expect(data.procedural).toBe(1);
    expect(data.workingMemory.used).toBe(0);
    expect(data.workingMemory.capacity).toBe(7);

    engine.close();
  });
});

describe("memory_manage", () => {
  test("focus_push and focus_get work together", () => {
    const engine = makeEngine();

    handleManage(engine, { action: "focus_push", content: "refactoring auth module" });
    handleManage(engine, { action: "focus_push", content: "fixing bug #123" });

    const getResult = handleManage(engine, { action: "focus_get" });
    const data = parseResult(getResult);
    expect(data.used).toBe(2);
    expect(data.capacity).toBe(7);
    expect(data.slots).toHaveLength(2);

    engine.close();
  });

  test("focus_pop removes most recent item", () => {
    const engine = makeEngine();

    pushFocus(engine.storage, "first task", engine.config, { now: 1000 });
    pushFocus(engine.storage, "second task", engine.config, { now: 2000 });

    const popResult = handleManage(engine, { action: "focus_pop" });
    const data = parseResult(popResult);
    expect(data.content).toBe("second task");

    const getResult = handleManage(engine, { action: "focus_get" });
    const remaining = parseResult(getResult);
    expect(remaining.used).toBe(1);

    engine.close();
  });

  test("focus_clear empties working memory", () => {
    const engine = makeEngine();

    handleManage(engine, { action: "focus_push", content: "task A" });
    handleManage(engine, { action: "focus_push", content: "task B" });

    const clearResult = handleManage(engine, { action: "focus_clear" });
    expect(clearResult.content[0]!.text).toBe("Cleared 2 items from working memory.");

    const getResult = handleManage(engine, { action: "focus_get" });
    const data = parseResult(getResult);
    expect(data.used).toBe(0);

    engine.close();
  });

  test("consolidate runs full cycle", () => {
    const engine = makeEngine();

    handleStore(engine, { action: "encode", content: "memory alpha", type: "semantic" });
    handleStore(engine, { action: "encode", content: "memory beta", type: "semantic" });

    const result = handleManage(engine, { action: "consolidate" });
    const data = parseResult(result);

    expect(data.memoriesStrengthened).toBeDefined();
    expect(data.memoriesPruned).toBeDefined();
    expect(data.factsExtracted).toBeDefined();
    expect(data.associationsDiscovered).toBeDefined();
    expect(data.chunksFormed).toBeDefined();

    engine.close();
  });

  test("recall_to_focus loads recalled memories into working memory", () => {
    const engine = makeEngine();
    handleStore(engine, { action: "encode", content: "important architecture decision" });

    const result = handleManage(engine, { action: "recall_to_focus", cue: "architecture" });
    const data = parseResult(result);
    expect(data.loaded.length).toBeGreaterThan(0);
    expect(data.focus.used).toBe(data.loaded.length);
    expect(data.focus.capacity).toBe(7);

    engine.close();
  });
});

describe("encode_batch", () => {
  test("stores multiple memories and returns IDs", () => {
    const engine = makeEngine();
    const result = handleStore(engine, {
      action: "encode_batch",
      memories: [
        { content: "fact one" },
        { content: "fact two", type: "episodic" },
        { content: "fact three", emotion: "curiosity", context: "project:test" },
      ],
    });
    const data = parseResult(result);
    expect(data.stored).toHaveLength(3);
    expect(data.errors).toBeUndefined();
    expect(data.stored[0]).toMatch(/^sem:/);
    expect(data.stored[1]).toMatch(/^epi:/);

    engine.close();
  });

  test("reports partial failures", () => {
    const engine = makeEngine();
    const result = handleStore(engine, {
      action: "encode_batch",
      memories: [
        { content: "valid memory" },
        { content: "bad type", type: "invalid" as any },
      ],
    });
    const data = parseResult(result);
    expect(data.stored).toHaveLength(1);
    expect(data.errors).toHaveLength(1);
    expect(data.errors[0]).toContain("Invalid type");

    engine.close();
  });
});

describe("list action", () => {
  test("returns memories without activation effects", () => {
    const engine = makeEngine();
    handleStore(engine, { action: "encode", content: "alpha fact" });
    handleStore(engine, { action: "encode", content: "beta fact" });

    const result = handleRecall(engine, { action: "list" });
    const data = parseResult(result);
    expect(data).toHaveLength(2);
    expect(data[0]).toHaveProperty("id");
    expect(data[0]).toHaveProperty("content");
    expect(data[0]).toHaveProperty("type");

    engine.close();
  });

  test("supports offset and limit", () => {
    const engine = makeEngine();
    for (let i = 0; i < 5; i++) {
      handleStore(engine, { action: "encode", content: `memory ${i}` });
    }
    const result = handleRecall(engine, { action: "list", limit: 2, offset: 1 });
    const data = parseResult(result);
    expect(data).toHaveLength(2);

    engine.close();
  });

  test("format ids returns only IDs", () => {
    const engine = makeEngine();
    handleStore(engine, { action: "encode", content: "test content" });

    const result = handleRecall(engine, { action: "list", format: "ids" });
    const data = parseResult(result);
    expect(typeof data[0]).toBe("string");
    expect(data[0]).toMatch(/^sem:/);

    engine.close();
  });

  test("format content returns only content strings", () => {
    const engine = makeEngine();
    handleStore(engine, { action: "encode", content: "test content" });

    const result = handleRecall(engine, { action: "list", format: "content" });
    const data = parseResult(result);
    expect(data[0]).toBe("test content");

    engine.close();
  });
});

describe("recall format param", () => {
  test("format content returns flat content array", () => {
    const engine = makeEngine();
    handleStore(engine, { action: "encode", content: "recall me" });

    const result = handleRecall(engine, { action: "recall", cue: "recall", format: "content" });
    const data = parseResult(result);
    expect(data[0]).toBe("recall me");

    engine.close();
  });

  test("format ids returns flat ID array", () => {
    const engine = makeEngine();
    handleStore(engine, { action: "encode", content: "recall me too" });

    const result = handleRecall(engine, { action: "recall", cue: "recall", format: "ids" });
    const data = parseResult(result);
    expect(typeof data[0]).toBe("string");
    expect(data[0]).toMatch(/^sem:/);

    engine.close();
  });
});

describe("context filtering fix", () => {
  test("recall finds context-tagged memories even with unrelated cue", () => {
    const engine = makeEngine();
    handleStore(engine, {
      action: "encode",
      content: "xyz unique content",
      context: "project:alpha",
    });

    const result = handleRecall(engine, {
      action: "recall",
      cue: "completely different search",
      context: "project:alpha",
    });
    const data = parseResult(result);
    expect(data.length).toBeGreaterThanOrEqual(1);
    expect(data[0].content).toBe("xyz unique content");

    engine.close();
  });
});
