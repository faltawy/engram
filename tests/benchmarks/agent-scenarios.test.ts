import { test, expect, describe } from "bun:test";
import { EngramStorage } from "../../src/storage/sqlite.ts";
import { encode } from "../../src/core/encoder.ts";
import { recall } from "../../src/core/recall.ts";
import { consolidate } from "../../src/core/consolidation.ts";
import { pushFocus } from "../../src/core/working-memory.ts";
import { DEFAULT_CONFIG, type CognitiveConfig } from "../../src/config/defaults.ts";
import type { EncodeInput } from "../../src/core/memory.ts";

const config: CognitiveConfig = {
  ...DEFAULT_CONFIG,
  activationNoise: 0,
  retrievalThreshold: -10.0,
  pruningThreshold: -20.0,
};

function makeStorage() {
  return EngramStorage.inMemory();
}

function hitRate(results: { memory: { id: string } }[], expectedIds: string[]): number {
  if (expectedIds.length === 0) return 1;
  const found = expectedIds.filter((id) => results.some((r) => r.memory.id === id));
  return found.length / expectedIds.length;
}

function avgRank(results: { memory: { id: string } }[], expectedIds: string[]): number {
  const ranks = expectedIds
    .map((id) => results.findIndex((r) => r.memory.id === id))
    .filter((r) => r >= 0)
    .map((r) => r + 1);
  if (ranks.length === 0) return Infinity;
  return ranks.reduce((a, b) => a + b, 0) / ranks.length;
}

describe("Multi-Session Project", () => {
  test("root-cause queries surface investigation chain across sessions", () => {
    const storage = makeStorage();
    const now = 1000000000;
    const day = 86400000;

    const session1: EncodeInput[] = [
      { content: "user reported intermittent 500 errors on checkout page", type: "episodic", context: "project:ecommerce", emotion: "anxiety", emotionWeight: 0.6 },
      { content: "checked application logs found null pointer in payment service", type: "episodic", context: "project:ecommerce" },
      { content: "payment service connects to stripe API through gateway proxy", type: "semantic", context: "project:ecommerce" },
      { content: "gateway proxy has connection pool limit of 10 concurrent", type: "semantic", context: "project:ecommerce" },
      { content: "hypothesis: connection pool exhaustion during peak traffic", type: "episodic", context: "project:ecommerce", emotion: "curiosity", emotionWeight: 0.4 },
    ];

    const session2: EncodeInput[] = [
      { content: "added connection pool metrics to grafana dashboard", type: "episodic", context: "project:ecommerce" },
      { content: "observed pool saturation at 100% during 2pm-4pm window", type: "episodic", context: "project:ecommerce", emotion: "satisfaction", emotionWeight: 0.5 },
      { content: "increased gateway pool size from 10 to 50 connections", type: "episodic", context: "project:ecommerce" },
      { content: "added circuit breaker to payment service for pool exhaustion", type: "episodic", context: "project:ecommerce" },
    ];

    const session3: EncodeInput[] = [
      { content: "monitored checkout error rate dropped to zero after pool fix", type: "episodic", context: "project:ecommerce", emotion: "satisfaction", emotionWeight: 0.7 },
      { content: "retrospective: root cause was undersized connection pool in gateway", type: "semantic", context: "project:ecommerce" },
      { content: "lesson learned: always monitor connection pool utilization", type: "semantic", context: "project:ecommerce" },
    ];

    const allIds: string[] = [];
    let time = now;
    for (const sessions of [session1, session2, session3]) {
      for (const input of sessions) {
        const mem = encode(storage, input, config, time);
        allIds.push(mem.id);
        time += 1000;
      }
      time += day;
      consolidate(storage, config, time);
    }

    const results = recall(storage, "checkout 500 errors root cause", config, {
      deterministic: true,
      now: time + 10000,
      limit: 15,
    });

    const keyIds = [allIds[0]!, allIds[10]!];
    const rate = hitRate(results, keyIds);
    expect(rate).toBeGreaterThan(0.4);

    storage.close();
  });
});

