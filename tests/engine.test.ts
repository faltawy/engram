import { test, expect, describe } from "bun:test";
import { EngramEngine } from "../src/core/engine.ts";
import { DEFAULT_CONFIG } from "../src/config/defaults.ts";

describe("EngramEngine", () => {
  test("inMemory() creates a working engine with default config", () => {
    const engine = EngramEngine.inMemory();
    expect(engine.config.decayRate).toBe(DEFAULT_CONFIG.decayRate);
    expect(engine.config.workingMemoryCapacity).toBe(7);
    expect(engine.storage).toBeDefined();
    engine.close();
  });

  test("inMemory() accepts config overrides", () => {
    const engine = EngramEngine.inMemory({ decayRate: 0.8, workingMemoryCapacity: 5 });
    expect(engine.config.decayRate).toBe(0.8);
    expect(engine.config.workingMemoryCapacity).toBe(5);
    expect(engine.config.latencyFactor).toBe(DEFAULT_CONFIG.latencyFactor);
    engine.close();
  });

  test("storage is functional after creation", () => {
    const engine = EngramEngine.inMemory();
    expect(engine.storage.getMemoryCount()).toBe(0);
    expect(engine.storage.getWorkingMemoryCount()).toBe(0);
    engine.close();
  });

  test("close() shuts down without error", () => {
    const engine = EngramEngine.inMemory();
    expect(() => engine.close()).not.toThrow();
  });

  test("create() opens persistent storage", () => {
    const tmpPath = `/tmp/engram-test-${Date.now()}.db`;
    const engine = EngramEngine.create({ dbPath: tmpPath });
    expect(engine.storage).toBeDefined();
    expect(engine.config.dbPath).toBe(tmpPath);
    engine.close();
  });
});
