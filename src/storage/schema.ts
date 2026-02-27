import { sqliteTable, text, integer, real, index, unique } from "drizzle-orm/sqlite-core";
import { MemoryType, Emotion, AssociationType, AccessType } from "../core/memory.ts";

export const memories = sqliteTable(
  "memories",
  {
    id: text("id").primaryKey(),
    type: text("type", {
      enum: Object.values(MemoryType) as [MemoryType, ...MemoryType[]],
    }).notNull(),
    content: text("content").notNull(),
    encodedAt: integer("encoded_at").notNull(),
    lastRecalledAt: integer("last_recalled_at"),
    recallCount: integer("recall_count").notNull().default(0),
    activation: real("activation").notNull().default(0.0),
    emotion: text("emotion", {
      enum: Object.values(Emotion) as [Emotion, ...Emotion[]],
    })
      .notNull()
      .default("neutral"),
    emotionWeight: real("emotion_weight").notNull().default(0.0),
    context: text("context"),
    chunkId: text("chunk_id"),
    reconsolidationCount: integer("reconsolidation_count").notNull().default(0),
  },
  (table) => [
    index("idx_memories_type").on(table.type),
    index("idx_memories_activation").on(table.activation),
    index("idx_memories_encoded_at").on(table.encodedAt),
    index("idx_memories_context").on(table.context),
    index("idx_memories_chunk_id").on(table.chunkId),
  ],
);

export const accessLog = sqliteTable(
  "access_log",
  {
    id: text("id").primaryKey(),
    memoryId: text("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    accessedAt: integer("accessed_at").notNull(),
    accessType: text("access_type", {
      enum: Object.values(AccessType) as [AccessType, ...AccessType[]],
    }).notNull(),
  },
  (table) => [
    index("idx_access_log_memory_id").on(table.memoryId),
    index("idx_access_log_accessed_at").on(table.accessedAt),
  ],
);

export const associations = sqliteTable(
  "associations",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    targetId: text("target_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    strength: real("strength").notNull().default(0.5),
    formedAt: integer("formed_at").notNull(),
    type: text("type", {
      enum: Object.values(AssociationType) as [AssociationType, ...AssociationType[]],
    }).notNull(),
  },
  (table) => [
    unique("unique_source_target").on(table.sourceId, table.targetId),
    index("idx_associations_source").on(table.sourceId),
    index("idx_associations_target").on(table.targetId),
  ],
);

export const workingMemory = sqliteTable("working_memory", {
  slot: integer("slot").primaryKey(),
  memoryRef: text("memory_ref"),
  content: text("content").notNull(),
  pushedAt: integer("pushed_at").notNull(),
});

export const consolidationLog = sqliteTable("consolidation_log", {
  id: text("id").primaryKey(),
  ranAt: integer("ran_at").notNull(),
  memoriesStrengthened: integer("memories_strengthened").notNull().default(0),
  memoriesPruned: integer("memories_pruned").notNull().default(0),
  factsExtracted: integer("facts_extracted").notNull().default(0),
  associationsDiscovered: integer("associations_discovered").notNull().default(0),
});

export type Memory = typeof memories.$inferSelect;
export type NewMemoryRow = typeof memories.$inferInsert;
export type AccessLogEntry = typeof accessLog.$inferSelect;
export type Association = typeof associations.$inferSelect;
export type WorkingMemorySlot = typeof workingMemory.$inferSelect;
export type ConsolidationLog = typeof consolidationLog.$inferSelect;
