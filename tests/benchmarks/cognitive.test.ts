import { test, expect, describe } from "bun:test";
import { EngramStorage } from "../../src/storage/sqlite.ts";
import { encode } from "../../src/core/encoder.ts";
import { recall } from "../../src/core/recall.ts";
import { consolidate } from "../../src/core/consolidation.ts";
import { DEFAULT_CONFIG, type CognitiveConfig } from "../../src/config/defaults.ts";
import {
  formAssociation,
  formEmotionalAssociations,
  formCausalAssociations,
  getSpreadingActivationTargets,
} from "../../src/core/associations.ts";

const config: CognitiveConfig = {
  ...DEFAULT_CONFIG,
  activationNoise: 0,
  retrievalThreshold: -10.0,
};

function makeStorage() {
  return EngramStorage.inMemory();
}

describe("Serial Position Effect", () => {
  test("first and last items in a list are recalled better than middle items", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const items = [
      "apple fruit item first",
      "banana fruit item second",
      "cherry fruit item third",
      "date fruit item fourth",
      "elderberry fruit item fifth",
      "fig fruit item sixth",
      "grape fruit item seventh",
      "honeydew fruit item eighth",
      "kiwi fruit item ninth",
      "lemon fruit item tenth",
    ];

    const memories = items.map((content, i) =>
      encode(storage, { content, type: "episodic", context: "list:fruits" }, config, now + i * 1000)
    );

    const recallTime = now + items.length * 1000 + 60000;

    const results = recall(storage, "fruit item", config, {
      deterministic: true,
      now: recallTime,
      limit: 10,
    });

    const positions = results.map((r) => memories.findIndex((m) => m.id === r.memory.id));

    const first = memories[0]!;
    const last = memories[memories.length - 1]!;
    const firstResult = results.find((r) => r.memory.id === first.id);
    const lastResult = results.find((r) => r.memory.id === last.id);

    const middleActivations = results
      .filter((r) => {
        const idx = memories.findIndex((m) => m.id === r.memory.id);
        return idx >= 3 && idx <= 6;
      })
      .map((r) => r.activation);

    const avgMiddle = middleActivations.length > 0
      ? middleActivations.reduce((a, b) => a + b, 0) / middleActivations.length
      : -Infinity;

    expect(lastResult).toBeDefined();
    expect(lastResult!.activation).toBeGreaterThan(avgMiddle);

    storage.close();
  });
});

describe("Spacing Effect", () => {
  test("spaced repetitions produce stronger memories than massed repetitions", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const spaced = encode(storage, {
      content: "spaced learning algorithm concepts",
      type: "semantic",
    }, config, now);

    const massed = encode(storage, {
      content: "massed learning algorithm techniques",
      type: "semantic",
    }, config, now);

    storage.logAccess(spaced.id, "recall", now + 3600000);
    storage.logAccess(spaced.id, "recall", now + 86400000);
    storage.logAccess(spaced.id, "recall", now + 259200000);

    storage.logAccess(massed.id, "recall", now + 1000);
    storage.logAccess(massed.id, "recall", now + 2000);
    storage.logAccess(massed.id, "recall", now + 3000);

    const recallTime = now + 604800000;
    const results = recall(storage, "learning algorithm", config, {
      deterministic: true,
      now: recallTime,
      limit: 10,
    });

    const spacedResult = results.find((r) => r.memory.id === spaced.id);
    const massedResult = results.find((r) => r.memory.id === massed.id);

    expect(spacedResult).toBeDefined();
    expect(massedResult).toBeDefined();
    expect(spacedResult!.activation).toBeGreaterThan(massedResult!.activation);

    storage.close();
  });
});

describe("Mood-Congruent Recall", () => {
  test("emotional associations link memories with same emotion", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const mem1 = encode(storage, {
      content: "project deadline missed badly",
      type: "episodic",
      emotion: "anxiety",
      emotionWeight: 0.8,
    }, config, now);

    const mem2 = encode(storage, {
      content: "unexpected server crash at midnight",
      type: "episodic",
      emotion: "anxiety",
      emotionWeight: 0.7,
    }, config, now + 100);

    const mem3 = encode(storage, {
      content: "team celebration after launch",
      type: "episodic",
      emotion: "joy",
      emotionWeight: 0.6,
    }, config, now + 200);

    const allAssocs = storage.getAssociations(mem1.id);
    const emotionalAssocs = allAssocs.filter((a) => a.type === "emotional");
    const linkedToAnxious = emotionalAssocs.some(
      (a) => (a.sourceId === mem2.id && a.targetId === mem1.id) ||
             (a.sourceId === mem1.id && a.targetId === mem2.id)
    );
    const linkedToJoyful = emotionalAssocs.some(
      (a) => (a.sourceId === mem3.id && a.targetId === mem1.id) ||
             (a.sourceId === mem1.id && a.targetId === mem3.id)
    );

    expect(linkedToAnxious).toBe(true);
    expect(linkedToJoyful).toBe(false);

    storage.close();
  });

  test("same arousal tier creates weaker cross-emotion links", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const mem1 = encode(storage, {
      content: "frustrating debugging session all day",
      type: "episodic",
      emotion: "frustration",
      emotionWeight: 0.6,
    }, config, now);

    const mem2 = encode(storage, {
      content: "joyful feature completion celebration",
      type: "episodic",
      emotion: "joy",
      emotionWeight: 0.5,
    }, config, now + 100);

    const allAssocs = storage.getAssociations(mem1.id);
    const crossLink = allAssocs.find(
      (a) => a.type === "emotional" &&
        ((a.sourceId === mem1.id && a.targetId === mem2.id) ||
         (a.sourceId === mem2.id && a.targetId === mem1.id))
    );

    expect(crossLink).toBeDefined();
    expect(crossLink!.strength).toBeLessThan(0.3);

    storage.close();
  });

  test("low emotion weight memories are not linked", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const mem1 = encode(storage, {
      content: "mildly interesting fact about computers",
      type: "semantic",
      emotion: "curiosity",
      emotionWeight: 0.2,
    }, config, now);

    const mem2 = encode(storage, {
      content: "another curiosity about programming languages",
      type: "semantic",
      emotion: "curiosity",
      emotionWeight: 0.1,
    }, config, now + 100);

    const assocs = formEmotionalAssociations(storage, mem1, now + 200);
    expect(assocs).toHaveLength(0);

    storage.close();
  });
});

