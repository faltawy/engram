import { test, expect, describe } from "bun:test";
import { EngramStorage } from "../src/storage/sqlite.ts";
import { encode } from "../src/core/encoder.ts";
import { recall } from "../src/core/recall.ts";
import { DEFAULT_CONFIG, type CognitiveConfig } from "../src/config/defaults.ts";
import { pushFocus, getFocus, clearFocus, focusUtilization } from "../src/core/working-memory.ts";
import {
  formAssociation,
  formSemanticAssociations,
  recordCoRecall,
  getSpreadingActivationTargets,
} from "../src/core/associations.ts";
import { reconsolidate } from "../src/core/reconsolidation.ts";
import { baseLevelActivation, spreadingActivationStrength } from "../src/core/activation.ts";

const config: CognitiveConfig = { ...DEFAULT_CONFIG, activationNoise: 0 };

function makeStorage() {
  return EngramStorage.inMemory();
}

describe("Working Memory Capacity", () => {
  test("buffer holds up to capacity limit", () => {
    const storage = makeStorage();
    const wmConfig = { ...config, workingMemoryCapacity: 3 };

    pushFocus(storage, "task A", wmConfig);
    pushFocus(storage, "task B", wmConfig);
    pushFocus(storage, "task C", wmConfig);

    const { used, capacity } = focusUtilization(storage, wmConfig);
    expect(used).toBe(3);
    expect(capacity).toBe(3);

    storage.close();
  });

  test("rejects items beyond capacity by evicting oldest", () => {
    const storage = makeStorage();
    const wmConfig = { ...config, workingMemoryCapacity: 3 };
    const now = 1000000;

    pushFocus(storage, "task A", wmConfig, { now: now });
    pushFocus(storage, "task B", wmConfig, { now: now + 1000 });
    pushFocus(storage, "task C", wmConfig, { now: now + 2000 });

    // Push a 4th item — should evict the oldest (task A)
    const { evicted } = pushFocus(storage, "task D", wmConfig, { now: now + 3000 });

    expect(evicted).not.toBeNull();
    expect(evicted!.content).toBe("task A");

    const slots = getFocus(storage);
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.content).sort()).toEqual(["task B", "task C", "task D"]);

    storage.close();
  });

  test("clear removes all items", () => {
    const storage = makeStorage();
    pushFocus(storage, "task A", config);
    pushFocus(storage, "task B", config);

    const count = clearFocus(storage);
    expect(count).toBe(2);
    expect(getFocus(storage)).toHaveLength(0);

    storage.close();
  });
});

describe("Associative Recall", () => {
  test("recalling A activates associated B and C", () => {
    const storage = makeStorage();
    const recallConfig = { ...config, retrievalThreshold: -10.0 };
    const now = 1000000000;

    const memA = encode(
      storage,
      { content: "coffee morning routine", type: "episodic" },
      recallConfig,
      now,
    );
    const memB = encode(
      storage,
      { content: "commute to office daily", type: "episodic" },
      recallConfig,
      now,
    );
    const memC = encode(
      storage,
      { content: "conversation with sarah", type: "episodic" },
      recallConfig,
      now,
    );

    // Form associations: A → B, A → C
    formAssociation(storage, memA.id, memB.id, "temporal", 0.8, now);
    formAssociation(storage, memA.id, memC.id, "temporal", 0.6, now);

    // Recall "coffee" — should find A, and spreading activation should boost B and C
    const results = recall(storage, "coffee morning", recallConfig, {
      deterministic: true,
      now: now + 1000,
      associative: true,
    });

    // memA should definitely be found (direct BM25 match)
    expect(results.some((r) => r.memory.id === memA.id)).toBe(true);

    // Check that spreading activation provides nonzero boost to associated memories
    const targets = getSpreadingActivationTargets(storage, memA.id, recallConfig);
    expect(targets.length).toBeGreaterThanOrEqual(2);

    storage.close();
  });

  test("semantic associations form between memories with shared keywords", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const mem1 = encode(
      storage,
      { content: "typescript generics are powerful for type safety", type: "semantic" },
      config,
      now,
    );
    const mem2 = encode(
      storage,
      { content: "typescript interfaces provide type safety contracts", type: "semantic" },
      config,
      now,
    );
    const mem3 = encode(
      storage,
      { content: "rust borrow checker ensures memory safety", type: "semantic" },
      config,
      now,
    );

    const assocs1 = formSemanticAssociations(storage, mem1, now);
    // mem1 and mem2 share "typescript" and "type" and "safety" — should form association
    expect(assocs1.some((a) => a.targetId === mem2.id)).toBe(true);

    storage.close();
  });
});