describe("Debugging History", () => {
  test("similar error recall surfaces past investigation and fix", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const investigation: EncodeInput[] = [
      { content: "TypeError cannot read property map of undefined in UserList component", type: "episodic", context: "debug:typeerror", emotion: "frustration", emotionWeight: 0.6 },
      { content: "UserList receives props from parent but data fetch returns null before loading", type: "episodic", context: "debug:typeerror" },
      { content: "added null check and loading state to UserList component", type: "episodic", context: "debug:typeerror", emotion: "satisfaction", emotionWeight: 0.4 },
      { content: "pattern: always handle loading and error states for async data in React components", type: "semantic", context: "debug:typeerror" },
    ];

    const ids: string[] = [];
    for (let i = 0; i < investigation.length; i++) {
      const mem = encode(storage, investigation[i]!, config, now + i * 1000);
      ids.push(mem.id);
    }

    consolidate(storage, config, now + 100000);

    const results = recall(storage, "TypeError cannot read property of undefined", config, {
      deterministic: true,
      now: now + 200000,
      limit: 10,
    });

    const foundOriginal = results.some((r) => r.memory.id === ids[0]);
    const foundFix = results.some((r) => r.memory.id === ids[2]);
    const foundPattern = results.some((r) => r.memory.id === ids[3]);

    expect(foundOriginal).toBe(true);
    expect(foundFix || foundPattern).toBe(true);

    storage.close();
  });
});

describe("Preference Learning", () => {
  test("scattered preference expressions aggregate on recall", () => {
    const storage = makeStorage();
    const now = 1000000000;
    const day = 86400000;

    const preferences: EncodeInput[] = [
      { content: "prefer typescript strict mode for all new projects", type: "semantic", context: "prefs:coding" },
      { content: "always use prettier with single quotes and no semicolons", type: "semantic", context: "prefs:coding" },
      { content: "prefer functional components over class components in React", type: "semantic", context: "prefs:coding" },
      { content: "use bun over npm for package management speed", type: "semantic", context: "prefs:coding" },
      { content: "prefer tailwind CSS over styled-components for styling", type: "semantic", context: "prefs:coding" },
      { content: "always write tests before implementation TDD workflow", type: "semantic", context: "prefs:coding" },
    ];

    const ids: string[] = [];
    for (let i = 0; i < preferences.length; i++) {
      const mem = encode(storage, preferences[i]!, config, now + i * day);
      ids.push(mem.id);
    }

    consolidate(storage, config, now + preferences.length * day + 1000);

    const results = recall(storage, "coding preferences style", config, {
      deterministic: true,
      now: now + preferences.length * day + 10000,
      limit: 10,
    });

    const rate = hitRate(results, ids);
    expect(rate).toBeGreaterThan(0.3);
    expect(results.length).toBeGreaterThanOrEqual(2);

    storage.close();
  });
});

describe("Knowledge Evolution", () => {
  test("recent understanding weighted over early confusion", () => {
    const storage = makeStorage();
    const now = 1000000000;
    const day = 86400000;

    const earlyConfusion = encode(storage, {
      content: "monads are confusing abstract math concept in functional programming",
      type: "episodic",
      emotion: "frustration",
      emotionWeight: 0.6,
    }, config, now);

    const midLearning = encode(storage, {
      content: "monads are like chainable containers that handle side effects",
      type: "semantic",
    }, config, now + day * 3);

    const finalUnderstanding = encode(storage, {
      content: "monads provide composable error handling and async flow control",
      type: "semantic",
    }, config, now + day * 7);

    for (let i = 0; i < 3; i++) {
      storage.logAccess(finalUnderstanding.id, "recall", now + day * (8 + i));
    }

    const results = recall(storage, "monads functional programming", config, {
      deterministic: true,
      now: now + day * 14,
      limit: 5,
    });

    const finalResult = results.find((r) => r.memory.id === finalUnderstanding.id);
    const earlyResult = results.find((r) => r.memory.id === earlyConfusion.id);

    expect(finalResult).toBeDefined();
    if (earlyResult) {
      expect(finalResult!.activation).toBeGreaterThan(earlyResult.activation);
    }

    storage.close();
  });
});