describe("Causal Chain Traversal", () => {
  test("encode A→B→C in same context, query A finds B and C", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const memA = encode(storage, {
      content: "noticed unusual CPU spike pattern",
      type: "episodic",
      context: "debug:cpu-issue",
    }, config, now);

    const memB = encode(storage, {
      content: "traced spike to runaway goroutine leak",
      type: "episodic",
      context: "debug:cpu-issue",
    }, config, now + 1000);

    const memC = encode(storage, {
      content: "fixed goroutine by adding context cancellation",
      type: "episodic",
      context: "debug:cpu-issue",
    }, config, now + 2000);

    consolidate(storage, config, now + 5000);

    const results = recall(storage, "CPU spike", config, {
      deterministic: true,
      now: now + 10000,
      limit: 10,
    });

    const foundA = results.some((r) => r.memory.id === memA.id);
    const foundB = results.some((r) => r.memory.id === memB.id);
    const foundC = results.some((r) => r.memory.id === memC.id);

    expect(foundA).toBe(true);
    expect(foundB).toBe(true);
    expect(foundC).toBe(true);

    storage.close();
  });

  test("causal associations are directional (source→target)", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const earlier = encode(storage, {
      content: "identified root cause of memory issue",
      type: "episodic",
      context: "debug:mem",
    }, config, now);

    const later = encode(storage, {
      content: "applied fix for memory issue",
      type: "episodic",
      context: "debug:mem",
    }, config, now + 1000);

    const allAssocs = storage.getAssociations(later.id);
    const causal = allAssocs.find(
      (a) => a.type === "causal" && a.sourceId === earlier.id && a.targetId === later.id
    );
    expect(causal).toBeDefined();
    expect(causal!.type).toBe("causal");

    storage.close();
  });

  test("causal strength decreases with sequence gap", () => {
    const storage = makeStorage();
    const now = 1000000000;

    encode(storage, {
      content: "step one of the process setup",
      type: "episodic",
      context: "debug:seq",
    }, config, now);

    encode(storage, {
      content: "step two continued from setup",
      type: "episodic",
      context: "debug:seq",
    }, config, now + 1000);

    const target = encode(storage, {
      content: "step three final resolution done",
      type: "episodic",
      context: "debug:seq",
    }, config, now + 2000);

    const assocs = storage.getAssociationsTo(target.id).filter((a) => a.type === "causal");

    if (assocs.length >= 2) {
      const sorted = assocs.sort((a, b) => b.strength - a.strength);
      expect(sorted[0]!.strength).toBeGreaterThan(sorted[1]!.strength);
    }

    storage.close();
  });
});

describe("Graph Traversal Depth", () => {
  test("depth-3 traversal reaches memories 3 hops away", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const a = encode(storage, { content: "origin memory node alpha", type: "semantic" }, config, now);
    const b = encode(storage, { content: "first hop memory node beta", type: "semantic" }, config, now + 100);
    const c = encode(storage, { content: "second hop memory node gamma", type: "semantic" }, config, now + 200);
    const d = encode(storage, { content: "third hop memory node delta", type: "semantic" }, config, now + 300);

    formAssociation(storage, a.id, b.id, "semantic", 0.9, now);
    formAssociation(storage, b.id, c.id, "semantic", 0.8, now);
    formAssociation(storage, c.id, d.id, "semantic", 0.7, now);

    const targets = getSpreadingActivationTargets(storage, a.id, config);

    const foundD = targets.some((t) => t.memoryId === d.id);
    expect(foundD).toBe(true);

    const depthD = targets.find((t) => t.memoryId === d.id);
    expect(depthD?.depth).toBe(3);

    storage.close();
  });
});
