import type { Memory as _Memory } from "../storage/schema.ts";
export { type Memory, type AccessLogEntry, type Association, type WorkingMemorySlot, type ConsolidationLog } from "../storage/schema.ts";

export const MemoryType = {
  Episodic: "episodic",
  Semantic: "semantic",
  Procedural: "procedural",
} as const;
export type MemoryType = (typeof MemoryType)[keyof typeof MemoryType];

export const Emotion = {
  Joy: "joy",
  Anxiety: "anxiety",
  Frustration: "frustration",
  Surprise: "surprise",
  Satisfaction: "satisfaction",
  Curiosity: "curiosity",
  Neutral: "neutral",
} as const;
export type Emotion = (typeof Emotion)[keyof typeof Emotion];

export const AssociationType = {
  Temporal: "temporal",
  Semantic: "semantic",
  CoRecall: "co-recall",
} as const;
export type AssociationType = (typeof AssociationType)[keyof typeof AssociationType];

export const AccessType = {
  Encode: "encode",
  Recall: "recall",
  Consolidate: "consolidate",
} as const;
export type AccessType = (typeof AccessType)[keyof typeof AccessType];

export interface EncodeInput {
  content: string;
  type: MemoryType;
  emotion?: Emotion;
  emotionWeight?: number;
  context?: string;
}

export interface RecallResult {
  memory: _Memory;
  activation: number;
  spreadingActivation: number;
  latency: number;
}

export function isValidMemoryType(s: string): s is MemoryType {
  return (Object.values(MemoryType) as string[]).includes(s);
}

const TYPE_PREFIX: Record<MemoryType, string> = {
  episodic: "epi",
  semantic: "sem",
  procedural: "proc",
};

function contentSlug(content: string, maxLen = 30): string {
  return content
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLen)
    .replace(/-$/, "");
}

function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(6, "0").slice(0, 6);
}

export function generateMemoryId(content: string, type: MemoryType): string {
  const prefix = TYPE_PREFIX[type];
  const slug = contentSlug(content);
  const hash = shortHash(content + Date.now());
  return `${prefix}:${slug}:${hash}`;
}

export function generateId(): string {
  return crypto.randomUUID();
}
