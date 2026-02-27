import { test, expect, describe } from "bun:test";
import { EngramStorage } from "../src/storage/sqlite.ts";
import { encode } from "../src/core/encoder.ts";
import { recall } from "../src/core/recall.ts";
import { consolidate } from "../src/core/consolidation.ts";
import { discoverChunks, getChunkMembers } from "../src/core/chunking.ts";
import { encodeProcedural, getSkills } from "../src/core/procedural-store.ts";
import { formAssociation } from "../src/core/associations.ts";
import { baseLevelActivation } from "../src/core/activation.ts";
import { DEFAULT_CONFIG, type CognitiveConfig } from "../src/config/defaults.ts";

const config: CognitiveConfig = { ...DEFAULT_CONFIG, activationNoise: 0 };

function makeStorage() {
  return EngramStorage.inMemory();
}

describe("Consolidation Effects", () => {
  test("sleep strengthens frequently-accessed memories", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const mem = encode(
      storage,
      {
        content: "important deployment checklist",
        type: "semantic",
      },
      config,
      now,
    );

    // Recall it 3 times within 24h to make it "frequently accessed"
    recall(storage, "deployment checklist", config, { deterministic: true, now: now + 1000 });
    recall(storage, "deployment checklist", config, { deterministic: true, now: now + 2000 });
    recall(storage, "deployment checklist", config, { deterministic: true, now: now + 3000 });

    const beforeConsolidation = storage.getAccessTimestamps(mem.id).length;

    consolidate(storage, config, now + 5000);

    const afterConsolidation = storage.getAccessTimestamps(mem.id).length;
    // Consolidation should have added another access (strengthening)
    expect(afterConsolidation).toBeGreaterThan(beforeConsolidation);

    storage.close();
  });

  test("sleep prunes weak memories below threshold", () => {
    const storage = makeStorage();
    const now = 1000000000;
    const pruneConfig = { ...config, pruningThreshold: -0.5 };

    // Encode a memory long ago with no reinforcement
    encode(
      storage,
      {
        content: "forgettable trivia fact",
        type: "semantic",
      },
      pruneConfig,
      now - 10000000,
    ); // very old

    // Encode a recent memory
    encode(
      storage,
      {
        content: "recent important memory",
        type: "semantic",
      },
      pruneConfig,
      now,
    );

    expect(storage.getMemoryCount()).toBe(2);

    const result = consolidate(storage, pruneConfig, now + 1000);

    // The old memory should have been pruned
    expect(result.memoriesPruned).toBeGreaterThanOrEqual(1);
    expect(storage.getMemoryCount()).toBeLessThan(2);

    storage.close();
  });
});

describe("Episodic → Semantic Extraction", () => {
  test("repeated similar episodes generate semantic facts", () => {
    const storage = makeStorage();
    const extractConfig = { ...config, semanticExtractionThreshold: 3 };
    const now = 1000000000;

    // Create 3 episodic memories about the same topic
    encode(
      storage,
      {
        content: "deployed microservice to kubernetes cluster",
        type: "episodic",
      },
      extractConfig,
      now,
    );
    encode(
      storage,
      {
        content: "deployed api gateway to kubernetes production",
        type: "episodic",
      },
      extractConfig,
      now + 1000,
    );
    encode(
      storage,
      {
        content: "deployed monitoring stack to kubernetes staging",
        type: "episodic",
      },
      extractConfig,
      now + 2000,
    );

    const beforeSemantic = storage.getMemoryCount("semantic");

    const result = consolidate(storage, extractConfig, now + 5000);

    const afterSemantic = storage.getMemoryCount("semantic");

    // Should have extracted at least one semantic fact about "deployed" + "kubernetes"
    expect(result.factsExtracted).toBeGreaterThanOrEqual(1);
    expect(afterSemantic).toBeGreaterThan(beforeSemantic);
    // The extracted fact should reference the shared pattern
    expect(
      result.extractedFacts.some((f) => f.includes("deployed") || f.includes("kubernetes")),
    ).toBe(true);

    storage.close();
  });
});

