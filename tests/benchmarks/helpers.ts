import type { EncodeInput } from "../../src/core/memory.ts";

export function precision(retrieved: number[], relevant: number[]): number {
  if (retrieved.length === 0) return 0;
  const hits = retrieved.filter((id) => relevant.includes(id)).length;
  return hits / retrieved.length;
}

export function recallRate(retrieved: number[], relevant: number[]): number {
  if (relevant.length === 0) return 1;
  const hits = retrieved.filter((id) => relevant.includes(id)).length;
  return hits / relevant.length;
}

export function mrr(retrieved: number[], relevant: number[]): number {
  for (let i = 0; i < retrieved.length; i++) {
    if (relevant.includes(retrieved[i]!)) return 1 / (i + 1);
  }
  return 0;
}

export function hitRate(results: { memory: { id: string } }[], expectedIds: string[]): number {
  if (expectedIds.length === 0) return 1;
  const found = expectedIds.filter((id) => results.some((r) => r.memory.id === id));
  return found.length / expectedIds.length;
}

export function avgRank(results: { memory: { id: string } }[], expectedIds: string[]): number {
  const ranks = expectedIds
    .map((id) => results.findIndex((r) => r.memory.id === id))
    .filter((r) => r >= 0)
    .map((r) => r + 1);
  if (ranks.length === 0) return Infinity;
  return ranks.reduce((a, b) => a + b, 0) / ranks.length;
}

function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

