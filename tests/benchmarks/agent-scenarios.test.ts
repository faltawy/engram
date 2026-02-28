import { test, expect, describe } from "bun:test";

import { DEFAULT_CONFIG, type CognitiveConfig } from "../../src/config/defaults.ts";
import { consolidate } from "../../src/core/consolidation.ts";
import { encode } from "../../src/core/encoder.ts";
import type { EncodeInput } from "../../src/core/memory.ts";
import { recall } from "../../src/core/recall.ts";
import { pushFocus } from "../../src/core/working-memory.ts";
import { EngramStorage } from "../../src/storage/sqlite.ts";
import { hitRate, avgRank } from "./helpers.ts";

const config: CognitiveConfig = {
  ...DEFAULT_CONFIG,
  activationNoise: 0,
  retrievalThreshold: -10.0,
  pruningThreshold: -20.0,
};

function makeStorage() {
  return EngramStorage.inMemory();
}

describe("Multi-Session Project", () => {
  test("root-cause queries surface investigation chain across sessions", () => {
    const storage = makeStorage();
    const now = 1000000000;
    const day = 86400000;

    const session1: EncodeInput[] = [
      {
        content: "user reported intermittent 500 errors on checkout page",
        type: "episodic",
        context: "project:ecommerce",
        emotion: "anxiety",
        emotionWeight: 0.6,
      },
      {
        content: "checked application logs found null pointer in payment service",
        type: "episodic",
        context: "project:ecommerce",
      },
      {
        content: "payment service connects to stripe API through gateway proxy",
        type: "semantic",
        context: "project:ecommerce",
      },
      {
        content: "gateway proxy has connection pool limit of 10 concurrent",
        type: "semantic",
        context: "project:ecommerce",
      },
      {
        content: "hypothesis: connection pool exhaustion during peak traffic",
        type: "episodic",
        context: "project:ecommerce",
        emotion: "curiosity",
        emotionWeight: 0.4,
      },
    ];

    const session2: EncodeInput[] = [
      {
        content: "added connection pool metrics to grafana dashboard",
        type: "episodic",
        context: "project:ecommerce",
      },
      {
        content: "observed pool saturation at 100% during 2pm-4pm window",
        type: "episodic",
        context: "project:ecommerce",
        emotion: "satisfaction",
        emotionWeight: 0.5,
      },
      {
        content: "increased gateway pool size from 10 to 50 connections",
        type: "episodic",
        context: "project:ecommerce",
      },
      {
        content: "added circuit breaker to payment service for pool exhaustion",
        type: "episodic",
        context: "project:ecommerce",
      },
    ];

    const session3: EncodeInput[] = [
      {
        content: "monitored checkout error rate dropped to zero after pool fix",
        type: "episodic",
        context: "project:ecommerce",
        emotion: "satisfaction",
        emotionWeight: 0.7,
      },
      {
        content: "retrospective: root cause was undersized connection pool in gateway",
        type: "semantic",
        context: "project:ecommerce",
      },
      {
        content: "lesson learned: always monitor connection pool utilization",
        type: "semantic",
        context: "project:ecommerce",
      },
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
      {
        content: "TypeError cannot read property map of undefined in UserList component",
        type: "episodic",
        context: "debug:typeerror",
        emotion: "frustration",
        emotionWeight: 0.6,
      },
      {
        content: "UserList receives props from parent but data fetch returns null before loading",
        type: "episodic",
        context: "debug:typeerror",
      },
      {
        content: "added null check and loading state to UserList component",
        type: "episodic",
        context: "debug:typeerror",
        emotion: "satisfaction",
        emotionWeight: 0.4,
      },
      {
        content:
          "pattern: always handle loading and error states for async data in React components",
        type: "semantic",
        context: "debug:typeerror",
      },
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
      {
        content: "prefer typescript strict mode for all new projects",
        type: "semantic",
        context: "prefs:coding",
      },
      {
        content: "always use prettier with single quotes and no semicolons",
        type: "semantic",
        context: "prefs:coding",
      },
      {
        content: "prefer functional components over class components in React",
        type: "semantic",
        context: "prefs:coding",
      },
      {
        content: "use bun over npm for package management speed",
        type: "semantic",
        context: "prefs:coding",
      },
      {
        content: "prefer tailwind CSS over styled-components for styling",
        type: "semantic",
        context: "prefs:coding",
      },
      {
        content: "always write tests before implementation TDD workflow",
        type: "semantic",
        context: "prefs:coding",
      },
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

    const earlyConfusion = encode(
      storage,
      {
        content: "monads are confusing abstract math concept in functional programming",
        type: "episodic",
        emotion: "frustration",
        emotionWeight: 0.6,
      },
      config,
      now,
    );

    const midLearning = encode(
      storage,
      {
        content: "monads are like chainable containers that handle side effects",
        type: "semantic",
      },
      config,
      now + day * 3,
    );

    const finalUnderstanding = encode(
      storage,
      {
        content: "monads provide composable error handling and async flow control",
        type: "semantic",
      },
      config,
      now + day * 7,
    );

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
      {
        content: "API design for user management service",
        type: "semantic",
        context: "project:alpha",
      },
      {
        content: "implemented REST endpoints for user CRUD operations",
        type: "episodic",
        context: "project:alpha",
      },
      {
        content: "user service deployed to production successfully",
        type: "episodic",
        context: "project:alpha",
      },
    ];

    const projectB: EncodeInput[] = [
      {
        content: "API design for inventory tracking service",
        type: "semantic",
        context: "project:beta",
      },
      {
        content: "implemented GraphQL endpoints for inventory queries",
        type: "episodic",
        context: "project:beta",
      },
      {
        content: "inventory service deployed to staging environment",
        type: "episodic",
        context: "project:beta",
      },
    ];

    const projectC: EncodeInput[] = [
      {
        content: "API design for notification delivery service",
        type: "semantic",
        context: "project:gamma",
      },
      {
        content: "implemented websocket endpoints for real-time notifications",
        type: "episodic",
        context: "project:gamma",
      },
      {
        content: "notification service load tested for 10000 concurrent users",
        type: "episodic",
        context: "project:gamma",
      },
    ];

    const idsA: string[] = [];
    const idsB: string[] = [];
    const idsC: string[] = [];

    let time = now;
    for (const input of projectA) {
      idsA.push(encode(storage, input, config, time).id);
      time += 1000;
    }
    for (const input of projectB) {
      idsB.push(encode(storage, input, config, time).id);
      time += 1000;
    }
    for (const input of projectC) {
      idsC.push(encode(storage, input, config, time).id);
      time += 1000;
    }

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

    const mem1 = encode(
      storage,
      {
        content: "authentication module uses bcrypt hashing",
        type: "semantic",
        context: "project:webapp",
      },
      config,
      now,
    );

    const mem2 = encode(
      storage,
      {
        content: "session tokens stored in httponly secure cookies",
        type: "semantic",
        context: "project:webapp",
      },
      config,
      now + 1000,
    );

    const mem3 = encode(
      storage,
      {
        content: "password reset flow sends email with time-limited token",
        type: "semantic",
        context: "project:webapp",
      },
      config,
      now + 2000,
    );

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
      {
        content: "started new microservice for payment processing",
        type: "episodic",
        context: "project:payments",
        emotion: "curiosity",
        emotionWeight: 0.4,
      },
      {
        content: "designed database schema with transactions and ledger tables",
        type: "episodic",
        context: "project:payments",
      },
      {
        content: "implemented idempotency keys for payment retry safety",
        type: "episodic",
        context: "project:payments",
        emotion: "satisfaction",
        emotionWeight: 0.4,
      },
      {
        content: "stripe webhook integration handles payment_intent events",
        type: "semantic",
        context: "project:payments",
      },
      {
        content: "added dead letter queue for failed webhook processing",
        type: "episodic",
        context: "project:payments",
      },
      {
        content: "load testing showed 500ms p99 latency for payment creation",
        type: "episodic",
        context: "project:payments",
        emotion: "frustration",
        emotionWeight: 0.5,
      },
      {
        content: "optimized payment creation by batching database writes",
        type: "episodic",
        context: "project:payments",
        emotion: "satisfaction",
        emotionWeight: 0.5,
      },
      {
        content: "p99 latency reduced to 150ms after batching optimization",
        type: "episodic",
        context: "project:payments",
        emotion: "joy",
        emotionWeight: 0.6,
      },
      {
        content: "refund processing implemented with partial refund support",
        type: "episodic",
        context: "project:payments",
      },
      {
        content: "PCI compliance audit checklist reviewed and documented",
        type: "procedural",
        context: "project:payments",
      },
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

describe("Long Time-Scale Project", () => {
  test("60 memories across 4 simulated weeks with cross-week retrieval", () => {
    const storage = makeStorage();
    const now = 1000000000;
    const day = 86400000;
    const week = day * 7;

    const week1: EncodeInput[] = [
      {
        content: "kicked off billing rewrite project sprint planning session",
        type: "episodic",
        context: "project:rewrite",
        emotion: "curiosity",
        emotionWeight: 0.5,
      },
      {
        content: "architecture decision: event-sourced billing with CQRS pattern",
        type: "semantic",
        context: "project:rewrite",
      },
      {
        content: "mapped legacy billing domain models to new schema design",
        type: "episodic",
        context: "project:rewrite",
      },
      {
        content: "discovered legacy discount rules buried in stored procedures",
        type: "episodic",
        context: "project:rewrite",
        emotion: "surprise",
        emotionWeight: 0.6,
      },
      {
        content: "documented 15 distinct discount rule types from legacy system",
        type: "episodic",
        context: "project:rewrite",
      },
      {
        content: "legacy discount rules include volume tiers percentage and fixed amount",
        type: "semantic",
        context: "project:rewrite",
      },
      {
        content: "designed discount engine interface supporting composable rules",
        type: "semantic",
        context: "project:rewrite",
      },
      {
        content: "implemented base billing aggregate with event replay capability",
        type: "episodic",
        context: "project:rewrite",
      },
      {
        content: "set up event store with PostgreSQL and outbox pattern",
        type: "procedural",
        context: "project:rewrite",
      },
      {
        content: "created migration scripts for legacy billing data transformation",
        type: "procedural",
        context: "project:rewrite",
      },
      {
        content: "legacy system handles 50000 invoices monthly during peak",
        type: "semantic",
        context: "project:rewrite",
      },
      {
        content: "defined billing context bounded context with clear aggregate boundaries",
        type: "semantic",
        context: "project:rewrite",
      },
      {
        content: "spike: evaluated temporal workflow engine for billing orchestration",
        type: "episodic",
        context: "project:rewrite",
      },
      {
        content: "decided against temporal due to operational complexity concerns",
        type: "semantic",
        context: "project:rewrite",
      },
      {
        content: "sprint review: completed domain modeling and architecture decisions",
        type: "episodic",
        context: "project:rewrite",
        emotion: "satisfaction",
        emotionWeight: 0.5,
      },
    ];

    const week2: EncodeInput[] = [
      {
        content: "started Stripe payment integration for billing rewrite",
        type: "episodic",
        context: "project:rewrite",
      },
      {
        content: "Stripe payment intent API requires idempotency keys for safety",
        type: "semantic",
        context: "project:rewrite",
      },
      {
        content: "implemented payment intent creation with idempotency key generation",
        type: "episodic",
        context: "project:rewrite",
      },
      {
        content: "configured Stripe webhook endpoint for payment event processing",
        type: "procedural",
        context: "project:rewrite",
      },
      {
        content: "webhook signature verification prevents replay attacks",
        type: "semantic",
        context: "project:rewrite",
      },
      {
        content: "implemented payment retry logic with exponential backoff",
        type: "episodic",
        context: "project:rewrite",
      },
      {
        content: "idempotency ensures retried payments are not double charged",
        type: "semantic",
        context: "project:rewrite",
      },
      {
        content: "added reconciliation job comparing Stripe records with local ledger",
        type: "episodic",
        context: "project:rewrite",
      },
      {
        content: "reconciliation found 3 edge cases in refund timing",
        type: "episodic",
        context: "project:rewrite",
        emotion: "frustration",
        emotionWeight: 0.5,
      },
      {
        content: "fixed refund timing race condition with distributed lock",
        type: "episodic",
        context: "project:rewrite",
        emotion: "satisfaction",
        emotionWeight: 0.5,
      },
      {
        content: "Stripe error handling covers network timeout and rate limit scenarios",
        type: "semantic",
        context: "project:rewrite",
      },
      {
        content: "payment service error codes mapped to customer-facing messages",
        type: "semantic",
        context: "project:rewrite",
      },
      {
        content: "added dead letter queue for unprocessable payment events",
        type: "episodic",
        context: "project:rewrite",
      },
      {
        content: "implemented payment audit trail with immutable event log",
        type: "procedural",
        context: "project:rewrite",
      },
      {
        content: "payment integration passes all Stripe test mode scenarios",
        type: "episodic",
        context: "project:rewrite",
        emotion: "satisfaction",
        emotionWeight: 0.4,
      },
    ];

    const week3: EncodeInput[] = [
      {
        content: "started subscription engine implementation for recurring billing",
        type: "episodic",
        context: "project:rewrite",
      },
      {
        content: "subscription lifecycle: trial activation renewal cancellation states",
        type: "semantic",
        context: "project:rewrite",
      },
      {
        content: "implemented subscription state machine with explicit transitions",
        type: "episodic",
        context: "project:rewrite",
      },
      {
        content: "proration calculates mid-cycle upgrade and downgrade adjustments",
        type: "semantic",
        context: "project:rewrite",
      },
      {
        content: "proration uses daily rate calculation for upgrade credit",
        type: "episodic",
        context: "project:rewrite",
      },
      {
        content: "dunning process retries failed subscription payments three times",
        type: "semantic",
        context: "project:rewrite",
      },
      {
        content: "implemented dunning email sequence: reminder warning suspension",
        type: "episodic",
        context: "project:rewrite",
      },
      {
        content: "usage-based billing tracks metered API calls per subscription",
        type: "semantic",
        context: "project:rewrite",
      },
      {
        content: "usage aggregation runs hourly with 5-minute billing granularity",
        type: "procedural",
        context: "project:rewrite",
      },
      {
        content: "implemented usage billing threshold alerts for customers",
        type: "episodic",
        context: "project:rewrite",
      },
      {
        content: "subscription migration tool handles legacy plan mapping",
        type: "procedural",
        context: "project:rewrite",
      },
      {
        content: "migration dry-run identified 200 accounts needing manual review",
        type: "episodic",
        context: "project:rewrite",
        emotion: "anxiety",
        emotionWeight: 0.4,
      },
      {
        content: "resolved migration conflicts for grandfathered pricing plans",
        type: "episodic",
        context: "project:rewrite",
      },
      {
        content: "subscription engine handles timezone-aware billing cycles",
        type: "semantic",
        context: "project:rewrite",
      },
      {
        content: "all subscription state transitions covered by property-based tests",
        type: "episodic",
        context: "project:rewrite",
        emotion: "satisfaction",
        emotionWeight: 0.4,
      },
    ];

    const week4: EncodeInput[] = [
      {
        content: "started integration testing phase for billing rewrite",
        type: "episodic",
        context: "project:rewrite",
      },
      {
        content: "integration tests cover payment subscription and discount flows",
        type: "procedural",
        context: "project:rewrite",
      },
      {
        content: "shadow billing runs new system in parallel with legacy for comparison",
        type: "episodic",
        context: "project:rewrite",
      },
      {
        content: "shadow billing found 0.3% discrepancy in tax calculation rounding",
        type: "episodic",
        context: "project:rewrite",
        emotion: "frustration",
        emotionWeight: 0.4,
      },
      {
        content: "fixed tax rounding by using banker rounding consistently",
        type: "episodic",
        context: "project:rewrite",
      },
      {
        content: "load testing simulated 100000 concurrent billing operations",
        type: "episodic",
        context: "project:rewrite",
      },
      {
        content: "load test revealed connection pool bottleneck at 80000 ops",
        type: "episodic",
        context: "project:rewrite",
        emotion: "anxiety",
        emotionWeight: 0.5,
      },
      {
        content: "resolved bottleneck by adding read replicas for billing queries",
        type: "episodic",
        context: "project:rewrite",
        emotion: "satisfaction",
        emotionWeight: 0.5,
      },
      {
        content: "production deployment plan uses blue-green with instant rollback",
        type: "procedural",
        context: "project:rewrite",
      },
      {
        content: "rollback procedure tested: switches DNS back to legacy in 30 seconds",
        type: "procedural",
        context: "project:rewrite",
      },
      {
        content: "feature flags control gradual migration of customer cohorts",
        type: "semantic",
        context: "project:rewrite",
      },
      {
        content: "deployed billing rewrite to 5% of traffic as initial canary",
        type: "episodic",
        context: "project:rewrite",
      },
      {
        content: "canary metrics show 40% latency improvement over legacy billing",
        type: "episodic",
        context: "project:rewrite",
        emotion: "joy",
        emotionWeight: 0.7,
      },
      {
        content: "expanded to 50% traffic after 48 hours of clean canary metrics",
        type: "episodic",
        context: "project:rewrite",
      },
      {
        content:
          "billing rewrite retrospective: project completed on schedule with improved architecture",
        type: "episodic",
        context: "project:rewrite",
        emotion: "satisfaction",
        emotionWeight: 0.8,
      },
    ];

    const allIds: string[] = [];
    let time = now;
    const weeks = [week1, week2, week3, week4];
    for (let w = 0; w < weeks.length; w++) {
      for (const input of weeks[w]!) {
        const mem = encode(storage, input, config, time);
        allIds.push(mem.id);
        time += day / 3;
      }
      time = now + (w + 1) * week;
      consolidate(storage, config, time);
    }

    const queryTime = now + 5 * week;

    const recallLimit = 40;
    const week1Ids = allIds.slice(0, 15);
    const week2Ids = allIds.slice(15, 30);
    const week3Ids = allIds.slice(30, 45);
    const week4Ids = allIds.slice(45, 60);

    const q1Results = recall(storage, "legacy discount rules", config, {
      deterministic: true,
      now: queryTime,
      limit: recallLimit,
      context: "project:rewrite",
    });
    const q1Week1 = q1Results.filter((r) => week1Ids.includes(r.memory.id)).length;
    expect(q1Week1).toBeGreaterThan(0);

    const q2Results = recall(storage, "payment retry idempotency", config, {
      deterministic: true,
      now: queryTime,
      limit: recallLimit,
      context: "project:rewrite",
    });
    const q2Week2 = q2Results.filter((r) => week2Ids.includes(r.memory.id)).length;
    expect(q2Week2).toBeGreaterThan(0);

    const q3Results = recall(storage, "subscription proration upgrade", config, {
      deterministic: true,
      now: queryTime,
      limit: recallLimit,
      context: "project:rewrite",
    });
    const q3Week3 = q3Results.filter((r) => week3Ids.includes(r.memory.id)).length;
    expect(q3Week3).toBeGreaterThan(0);

    const q4Results = recall(storage, "production deployment rollback", config, {
      deterministic: true,
      now: queryTime,
      limit: recallLimit,
      context: "project:rewrite",
    });
    const q4Week4 = q4Results.filter((r) => week4Ids.includes(r.memory.id)).length;
    expect(q4Week4).toBeGreaterThan(0);

    const q5Results = recall(storage, "billing rewrite overall progress", config, {
      deterministic: true,
      now: queryTime,
      limit: recallLimit,
      context: "project:rewrite",
    });
    const q5Weeks = new Set(
      q5Results
        .map((r) => {
          const idx = allIds.indexOf(r.memory.id);
          return Math.floor(idx / 15);
        })
        .filter((w) => w >= 0),
    );
    expect(q5Weeks.size).toBeGreaterThanOrEqual(2);

    console.log(
      `[Long Project] Q1(w1): ${q1Week1} Q2(w2): ${q2Week2} Q3(w3): ${q3Week3} Q4(w4): ${q4Week4} Q5(weeks): ${[
        ...q5Weeks,
      ].join(",")}`,
    );

    storage.close();
  });
});
