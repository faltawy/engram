import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { EngramStorage } from "../src/storage/sqlite.ts";
import { generateId } from "../src/core/memory.ts";
import type { Memory, Association } from "../src/core/memory.ts";

describe("EngramStorage", () => {
  let storage: EngramStorage;

  beforeEach(() => {
    storage = EngramStorage.inMemory();
  });

  afterEach(() => {
    storage.close();
  });

  function makeMemory(overrides?: Partial<Memory>): Memory {
    return {
      id: generateId(),
      type: "episodic",
      content: "test memory content",
      encodedAt: Date.now(),
      lastRecalledAt: null,
      recallCount: 0,
      activation: 0.5,
      emotion: "neutral",
      emotionWeight: 0.0,
      context: null,
      chunkId: null,
      reconsolidationCount: 0,
      ...overrides,
    };
  }

  test("insert and retrieve a memory", () => {
    const mem = makeMemory({ content: "hello world" });
    storage.insertMemory(mem);

    const retrieved = storage.getMemory(mem.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.content).toBe("hello world");
    expect(retrieved!.type).toBe("episodic");
  });

  test("get all memories", () => {
    storage.insertMemory(makeMemory({ type: "episodic" }));
    storage.insertMemory(makeMemory({ type: "semantic" }));
    storage.insertMemory(makeMemory({ type: "procedural" }));

    expect(storage.getAllMemories()).toHaveLength(3);
    expect(storage.getAllMemories("episodic")).toHaveLength(1);
    expect(storage.getAllMemories("semantic")).toHaveLength(1);
  });

  test("update a memory", () => {
    const mem = makeMemory();
    storage.insertMemory(mem);

    mem.recallCount = 5;
    mem.activation = 0.9;
    mem.lastRecalledAt = Date.now();
    storage.updateMemory(mem);

    const updated = storage.getMemory(mem.id)!;
    expect(updated.recallCount).toBe(5);
    expect(updated.activation).toBe(0.9);
  });

  test("delete a memory", () => {
    const mem = makeMemory();
    storage.insertMemory(mem);
    storage.deleteMemory(mem.id);
    expect(storage.getMemory(mem.id)).toBeNull();
  });

  test("search memories by content", () => {
    storage.insertMemory(makeMemory({ content: "TypeScript is great" }));
    storage.insertMemory(makeMemory({ content: "JavaScript is okay" }));
    storage.insertMemory(makeMemory({ content: "Rust is fast" }));

    const results = storage.searchMemories("Script");
    expect(results).toHaveLength(2);
  });

  test("filter memories by activation threshold", () => {
    storage.insertMemory(makeMemory({ activation: 0.8 }));
    storage.insertMemory(makeMemory({ activation: 0.3 }));
    storage.insertMemory(makeMemory({ activation: -0.5 }));

    expect(storage.getMemoriesAboveActivation(0.5)).toHaveLength(1);
    expect(storage.getMemoriesBelowActivation(0.0)).toHaveLength(1);
  });

  test("procedural memories excluded from below-activation query", () => {
    storage.insertMemory(makeMemory({ activation: -1.0, type: "procedural" }));
    storage.insertMemory(makeMemory({ activation: -1.0, type: "episodic" }));

    const belowThreshold = storage.getMemoriesBelowActivation(0.0);
    expect(belowThreshold).toHaveLength(1);
    expect(belowThreshold[0]!.type).toBe("episodic");
  });

  test("access log records and retrieves timestamps", () => {
    const mem = makeMemory();
    storage.insertMemory(mem);

    storage.logAccess(mem.id, "encode");
    storage.logAccess(mem.id, "recall");
    storage.logAccess(mem.id, "recall");

    const log = storage.getAccessLog(mem.id);
    expect(log).toHaveLength(3);
    expect(log[0]!.accessType).toBe("encode");

    const timestamps = storage.getAccessTimestamps(mem.id);
    expect(timestamps).toHaveLength(3);
  });

  test("associations CRUD", () => {
    const m1 = makeMemory();
    const m2 = makeMemory();
    storage.insertMemory(m1);
    storage.insertMemory(m2);

    const assoc: Association = {
      id: generateId(),
      sourceId: m1.id,
      targetId: m2.id,
      strength: 0.7,
      formedAt: Date.now(),
      type: "semantic",
    };
    storage.insertAssociation(assoc);

    expect(storage.getAssociationsFrom(m1.id)).toHaveLength(1);
    expect(storage.getAssociationsTo(m2.id)).toHaveLength(1);
    expect(storage.getAssociations(m1.id)).toHaveLength(1);
    expect(storage.getFanCount(m1.id)).toBe(1);
    expect(storage.getAssociationCount()).toBe(1);

    storage.updateAssociationStrength(assoc.id, 0.05);
    storage.deleteWeakAssociations(0.1);
    expect(storage.getAssociationCount()).toBe(0);
  });

  test("working memory slots", () => {
    storage.pushWorkingMemory({
      slot: 0,
      memoryRef: null,
      content: "refactoring auth module",
      pushedAt: Date.now(),
    });

    const wm = storage.getWorkingMemory();
    expect(wm).toHaveLength(1);
    expect(wm[0]!.content).toBe("refactoring auth module");

    expect(storage.getWorkingMemoryCount()).toBe(1);

    storage.clearWorkingMemory();
    expect(storage.getWorkingMemoryCount()).toBe(0);
  });

  test("consolidation log", () => {
    storage.logConsolidation({
      id: generateId(),
      ranAt: Date.now(),
      memoriesStrengthened: 12,
      memoriesPruned: 5,
      factsExtracted: 3,
      associationsDiscovered: 8,
    });

    const last = storage.getLastConsolidation();
    expect(last).not.toBeNull();
    expect(last!.memoriesStrengthened).toBe(12);
    expect(last!.memoriesPruned).toBe(5);
  });

  test("memory count by type", () => {
    storage.insertMemory(makeMemory({ type: "episodic" }));
    storage.insertMemory(makeMemory({ type: "episodic" }));
    storage.insertMemory(makeMemory({ type: "semantic" }));

    expect(storage.getMemoryCount()).toBe(3);
    expect(storage.getMemoryCount("episodic")).toBe(2);
    expect(storage.getMemoryCount("semantic")).toBe(1);
    expect(storage.getMemoryCount("procedural")).toBe(0);
  });

  test("transactions work", () => {
    const mem = makeMemory();
    storage.transaction(() => {
      storage.insertMemory(mem);
      storage.logAccess(mem.id, "encode");
    });

    expect(storage.getMemory(mem.id)).not.toBeNull();
    expect(storage.getAccessLog(mem.id)).toHaveLength(1);
  });
});
