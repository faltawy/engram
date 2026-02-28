import { test, expect, describe } from "bun:test";
import { EngramStorage } from "../../src/storage/sqlite.ts";
import { encode } from "../../src/core/encoder.ts";
import { recall } from "../../src/core/recall.ts";
import { consolidate } from "../../src/core/consolidation.ts";
import { DEFAULT_CONFIG, type CognitiveConfig } from "../../src/config/defaults.ts";
import type { Emotion, MemoryType } from "../../src/core/memory.ts";
import { precision, recallRate, mrr, generateCorpus, generateInterferingCorpus } from "./helpers.ts";

const config: CognitiveConfig = {
  ...DEFAULT_CONFIG,
  activationNoise: 0,
  retrievalThreshold: -10.0,
};

function makeStorage() {
  return EngramStorage.inMemory();
}

interface MemorySpec {
  content: string;
  type: MemoryType;
  emotion?: Emotion;
  emotionWeight?: number;
  context?: string;
}

interface QuerySpec {
  cue: string;
  expected: number[];
  context?: string;
}

const corpus: MemorySpec[] = [
  { content: "fixed memory leak in connection pool by adding timeout", type: "episodic", context: "project:backend", emotion: "satisfaction", emotionWeight: 0.5 },
  { content: "database query optimization reduced response time by 40%", type: "episodic", context: "project:backend", emotion: "joy", emotionWeight: 0.6 },
  { content: "user authentication flow uses JWT tokens with refresh rotation", type: "semantic", context: "project:auth" },
  { content: "redis cache invalidation strategy uses pub/sub pattern", type: "semantic", context: "project:backend" },
  { content: "frontend bundle size reduced from 2MB to 500KB using code splitting", type: "episodic", context: "project:frontend", emotion: "satisfaction", emotionWeight: 0.5 },
  { content: "API rate limiting implemented with sliding window algorithm", type: "semantic", context: "project:backend" },
  { content: "deployment pipeline uses blue-green strategy for zero downtime", type: "procedural", context: "project:devops" },
  { content: "monitoring alerts configured for CPU usage above 80%", type: "procedural", context: "project:devops" },
  { content: "graphql schema design follows relay specification for pagination", type: "semantic", context: "project:api" },
  { content: "websocket connections managed with heartbeat keepalive mechanism", type: "semantic", context: "project:backend" },
  { content: "CSS modules prevent style conflicts in micro-frontend architecture", type: "semantic", context: "project:frontend" },
  { content: "error handling middleware catches unhandled promise rejections", type: "procedural", context: "project:backend" },
  { content: "database migration scripts versioned with sequential numbering", type: "procedural", context: "project:backend" },
  { content: "user session timeout set to 30 minutes with activity extension", type: "semantic", context: "project:auth" },
  { content: "logging pipeline sends structured JSON to elasticsearch", type: "procedural", context: "project:devops" },
  { content: "react component testing uses testing library over enzyme", type: "semantic", context: "project:frontend" },
  { content: "CI pipeline runs unit tests integration tests and linting in parallel", type: "procedural", context: "project:devops" },
  { content: "memory leak investigation found unclosed database connections", type: "episodic", context: "project:backend", emotion: "frustration", emotionWeight: 0.7 },
  { content: "production outage caused by misconfigured load balancer health checks", type: "episodic", context: "project:devops", emotion: "anxiety", emotionWeight: 0.8 },
  { content: "refactored authentication to support OAuth2 and SAML providers", type: "episodic", context: "project:auth", emotion: "satisfaction", emotionWeight: 0.4 },
  { content: "typescript strict mode enabled across all backend services", type: "episodic", context: "project:backend" },
  { content: "load testing revealed bottleneck in serialization layer", type: "episodic", context: "project:backend", emotion: "curiosity", emotionWeight: 0.4 },
  { content: "docker compose setup for local development with hot reload", type: "procedural", context: "project:devops" },
  { content: "password hashing migrated from bcrypt to argon2id", type: "episodic", context: "project:auth", emotion: "satisfaction", emotionWeight: 0.3 },
  { content: "frontend state management migrated from redux to zustand", type: "episodic", context: "project:frontend" },
  { content: "API versioning strategy uses URL path prefix v1 v2", type: "semantic", context: "project:api" },
  { content: "database connection pooling configured with min 5 max 20 connections", type: "semantic", context: "project:backend" },
  { content: "cron job schedules nightly data aggregation for analytics dashboard", type: "procedural", context: "project:backend" },
  { content: "SSL certificate renewal automated with certbot and nginx", type: "procedural", context: "project:devops" },
  { content: "input validation sanitizes HTML to prevent XSS attacks", type: "semantic", context: "project:auth" },
  { content: "feature flags managed through launchdarkly for gradual rollouts", type: "semantic", context: "project:backend" },
  { content: "GraphQL resolvers use dataloader for N+1 query prevention", type: "semantic", context: "project:api" },
  { content: "backup strategy includes daily snapshots and point-in-time recovery", type: "procedural", context: "project:devops" },
  { content: "user notification preferences stored in separate microservice", type: "semantic", context: "project:backend" },
  { content: "end-to-end tests run nightly against staging environment", type: "procedural", context: "project:devops" },
  { content: "API gateway handles request routing and authentication", type: "semantic", context: "project:api" },
  { content: "kubernetes horizontal pod autoscaler configured for CPU and memory", type: "procedural", context: "project:devops" },
  { content: "search indexing uses elasticsearch with custom analyzers for fuzzy matching", type: "semantic", context: "project:backend" },
  { content: "frontend accessibility audit found 12 WCAG violations to fix", type: "episodic", context: "project:frontend", emotion: "frustration", emotionWeight: 0.5 },
  { content: "microservice communication uses gRPC for internal and REST for external", type: "semantic", context: "project:api" },
  { content: "cache warming strategy preloads popular items on deployment", type: "semantic", context: "project:backend" },
  { content: "user avatar upload resized to thumbnails using sharp library", type: "semantic", context: "project:frontend" },
  { content: "distributed tracing implemented with opentelemetry and jaeger", type: "procedural", context: "project:devops" },
  { content: "rate limit exceeded errors return 429 with retry-after header", type: "semantic", context: "project:api" },
  { content: "database read replicas configured for analytics queries", type: "semantic", context: "project:backend" },
  { content: "rollback procedure documented for each microservice deployment", type: "procedural", context: "project:devops" },
  { content: "content delivery network configured for static assets with 1 year cache", type: "semantic", context: "project:frontend" },
  { content: "event sourcing pattern used for audit trail in financial transactions", type: "semantic", context: "project:backend" },
  { content: "smoke tests verify critical user flows after each deployment", type: "procedural", context: "project:devops" },
  { content: "circuit breaker pattern prevents cascade failures between services", type: "semantic", context: "project:backend" },
];