describe("Spreading Activation Decay", () => {
  test("activation weakens as it spreads further from source", () => {
    const storage = makeStorage();
    const now = 1000000000;

    // Create a chain: A → B → C → D
    const memA = encode(storage, { content: "source memory alpha", type: "semantic" }, config, now);
    const memB = encode(storage, { content: "linked memory beta", type: "semantic" }, config, now);
    const memC = encode(
      storage,
      { content: "distant memory gamma", type: "semantic" },
      config,
      now,
    );
    const memD = encode(
      storage,
      { content: "far away memory delta", type: "semantic" },
      config,
      now,
    );

    formAssociation(storage, memA.id, memB.id, "semantic", 0.8, now);
    formAssociation(storage, memB.id, memC.id, "semantic", 0.7, now);
    formAssociation(storage, memC.id, memD.id, "semantic", 0.6, now);

    const targets = getSpreadingActivationTargets(storage, memA.id, config, 3);

    const boostB = targets.find((t) => t.memoryId === memB.id)?.activationBoost ?? 0;
    const boostC = targets.find((t) => t.memoryId === memC.id)?.activationBoost ?? 0;

    // Closer targets get more activation than distant ones
    expect(boostB).toBeGreaterThan(boostC);
    // depth should increase
    expect(targets.find((t) => t.memoryId === memB.id)?.depth).toBe(1);
    expect(targets.find((t) => t.memoryId === memC.id)?.depth).toBe(2);

    storage.close();
  });

  test("fan effect: memories with many connections spread activation thinly", () => {
    // S_ji = S - ln(fan_j)
    // More connections = weaker per-connection boost
    const lowFan = spreadingActivationStrength(config.maxSpreadingActivation, 2);
    const highFan = spreadingActivationStrength(config.maxSpreadingActivation, 10);

    expect(lowFan).toBeGreaterThan(highFan);
  });
});

describe("Reconsolidation", () => {
  test("recalled memories update with new context", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const mem = encode(
      storage,
      {
        content: "deployed to production",
        type: "episodic",
        context: "project:alpha",
      },
      config,
      now,
    );

    expect(mem.reconsolidationCount).toBe(0);

    reconsolidate(
      storage,
      mem,
      {
        newContext: "project:beta",
      },
      config,
    );

    const updated = storage.getMemory(mem.id)!;
    expect(updated.reconsolidationCount).toBe(1);
    expect(updated.context).toContain("project:alpha");
    expect(updated.context).toContain("project:beta");

    storage.close();
  });

  test("emotional blending during reconsolidation", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const mem = encode(
      storage,
      {
        content: "the big presentation",
        type: "episodic",
        emotion: "anxiety",
        emotionWeight: 0.8,
      },
      config,
      now,
    );

    // Recall with a calmer emotional state — should slightly shift the memory
    reconsolidate(
      storage,
      mem,
      {
        currentEmotion: "satisfaction",
        currentEmotionWeight: 0.5,
      },
      config,
    );

    const updated = storage.getMemory(mem.id)!;
    // Emotion weight should have been blended (reduced from 0.8)
    expect(updated.emotionWeight).toBeLessThan(0.8);
    expect(updated.reconsolidationCount).toBe(1);

    storage.close();
  });
});

describe("Co-Recall Associations", () => {
  test("memories recalled together form co-recall associations", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const mem1 = encode(
      storage,
      { content: "database optimization techniques", type: "semantic" },
      config,
      now,
    );
    const mem2 = encode(
      storage,
      { content: "query performance profiling", type: "semantic" },
      config,
      now,
    );
    const mem3 = encode(
      storage,
      { content: "index design patterns", type: "semantic" },
      config,
      now,
    );

    // Record that these were recalled together
    const formed = recordCoRecall(storage, [mem1.id, mem2.id, mem3.id], now);

    // Should form 3 associations (1-2, 1-3, 2-3)
    expect(formed).toHaveLength(3);
    expect(formed[0]!.type).toBe("co-recall");

    // Recording again should strengthen, not duplicate
    const formed2 = recordCoRecall(storage, [mem1.id, mem2.id], now + 1000);
    expect(formed2).toHaveLength(0); // no new associations, just strengthened

    storage.close();
  });
});

describe("Context-Dependent Recall", () => {
  test("matching context improves retrieval", () => {
    const storage = makeStorage();
    const recallConfig = { ...config, retrievalThreshold: -10.0 };
    const now = 1000000000;

    encode(
      storage,
      {
        content: "review the API documentation",
        type: "semantic",
        context: "project:api",
      },
      recallConfig,
      now,
    );

    encode(
      storage,
      {
        content: "review the database schema",
        type: "semantic",
        context: "project:db",
      },
      recallConfig,
      now,
    );

    // Recall with context filter
    const apiResults = recall(storage, "review documentation", recallConfig, {
      deterministic: true,
      now: now + 1000,
      context: "project:api",
    });

    expect(apiResults.length).toBe(1);
    expect(apiResults[0]!.memory.context).toBe("project:api");

    storage.close();
  });
});
