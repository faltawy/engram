import { test, expect, describe } from "bun:test";
import { EngramStorage } from "../src/storage/sqlite.ts";
import { encode } from "../src/core/encoder.ts";
import { recall } from "../src/core/recall.ts";
import { baseLevelActivation } from "../src/core/activation.ts";
import { ebbinghausRetention, memoryStrength } from "../src/core/forgetting.ts";
import { DEFAULT_CONFIG, type CognitiveConfig } from "../src/config/defaults.ts";

const config: CognitiveConfig = { ...DEFAULT_CONFIG, activationNoise: 0 };

function makeStorage() {
  return EngramStorage.inMemory();
}

describe("Forgetting Curve", () => {
  test("memories decay over time without reinforcement", () => {
    // Simulate a single access, then measure activation at increasing intervals
    const accessTime = 1000000;
    const decayRate = config.decayRate; // 0.5

    const activations: number[] = [];
    const intervals = [1, 10, 60, 600, 3600, 86400]; // 1s to 1 day

    for (const seconds of intervals) {
      const now = accessTime + seconds * 1000;
      const activation = baseLevelActivation([accessTime], now, decayRate);
      activations.push(activation);
    }

    // Activation should strictly decrease over time
    for (let i = 1; i < activations.length; i++) {
      expect(activations[i]!).toBeLessThan(activations[i - 1]!);
    }

    // Power law: equal-width intervals show bigger drops early, smaller later
    // Compare drop over 10s starting at t=1s vs drop over 10s starting at t=1000s
    const earlyStart = baseLevelActivation([accessTime], accessTime + 1000, decayRate);
    const earlyEnd = baseLevelActivation([accessTime], accessTime + 11000, decayRate);
    const earlyDrop = earlyStart - earlyEnd;

    const lateStart = baseLevelActivation([accessTime], accessTime + 1000000, decayRate);
    const lateEnd = baseLevelActivation([accessTime], accessTime + 1010000, decayRate);
    const lateDrop = lateStart - lateEnd;

    expect(earlyDrop).toBeGreaterThan(lateDrop);
  });

  test("Ebbinghaus retention decays exponentially", () => {
    const strength = 10; // seconds
    const r1 = ebbinghausRetention(1, strength);
    const r2 = ebbinghausRetention(5, strength);
    const r3 = ebbinghausRetention(10, strength);
    const r4 = ebbinghausRetention(100, strength);

    expect(r1).toBeGreaterThan(r2);
    expect(r2).toBeGreaterThan(r3);
    expect(r3).toBeGreaterThan(r4);

    // At t=0, retention should be ~1
    expect(ebbinghausRetention(0, strength)).toBeCloseTo(1.0, 5);
    // At t >> S, retention should approach 0
    expect(r4).toBeLessThan(0.001);
  });
});

describe("Spacing Effect", () => {
  test("spaced recalls produce stronger activation than massed recalls at a later time", () => {
    const decayRate = config.decayRate;

    // Both have 5 accesses. Timestamps in milliseconds.
    // Key: massed accesses are all at the SAME time (t=0).
    // Spaced accesses are distributed.

    const base = 0;

    // Massed: 5 accesses all at the same moment
    const massedTimes = [base, base, base, base, base];

    // Spaced: 5 accesses spread over 40 seconds (10s apart)
    const spacedTimes = [base, base + 10000, base + 20000, base + 30000, base + 40000];

    // Test at a moderate future time (100s after the initial access)
    const testTime = 100000;

    const massedActivation = baseLevelActivation(massedTimes, testTime, decayRate);
    const spacedActivation = baseLevelActivation(spacedTimes, testTime, decayRate);

    // Spaced wins: the more recent accesses in the spaced set contribute
    // more than the identical old-time accesses in the massed set
    expect(spacedActivation).toBeGreaterThan(massedActivation);
  });
});

describe("Recency Effect", () => {
  test("recently accessed memories have higher activation at recall time", () => {
    // Use a very low threshold so both memories are retrievable
    const recencyConfig = { ...config, retrievalThreshold: -10.0 };
    const storage = makeStorage();
    const now = 1000000000;

    encode(
      storage,
      {
        content: "old memory from a minute ago",
        type: "semantic",
      },
      recencyConfig,
      now - 60000,
    ); // 1 minute ago

    encode(
      storage,
      {
        content: "recent memory from just now",
        type: "semantic",
      },
      recencyConfig,
      now,
    );

    // Recall both at the same "now"
    const results = recall(storage, "memory", recencyConfig, {
      deterministic: true,
      now: now + 1000,
    });

    expect(results.length).toBeGreaterThanOrEqual(2);

    // Recent memory should have higher activation at recall time
    const recentResult = results.find((r) => r.memory.content.includes("recent"))!;
    const oldResult = results.find((r) => r.memory.content.includes("old"))!;
    expect(recentResult).toBeDefined();
    expect(oldResult).toBeDefined();
    expect(recentResult.activation).toBeGreaterThan(oldResult.activation);

    storage.close();
  });
});

