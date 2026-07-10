#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";

import { EngramEngine } from "../core/engine.ts";
import { MemoryType, Emotion, AssociationType } from "../core/memory.ts";
import { handleStore, handleRecall, handleManage } from "./tools.ts";

const engine = EngramEngine.create();

const server = new McpServer({
  name: "engram",
  version: "0.4.0",
});

const memoryTypeEnum = z.enum(Object.values(MemoryType) as [MemoryType, ...MemoryType[]]);
const emotionEnum = z.enum(Object.values(Emotion) as [Emotion, ...Emotion[]]);
const associationTypeEnum = z.enum(
  Object.values(AssociationType) as [AssociationType, ...AssociationType[]],
);

server.registerTool(
  "memory_store",
  {
    title: "Store Memory",
    description: `Actions: encode(content) — store memory | encode_batch(memories[]) — store multiple | reconsolidate(id) — update during recall | forget(id) — delete a wrong/stale memory | associate(sourceId, targetId) — explicitly link two memories.`,
    inputSchema: {
      action: z
        .enum(["encode", "encode_batch", "reconsolidate", "forget", "associate"])
        .describe("Store operation to perform"),
      content: z.string().optional().describe("encode: memory content"),
      type: memoryTypeEnum.optional().describe("encode: memory type (default: semantic)"),
      emotion: emotionEnum.optional().describe("encode: emotional tag"),
      emotionWeight: z.number().min(0).max(1).optional().describe("encode: emotion intensity 0-1"),
      context: z.string().optional().describe("encode: context tag (e.g. project:acme)"),
      memories: z
        .array(
          z.object({
            content: z.string(),
            type: memoryTypeEnum.optional(),
            emotion: emotionEnum.optional(),
            emotionWeight: z.number().min(0).max(1).optional(),
            context: z.string().optional(),
          }),
        )
        .min(1)
        .max(50)
        .optional()
        .describe("encode_batch: memories to encode"),
      id: z.string().optional().describe("reconsolidate/forget: memory ID or prefix"),
      newContext: z.string().optional().describe("reconsolidate: new context to blend"),
      currentEmotion: emotionEnum.optional().describe("reconsolidate: current emotional state"),
      currentEmotionWeight: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("reconsolidate: emotion intensity"),
      sourceId: z.string().optional().describe("associate: source memory ID or prefix"),
      targetId: z.string().optional().describe("associate: target memory ID or prefix"),
      associationType: associationTypeEnum
        .optional()
        .describe("associate: link type (default: semantic)"),
      strength: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("associate: link strength 0-1 (default: 0.8)"),
    },
  },
  async (args) => handleStore(engine, args),
);

server.registerTool(
  "memory_recall",
  {
    title: "Recall Memories",
    description: `Actions: recall(cue) — cue-based retrieval | list — browse without activation effects | inspect(id) — full lifecycle | stats — system overview | contexts — list all contexts with counts.`,
    inputSchema: {
      action: z
        .enum(["recall", "list", "inspect", "stats", "contexts"])
        .describe("Recall operation to perform"),
      cue: z.string().optional().describe("recall: retrieval cue"),
      limit: z.number().optional().describe("recall/list: max results"),
      type: memoryTypeEnum.optional().describe("recall/list: filter by type"),
      context: z.string().optional().describe("recall/list: filter by context prefix"),
      associative: z.boolean().optional().describe("recall: spreading activation (default: true)"),
      verbose: z.boolean().optional().describe("recall: include full fields"),
      format: z
        .enum(["full", "content", "ids"])
        .optional()
        .describe("recall/list: response format (default: full)"),
      offset: z.number().optional().describe("list: skip first N results"),
      id: z.string().optional().describe("inspect: memory ID or prefix"),
    },
  },
  async (args) => handleRecall(engine, args),
);

server.registerTool(
  "memory_manage",
  {
    title: "Manage Memory",
    description: `Actions: session_begin — start a session, get a briefing of relevant memories (call at session start) | session_end — consolidate and close the session (call before finishing) | consolidate — run sleep cycle | recall_to_focus(cue) — recall and load to working memory | focus_push(content) — push to buffer | focus_pop — pop newest | focus_get — view buffer | focus_clear — empty buffer.`,
    inputSchema: {
      action: z
        .enum([
          "session_begin",
          "session_end",
          "consolidate",
          "focus_push",
          "focus_pop",
          "focus_get",
          "focus_clear",
          "recall_to_focus",
        ])
        .describe("Manage operation to perform"),
      context: z
        .string()
        .optional()
        .describe("session_begin/recall_to_focus: context (default: auto-detected project)"),
      content: z.string().optional().describe("focus_push: content to hold in focus"),
      memoryRef: z.string().optional().describe("focus_push: reference to existing memory ID"),
      cue: z.string().optional().describe("recall_to_focus: recall cue"),
      limit: z.number().optional().describe("recall_to_focus: max memories to load (default: 3)"),
      type: memoryTypeEnum.optional().describe("recall_to_focus: filter by type"),
    },
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
