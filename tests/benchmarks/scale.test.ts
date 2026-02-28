import { test, expect, describe } from "bun:test";
import { EngramStorage } from "../../src/storage/sqlite.ts";
import { encode } from "../../src/core/encoder.ts";
import { recall } from "../../src/core/recall.ts";
import { consolidate } from "../../src/core/consolidation.ts";
import { DEFAULT_CONFIG, type CognitiveConfig } from "../../src/config/defaults.ts";
import { generateCorpus, mrr, measureMs } from "./helpers.ts";

const config: CognitiveConfig = {
  ...DEFAULT_CONFIG,
  activationNoise: 0,
  retrievalThreshold: -10.0,
};

function makeStorage() {
  return EngramStorage.inMemory();
}

describe("Memory Pressure", () => {
  test("prune low-activation, preserve high-value memories", () => {
    const storage = makeStorage();
    const now = 1000000000;
    const day = 86400000;
    const pressureConfig: CognitiveConfig = { ...config, pruningThreshold: -5.5 };

    const importantIds: string[] = [];
    const fillerIds: string[] = [];

    for (let i = 0; i < 180; i++) {
      const mem = encode(storage, {
        content: `routine filler memory number ${i} about daily standup notes`,
        type: "episodic",
        context: "project:filler",
      }, pressureConfig, now + i * 100);
      fillerIds.push(mem.id);
    }

    for (let i = 0; i < 20; i++) {
      const mem = encode(storage, {
        content: `critical important memory ${i} about production incident resolution`,
        type: "episodic",
        context: "project:important",
        emotion: "anxiety",
        emotionWeight: 0.7,
      }, pressureConfig, now + 18000 + i * 100);
      importantIds.push(mem.id);
      storage.logAccess(mem.id, "recall", now + day * 5);
      storage.logAccess(mem.id, "recall", now + day * 15);
      storage.logAccess(mem.id, "recall", now + day * 25);
    }

    const consolidateTime = now + day * 30;
    consolidate(storage, pressureConfig, consolidateTime);

    const survivingImportant = importantIds.filter((id) => storage.getMemory(id) !== null);
    const survivingFiller = fillerIds.filter((id) => storage.getMemory(id) !== null);

    console.log(`[Memory Pressure] Pruned ${180 - survivingFiller.length} of 180 filler, preserved ${survivingImportant.length}/20 important`);

    expect(survivingImportant.length).toBe(20);
    expect(survivingFiller.length).toBeLessThan(180);
  });

  test("procedural memories immune to pruning", () => {
    const storage = makeStorage();
    const now = 1000000000;
    const day = 86400000;
    const pressureConfig: CognitiveConfig = { ...config, pruningThreshold: -5.0 };

    const proceduralIds: string[] = [];
    const episodicIds: string[] = [];
    const semanticIds: string[] = [];

    for (let i = 0; i < 100; i++) {
      const mem = encode(storage, {
        content: `episodic filler event number ${i} from daily work log`,
        type: "episodic",
        context: "project:work",
      }, pressureConfig, now + i * 100);
      episodicIds.push(mem.id);
    }

    for (let i = 0; i < 30; i++) {
      const mem = encode(storage, {
        content: `semantic knowledge fact ${i} about system architecture`,
        type: "semantic",
        context: "project:arch",
      }, pressureConfig, now + 10000 + i * 100);
      semanticIds.push(mem.id);
    }

    for (let i = 0; i < 20; i++) {
      const mem = encode(storage, {
        content: `procedural skill ${i} for deployment rollback procedure`,
        type: "procedural",
        context: "project:ops",
      }, pressureConfig, now + 13000 + i * 100);
      proceduralIds.push(mem.id);
    }

    const consolidateTime = now + day * 60;
    consolidate(storage, pressureConfig, consolidateTime);

    const survivingProcedural = proceduralIds.filter((id) => storage.getMemory(id) !== null);

    console.log(`[Memory Pressure] Procedural: ${survivingProcedural.length}/20 survived after 60 days`);

    expect(survivingProcedural.length).toBe(20);
  });

  test("repeated access rescues memories from pruning", () => {
    const storage = makeStorage();
    const now = 1000000000;
    const day = 86400000;
    const pressureConfig: CognitiveConfig = { ...config, pruningThreshold: -6.5 };

    const accessedIds: string[] = [];
    const neglectedIds: string[] = [];

    for (let i = 0; i < 100; i++) {
      const mem = encode(storage, {
        content: `memory item number ${i} about various engineering topics`,
        type: "episodic",
        context: "project:general",
      }, pressureConfig, now + i * 100);

      if (i < 10) {
        accessedIds.push(mem.id);
        storage.logAccess(mem.id, "recall", now + day * 10);
        storage.logAccess(mem.id, "recall", now + day * 25);
        storage.logAccess(mem.id, "recall", now + day * 40);
      } else {
        neglectedIds.push(mem.id);
      }
    }

    consolidate(storage, pressureConfig, now + day * 45);

    const survivingAccessed = accessedIds.filter((id) => storage.getMemory(id) !== null);
    const survivingNeglected = neglectedIds.filter((id) => storage.getMemory(id) !== null);

    console.log(`[Memory Pressure] Accessed: ${survivingAccessed.length}/10, Neglected: ${survivingNeglected.length}/90`);

    expect(survivingAccessed.length).toBe(10);
    expect(survivingNeglected.length).toBeLessThan(90);
  });
});