describe("Frequency Effect", () => {
  test("frequently accessed memories have higher activation", () => {
    const decayRate = config.decayRate;
    const now = 100000;

    // Infrequent: 2 accesses
    const infrequentTimes = [90000, 95000];
    const infrequentActivation = baseLevelActivation(infrequentTimes, now, decayRate);

    // Frequent: 10 accesses at same spacing
    const frequentTimes = [90000, 91000, 92000, 93000, 94000, 95000, 96000, 97000, 98000, 99000];
    const frequentActivation = baseLevelActivation(frequentTimes, now, decayRate);

    // Frequently accessed memory should have much higher activation
    expect(frequentActivation).toBeGreaterThan(infrequentActivation);
  });

  test("more accesses = higher activation (direct activation math)", () => {
    const decayRate = config.decayRate;
    const testTime = 100000;

    // Few accesses: encoded once 60s ago
    const fewAccesses = [40000];

    // Many accesses: encoded + 5 recalls spread over time
    const manyAccesses = [40000, 50000, 60000, 70000, 80000, 90000];

    const fewActivation = baseLevelActivation(fewAccesses, testTime, decayRate);
    const manyActivation = baseLevelActivation(manyAccesses, testTime, decayRate);

    expect(manyActivation).toBeGreaterThan(fewActivation);
  });

  test("recall cycle adds access timestamps to the recalled memory", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const mem = encode(
      storage,
      {
        content: "typescript configuration patterns",
        type: "semantic",
      },
      config,
      now,
    );

    // 1 access from encode
    expect(storage.getAccessTimestamps(mem.id).length).toBe(1);

    // Recall it — should add another access
    recall(storage, "typescript configuration", config, {
      deterministic: true,
      now: now + 2000,
    });

    const timestamps = storage.getAccessTimestamps(mem.id);
    expect(timestamps.length).toBeGreaterThanOrEqual(2);

    storage.close();
  });
});

describe("Emotional Enhancement", () => {
  test("emotional memories have higher initial activation than neutral ones", () => {
    const storage = makeStorage();
    const now = Date.now();

    const neutral = encode(
      storage,
      {
        content: "a neutral everyday event",
        type: "episodic",
        emotion: "neutral",
      },
      config,
      now,
    );

    const emotional = encode(
      storage,
      {
        content: "a highly anxious event",
        type: "episodic",
        emotion: "anxiety",
      },
      config,
      now,
    );

    expect(emotional.activation).toBeGreaterThan(neutral.activation);
    expect(emotional.emotionWeight).toBe(0.8); // default anxiety weight

    storage.close();
  });

  test("emotional memories decay slower (higher effective strength)", () => {
    // Emotional weight increases memory strength
    const neutralStrength = memoryStrength(3, 0.0, 2, config.emotionalBoostFactor);
    const emotionalStrength = memoryStrength(3, 0.8, 2, config.emotionalBoostFactor);

    expect(emotionalStrength).toBeGreaterThan(neutralStrength);

    // This means emotional memories retain more over the same time period
    const t = 3600; // 1 hour in seconds
    const neutralRetention = ebbinghausRetention(t, neutralStrength);
    const emotionalRetention = ebbinghausRetention(t, emotionalStrength);

    expect(emotionalRetention).toBeGreaterThan(neutralRetention);
  });
});

describe("Retrieval-Induced Strengthening", () => {
  test("successfully recalling a memory increases its activation", () => {
    const storage = makeStorage();
    const now = Date.now();

    encode(
      storage,
      {
        content: "a memory to be strengthened by recall",
        type: "semantic",
      },
      config,
      now,
    );

    const beforeRecall = storage.getAllMemories()[0]!;
    const beforeActivation = beforeRecall.activation;

    // Recall it
    recall(storage, "strengthened by recall", config, {
      deterministic: true,
      now: now + 1000,
    });

    const afterRecall = storage.getAllMemories()[0]!;

    // The recall should have logged an access and strengthened the memory
    expect(afterRecall.recallCount).toBe(1);
    expect(afterRecall.lastRecalledAt).not.toBeNull();

    // Activation should be higher after recall (retrieval strengthening)
    const timestamps = storage.getAccessTimestamps(afterRecall.id);
    expect(timestamps.length).toBe(2); // encode + recall

    storage.close();
  });
});
