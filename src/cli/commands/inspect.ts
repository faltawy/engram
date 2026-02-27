import { defineCommand } from "citty";
import { EngramEngine } from "../../core/engine.ts";
import { formatMemoryInspection, dim } from "../format.ts";

export const inspectCommand = defineCommand({
  meta: {
    name: "inspect",
    description: "Examine a memory's full lifecycle",
  },
  args: {
    id: {
      type: "positional",
      description: "Memory ID (or prefix) to inspect",
      required: true,
    },
  },
  run({ args }) {
    const engine = EngramEngine.create();
    try {
      const allMemories = engine.storage.getAllMemories();
      const match = allMemories.find((m) => m.id === args.id || m.id.startsWith(args.id));

      if (!match) {
        console.log(dim(`  No memory found matching "${args.id}"`));
        return;
      }

      const accessLog = engine.storage.getAccessLog(match.id);
      const associations = engine.storage.getAssociations(match.id);

      console.log(formatMemoryInspection(match, accessLog.length, associations.length));
    } finally {
      engine.close();
    }
  },
});