const queries: QuerySpec[] = [
  { cue: "memory leak fix", expected: [0, 17] },
  { cue: "database performance optimization", expected: [1, 21, 27, 44] },
  { cue: "authentication security", expected: [2, 13, 19, 23, 29] },
  { cue: "cache strategy", expected: [3, 40, 46] },
  { cue: "frontend performance", expected: [4, 24, 46] },
  { cue: "rate limiting API", expected: [5, 43] },
  { cue: "deployment strategy", expected: [6, 45] },
  { cue: "monitoring and alerting", expected: [7, 42] },
  { cue: "graphql pagination", expected: [8, 31] },
  { cue: "error handling", expected: [11, 49] },
  { cue: "production incident outage", expected: [18] },
  { cue: "testing strategy", expected: [15, 16, 34, 48] },
  { cue: "docker development setup", expected: [22] },
  { cue: "kubernetes autoscaling", expected: [36] },
  { cue: "search functionality", expected: [37] },
  { cue: "microservice communication patterns", expected: [39, 49] },
  { cue: "security vulnerabilities", expected: [29, 23] },
  { cue: "CSS styling architecture", expected: [10] },
  { cue: "backup and recovery", expected: [32] },
  { cue: "observability tracing", expected: [42, 14] },
];

describe("Tier 1: Retrieval Quality", () => {
  test("baseline precision, recall, and MRR across 20 queries", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const memoryIds: string[] = [];
    for (let i = 0; i < corpus.length; i++) {
      const spec = corpus[i]!;
      const mem = encode(storage, spec, config, now + i * 100);
      memoryIds.push(mem.id);
    }

    consolidate(storage, config, now + corpus.length * 100 + 1000);

    let totalPrecision = 0;
    let totalRecall = 0;
    let totalMrr = 0;

    for (const q of queries) {
      const results = recall(storage, q.cue, config, {
        deterministic: true,
        now: now + corpus.length * 100 + 2000,
        limit: 10,
      });

      const retrievedIndices = results.map((r) => memoryIds.indexOf(r.memory.id)).filter((i) => i >= 0);

      totalPrecision += precision(retrievedIndices, q.expected);
      totalRecall += recallRate(retrievedIndices, q.expected);
      totalMrr += mrr(retrievedIndices, q.expected);
    }

    const avgPrecision = totalPrecision / queries.length;
    const avgRecall = totalRecall / queries.length;
    const avgMrr = totalMrr / queries.length;

    console.log(`[Retrieval Quality] Precision: ${(avgPrecision * 100).toFixed(1)}%`);
    console.log(`[Retrieval Quality] Recall: ${(avgRecall * 100).toFixed(1)}%`);
    console.log(`[Retrieval Quality] MRR: ${(avgMrr * 100).toFixed(1)}%`);

    expect(avgRecall).toBeGreaterThan(0.15);
    expect(avgMrr).toBeGreaterThan(0.05);

    storage.close();
  });

  test("context-filtered retrieval improves precision", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const memoryIds: string[] = [];
    for (let i = 0; i < corpus.length; i++) {
      const spec = corpus[i]!;
      const mem = encode(storage, spec, config, now + i * 100);
      memoryIds.push(mem.id);
    }

    consolidate(storage, config, now + corpus.length * 100 + 1000);

    const unfilteredResults = recall(storage, "deployment strategy", config, {
      deterministic: true,
      now: now + corpus.length * 100 + 2000,
      limit: 10,
    });

    const filteredResults = recall(storage, "deployment strategy", config, {
      deterministic: true,
      now: now + corpus.length * 100 + 2000,
      limit: 10,
      context: "project:devops",
    });

    const unfilteredDevops = unfilteredResults.filter((r) => r.memory.context === "project:devops").length;
    const filteredDevops = filteredResults.filter((r) => r.memory.context === "project:devops").length;

    expect(filteredDevops).toBeGreaterThanOrEqual(unfilteredDevops);

    storage.close();
  });

  test("emotional memories get retrieval boost", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const neutral = encode(storage, {
      content: "routine code review completed",
      type: "episodic",
      context: "project:dev",
    }, config, now);

    const emotional = encode(storage, {
      content: "critical production bug in code review",
      type: "episodic",
      context: "project:dev",
      emotion: "anxiety",
      emotionWeight: 0.8,
    }, config, now + 100);

    const results = recall(storage, "code review", config, {
      deterministic: true,
      now: now + 5000,
      limit: 10,
    });

    const neutralResult = results.find((r) => r.memory.id === neutral.id);
    const emotionalResult = results.find((r) => r.memory.id === emotional.id);

    expect(emotionalResult).toBeDefined();
    expect(neutralResult).toBeDefined();
    expect(emotionalResult!.activation).toBeGreaterThan(neutralResult!.activation);

    storage.close();
  });

  test("associations improve recall of indirectly-related memories", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const memA = encode(storage, {
      content: "investigated slow API response times",
      type: "episodic",
      context: "project:perf",
    }, config, now);

    const memB = encode(storage, {
      content: "database query plan showed full table scan",
      type: "episodic",
      context: "project:perf",
    }, config, now + 100);

    const memC = encode(storage, {
      content: "added composite index to orders table",
      type: "episodic",
      context: "project:perf",
    }, config, now + 200);

    consolidate(storage, config, now + 1000);

    const results = recall(storage, "slow API", config, {
      deterministic: true,
      now: now + 2000,
      limit: 10,
    });

    const foundA = results.some((r) => r.memory.id === memA.id);
    expect(foundA).toBe(true);

    const foundBorC = results.some((r) => r.memory.id === memB.id || r.memory.id === memC.id);
    expect(foundBorC).toBe(true);

    storage.close();
  });
});

