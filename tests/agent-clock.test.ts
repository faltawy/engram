import { test, expect, describe } from "bun:test";

import { DEFAULT_CONFIG, type CognitiveConfig } from "../src/config/defaults.ts";
import { accessAges } from "../src/core/clock.ts";
import { consolidate } from "../src/core/consolidation.ts";
import { encode } from "../src/core/encoder.ts";
import { recall } from "../src/core/recall.ts";
import { EngramStorage } from "../src/storage/sqlite.ts";

const config: CognitiveConfig = {
  ...DEFAULT_CONFIG,
  clockMode: "agent",
  activationNoise: 0,
};

function makeStorage() {
  return EngramStorage.inMemory();
}

describe("Agent Clock", () => {
  test("clock advances with each access, not with wall time", () => {
    const storage = makeStorage();
    const before = storage.getClock();

    encode(storage, { content: "first fact", type: "semantic" }, config);
    expect(storage.getClock()).toBe(before + 1);

    encode(storage, { content: "second fact", type: "semantic" }, config);
    expect(storage.getClock()).toBe(before + 2);

    storage.close();
  });

  test("agent ages count events while wall ages count seconds", () => {
    const entries = [{ accessedAt: 0, clock: 10 }];
    const now = { wall: 3600000, clock: 15 };

    expect(accessAges(entries, now, "agent")).toEqual([5]);
    expect(accessAges(entries, now, "wall")).toEqual([3600]);
  });

  test("idle wall-clock time does not decay memories in agent mode", () => {
    const storage = makeStorage();
    const now = 1000000000;
    const month = 30 * 86400000;

    const mem = encode(
      storage,
      { content: "task plan for the migration project", type: "semantic" },
      config,
      now,
    );

    // A month of wall-clock idleness passes, zero agent activity
    const results = recall(storage, "migration project", config, {
      deterministic: true,
      now: now + month,
    });

    expect(results.some((r) => r.memory.id === mem.id)).toBe(true);

    storage.close();
  });

  test("memories decay as agent activity accumulates", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const old = encode(storage, { content: "earliest unrelated note", type: "semantic" }, config, now);

    for (let i = 0; i < 50; i++) {
      encode(storage, { content: `later distinct entry ${i}`, type: "semantic" }, config, now + i);
    }

    const fresh = encode(storage, { content: "newest distinct entry", type: "semantic" }, config, now + 100);

    const results = recall(storage, "distinct entry", config, {
      deterministic: true,
      now: now + 200,
      limit: 60,
    });

    const oldResult = results.find((r) => r.memory.id === old.id);
    const freshResult = results.find((r) => r.memory.id === fresh.id);
    expect(freshResult).toBeDefined();
    if (oldResult) {
      expect(freshResult!.activation).toBeGreaterThan(oldResult.activation);
    }

    storage.close();
  });

  test("pruning survives idle gaps but prunes event-stale memories", () => {
    const storage = makeStorage();
    const now = 1000000000;
    const year = 365 * 86400000;
    const pruneConfig = { ...config, pruningThreshold: -1.5 };

    const kept = encode(
      storage,
      { content: "important architecture decision", type: "semantic" },
      pruneConfig,
      now,
    );

    // A year of idle wall time, but only one event since encoding
    const result = consolidate(storage, pruneConfig, now + year);
    expect(result.prunedIds).not.toContain(kept.id);
    expect(storage.getMemory(kept.id)).not.toBeNull();

    storage.close();
  });
});

describe("Sessions", () => {
  test("beginSession and endSession record clock boundaries", () => {
    const storage = makeStorage();

    encode(storage, { content: "pre-session fact", type: "semantic" }, config);
    const session = storage.beginSession("project:test");
    expect(session.startClock).toBe(storage.getClock());
    expect(session.endedAt).toBeNull();

    encode(storage, { content: "in-session fact", type: "semantic" }, config);

    const ended = storage.endSession(session.id)!;
    expect(ended.endedAt).not.toBeNull();
    expect(ended.endClock).toBe(storage.getClock());
    expect(ended.endClock! - ended.startClock).toBe(1);

    storage.close();
  });

  test("beginSession closes a dangling active session", () => {
    const storage = makeStorage();

    const first = storage.beginSession(null);
    const second = storage.beginSession(null);

    const active = storage.getActiveSession();
    expect(active?.id).toBe(second.id);
    expect(storage.getSessionCount()).toBe(2);
    expect(first.id).not.toBe(second.id);

    storage.close();
  });

  test("consolidation strengthens memories accessed twice within the session", () => {
    const storage = makeStorage();
    const now = 1000000000;

    const outside = encode(storage, { content: "touched before session", type: "semantic" }, config, now);

    storage.beginSession("project:test", now + 1000);

    const inside = encode(storage, { content: "hot topic this session", type: "semantic" }, config, now + 2000);
    recall(storage, "hot topic", config, { deterministic: true, now: now + 3000 });

    const insideBefore = storage.getAccessEntries(inside.id).length;
    const outsideBefore = storage.getAccessEntries(outside.id).length;

    consolidate(storage, config, now + 4000);

    expect(storage.getAccessEntries(inside.id).length).toBe(insideBefore + 1);
    expect(storage.getAccessEntries(outside.id).length).toBe(outsideBefore);

    storage.close();
  });
});
