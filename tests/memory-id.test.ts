import { test, expect, describe } from "bun:test";
import { generateMemoryId, generateId } from "../src/core/memory.ts";
import { encode } from "../src/core/encoder.ts";
import { EngramStorage } from "../src/storage/sqlite.ts";
import { DEFAULT_CONFIG } from "../src/config/defaults.ts";

describe("generateMemoryId", () => {
  test("produces format {type}:{slug}:{hash}", () => {
    const id = generateMemoryId("React hooks pattern", "semantic");
    const parts = id.split(":");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("sem");
  });

  test("uses correct type prefixes", () => {
    expect(generateMemoryId("test", "episodic").startsWith("epi:")).toBe(true);
    expect(generateMemoryId("test", "semantic").startsWith("sem:")).toBe(true);
    expect(generateMemoryId("test", "procedural").startsWith("proc:")).toBe(true);
  });

  test("slug is kebab-cased and lowercase", () => {
    const id = generateMemoryId("React Hooks Pattern", "semantic");
    const slug = id.split(":")[1]!;
    expect(slug).toBe("react-hooks-pattern");
  });

  test("slug is max 30 chars", () => {
    const longContent = "this is a very long content string that should be truncated to fit within the slug limit";
    const id = generateMemoryId(longContent, "semantic");
    const slug = id.split(":")[1]!;
    expect(slug.length).toBeLessThanOrEqual(30);
  });

  test("hash is 6 hex chars", () => {
    const id = generateMemoryId("test content", "semantic");
    const hash = id.split(":")[2]!;
    expect(hash).toMatch(/^[0-9a-f]{6}$/);
  });

  test("strips leading/trailing hyphens from slug", () => {
    const id = generateMemoryId("  -test-  ", "semantic");
    const slug = id.split(":")[1]!;
    expect(slug).not.toMatch(/^-|-$/);
  });
});

describe("generateId (UUID)", () => {
  test("returns a valid UUID", () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe("encoded memories use self-descriptive IDs", () => {
  test("encode() produces slug-based IDs", () => {
    const storage = EngramStorage.inMemory();
    const config = { ...DEFAULT_CONFIG, activationNoise: 0 };

    const memory = encode(
      storage,
      { content: "kubernetes deployment guide", type: "semantic" },
      config,
    );

    expect(memory.id).toMatch(/^sem:kubernetes-deployment-guide:[0-9a-f]{6}$/);
    storage.close();
  });

  test("episodic encode uses epi prefix", () => {
    const storage = EngramStorage.inMemory();
    const config = { ...DEFAULT_CONFIG, activationNoise: 0 };

    const memory = encode(
      storage,
      { content: "meeting with client", type: "episodic" },
      config,
    );

    expect(memory.id.startsWith("epi:")).toBe(true);
    storage.close();
  });
});
