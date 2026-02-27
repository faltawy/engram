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
    expect(data.content).toBe("TypeScript is great");
    expect(data.type).toBe("semantic");
    expect(data.emotion).toBe("joy");
    expect(data.context).toBe("project:test");
    expect(data.id).toBeDefined();
    expect(data.activation).toBeGreaterThan(0);

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

    expect(data.context).toContain("incident-resolved");
    expect(data.reconsolidationCount).toBe(1);
    expect(data.emotion).toBe("satisfaction");

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
});