const domains: {
  name: string;
  context: string;
  templates: string[];
  slots: string[][];
}[] = [
  {
    name: "backend",
    context: "project:backend",
    templates: [
      "implemented {0} service with {1} pattern",
      "fixed {0} bug in {1} handler",
      "optimized {0} query reducing latency by {1}",
      "refactored {0} module to use {1}",
      "added {0} caching layer with {1} strategy",
      "configured {0} connection pool with {1} limits",
      "deployed {0} service to {1} environment",
      "migrated {0} from {1} to new architecture",
      "integrated {0} with {1} for monitoring",
      "resolved {0} deadlock in {1} transaction",
      "built {0} queue processor for {1} events",
      "added {0} rate limiting to {1} endpoints",
      "implemented {0} retry logic with {1} backoff",
      "upgraded {0} dependency to fix {1} vulnerability",
      "added {0} health check for {1} service",
      "configured {0} logging for {1} debugging",
      "implemented {0} batch processing for {1} records",
      "added {0} validation to {1} input handler",
    ],
    slots: [
      ["payment", "user", "order", "notification", "inventory", "auth", "session", "analytics", "search", "billing"],
      ["repository", "saga", "CQRS", "circuit breaker", "bulkhead", "retry", "pub-sub", "event sourcing", "middleware", "decorator"],
    ],
  },
  {
    name: "frontend",
    context: "project:frontend",
    templates: [
      "built {0} component with {1} state management",
      "fixed {0} rendering issue in {1} view",
      "optimized {0} bundle size using {1}",
      "added {0} animation with {1} library",
      "implemented {0} form with {1} validation",
      "refactored {0} styles to use {1}",
      "added {0} accessibility features to {1}",
      "configured {0} routing for {1} pages",
      "implemented {0} lazy loading for {1}",
      "fixed {0} layout shift in {1} component",
      "added {0} error boundary for {1} section",
      "implemented {0} infinite scroll in {1} list",
      "optimized {0} re-renders in {1} tree",
      "built {0} dashboard with {1} charts",
      "added {0} dark mode toggle to {1}",
      "implemented {0} drag and drop in {1}",
      "fixed {0} memory leak in {1} effect",
      "added {0} skeleton loader for {1}",
    ],
    slots: [
      ["dashboard", "profile", "settings", "checkout", "search", "navigation", "modal", "table", "card", "sidebar"],
      ["zustand", "context API", "redux toolkit", "jotai", "signals", "react query", "SWR", "tanstack", "recoil", "valtio"],
    ],
  },
  {
    name: "devops",
    context: "project:devops",
    templates: [
      "configured {0} pipeline for {1} deployment",
      "set up {0} monitoring with {1} alerts",
      "automated {0} scaling based on {1} metrics",
      "implemented {0} rollback strategy for {1}",
      "configured {0} secrets management using {1}",
      "set up {0} log aggregation with {1}",
      "automated {0} certificate renewal for {1}",
      "configured {0} load balancer with {1} rules",
      "implemented {0} disaster recovery for {1}",
      "set up {0} container registry with {1}",
      "configured {0} network policies for {1}",
      "automated {0} database backup to {1}",
      "set up {0} canary deployment for {1}",
      "configured {0} resource quotas for {1}",
      "implemented {0} chaos testing for {1}",
      "set up {0} service mesh with {1}",
      "configured {0} ingress rules for {1}",
      "automated {0} compliance scanning for {1}",
    ],
    slots: [
      ["CI/CD", "kubernetes", "terraform", "docker", "helm", "ArgoCD", "jenkins", "github-actions", "ansible", "prometheus"],
      ["production", "staging", "development", "canary", "blue-green", "rolling", "shadow", "preview", "hotfix", "release"],
    ],
  },
  {
    name: "security",
    context: "project:security",
    templates: [
      "implemented {0} authentication with {1}",
      "configured {0} encryption for {1} data",
      "added {0} audit logging for {1} actions",
      "implemented {0} access control with {1}",
      "fixed {0} vulnerability in {1} endpoint",
      "configured {0} CORS policy for {1}",
      "added {0} input sanitization to {1}",
      "implemented {0} token rotation for {1}",
      "configured {0} WAF rules for {1}",
      "added {0} rate limiting to prevent {1}",
      "implemented {0} CSP headers for {1}",
      "configured {0} TLS settings for {1}",
      "added {0} security headers to {1}",
      "implemented {0} OAuth flow for {1}",
      "configured {0} session management for {1}",
      "added {0} brute force protection to {1}",
      "implemented {0} API key rotation for {1}",
      "configured {0} secret scanning for {1}",
    ],
    slots: [
      ["JWT", "OAuth2", "SAML", "MFA", "RBAC", "ABAC", "SSO", "OIDC", "LDAP", "Kerberos"],
      ["user login", "API gateway", "admin panel", "webhook", "file upload", "payment", "session", "password reset", "registration", "data export"],
    ],
  },
  {
    name: "database",
    context: "project:database",
    templates: [
      "optimized {0} query with {1} index",
      "migrated {0} schema to support {1}",
      "configured {0} replication for {1}",
      "added {0} partition strategy for {1}",
      "implemented {0} connection pooling with {1}",
      "fixed {0} deadlock in {1} transaction",
      "configured {0} backup schedule for {1}",
      "optimized {0} join performance in {1}",
      "added {0} materialized view for {1}",
      "implemented {0} sharding strategy for {1}",
      "configured {0} vacuum schedule for {1}",
      "migrated {0} data from {1} to new schema",
      "added {0} constraints to {1} table",
      "implemented {0} audit trail for {1}",
      "configured {0} read replica for {1}",
      "optimized {0} bulk insert for {1}",
      "added {0} full-text search to {1}",
      "implemented {0} CDC pipeline for {1}",
    ],
    slots: [
      ["orders", "users", "products", "transactions", "sessions", "events", "logs", "analytics", "inventory", "payments"],
      ["composite", "partial", "covering", "GIN", "BRIN", "hash", "B-tree", "expression", "multi-column", "filtered"],
    ],
  },
  {
    name: "api",
    context: "project:api",
    templates: [
      "designed {0} endpoint for {1} resource",
      "implemented {0} pagination for {1} listing",
      "added {0} versioning to {1} routes",
      "configured {0} rate limiting for {1}",
      "implemented {0} webhook for {1} events",
      "added {0} documentation for {1} API",
      "implemented {0} batch endpoint for {1}",
      "configured {0} caching for {1} responses",
      "added {0} filtering to {1} query",
      "implemented {0} search endpoint for {1}",
      "configured {0} compression for {1} payload",
      "added {0} idempotency to {1} mutation",
      "implemented {0} streaming for {1} data",
      "configured {0} timeout for {1} request",
      "added {0} retry header to {1} response",
      "implemented {0} GraphQL resolver for {1}",
      "configured {0} schema validation for {1}",
      "added {0} error handling to {1} endpoint",
    ],
    slots: [
      ["REST", "GraphQL", "gRPC", "WebSocket", "SSE", "JSON-RPC", "tRPC", "OpenAPI", "AsyncAPI", "Protobuf"],
      ["users", "orders", "products", "payments", "notifications", "analytics", "inventory", "search", "comments", "files"],
    ],
  },
  {
    name: "testing",
    context: "project:testing",
    templates: [
      "wrote {0} tests for {1} module",
      "configured {0} test runner with {1}",
      "added {0} coverage for {1} edge cases",
      "implemented {0} mock for {1} service",
      "set up {0} integration tests for {1}",
      "added {0} snapshot tests for {1}",
      "configured {0} E2E tests with {1}",
      "implemented {0} load test for {1}",
      "added {0} contract tests for {1}",
      "configured {0} test fixtures for {1}",
      "implemented {0} fuzz testing for {1}",
      "added {0} regression test for {1}",
      "configured {0} test parallelism for {1}",
      "implemented {0} property test for {1}",
      "added {0} smoke test for {1}",
      "configured {0} test database for {1}",
      "implemented {0} visual regression for {1}",
      "added {0} performance benchmark for {1}",
    ],
    slots: [
      ["unit", "integration", "E2E", "acceptance", "smoke", "performance", "security", "accessibility", "contract", "mutation"],
      ["auth", "payment", "checkout", "search", "upload", "notification", "billing", "dashboard", "API", "database"],
    ],
  },
  {
    name: "mobile",
    context: "project:mobile",
    templates: [
      "built {0} screen with {1} navigation",
      "fixed {0} crash on {1} devices",
      "optimized {0} rendering for {1} performance",
      "added {0} offline support with {1}",
      "implemented {0} push notification for {1}",
      "configured {0} deep linking for {1}",
      "added {0} biometric auth for {1}",
      "implemented {0} gesture handler for {1}",
      "fixed {0} layout issue on {1} screen size",
      "added {0} analytics tracking for {1}",
      "implemented {0} image caching with {1}",
      "configured {0} app permissions for {1}",
      "added {0} accessibility label to {1}",
      "implemented {0} background sync for {1}",
      "fixed {0} memory leak in {1} screen",
      "added {0} haptic feedback to {1}",
      "implemented {0} local storage with {1}",
      "configured {0} crash reporting for {1}",
    ],
    slots: [
      ["home", "profile", "settings", "feed", "chat", "camera", "map", "search", "detail", "onboarding"],
      ["stack", "tab", "drawer", "modal", "bottom-sheet", "swipe", "native", "webview", "hybrid", "adaptive"],
    ],
  },
];

