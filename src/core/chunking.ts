import type { CognitiveConfig } from "../config/defaults.ts";
import type { EngramStorage } from "../storage/sqlite.ts";
import type { Memory } from "./memory.ts";
import { generateId } from "./memory.ts";
import { extractKeywords } from "./search.ts";

export interface Chunk {
  id: string;
  memberIds: string[];
  label: string;
}

class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  add(x: string): void {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
  }

  find(x: string): string {
    const p = this.parent.get(x);
    if (p === undefined) return x;
    if (p !== x) {
      const root = this.find(p);
      this.parent.set(x, root);
      return root;
    }
    return x;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;

    const rankA = this.rank.get(rootA) ?? 0;
    const rankB = this.rank.get(rootB) ?? 0;

    if (rankA < rankB) {
      this.parent.set(rootA, rootB);
    } else if (rankA > rankB) {
      this.parent.set(rootB, rootA);
    } else {
      this.parent.set(rootB, rootA);
      this.rank.set(rootA, rankA + 1);
    }
  }

  components(): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    for (const id of this.parent.keys()) {
      const root = this.find(id);
      const group = groups.get(root) ?? [];
      group.push(id);
      groups.set(root, group);
    }
    return groups;
  }
}

export function discoverChunks(
  storage: EngramStorage,
  config: CognitiveConfig
): Chunk[] {
  const allMemories = storage.getAllMemories();
  const memoryMap = new Map<string, Memory>();
  const uf = new UnionFind();

  for (const memory of allMemories) {
    if (memory.chunkId) continue;
    memoryMap.set(memory.id, memory);
    uf.add(memory.id);
  }

  for (const memory of memoryMap.values()) {
    const associations = storage.getAssociations(memory.id);
    for (const assoc of associations) {
      if (assoc.strength < config.chunkingSimilarityThreshold) continue;
      const otherId =
        assoc.sourceId === memory.id ? assoc.targetId : assoc.sourceId;
      if (!memoryMap.has(otherId)) continue;
      uf.union(memory.id, otherId);
    }
  }

  const chunks: Chunk[] = [];
  for (const memberIds of uf.components().values()) {
    if (memberIds.length < 2) continue;

    const members = memberIds.map((id) => memoryMap.get(id)!);
    const chunkId = generateId();
    const keywords = extractKeywords(
      members.map((m) => m.content).join(" "),
      3
    );
    const label = keywords.join(" + ") || "chunk";

    for (const member of members) {
      member.chunkId = chunkId;
      storage.updateMemory(member);
    }

    chunks.push({ id: chunkId, memberIds, label });
  }

  return chunks;
}

export function getChunkMembers(
  storage: EngramStorage,
  chunkId: string
): Memory[] {
  return storage.getAllMemories().filter((m) => m.chunkId === chunkId);
}