describe("Stress Testing", () => {
  test("recall latency bounded at 500 memories", async () => {
    const storage = makeStorage();
    const now = 1000000000;
    const corpus = generateCorpus(500);

    for (let i = 0; i < corpus.length; i++) {
      encode(storage, corpus[i]!, config, now + i * 100);
    }

    const queries = [
      "payment service configuration",
      "database optimization query",
      "frontend rendering performance",
      "kubernetes deployment scaling",
      "authentication security token",
      "API endpoint documentation",
      "testing integration coverage",
      "mobile application navigation",
      "docker container orchestration",
      "monitoring alerting dashboard",
    ];

    const latencies: number[] = [];
    for (const q of queries) {
      const ms = await measureMs(() => {
        recall(storage, q, config, {
          deterministic: true,
          now: now + 50100,
          limit: 10,
        });
      });
      latencies.push(ms);
    }

    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const max = Math.max(...latencies);

    console.log(`[Stress] 500-memory recall: avg=${avg.toFixed(1)}ms, max=${max.toFixed(1)}ms`);

    expect(max).toBeLessThan(500);
    expect(avg).toBeLessThan(200);

    storage.close();
  }, 15000);

  test("recall correctness at 500 memories", () => {
    const storage = makeStorage();
    const now = 1000000000;
    const corpus = generateCorpus(500);

    const memoryIds: string[] = [];
    for (let i = 0; i < corpus.length; i++) {
      const mem = encode(storage, corpus[i]!, config, now + i * 100);
      memoryIds.push(mem.id);
    }

    const queries = [
      "payment service retry logic",
      "database query optimization index",
      "frontend component rendering",
      "kubernetes deployment scaling",
      "authentication token rotation",
      "API endpoint rate limiting",
      "testing coverage integration",
      "mobile push notification",
      "docker container registry",
      "monitoring alerts prometheus",
    ];

    let totalMrr = 0;
    for (const cue of queries) {
      const results = recall(storage, cue, config, {
        deterministic: true,
        now: now + 50100,
        limit: 10,
      });
      const retrievedIndices = results.map((r) => memoryIds.indexOf(r.memory.id)).filter((i) => i >= 0);
      const relevant = corpus
        .map((m, i) => ({ m, i }))
        .filter(({ m }) => cue.split(" ").some((w) => m.content.includes(w)))
        .map(({ i }) => i);
      if (relevant.length > 0) {
        totalMrr += mrr(retrievedIndices, relevant);
      }
    }

    const avgMrr = totalMrr / queries.length;
    console.log(`[Stress] 500-memory MRR: ${(avgMrr * 100).toFixed(1)}%`);
    expect(avgMrr).toBeGreaterThan(0.03);

    storage.close();
  });

  test("encode throughput at scale", async () => {
    const storage = makeStorage();
    const now = 1000000000;
    const corpus = generateCorpus(500);

    const elapsed = await measureMs(() => {
      for (let i = 0; i < corpus.length; i++) {
        encode(storage, corpus[i]!, config, now + i * 100);
      }
    });

    console.log(`[Stress] 500 encodes: ${elapsed.toFixed(1)}ms`);
    expect(elapsed).toBeLessThan(3000);

    storage.close();
  });
});

describe("Consolidation at Scale", () => {
  test("100-memory consolidation timing", async () => {
    const storage = makeStorage();
    const now = 1000000000;
    const corpus = generateCorpus(100);

    for (let i = 0; i < corpus.length; i++) {
      encode(storage, corpus[i]!, config, now + i * 100);
    }

    let result: ReturnType<typeof consolidate>;
    const elapsed = await measureMs(() => {
      result = consolidate(storage, config, now + 10100);
    });

    console.log(`[Consolidation] 100 memories: ${elapsed.toFixed(1)}ms, associations: ${result!.associationsDiscovered}`);
    expect(elapsed).toBeLessThan(3000);
    expect(result!.associationsDiscovered).toBeGreaterThan(0);

    storage.close();
  });

  test("250-memory consolidation timing", async () => {
    const storage = makeStorage();
    const now = 1000000000;
    const corpus = generateCorpus(250);

    for (let i = 0; i < corpus.length; i++) {
      encode(storage, corpus[i]!, config, now + i * 100);
    }

    let result: ReturnType<typeof consolidate>;
    const elapsed = await measureMs(() => {
      result = consolidate(storage, config, now + 25100);
    });

    console.log(`[Consolidation] 250 memories: ${elapsed.toFixed(1)}ms, associations: ${result!.associationsDiscovered}`);
    expect(elapsed).toBeLessThan(8000);

    storage.close();
  }, 10000);
});

describe("Association Graph Properties", () => {
  test("fan count distribution after 100-memory consolidation", () => {
    const storage = makeStorage();
    const now = 1000000000;
    const corpus = generateCorpus(100);

    const memoryIds: string[] = [];
    for (let i = 0; i < corpus.length; i++) {
      const mem = encode(storage, corpus[i]!, config, now + i * 100);
      memoryIds.push(mem.id);
    }

    consolidate(storage, config, now + 10100);

    const fanCounts = memoryIds.map((id) => storage.getFanCount(id));

    const min = Math.min(...fanCounts);
    const max = Math.max(...fanCounts);
    const mean = fanCounts.reduce((a, b) => a + b, 0) / fanCounts.length;
    const sorted = [...fanCounts].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;

    console.log(`[Graph] Fan count: min=${min}, max=${max}, mean=${mean.toFixed(1)}, median=${median}`);

    expect(max).toBeLessThan(100);
    expect(mean).toBeGreaterThan(2);

    storage.close();
  });
});
