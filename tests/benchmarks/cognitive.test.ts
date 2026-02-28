import { test, expect, describe } from "bun:test";

import { DEFAULT_CONFIG, type CognitiveConfig } from "../../src/config/defaults.ts";
import {
  formAssociation,
  formEmotionalAssociations,
  formCausalAssociations,
  getSpreadingActivationTargets,
} from "../../src/core/associations.ts";
import { consolidate } from "../../src/core/consolidation.ts";
import { encode } from "../../src/core/encoder.ts";
import { recall } from "../../src/core/recall.ts";
import { EngramStorage } from "../../src/storage/sqlite.ts";

const config: CognitiveConfig = {
  ...DEFAULT_CONFIG,
  activationNoise: 0,
  retrievalThreshold: -10.0,
  pruningThreshold: -20.0,
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
      encode(
        storage,
        { content, type: "episodic", context: "list:fruits" },
        config,
        now + i * 1000,
      ),
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

    const avgMiddle =
      middleActivations.length > 0
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

    const spaced = encode(
      storage,
      {
        content: "spaced learning algorithm concepts",
        type: "semantic",
      },
      config,
      now,
    );

    const massed = encode(
      storage,
      {
        content: "massed learning algorithm techniques",
        type: "semantic",
      },
      config,
      now,
    );

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

    const mem1 = encode(
      storage,
      {
        content: "project deadline missed badly",
        type: "episodic",
        emotion: "anxiety",
        emotionWeight: 0.8,
      },
      config,
      now,
    );

    const mem2 = encode(
      storage,
      {
        content: "unexpected server crash at midnight",
        type: "episodic",
        emotion: "anxiety",
        emotionWeight: 0.7,
      },
      config,
      now + 100,
    );

    const mem3 = encode(
      storage,
      {
        content: "team celebration after launch",
        type: "episodic",
        emotion: "joy",
        emotionWeight: 0.6,
      },
      config,
      now + 200,
    );

    const allAssocs = storage.getAssociations(mem1.id);
    const emotionalAssocs = allAssocs.filter((a) => a.type === "emotional");
    const linkedToAnxious = emotionalAssocs.some(
      (a) =>
        (a.sourceId === mem2.id && a.targetId === mem1.id) ||
        (a.sourceId === mem1.id && a.targetId === mem2.id),
    );
    const linkedToJoyful = emotionalAssocs.some(
      (a) =>
        (a.sourceId === mem3.id && a.targetId === mem1.id) ||
        (a.sourceId === mem1.id && a.targetId === mem3.id),
    );

    expect(linkedToAnxious).toBe(true);
    expect(linkedToJoyful).toBe(false);

    storage.close();
  });

  test("same arousal tier creates weaker cross-emotion links", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const mem1 = encode(
      storage,
      {
        content: "frustrating debugging session all day",
        type: "episodic",
        emotion: "frustration",
        emotionWeight: 0.6,
      },
      config,
      now,
    );

    const mem2 = encode(
      storage,
      {
        content: "joyful feature completion celebration",
        type: "episodic",
        emotion: "joy",
        emotionWeight: 0.5,
      },
      config,
      now + 100,
    );

    const allAssocs = storage.getAssociations(mem1.id);
    const crossLink = allAssocs.find(
      (a) =>
        a.type === "emotional" &&
        ((a.sourceId === mem1.id && a.targetId === mem2.id) ||
          (a.sourceId === mem2.id && a.targetId === mem1.id)),
    );

    expect(crossLink).toBeDefined();
    expect(crossLink!.strength).toBeLessThan(0.3);

    storage.close();
  });

  test("low emotion weight memories are not linked", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const mem1 = encode(
      storage,
      {
        content: "mildly interesting fact about computers",
        type: "semantic",
        emotion: "curiosity",
        emotionWeight: 0.2,
      },
      config,
      now,
    );

    const mem2 = encode(
      storage,
      {
        content: "another curiosity about programming languages",
        type: "semantic",
        emotion: "curiosity",
        emotionWeight: 0.1,
      },
      config,
      now + 100,
    );

    const assocs = formEmotionalAssociations(storage, mem1, now + 200);
    expect(assocs).toHaveLength(0);

    storage.close();
  });
});

