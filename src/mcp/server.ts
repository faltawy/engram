#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import { EngramEngine } from "../core/engine.ts";
import { MemoryType, Emotion } from "../core/memory.ts";
import { handleStore, handleRecall, handleManage } from "./tools.ts";

const engine = EngramEngine.create();

const server = new McpServer({
  name: "engram",
  version: "0.2.0",
});

server.registerTool(
  "memory_store",
  {
    title: "Store Memory",
    description: `Store memories. Requires "action" field.

Actions:
- action:"encode" — Create a new memory. Params: content (required), type? (semantic|episodic|procedural, default semantic), emotion? (neutral|curiosity|surprise|anxiety|satisfaction|frustration|confusion|excitement|calm|urgency), emotionWeight? (0-1), context? (e.g. "project:acme")
- action:"reconsolidate" — Update an existing memory during recall. Params: id (required), newContext?, currentEmotion?, currentEmotionWeight?`,
    inputSchema: z.discriminatedUnion("action", [
      z.object({
        action: z.literal("encode"),
        content: z.string().describe("Memory content"),
        type: z.nativeEnum(MemoryType).optional().describe("Memory type (default: semantic)"),
        emotion: z.nativeEnum(Emotion).optional().describe("Emotional tag"),
        emotionWeight: z.number().min(0).max(1).optional().describe("Emotion intensity 0-1"),
        context: z.string().optional().describe("Context tag (e.g. project:acme)"),
      }),
      z.object({
        action: z.literal("reconsolidate"),
        id: z.string().describe("Memory ID to update"),
        newContext: z.string().optional().describe("New context to blend"),
        currentEmotion: z.nativeEnum(Emotion).optional().describe("Current emotional state"),
        currentEmotionWeight: z.number().min(0).max(1).optional().describe("Emotion intensity"),
      }),
    ]),
  },
  async (args) => handleStore(engine, args),
);

server.registerTool(
  "memory_recall",
  {
    title: "Recall Memories",
    description: `Retrieve memories. Requires "action" field.

Actions:
- action:"recall" — Cue-based retrieval with spreading activation. Params: cue (required), limit? (default 5), type? (semantic|episodic|procedural), context?, associative? (default true), verbose?
- action:"inspect" — Examine a specific memory's full lifecycle. Params: id (required, full ID or prefix)
- action:"stats" — Memory system overview (counts, working memory usage, last consolidation). No extra params.`,
    inputSchema: z.discriminatedUnion("action", [
      z.object({
        action: z.literal("recall").optional().default("recall"),
        cue: z.string().describe("Recall cue"),
        limit: z.number().optional().describe("Max results (default: 5)"),
        type: z.nativeEnum(MemoryType).optional().describe("Filter by type"),
        context: z.string().optional().describe("Filter by context"),
        associative: z.boolean().optional().describe("Spreading activation (default: true)"),
        verbose: z.boolean().optional().describe("Full fields"),
      }),
      z.object({
        action: z.literal("inspect"),
        id: z.string().describe("Memory ID or prefix"),
      }),
      z.object({
        action: z.literal("stats"),
      }),
    ]),
  },
  async (args) => handleRecall(engine, args),
);

server.registerTool(
  "memory_manage",
  {
    title: "Manage Memory",
    description: `Memory maintenance. Requires "action" field.

Actions:
- action:"consolidate" — Run sleep cycle (strengthen, prune, extract patterns, discover links). No extra params.
- action:"focus_push" — Push to working memory buffer. Params: content (required), memoryRef?
- action:"focus_pop" — Remove most recent item from working memory. No extra params.
- action:"focus_get" — View current working memory contents. No extra params.
- action:"focus_clear" — Clear all working memory. No extra params.`,
    inputSchema: z.discriminatedUnion("action", [
      z.object({
        action: z.literal("consolidate"),
      }),
      z.object({
        action: z.literal("focus_push"),
        content: z.string().describe("Content to hold in focus"),
        memoryRef: z.string().optional().describe("Reference to existing memory ID"),
      }),
      z.object({
        action: z.literal("focus_pop"),
      }),
      z.object({
        action: z.literal("focus_get"),
      }),
      z.object({
        action: z.literal("focus_clear"),
      }),
    ]),
  },
  async (args) => handleManage(engine, args),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("engram MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
