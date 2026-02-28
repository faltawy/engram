import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ProviderInstaller } from "./types.ts";

const MCP_SERVER_CONFIG = {
  command: "bunx",
  args: ["-p", "@cogmem/engram", "engram-mcp"],
};

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readJsonFile(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJsonFile(path: string, data: Record<string, unknown>) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function installSkill(skillDir: string, skillContent: string, dryRun: boolean): boolean {
  const skillPath = join(skillDir, "SKILL.md");
  if (existsSync(skillPath)) {
    const existing = readFileSync(skillPath, "utf-8");
    if (existing === skillContent) return false;
  }
  if (!dryRun) {
    ensureDir(skillDir);
    writeFileSync(skillPath, skillContent);
  }
  return true;
}

function configureMcp(configPath: string, dryRun: boolean): boolean {
  const config = readJsonFile(configPath);
  const servers = (config.mcpServers ?? {}) as Record<string, unknown>;
  if (servers.engram) return false;
  if (!dryRun) {
    servers.engram = MCP_SERVER_CONFIG;
    config.mcpServers = servers;
    ensureDir(join(configPath, ".."));
    writeJsonFile(configPath, config);
  }
  return true;
}

export const claudeProvider: ProviderInstaller = {
  name: "claude",
  displayName: "Claude Code",
  available: true,

  async installGlobal(skillContent, dryRun) {
    const home = homedir();
    const skillDir = join(home, ".claude", "skills", "engram");
    const configPath = join(home, ".claude", "settings.json");

    const skillInstalled = installSkill(skillDir, skillContent, dryRun);
    const mcpInstalled = configureMcp(configPath, dryRun);

    const status =
      !skillInstalled && !mcpInstalled
        ? "already_installed"
        : skillInstalled && mcpInstalled
          ? "installed"
          : "updated";

    return {
      status,
      skillPath: join(skillDir, "SKILL.md"),
      mcpConfigured: mcpInstalled,
      mcpConfigPath: configPath,
    };
  },

  async installProject(skillContent, projectDir, dryRun) {
    const skillDir = join(projectDir, ".claude", "skills", "engram");
    const configPath = join(projectDir, ".claude", "settings.local.json");

    const skillInstalled = installSkill(skillDir, skillContent, dryRun);
    const mcpInstalled = configureMcp(configPath, dryRun);

    const status =
      !skillInstalled && !mcpInstalled
        ? "already_installed"
        : skillInstalled && mcpInstalled
          ? "installed"
          : "updated";

    return {
      status,
      skillPath: join(skillDir, "SKILL.md"),
      mcpConfigured: mcpInstalled,
      mcpConfigPath: configPath,
    };
  },
};
