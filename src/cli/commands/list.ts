import { defineCommand } from "citty";
import { EngramEngine } from "../../core/engine.ts";
import { isValidMemoryType } from "../../core/memory.ts";
import { formatMemoryList } from "../format.ts";

export const listCommand = defineCommand({
  meta: {
    name: "list",
    description: "Browse stored memories (read-only, no activation effects)",
  },
  args: {
    type: {
      type: "string",
      description: "Filter by memory type (episodic, semantic, procedural)",
    },
    context: {
      type: "string",
      description: "Filter by context prefix (e.g. project:acme)",
    },
    all: {
      type: "boolean",
      description: "Show all memories regardless of context",
      default: false,
    },
    limit: {
      type: "string",
      description: "Maximum number of results",
      alias: "n",
      default: "20",
    },
  },
  run({ args }) {
    const engine = EngramEngine.create();
    try {
      const type = args.type && isValidMemoryType(args.type) ? args.type : undefined;
      const limit = Number(args.limit);

      let memories;
      let displayContext: string | null = null;

      if (args.all) {
        memories = engine.storage.getAllMemories(type).slice(0, limit);
      } else {
        const context = args.context ?? engine.projectContext;
        if (context) {
          displayContext = context;
          memories = engine.storage.getMemoriesByContext(context, type, limit);
        } else {
          memories = engine.storage.getAllMemories(type).slice(0, limit);
        }
      }

      console.log(formatMemoryList(memories, displayContext));
    } finally {
      engine.close();
    }
  },
});
