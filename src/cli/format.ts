import type { Memory, RecallResult } from "../core/memory.ts";
import kleur from "kleur";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";

dayjs.extend(relativeTime);

export function isInteractive(): boolean {
  return !!process.stdout.isTTY;
}

const dim = (s: string) => kleur.dim(s);
const bold = (s: string) => kleur.bold(s);
const green = (s: string) => kleur.green(s);
const yellow = (s: string) => kleur.yellow(s);
const red = (s: string) => kleur.red(s);
const cyan = (s: string) => kleur.cyan(s);
const magenta = (s: string) => kleur.magenta(s);

export function formatMemoryEncoded(memory: Memory): string {
  if (!isInteractive()) {
    return JSON.stringify({
      id: memory.id,
      type: memory.type,
      content: memory.content,
      activation: memory.activation,
      emotion: memory.emotion,
      context: memory.context,
    });
  }

  const lines: string[] = [];
  lines.push(green("  Encoded memory") + dim(` [${memory.id.slice(0, 8)}]`));
  lines.push(`  ${bold(memory.content)}`);
  lines.push(
    dim(`  type: ${memory.type}`) +
      (memory.emotion !== "neutral"
        ? ` ${dim("emotion:")} ${formatEmotion(memory.emotion, memory.emotionWeight)}`
        : "") +
      (memory.context ? ` ${dim("context:")} ${memory.context}` : ""),
  );
  lines.push(dim(`  activation: ${memory.activation.toFixed(3)}`));
  return lines.join("\n");
}

export function formatRecallResults(results: RecallResult[]): string {
  if (!isInteractive()) {
    return JSON.stringify(
      results.map((r) => ({
        id: r.memory.id,
        content: r.memory.content,
        context: r.memory.context,
        activation: r.activation,
      })),
    );
  }

  if (results.length === 0) {
    return dim("  No memories found above retrieval threshold.");
  }

  const lines: string[] = [];
  for (const result of results) {
    const m = result.memory;
    const activationColor = result.activation > 0.5 ? green : result.activation > 0 ? yellow : red;

    lines.push(`  ${activationColor("●")} ${bold(m.content)} ` + dim(`[${m.id.slice(0, 8)}]`));

    const meta: string[] = [];
    meta.push(`type: ${m.type}`);
    meta.push(`activation: ${result.activation.toFixed(3)}`);
    if (m.recallCount > 0) meta.push(`recalled: ${m.recallCount}x`);
    if (result.spreadingActivation > 0) {
      meta.push(`spreading: +${result.spreadingActivation.toFixed(3)}`);
    }
    if (m.emotion !== "neutral") {
      meta.push(`emotion: ${formatEmotion(m.emotion, m.emotionWeight)}`);
    }
    if (m.context) meta.push(`context: ${m.context}`);

    lines.push(dim(`    ${meta.join(" | ")}`));
    lines.push(
      dim(`    latency: ${result.latency.toFixed(0)}ms`) +
        dim(` | encoded: ${formatTimeAgo(m.encodedAt)}`),
    );
    lines.push("");
  }
  return lines.join("\n");
}

function formatEmotion(emotion: string, weight: number): string {
  const w = weight.toFixed(1);
  switch (emotion) {
    case "anxiety":
      return red(`${emotion}(${w})`);
    case "frustration":
      return red(`${emotion}(${w})`);
    case "joy":
      return green(`${emotion}(${w})`);
    case "satisfaction":
      return green(`${emotion}(${w})`);
    case "surprise":
      return yellow(`${emotion}(${w})`);
    case "curiosity":
      return cyan(`${emotion}(${w})`);
    default:
      return dim(`${emotion}(${w})`);
  }
}

export function formatTimeAgo(timestamp: number): string {
  return dayjs(timestamp).fromNow();
}

export function formatMemoryInspection(
  memory: Memory,
  accessCount: number,
  associationCount: number,
): string {
  if (!isInteractive()) {
    return JSON.stringify({
      id: memory.id,
      type: memory.type,
      content: memory.content,
      encodedAt: memory.encodedAt,
      lastRecalledAt: memory.lastRecalledAt,
      recallCount: memory.recallCount,
      activation: memory.activation,
      emotion: memory.emotion,
      emotionWeight: memory.emotionWeight,
      context: memory.context,
      chunkId: memory.chunkId,
      reconsolidationCount: memory.reconsolidationCount,
      accessCount,
      associationCount,
    });
  }

  const lines: string[] = [];
  lines.push(bold(`Memory [${memory.id.slice(0, 8)}]`));
  lines.push(`  ${bold(memory.content)}`);
  lines.push("");
  lines.push(dim("  Lifecycle:"));
  lines.push(`    Type:           ${memory.type}`);
  lines.push(`    Encoded:        ${new Date(memory.encodedAt).toISOString()}`);
  lines.push(
    `    Last recalled:  ${memory.lastRecalledAt ? new Date(memory.lastRecalledAt).toISOString() : "never"}`,
  );
  lines.push(`    Recall count:   ${memory.recallCount}`);
  lines.push(`    Reconsolidations: ${memory.reconsolidationCount}`);
  lines.push("");
  lines.push(dim("  Activation:"));
  lines.push(`    Current:        ${memory.activation.toFixed(4)}`);
  lines.push(`    Emotion:        ${formatEmotion(memory.emotion, memory.emotionWeight)}`);
  lines.push(`    Associations:   ${associationCount} links`);
  lines.push(`    Total accesses: ${accessCount}`);
  if (memory.context) {
    lines.push(`    Context:        ${memory.context}`);
  }
  if (memory.chunkId) {
    lines.push(`    Chunk:          ${memory.chunkId.slice(0, 8)}`);
  }
  return lines.join("\n");
}

export { dim, bold, green, yellow, red, cyan, magenta };
