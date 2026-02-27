import type { CognitiveConfig } from "../config/defaults.ts";
import { loadConfig } from "../config/defaults.ts";
import { EngramStorage } from "../storage/sqlite.ts";
import { execSync } from "node:child_process";
import { basename } from "node:path";

export function detectProjectContext(): string | null {
  try {
    const root = execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return `project:${basename(root)}`;
  } catch {
    return null;
  }
}

export class EngramEngine {
  readonly storage: EngramStorage;
  readonly config: CognitiveConfig;
  readonly projectContext: string | null;

  private constructor(
    storage: EngramStorage,
    config: CognitiveConfig,
    projectContext: string | null,
  ) {
    this.storage = storage;
    this.config = config;
    this.projectContext = projectContext;
  }

  static create(configOverrides?: Partial<CognitiveConfig>): EngramEngine {
    const config = loadConfig(configOverrides);
    const storage = EngramStorage.open(config.dbPath);
    const projectContext = detectProjectContext();
    return new EngramEngine(storage, config, projectContext);
  }

  static inMemory(configOverrides?: Partial<CognitiveConfig>): EngramEngine {
    const config = loadConfig(configOverrides);
    const storage = EngramStorage.inMemory();
    return new EngramEngine(storage, config, null);
  }

  close(): void {
    this.storage.close();
  }
}