describe("Context Switching", () => {
  test("memories from different projects don't cross-contaminate", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const projectA: EncodeInput[] = [
      { content: "API design for user management service", type: "semantic", context: "project:alpha" },
      { content: "implemented REST endpoints for user CRUD operations", type: "episodic", context: "project:alpha" },
      { content: "user service deployed to production successfully", type: "episodic", context: "project:alpha" },
    ];

    const projectB: EncodeInput[] = [
      { content: "API design for inventory tracking service", type: "semantic", context: "project:beta" },
      { content: "implemented GraphQL endpoints for inventory queries", type: "episodic", context: "project:beta" },
      { content: "inventory service deployed to staging environment", type: "episodic", context: "project:beta" },
    ];

    const projectC: EncodeInput[] = [
      { content: "API design for notification delivery service", type: "semantic", context: "project:gamma" },
      { content: "implemented websocket endpoints for real-time notifications", type: "episodic", context: "project:gamma" },
      { content: "notification service load tested for 10000 concurrent users", type: "episodic", context: "project:gamma" },
    ];

    const idsA: string[] = [];
    const idsB: string[] = [];
    const idsC: string[] = [];

    let time = now;
    for (const input of projectA) { idsA.push(encode(storage, input, config, time).id); time += 1000; }
    for (const input of projectB) { idsB.push(encode(storage, input, config, time).id); time += 1000; }
    for (const input of projectC) { idsC.push(encode(storage, input, config, time).id); time += 1000; }

    consolidate(storage, config, time + 1000);

    const alphaResults = recall(storage, "API design service", config, {
      deterministic: true,
      now: time + 5000,
      limit: 10,
      context: "project:alpha",
    });

    const alphaIds = alphaResults.map((r) => r.memory.id);
    const contamination = alphaIds.filter((id) => idsB.includes(id) || idsC.includes(id));
    expect(contamination).toHaveLength(0);

    storage.close();
  });

  test("working memory primes recall within active project", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const mem1 = encode(storage, {
      content: "authentication module uses bcrypt hashing",
      type: "semantic",
      context: "project:webapp",
    }, config, now);

    const mem2 = encode(storage, {
      content: "session tokens stored in httponly secure cookies",
      type: "semantic",
      context: "project:webapp",
    }, config, now + 1000);

    const mem3 = encode(storage, {
      content: "password reset flow sends email with time-limited token",
      type: "semantic",
      context: "project:webapp",
    }, config, now + 2000);

    consolidate(storage, config, now + 10000);

    pushFocus(storage, "working on authentication", config, {
      memoryRef: mem1.id,
      now: now + 20000,
    });

    const results = recall(storage, "security tokens", config, {
      deterministic: true,
      now: now + 21000,
      limit: 10,
    });

    const foundRelated = results.some((r) => r.memory.id === mem2.id || r.memory.id === mem3.id);
    expect(foundRelated).toBe(true);

    storage.close();
  });
});

describe("Scenario Scoring", () => {
  test("comprehensive scenario scoring across all dimensions", () => {
    const storage = makeStorage();
    const now = 1000000000;
    const day = 86400000;

    const weekOfWork: EncodeInput[] = [
      { content: "started new microservice for payment processing", type: "episodic", context: "project:payments", emotion: "curiosity", emotionWeight: 0.4 },
      { content: "designed database schema with transactions and ledger tables", type: "episodic", context: "project:payments" },
      { content: "implemented idempotency keys for payment retry safety", type: "episodic", context: "project:payments", emotion: "satisfaction", emotionWeight: 0.4 },
      { content: "stripe webhook integration handles payment_intent events", type: "semantic", context: "project:payments" },
      { content: "added dead letter queue for failed webhook processing", type: "episodic", context: "project:payments" },
      { content: "load testing showed 500ms p99 latency for payment creation", type: "episodic", context: "project:payments", emotion: "frustration", emotionWeight: 0.5 },
      { content: "optimized payment creation by batching database writes", type: "episodic", context: "project:payments", emotion: "satisfaction", emotionWeight: 0.5 },
      { content: "p99 latency reduced to 150ms after batching optimization", type: "episodic", context: "project:payments", emotion: "joy", emotionWeight: 0.6 },
      { content: "refund processing implemented with partial refund support", type: "episodic", context: "project:payments" },
      { content: "PCI compliance audit checklist reviewed and documented", type: "procedural", context: "project:payments" },
    ];

    const ids: string[] = [];
    for (let i = 0; i < weekOfWork.length; i++) {
      const mem = encode(storage, weekOfWork[i]!, config, now + i * (day / 3));
      ids.push(mem.id);
    }

    consolidate(storage, config, now + weekOfWork.length * (day / 3) + 1000);

    const scenarios = [
      {
        query: "payment latency performance issue",
        expectedIds: [ids[5]!, ids[6]!, ids[7]!],
      },
      {
        query: "stripe webhook integration",
        expectedIds: [ids[3]!, ids[4]!],
      },
      {
        query: "payment retry idempotency",
        expectedIds: [ids[2]!],
      },
    ];

    let totalHitRate = 0;
    let totalAvgRank = 0;

    for (const scenario of scenarios) {
      const results = recall(storage, scenario.query, config, {
        deterministic: true,
        now: now + weekOfWork.length * (day / 3) + 10000,
        limit: 10,
      });

      totalHitRate += hitRate(results, scenario.expectedIds);
      totalAvgRank += avgRank(results, scenario.expectedIds);
    }

    const meanHitRate = totalHitRate / scenarios.length;
    const meanAvgRank = totalAvgRank / scenarios.length;

    console.log(`[Agent Scenarios] Mean hit rate: ${(meanHitRate * 100).toFixed(1)}%`);
    console.log(`[Agent Scenarios] Mean avg rank: ${meanAvgRank.toFixed(1)}`);

    expect(meanHitRate).toBeGreaterThan(0.3);

    storage.close();
  });
});