describe("Procedural Memory Immunity", () => {
  test("procedural memories maintain activation regardless of time", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const skill = encodeProcedural(storage, "always run smoke tests before deploying", config, {
      now,
    });

    expect(skill.type).toBe("procedural");

    // Procedural memories should survive consolidation even if "old"
    const pruneConfig = { ...config, pruningThreshold: 100 }; // absurdly high threshold
    const result = consolidate(storage, pruneConfig, now + 100000000);

    // The procedural memory should NOT be pruned (immune to decay)
    const afterPrune = storage.getMemory(skill.id);
    expect(afterPrune).not.toBeNull();
    expect(afterPrune!.type).toBe("procedural");

    storage.close();
  });

  test("getSkills returns all procedural memories", () => {
    const storage = makeStorage();
    const now = 1000000000;

    encodeProcedural(storage, "always lint before committing", config, { now });
    encodeProcedural(storage, "use bun instead of node", config, { now });
    encode(storage, { content: "some episodic memory", type: "episodic" }, config, now);

    const skills = getSkills(storage);
    expect(skills).toHaveLength(2);
    expect(skills.every((s) => s.type === "procedural")).toBe(true);

    storage.close();
  });
});

describe("Chunking", () => {
  test("strongly associated memories group into chunks", () => {
    const storage = makeStorage();
    const chunkConfig = { ...config, chunkingSimilarityThreshold: 0.5 };
    const now = 1000000000;

    const m1 = encode(
      storage,
      { content: "react component patterns", type: "semantic" },
      chunkConfig,
      now,
    );
    const m2 = encode(
      storage,
      { content: "react hooks best practices", type: "semantic" },
      chunkConfig,
      now,
    );
    const m3 = encode(
      storage,
      { content: "unrelated rust memory", type: "semantic" },
      chunkConfig,
      now,
    );

    // Create strong association between m1 and m2
    formAssociation(storage, m1.id, m2.id, "semantic", 0.8, now);

    const chunks = discoverChunks(storage, chunkConfig);

    // m1 and m2 should be chunked together, m3 should not
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.memberIds).toContain(m1.id);
    expect(chunks[0]!.memberIds).toContain(m2.id);
    expect(chunks[0]!.memberIds).not.toContain(m3.id);

    // Verify chunk assignment in storage
    const updated1 = storage.getMemory(m1.id)!;
    const updated2 = storage.getMemory(m2.id)!;
    expect(updated1.chunkId).toBe(updated2.chunkId);
    expect(updated1.chunkId).not.toBeNull();

    // getChunkMembers should return the group
    const members = getChunkMembers(storage, updated1.chunkId!);
    expect(members).toHaveLength(2);

    storage.close();
  });

  test("weakly associated memories don't chunk", () => {
    const storage = makeStorage();
    const chunkConfig = { ...config, chunkingSimilarityThreshold: 0.8 };
    const now = 1000000000;

    const m1 = encode(storage, { content: "memory alpha", type: "semantic" }, chunkConfig, now);
    const m2 = encode(storage, { content: "memory beta", type: "semantic" }, chunkConfig, now);

    // Weak association (below threshold)
    formAssociation(storage, m1.id, m2.id, "semantic", 0.3, now);

    const chunks = discoverChunks(storage, chunkConfig);
    expect(chunks).toHaveLength(0);

    storage.close();
  });
});

describe("Association Discovery During Sleep", () => {
  test("consolidation discovers temporal and semantic associations", () => {
    const storage = makeStorage();
    const now = 1000000000;

    // Encode memories close together in time with shared keywords
    encode(
      storage,
      {
        content: "typescript interface design patterns",
        type: "semantic",
      },
      config,
      now,
    );
    encode(
      storage,
      {
        content: "typescript generic type patterns",
        type: "semantic",
      },
      config,
      now + 1000,
    );

    expect(storage.getAssociationCount()).toBe(0);

    const result = consolidate(storage, config, now + 5000);

    // Should have discovered associations (temporal and/or semantic)
    expect(result.associationsDiscovered).toBeGreaterThan(0);
    expect(storage.getAssociationCount()).toBeGreaterThan(0);

    storage.close();
  });
});
