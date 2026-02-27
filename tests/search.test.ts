import { test, expect, describe } from "bun:test";
import { tokenize, extractKeywords } from "../src/core/search.ts";
import { EngramStorage } from "../src/storage/sqlite.ts";
import { encode } from "../src/core/encoder.ts";
import { DEFAULT_CONFIG } from "../src/config/defaults.ts";

describe("tokenize", () => {
  test("lowercases and splits on non-alphanumeric", () => {
    expect(tokenize("Hello World")).toEqual(["hello", "world"]);
  });

  test("filters single-char tokens", () => {
    expect(tokenize("I am a test")).toEqual(["am", "test"]);
  });

  test("handles punctuation and special chars", () => {
    expect(tokenize("react-hooks: useState & useEffect")).toEqual([
      "react",
      "hooks",
      "usestate",
      "useeffect",
    ]);
  });

  test("returns empty array for empty input", () => {
    expect(tokenize("")).toEqual([]);
  });

  test("handles numbers", () => {
    expect(tokenize("error 404 not found")).toEqual(["error", "404", "not", "found"]);
  });
});

describe("extractKeywords", () => {
  test("returns top keywords by frequency", () => {
    const text = "react hooks react components react patterns";
    const keywords = extractKeywords(text, 3);
    expect(keywords[0]).toBe("react");
    expect(keywords.length).toBeLessThanOrEqual(3);
  });

  test("respects maxKeywords limit", () => {
    const text = "one two three four five six seven eight";
    expect(extractKeywords(text, 2)).toHaveLength(2);
  });

  test("returns empty for empty input", () => {
    expect(extractKeywords("")).toEqual([]);
  });

  test("deduplicates tokens before ranking", () => {
    const text = "test test test unique";
    const keywords = extractKeywords(text, 2);
    expect(keywords[0]).toBe("test");
    expect(keywords[1]).toBe("unique");
  });
});

describe("FTS5 search via storage", () => {
  test("finds matching memories", () => {
    const storage = EngramStorage.inMemory();
    const config = { ...DEFAULT_CONFIG, activationNoise: 0 };

    encode(storage, { content: "kubernetes deployment guide", type: "semantic" }, config);
    encode(storage, { content: "react component patterns", type: "semantic" }, config);
    encode(storage, { content: "kubernetes pod networking", type: "semantic" }, config);

    const results = storage.searchFTS("kubernetes", 10);
    expect(results.length).toBe(2);

    storage.close();
  });

  test("returns empty for empty query", () => {
    const storage = EngramStorage.inMemory();
    expect(storage.searchFTS("", 10)).toEqual([]);
    storage.close();
  });

  test("FTS index stays in sync after delete", () => {
    const storage = EngramStorage.inMemory();
    const config = { ...DEFAULT_CONFIG, activationNoise: 0 };

    const mem = encode(storage, { content: "deletable memory", type: "semantic" }, config);
    expect(storage.searchFTS("deletable", 10).length).toBe(1);

    storage.deleteMemory(mem.id);
    expect(storage.searchFTS("deletable", 10).length).toBe(0);

    storage.close();
  });

  test("respects limit", () => {
    const storage = EngramStorage.inMemory();
    const config = { ...DEFAULT_CONFIG, activationNoise: 0 };

    for (let i = 0; i < 5; i++) {
      encode(storage, { content: `test memory number ${i}`, type: "semantic" }, config);
    }

    const results = storage.searchFTS("test", 2);
    expect(results.length).toBeLessThanOrEqual(2);

    storage.close();
  });
});
