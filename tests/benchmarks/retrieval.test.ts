import { test, expect, describe } from "bun:test";
import { EngramStorage } from "../../src/storage/sqlite.ts";
import { encode } from "../../src/core/encoder.ts";
import { recall } from "../../src/core/recall.ts";
import { consolidate } from "../../src/core/consolidation.ts";
import { DEFAULT_CONFIG, type CognitiveConfig } from "../../src/config/defaults.ts";
import type { Emotion, MemoryType } from "../../src/core/memory.ts";

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

function precision(retrieved: number[], relevant: number[]): number {
  if (retrieved.length === 0) return 0;
  const hits = retrieved.filter((id) => relevant.includes(id)).length;
  return hits / retrieved.length;
}

function recallRate(retrieved: number[], relevant: number[]): number {
  if (relevant.length === 0) return 1;
  const hits = retrieved.filter((id) => relevant.includes(id)).length;
  return hits / relevant.length;
}

function mrr(retrieved: number[], relevant: number[]): number {
  for (let i = 0; i < retrieved.length; i++) {
    if (relevant.includes(retrieved[i]!)) return 1 / (i + 1);
  }
  return 0;
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