export function generateCorpus(size: number, seed: number = 42): EncodeInput[] {
  const rng = lcg(seed);
  const result: EncodeInput[] = [];

  for (let i = 0; i < size; i++) {
    const domain = domains[Math.floor(rng() * domains.length)]!;
    const template = domain.templates[Math.floor(rng() * domain.templates.length)]!;
    const slot0 = domain.slots[0]![Math.floor(rng() * domain.slots[0]!.length)]!;
    const slot1 = domain.slots[1]![Math.floor(rng() * domain.slots[1]!.length)]!;
    const content = template.replace("{0}", slot0).replace("{1}", slot1);

    const typeRoll = rng();
    const type = typeRoll < 0.5 ? "episodic" : typeRoll < 0.85 ? "semantic" : "procedural";

    const emotionOptions = ["joy", "anxiety", "frustration", "surprise", "satisfaction", "curiosity"] as const;
    const emotionRoll = rng();
    const hasEmotion = emotionRoll < 0.4;
    const emotion = hasEmotion
      ? emotionOptions[Math.floor(rng() * emotionOptions.length)]!
      : "neutral";
    const emotionWeight = hasEmotion ? 0.3 + rng() * 0.5 : undefined;

    result.push({
      content,
      type,
      context: domain.context,
      emotion,
      emotionWeight,
    });
  }

  return result;
}

export function generateInterferingCorpus(
  keyword: string,
  domainContexts: { context: string; templates: string[] }[],
  perDomain: number,
): EncodeInput[] {
  const result: EncodeInput[] = [];

  for (const domain of domainContexts) {
    for (let i = 0; i < perDomain; i++) {
      const template = domain.templates[i % domain.templates.length]!;
      const content = template.replace("{keyword}", keyword);
      result.push({
        content,
        type: "episodic",
        context: domain.context,
      });
    }
  }

  return result;
}

export async function measureMs(fn: () => void | Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}