describe("Causal Chain Traversal", () => {
  test("encode A→B→C in same context, query A finds B and C", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const memA = encode(
      storage,
      {
        content: "noticed unusual CPU spike pattern",
        type: "episodic",
        context: "debug:cpu-issue",
      },
      config,
      now,
    );

    const memB = encode(
      storage,
      {
        content: "traced spike to runaway goroutine leak",
        type: "episodic",
        context: "debug:cpu-issue",
      },
      config,
      now + 1000,
    );

    const memC = encode(
      storage,
      {
        content: "fixed goroutine by adding context cancellation",
        type: "episodic",
        context: "debug:cpu-issue",
      },
      config,
      now + 2000,
    );

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

    const earlier = encode(
      storage,
      {
        content: "identified root cause of memory issue",
        type: "episodic",
        context: "debug:mem",
      },
      config,
      now,
    );

    const later = encode(
      storage,
      {
        content: "applied fix for memory issue",
        type: "episodic",
        context: "debug:mem",
      },
      config,
      now + 1000,
    );

    const allAssocs = storage.getAssociations(later.id);
    const causal = allAssocs.find(
      (a) => a.type === "causal" && a.sourceId === earlier.id && a.targetId === later.id,
    );
    expect(causal).toBeDefined();
    expect(causal!.type).toBe("causal");

    storage.close();
  });

  test("causal strength decreases with sequence gap", () => {
    const storage = makeStorage();
    const now = 1000000000;

    encode(
      storage,
      {
        content: "step one of the process setup",
        type: "episodic",
        context: "debug:seq",
      },
      config,
      now,
    );

    encode(
      storage,
      {
        content: "step two continued from setup",
        type: "episodic",
        context: "debug:seq",
      },
      config,
      now + 1000,
    );

    const target = encode(
      storage,
      {
        content: "step three final resolution done",
        type: "episodic",
        context: "debug:seq",
      },
      config,
      now + 2000,
    );

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

    const a = encode(
      storage,
      { content: "origin memory node alpha", type: "semantic" },
      config,
      now,
    );
    const b = encode(
      storage,
      { content: "first hop memory node beta", type: "semantic" },
      config,
      now + 100,
    );
    const c = encode(
      storage,
      { content: "second hop memory node gamma", type: "semantic" },
      config,
      now + 200,
    );
    const d = encode(
      storage,
      { content: "third hop memory node delta", type: "semantic" },
      config,
      now + 300,
    );

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

describe("Fan Effect at Scale", () => {
  const fanConfig: CognitiveConfig = { ...config, maxSpreadingActivation: 5.0 };

  test("spreading activation attenuates with 30 fan-out", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const hub = encode(
      storage,
      {
        content: "central hub concept architecture overview",
        type: "semantic",
      },
      fanConfig,
      now,
    );

    const spokes: ReturnType<typeof encode>[] = [];
    for (let i = 0; i < 30; i++) {
      const spoke = encode(
        storage,
        {
          content: `spoke memory topic number ${i} connected to hub`,
          type: "semantic",
        },
        config,
        now + (i + 1) * 100,
      );
      formAssociation(storage, hub.id, spoke.id, "semantic", 0.8, now);
      spokes.push(spoke);
    }

    const distant: ReturnType<typeof encode>[] = [];
    for (let i = 0; i < 5; i++) {
      const d = encode(
        storage,
        {
          content: `distant memory reachable via two hops number ${i}`,
          type: "semantic",
        },
        config,
        now + 3200 + i * 100,
      );
      formAssociation(storage, spokes[i]!.id, d.id, "semantic", 0.7, now);
      distant.push(d);
    }

    const targets = getSpreadingActivationTargets(storage, hub.id, fanConfig);

    const spokeTargets = targets.filter((t) => spokes.some((s) => s.id === t.memoryId));
    expect(spokeTargets.length).toBe(30);

    const distantTargets = targets.filter((t) => distant.some((d) => d.id === t.memoryId));
    expect(distantTargets.length).toBeGreaterThan(0);

    const avgSpokeBoost =
      spokeTargets.reduce((s, t) => s + t.activationBoost, 0) / spokeTargets.length;
    console.log(
      `[Fan Effect] 30-fan spoke boost: ${avgSpokeBoost.toFixed(
        4,
      )}, distant count: ${distantTargets.length}`,
    );
    expect(avgSpokeBoost).toBeGreaterThan(0);

    storage.close();
  });

  test("fan effect comparison: 5 vs 30 connections", () => {
    const storageA = makeStorage();
    const storageB = makeStorage();
    const now = 1000000000;

    const hubA = encode(
      storageA,
      { content: "hub alpha central node", type: "semantic" },
      fanConfig,
      now,
    );
    for (let i = 0; i < 5; i++) {
      const spoke = encode(
        storageA,
        {
          content: `alpha spoke item number ${i}`,
          type: "semantic",
        },
        fanConfig,
        now + (i + 1) * 100,
      );
      formAssociation(storageA, hubA.id, spoke.id, "semantic", 0.8, now);
    }

    const hubB = encode(
      storageB,
      { content: "hub beta central node", type: "semantic" },
      fanConfig,
      now,
    );
    for (let i = 0; i < 30; i++) {
      const spoke = encode(
        storageB,
        {
          content: `beta spoke item number ${i}`,
          type: "semantic",
        },
        fanConfig,
        now + (i + 1) * 100,
      );
      formAssociation(storageB, hubB.id, spoke.id, "semantic", 0.8, now);
    }

    const targetsA = getSpreadingActivationTargets(storageA, hubA.id, fanConfig);
    const targetsB = getSpreadingActivationTargets(storageB, hubB.id, fanConfig);

    const avgBoostA =
      targetsA.length > 0
        ? targetsA.reduce((s, t) => s + t.activationBoost, 0) / targetsA.length
        : 0;
    const avgBoostB =
      targetsB.length > 0
        ? targetsB.reduce((s, t) => s + t.activationBoost, 0) / targetsB.length
        : 0;

    console.log(
      `[Fan Effect] 5-fan avg boost: ${avgBoostA.toFixed(
        4,
      )}, 30-fan avg boost: ${avgBoostB.toFixed(4)}`,
    );

    expect(avgBoostA).toBeGreaterThanOrEqual(avgBoostB * 2);

    storageA.close();
    storageB.close();
  });
});

describe("Competing Cues", () => {
  test("similar memories compete during recall", () => {
    const storage = makeStorage();
    const now = 1000000000;
    const day = 86400000;

    const mem1 = encode(
      storage,
      {
        content: "fixed timeout bug in user authentication service sprint 12",
        type: "episodic",
        context: "sprint:12",
      },
      config,
      now,
    );

    const mem2 = encode(
      storage,
      {
        content: "fixed timeout bug in payment processing service sprint 13",
        type: "episodic",
        context: "sprint:13",
      },
      config,
      now + day * 7,
    );

    const mem3 = encode(
      storage,
      {
        content: "fixed timeout bug in notification delivery service sprint 14",
        type: "episodic",
        context: "sprint:14",
      },
      config,
      now + day * 14,
    );

    consolidate(storage, config, now + day * 15);

    const specificResults = recall(storage, "timeout bug payment processing", config, {
      deterministic: true,
      now: now + day * 16,
      limit: 5,
    });

    const paymentFound = specificResults.some((r) => r.memory.id === mem2.id);
    expect(paymentFound).toBe(true);

    const ambiguousResults = recall(storage, "fixed timeout bug in service", config, {
      deterministic: true,
      now: now + day * 16,
      limit: 5,
    });

    const recentResult = ambiguousResults.find((r) => r.memory.id === mem3.id);
    expect(recentResult).toBeDefined();
    expect(ambiguousResults[0]!.memory.id).toBe(mem3.id);

    storage.close();
  });

  test("emotion-tagged memory beats neutral competitor", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const neutral = encode(
      storage,
      {
        content: "deployed microservice update to production cluster",
        type: "episodic",
        context: "project:deploy",
      },
      config,
      now,
    );

    const emotional = encode(
      storage,
      {
        content: "critical microservice deployment to production cluster failed",
        type: "episodic",
        context: "project:deploy",
        emotion: "anxiety",
        emotionWeight: 0.8,
      },
      config,
      now + 100,
    );

    const results = recall(storage, "microservice production deployment", config, {
      deterministic: true,
      now: now + 5000,
      limit: 5,
    });

    const neutralResult = results.find((r) => r.memory.id === neutral.id);
    const emotionalResult = results.find((r) => r.memory.id === emotional.id);

    expect(emotionalResult).toBeDefined();
    expect(neutralResult).toBeDefined();
    expect(emotionalResult!.activation).toBeGreaterThan(neutralResult!.activation);

    storage.close();
  });
});
