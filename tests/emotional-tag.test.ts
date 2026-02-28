import { test, expect, describe } from "bun:test";

import { defaultEmotionWeight, isValidEmotion } from "../src/core/emotional-tag.ts";
import { Emotion } from "../src/core/memory.ts";

describe("isValidEmotion", () => {
  test("accepts all valid emotions", () => {
    for (const emotion of Object.values(Emotion)) {
      expect(isValidEmotion(emotion)).toBe(true);
    }
  });

  test("rejects invalid strings", () => {
    expect(isValidEmotion("rage")).toBe(false);
    expect(isValidEmotion("happy")).toBe(false);
    expect(isValidEmotion("")).toBe(false);
    expect(isValidEmotion("NEUTRAL")).toBe(false);
  });
});

describe("defaultEmotionWeight", () => {
  test("anxiety has highest weight", () => {
    expect(defaultEmotionWeight("anxiety")).toBe(0.8);
  });

  test("neutral has zero weight", () => {
    expect(defaultEmotionWeight("neutral")).toBe(0.0);
  });

  test("all emotions return a number >= 0", () => {
    for (const emotion of Object.values(Emotion)) {
      const weight = defaultEmotionWeight(emotion);
      expect(weight).toBeGreaterThanOrEqual(0);
      expect(weight).toBeLessThanOrEqual(1);
    }
  });

  test("emotional hierarchy: anxiety > surprise > frustration > joy > satisfaction > curiosity > neutral", () => {
    expect(defaultEmotionWeight("anxiety")).toBeGreaterThan(defaultEmotionWeight("surprise"));
    expect(defaultEmotionWeight("surprise")).toBeGreaterThan(defaultEmotionWeight("frustration"));
    expect(defaultEmotionWeight("frustration")).toBeGreaterThan(defaultEmotionWeight("joy"));
    expect(defaultEmotionWeight("joy")).toBeGreaterThan(defaultEmotionWeight("satisfaction"));
    expect(defaultEmotionWeight("satisfaction")).toBeGreaterThan(defaultEmotionWeight("curiosity"));
    expect(defaultEmotionWeight("curiosity")).toBeGreaterThan(defaultEmotionWeight("neutral"));
  });
});
