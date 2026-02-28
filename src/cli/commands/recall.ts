import { defineCommand } from "citty";

import { EngramEngine } from "../../core/engine.ts";
import { isValidMemoryType } from "../../core/memory.ts";
import { recall } from "../../core/recall.ts";
import { formatRecallResults } from "../format.ts";

export const recallCommand = defineCommand({
  meta: {
    name: "recall",
    description: "Retrieve memories by cue (associative recall)",
  },
  args: {
    cue: {
      type: "positional",
      description: "The recall cue — what you're trying to remember",
      required: true,
    },
    type: {
      type: "string",
      description: "Filter by memory type (episodic, semantic, procedural)",
    },
    context: {
      type: "string",
      description: "Filter by context tag",
    },
    limit: {
      type: "string",
      description: "Maximum number of results",
      alias: "n",
      default: "10",
    },
    noAssociative: {
      type: "boolean",
      description: "Disable spreading activation",
      default: false,
    },
  },
  run({ args }) {
    const engine = EngramEngine.create();
    try {
      const typeFilter =
        args.type && isValidMemoryType(args.type) ? args.type : undefined;

      const results = recall(engine.storage, args.cue, engine.config, {
        type: typeFilter,
        context: args.context ?? engine.projectContext ?? undefined,
        limit: Number(args.limit),
        associative: !args.noAssociative,
      });

      console.log(formatRecallResults(results));
    } finally {
      engine.close();
    }
  },
});
