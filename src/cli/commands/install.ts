import { defineCommand } from "citty";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { consola } from "consola";
import { getProvider, availableProviders } from "../providers/index.ts";
import { green, dim, yellow, bold } from "../format.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = join(__dirname, "..", "..", "..", "SKILL.md");

function loadSkillContent(): string {
  return readFileSync(SKILL_PATH, "utf-8");
}

export const installCommand = defineCommand({
  meta: {
    name: "install",
    description: "Install engram skill + MCP config for your AI editor",
  },
  args: {
    provider: {
      type: "string",
      description: "Provider to install for (claude)",
      alias: "p",
    },
    global: {
      type: "boolean",
      description: "Install globally (~/.claude/)",
      alias: "g",
    },
    project: {
      type: "boolean",
      description: "Install to current project directory",
    },
    dryRun: {
      type: "boolean",
      description: "Show what would be installed without writing files",
      alias: "n",
    },
  },
  async run({ args }) {
    const dryRun = args.dryRun ?? false;

    let providerName = args.provider;
    if (!providerName) {
      const choices = availableProviders.map((p) => ({
        label: p.available ? p.displayName : `${p.displayName} (coming soon)`,
        value: p.name,
        disabled: !p.available,
      }));

      providerName = (await consola.prompt("Select a provider", {
        type: "select",
        options: choices,
      })) as unknown as string;

      if (typeof providerName === "symbol") process.exit(0);
    }

    const provider = getProvider(providerName);
    if (!provider) {
      consola.error(`Unknown provider: ${providerName}`);
      process.exit(1);
    }
    if (!provider.available) {
      consola.error(`${provider.displayName} is not yet supported`);
      process.exit(1);
    }

    let scope: "global" | "project" | undefined;
    if (args.global) scope = "global";
    else if (args.project) scope = "project";

    if (!scope) {
      scope = (await consola.prompt("Install scope", {
        type: "select",
        options: [
          { label: `Global (~/.claude/)`, value: "global" },
          { label: `Project (./.claude/)`, value: "project" },
        ],
      })) as unknown as "global" | "project";

      if (typeof scope === "symbol") process.exit(0);
    }

    const skillContent = loadSkillContent();

    if (dryRun) console.log(yellow("\n  dry run — no files will be written\n"));

    const result =
      scope === "global"
        ? await provider.installGlobal(skillContent, dryRun)
        : await provider.installProject(skillContent, process.cwd(), dryRun);

    if (result.status === "already_installed") {
      console.log(dim("  already installed — nothing to do"));
      console.log(dim(`  skill: ${result.skillPath}`));
      if (result.mcpConfigPath) console.log(dim(`  mcp:   ${result.mcpConfigPath}`));
      return;
    }

    const prefix = dryRun ? "would install" : "installed";
    const check = dryRun ? yellow("~") : green("\u2713");

    console.log(`  ${check} Skill ${prefix} ${dim("\u2192")} ${bold(result.skillPath)}`);
    if (result.mcpConfigured && result.mcpConfigPath) {
      console.log(`  ${check} MCP ${prefix}   ${dim("\u2192")} ${bold(result.mcpConfigPath)}`);
    } else if (result.mcpConfigPath) {
      console.log(dim(`  - MCP already configured → ${result.mcpConfigPath}`));
    }
  },
});
