import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { eq, and, gt, lt, or, desc, asc, count, sql } from "drizzle-orm";
import { memories, accessLog, associations, workingMemory, consolidationLog } from "./schema.ts";
import type { MemoryType, AccessType } from "../core/memory.ts";
import type {
  Memory,
  AccessLogEntry,
  Association,
  WorkingMemorySlot,
  ConsolidationLog,
} from "./schema.ts";
import { generateId } from "../core/memory.ts";
import { resolveDbPath } from "../config/defaults.ts";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import * as schema from "./schema.ts";

export class EngramStorage {
  private sqlite: Database;
  readonly db: BunSQLiteDatabase<typeof schema>;

  private constructor(sqlite: Database, db: BunSQLiteDatabase<typeof schema>) {
    this.sqlite = sqlite;
    this.db = db;
    this.initFTS();
  }

  private initFTS(): void {
    this.sqlite.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(memory_id UNINDEXED, content)
    `);
    this.sqlite.run(`
      CREATE TRIGGER IF NOT EXISTS memories_fts_insert AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(memory_id, content) VALUES (new.id, new.content);
      END
    `);
    this.sqlite.run(`
      CREATE TRIGGER IF NOT EXISTS memories_fts_delete AFTER DELETE ON memories BEGIN
        DELETE FROM memories_fts WHERE memory_id = old.id;
      END
    `);

    const ftsCount = this.sqlite.prepare("SELECT count(*) as c FROM memories_fts").get() as {
      c: number;
    };
    const memCount = this.sqlite.prepare("SELECT count(*) as c FROM memories").get() as {
      c: number;
    };
    if (ftsCount.c === 0 && memCount.c > 0) {
      this.sqlite.run(
        "INSERT INTO memories_fts(memory_id, content) SELECT id, content FROM memories",
      );
    }
  }

  private static readonly migrationsFolder = resolve(import.meta.dir, "../../drizzle");

  static open(dbPath: string): EngramStorage {
    const resolved = resolveDbPath(dbPath);
    const dir = dirname(resolved);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const sqlite = new Database(resolved);
    sqlite.run("PRAGMA journal_mode = WAL");
    sqlite.run("PRAGMA foreign_keys = ON");
    const db = drizzle({ client: sqlite, schema });
    migrate(db, { migrationsFolder: EngramStorage.migrationsFolder });
    return new EngramStorage(sqlite, db);
  }

  static inMemory(): EngramStorage {
    const sqlite = new Database(":memory:");
    sqlite.run("PRAGMA foreign_keys = ON");
    const db = drizzle({ client: sqlite, schema });
    migrate(db, { migrationsFolder: EngramStorage.migrationsFolder });
    return new EngramStorage(sqlite, db);
  }

  close(): void {
    this.sqlite.close();
  }

  // ─── Memories ──────────────────────────────────────────────

  insertMemory(memory: Memory): void {
    this.db
      .insert(memories)
      .values({
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
      })
      .run();
  }

  getMemory(id: string): Memory | null {
    const row = this.db.select().from(memories).where(eq(memories.id, id)).get();
    return row ?? null;
  }

  getAllMemories(type?: MemoryType): Memory[] {
    if (type) {
      return this.db
        .select()
        .from(memories)
        .where(eq(memories.type, type))
        .orderBy(desc(memories.encodedAt))
        .all();
    }
    return this.db.select().from(memories).orderBy(desc(memories.encodedAt)).all();
  }

  updateMemory(memory: Memory): void {
    this.db
      .update(memories)
      .set({
        lastRecalledAt: memory.lastRecalledAt,
        recallCount: memory.recallCount,
        activation: memory.activation,
        emotion: memory.emotion,
        emotionWeight: memory.emotionWeight,
        context: memory.context,
        chunkId: memory.chunkId,
        reconsolidationCount: memory.reconsolidationCount,
      })
      .where(eq(memories.id, memory.id))
      .run();
  }

  deleteMemory(id: string): void {
    this.db.delete(memories).where(eq(memories.id, id)).run();
  }

  getMemoriesAboveActivation(threshold: number): Memory[] {
    return this.db
      .select()
      .from(memories)
      .where(gt(memories.activation, threshold))
      .orderBy(desc(memories.activation))
      .all();
  }

  getMemoriesBelowActivation(threshold: number): Memory[] {
    return this.db
      .select()
      .from(memories)
      .where(and(lt(memories.activation, threshold), sql`${memories.type} != 'procedural'`))
      .orderBy(asc(memories.activation))
      .all();
  }

  searchMemories(query: string, limit = 20): Memory[] {
    return this.db
      .select()
      .from(memories)
      .where(sql`${memories.content} LIKE ${"%" + query + "%"}`)
      .orderBy(desc(memories.activation))
      .limit(limit)
      .all();
  }

  getMemoryCount(type?: MemoryType): number {
    if (type) {
      const result = this.db
        .select({ value: count() })
        .from(memories)
        .where(eq(memories.type, type))
        .get();
      return result?.value ?? 0;
    }
    const result = this.db.select({ value: count() }).from(memories).get();
    return result?.value ?? 0;
  }

  getMemoriesByContext(context: string, type?: MemoryType, limit = 20): Memory[] {
    const conditions = [sql`${memories.context} LIKE ${context + "%"}`];
    if (type) conditions.push(eq(memories.type, type));
    return this.db
      .select()
      .from(memories)
      .where(and(...conditions))
      .orderBy(desc(memories.activation))
      .limit(limit)
      .all();
  }

  getMemoryCountByContext(context: string, type?: MemoryType): number {
    const conditions = [sql`${memories.context} LIKE ${context + "%"}`];
    if (type) conditions.push(eq(memories.type, type));
    const result = this.db
      .select({ value: count() })
      .from(memories)
      .where(and(...conditions))
      .get();
    return result?.value ?? 0;
  }

  searchFTS(query: string, limit: number = 20): string[] {
    const sanitized = query.replace(/[^a-zA-Z0-9\s]/g, "").trim();
    if (!sanitized) return [];
    const terms = sanitized
      .split(/\s+/)
      .map((t) => `"${t}"*`)
      .join(" OR ");
    const stmt = this.sqlite.prepare(
      `SELECT memory_id FROM memories_fts WHERE memories_fts MATCH ? ORDER BY rank LIMIT ?`,
    );
    return stmt.all(terms, limit).map((row: any) => row.memory_id as string);
  }

  // ─── Access Log ────────────────────────────────────────────

  logAccess(memoryId: string, accessType: AccessType, timestamp?: number): void {
    this.db
      .insert(accessLog)
      .values({
        id: generateId(),
        memoryId,
        accessedAt: timestamp ?? Date.now(),
        accessType,
      })
      .run();
  }

  getAccessLog(memoryId: string): AccessLogEntry[] {
    return this.db
      .select()
      .from(accessLog)
      .where(eq(accessLog.memoryId, memoryId))
      .orderBy(asc(accessLog.accessedAt))
      .all();
  }

  getAccessTimestamps(memoryId: string): number[] {
    return this.db
      .select({ accessedAt: accessLog.accessedAt })
      .from(accessLog)
      .where(eq(accessLog.memoryId, memoryId))
      .orderBy(asc(accessLog.accessedAt))
      .all()
      .map((r) => r.accessedAt);
  }

  // ─── Associations ──────────────────────────────────────────

  insertAssociation(assoc: Association): void {
    this.db
      .insert(associations)
      .values({
        id: assoc.id,
        sourceId: assoc.sourceId,
        targetId: assoc.targetId,
        strength: assoc.strength,
        formedAt: assoc.formedAt,
        type: assoc.type,
      })
      .onConflictDoUpdate({
        target: [associations.sourceId, associations.targetId],
        set: {
          strength: assoc.strength,
          type: assoc.type,
        },
      })
      .run();
  }

  getAssociationsFrom(memoryId: string): Association[] {
    return this.db
      .select()
      .from(associations)
      .where(eq(associations.sourceId, memoryId))
      .orderBy(desc(associations.strength))
      .all();
  }

  getAssociationsTo(memoryId: string): Association[] {
    return this.db
      .select()
      .from(associations)
      .where(eq(associations.targetId, memoryId))
      .orderBy(desc(associations.strength))
      .all();
  }

  getAssociations(memoryId: string): Association[] {
    return this.db
      .select()
      .from(associations)
      .where(or(eq(associations.sourceId, memoryId), eq(associations.targetId, memoryId)))
      .orderBy(desc(associations.strength))
      .all();
  }

  getFanCount(memoryId: string): number {
    const result = this.db
      .select({ value: count() })
      .from(associations)
      .where(or(eq(associations.sourceId, memoryId), eq(associations.targetId, memoryId)))
      .get();
    return result?.value ?? 0;
  }

  getAssociationCount(): number {
    const result = this.db.select({ value: count() }).from(associations).get();
    return result?.value ?? 0;
  }

  updateAssociationStrength(id: string, strength: number): void {
    this.db.update(associations).set({ strength }).where(eq(associations.id, id)).run();
  }

  deleteWeakAssociations(minStrength: number): number {
    // Raw sqlite needed for .changes (drizzle sync delete returns void)
    const stmt = this.sqlite.prepare("DELETE FROM associations WHERE strength < ?");
    const result = stmt.run(minStrength);
    return result.changes;
  }

  // ─── Working Memory ────────────────────────────────────────

  getWorkingMemory(): WorkingMemorySlot[] {
    return this.db.select().from(workingMemory).orderBy(asc(workingMemory.slot)).all();
  }

  pushWorkingMemory(slot: WorkingMemorySlot): void {
    this.db
      .insert(workingMemory)
      .values({
        slot: slot.slot,
        memoryRef: slot.memoryRef,
        content: slot.content,
        pushedAt: slot.pushedAt,
      })
      .onConflictDoUpdate({
        target: workingMemory.slot,
        set: {
          memoryRef: slot.memoryRef,
          content: slot.content,
          pushedAt: slot.pushedAt,
        },
      })
      .run();
  }

  clearWorkingMemory(): void {
    this.db.delete(workingMemory).run();
  }

  removeWorkingMemorySlot(slot: number): void {
    this.db.delete(workingMemory).where(eq(workingMemory.slot, slot)).run();
  }

  getWorkingMemoryCount(): number {
    const result = this.db.select({ value: count() }).from(workingMemory).get();
    return result?.value ?? 0;
  }

  // ─── Consolidation Log ─────────────────────────────────────

  logConsolidation(entry: ConsolidationLog): void {
    this.db
      .insert(consolidationLog)
      .values({
        id: entry.id,
        ranAt: entry.ranAt,
        memoriesStrengthened: entry.memoriesStrengthened,
        memoriesPruned: entry.memoriesPruned,
        factsExtracted: entry.factsExtracted,
        associationsDiscovered: entry.associationsDiscovered,
      })
      .run();
  }

  getLastConsolidation(): ConsolidationLog | null {
    const row = this.db
      .select()
      .from(consolidationLog)
      .orderBy(desc(consolidationLog.ranAt))
      .limit(1)
      .get();
    return row ?? null;
  }

  // ─── Bulk / Utility ────────────────────────────────────────

  transaction<T>(fn: () => T): T {
    return this.sqlite.transaction(fn)();
  }
}
