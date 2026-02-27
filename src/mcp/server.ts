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
    description: `Actions: encode(content) — store memory | encode_batch(memories[]) — store multiple | reconsolidate(id) — update during recall. Optional: type, emotion, emotionWeight, context.`,
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
        action: z.literal("encode_batch"),
        memories: z
          .array(
            z.object({
              content: z.string(),
              type: z.nativeEnum(MemoryType).optional(),
              emotion: z.nativeEnum(Emotion).optional(),
              emotionWeight: z.number().min(0).max(1).optional(),
              context: z.string().optional(),
            }),
          )
          .min(1)
          .max(50)
          .describe("Array of memories to encode"),
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
    description: `Actions: recall(cue) — cue-based retrieval | list — browse without activation effects | inspect(id) — full lifecycle | stats — system overview. Optional: limit, type, context, format, verbose.`,
    inputSchema: z.discriminatedUnion("action", [
      z.object({
        action: z.literal("recall").optional().default("recall"),
        cue: z.string().describe("Recall cue"),
        limit: z.number().optional().describe("Max results (default: 5)"),
        type: z.nativeEnum(MemoryType).optional().describe("Filter by type"),
        context: z.string().optional().describe("Filter by context"),
        associative: z.boolean().optional().describe("Spreading activation (default: true)"),
        verbose: z.boolean().optional().describe("Full fields"),
        format: z.enum(["full", "content", "ids"]).optional().describe("Response format (default: full)"),
      }),
      z.object({
        action: z.literal("inspect"),
        id: z.string().describe("Memory ID or prefix"),
      }),
      z.object({
        action: z.literal("list"),
        type: z.nativeEnum(MemoryType).optional().describe("Filter by type"),
        context: z.string().optional().describe("Filter by context prefix"),
        limit: z.number().optional().describe("Max results (default: 20)"),
        offset: z.number().optional().describe("Skip first N results (default: 0)"),
        format: z.enum(["full", "content", "ids"]).optional().describe("Response format (default: full)"),
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
    description: `Actions: consolidate — run sleep cycle | recall_to_focus(cue) — recall and load to working memory | focus_push(content) — push to buffer | focus_pop — pop newest | focus_get — view buffer | focus_clear — empty buffer.`,
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
      z.object({
        action: z.literal("recall_to_focus"),
        cue: z.string().describe("Recall cue"),
        limit: z.number().optional().describe("Max memories to load (default: 3)"),
        type: z.nativeEnum(MemoryType).optional().describe("Filter by type"),
        context: z.string().optional().describe("Filter by context"),
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