describe("Scale Retrieval Quality", () => {
  function runScaleTest(size: number, queryCount: number) {
    const storage = makeStorage();
    const now = 1000000000;
    const corpus = generateCorpus(size);

    const memoryIds: string[] = [];
    for (let i = 0; i < corpus.length; i++) {
      const mem = encode(storage, corpus[i]!, config, now + i * 100);
      memoryIds.push(mem.id);
    }

    const scaleQueries = [
      "payment service retry logic",
      "database query optimization index",
      "frontend component rendering performance",
      "kubernetes deployment scaling",
      "authentication token rotation security",
      "API endpoint rate limiting",
      "testing coverage integration mock",
      "mobile push notification offline",
      "docker container registry helm",
      "monitoring alerts prometheus grafana",
      "cache invalidation strategy redis",
      "websocket connection handler",
      "CI/CD pipeline automated build",
      "load balancer health check",
      "search indexing elasticsearch",
    ].slice(0, queryCount);

    let totalPrecision = 0;
    let totalRecall = 0;
    let totalMrr = 0;

    for (const cue of scaleQueries) {
      const results = recall(storage, cue, config, {
        deterministic: true,
        now: now + size * 100 + 2000,
        limit: 10,
      });

      const retrievedIndices = results.map((r) => memoryIds.indexOf(r.memory.id)).filter((i) => i >= 0);
      const relevant = corpus
        .map((m, i) => ({ m, i }))
        .filter(({ m }) => cue.split(" ").some((w) => m.content.includes(w)))
        .map(({ i }) => i);

      if (relevant.length > 0) {
        totalPrecision += precision(retrievedIndices, relevant);
        totalRecall += recallRate(retrievedIndices, relevant);
        totalMrr += mrr(retrievedIndices, relevant);
      }
    }

    storage.close();

    return {
      avgPrecision: totalPrecision / queryCount,
      avgRecall: totalRecall / queryCount,
      avgMrr: totalMrr / queryCount,
    };
  }

  test("precision/recall/MRR at 100 memories", () => {
    const { avgRecall, avgPrecision, avgMrr } = runScaleTest(100, 10);
    console.log(`[Scale 100] P=${(avgPrecision * 100).toFixed(1)}% R=${(avgRecall * 100).toFixed(1)}% MRR=${(avgMrr * 100).toFixed(1)}%`);
    expect(avgRecall).toBeGreaterThan(0.10);
  });

  test("precision/recall/MRR at 250 memories", () => {
    const { avgRecall, avgPrecision, avgMrr } = runScaleTest(250, 15);
    console.log(`[Scale 250] P=${(avgPrecision * 100).toFixed(1)}% R=${(avgRecall * 100).toFixed(1)}% MRR=${(avgMrr * 100).toFixed(1)}%`);
    expect(avgRecall).toBeGreaterThan(0.08);
  });

  test("precision/recall/MRR at 500 memories", () => {
    const { avgRecall, avgPrecision, avgMrr } = runScaleTest(500, 15);
    console.log(`[Scale 500] P=${(avgPrecision * 100).toFixed(1)}% R=${(avgRecall * 100).toFixed(1)}% MRR=${(avgMrr * 100).toFixed(1)}%`);
    expect(avgRecall).toBeGreaterThan(0.05);
  }, 15000);

  test("degradation curve across sizes", () => {
    const sharedQueries = [
      "payment service retry logic",
      "database query optimization index",
      "frontend component rendering",
      "kubernetes deployment scaling",
      "authentication token rotation",
    ];
    const sizes = [50, 100, 250, 500] as const;
    const mrrBySize: Record<number, number> = {};

    for (const size of sizes) {
      const storage = makeStorage();
      const now = 1000000000;
      const corpus = generateCorpus(size);

      const memoryIds: string[] = [];
      for (let i = 0; i < corpus.length; i++) {
        const mem = encode(storage, corpus[i]!, config, now + i * 100);
        memoryIds.push(mem.id);
      }

      let totalMrr = 0;
      for (const cue of sharedQueries) {
        const results = recall(storage, cue, config, {
          deterministic: true,
          now: now + size * 100 + 2000,
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

      mrrBySize[size] = totalMrr / sharedQueries.length;
      storage.close();
    }

    console.log(
      `[Scale Degradation] 50: ${(mrrBySize[50]! * 100).toFixed(1)}%, 100: ${(mrrBySize[100]! * 100).toFixed(1)}%, 250: ${(mrrBySize[250]! * 100).toFixed(1)}%, 500: ${(mrrBySize[500]! * 100).toFixed(1)}%`
    );

    expect(mrrBySize[500]!).toBeGreaterThanOrEqual(mrrBySize[50]! * 0.3);
  }, 15000);
});

describe("Interference & Competition", () => {
  test("disambiguates 'pool' across contexts", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const poolCorpus = generateInterferingCorpus("pool", [
      {
        context: "domain:connection-pool",
        templates: [
          "connection {keyword} exhaustion causing timeout errors",
          "database {keyword} size configured to 20 connections",
          "{keyword} manager handles connection lifecycle",
          "max {keyword} connections reached during peak traffic",
          "{keyword} idle timeout set to 30 seconds",
          "connection {keyword} monitoring added to dashboard",
          "{keyword} drain on graceful shutdown implemented",
          "dynamic {keyword} sizing based on load metrics",
          "connection {keyword} leak detected in service",
          "{keyword} saturation alert configured at 80%",
        ],
      },
      {
        context: "domain:thread-pool",
        templates: [
          "thread {keyword} executor with fixed size workers",
          "worker {keyword} processes background jobs",
          "{keyword} thread count tuned for CPU cores",
          "task queue overflow in thread {keyword}",
          "{keyword} shutdown awaits pending tasks",
          "thread {keyword} deadlock detected under load",
          "{keyword} fork-join framework for parallel tasks",
          "bounded thread {keyword} prevents resource starvation",
          "{keyword} work stealing algorithm implemented",
          "thread {keyword} monitoring for blocked threads",
        ],
      },
      {
        context: "domain:data-pool",
        templates: [
          "data {keyword} aggregates metrics from sensors",
          "{keyword} of training data preprocessed for model",
          "shared data {keyword} between microservices",
          "object {keyword} pattern for memory allocation",
          "{keyword} allocator reduces garbage collection",
          "buffer {keyword} for batch processing pipeline",
          "resource {keyword} with lazy initialization",
          "memory {keyword} pre-allocated for hot path",
          "data {keyword} partitioned by region",
          "{keyword} of user events for analytics",
        ],
      },
    ], 10);

    for (let i = 0; i < poolCorpus.length; i++) {
      encode(storage, poolCorpus[i]!, config, now + i * 100);
    }

    consolidate(storage, config, now + poolCorpus.length * 100 + 1000);

    const filteredResults = recall(storage, "pool exhaustion under load", config, {
      deterministic: true,
      now: now + poolCorpus.length * 100 + 5000,
      limit: 5,
      context: "domain:connection-pool",
    });
    const allConnectionPool = filteredResults.every((r) => r.memory.context === "domain:connection-pool");
    expect(allConnectionPool).toBe(true);

    const unfilteredResults = recall(storage, "pool exhaustion under load", config, {
      deterministic: true,
      now: now + poolCorpus.length * 100 + 6000,
      limit: 5,
    });
    const topResult = unfilteredResults[0];
    expect(topResult).toBeDefined();
    expect(topResult!.memory.context).toBe("domain:connection-pool");

    storage.close();
  });

  test("competing 'cache' memories resolved by specificity", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const cacheMemories = [
      { content: "redis cache invalidation using pub/sub pattern", type: "episodic" as const, context: "cache:redis" },
      { content: "redis cache TTL strategy for session data", type: "episodic" as const, context: "cache:redis" },
      { content: "redis cache cluster with sentinel failover", type: "episodic" as const, context: "cache:redis" },
      { content: "redis cache memory eviction policy configured LRU", type: "episodic" as const, context: "cache:redis" },
      { content: "redis cache pipeline for bulk operations", type: "episodic" as const, context: "cache:redis" },
      { content: "browser cache headers set for static assets", type: "episodic" as const, context: "cache:browser" },
      { content: "browser cache service worker for offline support", type: "episodic" as const, context: "cache:browser" },
      { content: "browser cache local storage for user preferences", type: "episodic" as const, context: "cache:browser" },
      { content: "browser cache IndexedDB for large data sets", type: "episodic" as const, context: "cache:browser" },
      { content: "browser cache manifest for progressive web app", type: "episodic" as const, context: "cache:browser" },
      { content: "CPU cache line alignment for struct layout", type: "episodic" as const, context: "cache:cpu" },
      { content: "CPU cache miss profiling with perf tools", type: "episodic" as const, context: "cache:cpu" },
      { content: "CPU cache prefetch hints for sequential access", type: "episodic" as const, context: "cache:cpu" },
      { content: "CPU cache coherence protocol in multicore", type: "episodic" as const, context: "cache:cpu" },
      { content: "CPU cache false sharing between threads", type: "episodic" as const, context: "cache:cpu" },
      { content: "DNS cache poisoning prevention with DNSSEC", type: "episodic" as const, context: "cache:dns" },
      { content: "DNS cache TTL configuration for domain records", type: "episodic" as const, context: "cache:dns" },
      { content: "DNS cache flush procedure for testing", type: "episodic" as const, context: "cache:dns" },
      { content: "DNS cache resolver performance tuning", type: "episodic" as const, context: "cache:dns" },
      { content: "DNS cache negative caching for NXDOMAIN", type: "episodic" as const, context: "cache:dns" },
    ];

    for (let i = 0; i < cacheMemories.length; i++) {
      encode(storage, cacheMemories[i]!, config, now + i * 100);
    }

    consolidate(storage, config, now + cacheMemories.length * 100 + 1000);

    const filteredResults = recall(storage, "redis cache invalidation", config, {
      deterministic: true,
      now: now + cacheMemories.length * 100 + 5000,
      limit: 5,
      context: "cache:redis",
    });
    const filteredRedis = filteredResults.filter((r) => r.memory.context === "cache:redis").length;
    expect(filteredRedis).toBeGreaterThanOrEqual(2);

    const unfilteredResults = recall(storage, "redis cache invalidation", config, {
      deterministic: true,
      now: now + cacheMemories.length * 100 + 6000,
      limit: 10,
    });
    const unfilteredRedis = unfilteredResults.filter((r) => r.memory.context === "cache:redis").length;
    expect(unfilteredRedis).toBeGreaterThanOrEqual(1);

    storage.close();
  });
});
