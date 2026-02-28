import { test, expect, describe, afterEach } from "bun:test";

import { DEFAULT_CONFIG, loadConfig, resolveDbPath } from "../src/config/defaults.ts";

describe("resolveDbPath", () => {
  test("expands ~ to HOME", () => {
    const home = process.env.HOME || "/tmp";
    expect(resolveDbPath("~/.engram/memory.db")).toBe(`${home}/.engram/memory.db`);
  });

  test("returns absolute paths unchanged", () => {
    expect(resolveDbPath("/var/data/engram.db")).toBe("/var/data/engram.db");
  });

  test("returns relative paths unchanged", () => {
    expect(resolveDbPath("./data/memory.db")).toBe("./data/memory.db");
  });
});

describe("loadConfig", () => {
  const envKeys = [
    "ENGRAM_DB_PATH",
    "ENGRAM_DECAY_RATE",
    "ENGRAM_WM_CAPACITY",
    "ENGRAM_RETRIEVAL_THRESHOLD",
  ];

  afterEach(() => {
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  test("returns defaults with no overrides", () => {
    const config = loadConfig();
    expect(config.decayRate).toBe(DEFAULT_CONFIG.decayRate);
    expect(config.workingMemoryCapacity).toBe(DEFAULT_CONFIG.workingMemoryCapacity);
    expect(config.dbPath).toBe(DEFAULT_CONFIG.dbPath);
  });

  test("applies overrides", () => {
    const config = loadConfig({ decayRate: 0.9, workingMemoryCapacity: 3 });
    expect(config.decayRate).toBe(0.9);
    expect(config.workingMemoryCapacity).toBe(3);
    expect(config.latencyFactor).toBe(DEFAULT_CONFIG.latencyFactor);
  });

  test("ENGRAM_DB_PATH env var overrides dbPath", () => {
    process.env.ENGRAM_DB_PATH = "/custom/path.db";
    const config = loadConfig();
    expect(config.dbPath).toBe("/custom/path.db");
  });

  test("ENGRAM_DECAY_RATE env var overrides decayRate", () => {
    process.env.ENGRAM_DECAY_RATE = "0.75";
    const config = loadConfig();
    expect(config.decayRate).toBe(0.75);
  });

  test("ENGRAM_WM_CAPACITY env var overrides workingMemoryCapacity", () => {
    process.env.ENGRAM_WM_CAPACITY = "5";
    const config = loadConfig();
    expect(config.workingMemoryCapacity).toBe(5);
  });

  test("ENGRAM_RETRIEVAL_THRESHOLD env var overrides retrievalThreshold", () => {
    process.env.ENGRAM_RETRIEVAL_THRESHOLD = "-0.5";
    const config = loadConfig();
    expect(config.retrievalThreshold).toBe(-0.5);
  });

  test("env vars take precedence over overrides", () => {
    process.env.ENGRAM_DB_PATH = "/env/path.db";
    const config = loadConfig({ dbPath: "/override/path.db" });
    expect(config.dbPath).toBe("/env/path.db");
  });
});

describe("DEFAULT_CONFIG", () => {
  test("has sensible defaults", () => {
    expect(DEFAULT_CONFIG.decayRate).toBe(0.5);
    expect(DEFAULT_CONFIG.workingMemoryCapacity).toBe(7);
    expect(DEFAULT_CONFIG.retrievalThreshold).toBe(-3.0);
    expect(DEFAULT_CONFIG.pruningThreshold).toBe(-2.0);
    expect(DEFAULT_CONFIG.activationNoise).toBe(0.25);
    expect(DEFAULT_CONFIG.dbPath).toBe("~/.engram/memory.db");
  });
});
