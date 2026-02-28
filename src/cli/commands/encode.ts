import { defineCommand } from "citty";

import { isValidEmotion } from "../../core/emotional-tag.ts";
import { encode } from "../../core/encoder.ts";
import { EngramEngine } from "../../core/engine.ts";
import { isValidMemoryType, Emotion } from "../../core/memory.ts";
import { formatMemoryEncoded } from "../format.ts";

export const encodeCommand = defineCommand({
  meta: {
    name: "encode",
    description: "Form a new memory",
  },
  args: {
    content: {
      type: "positional",
      description: "The memory content to encode",
      required: true,
    },
    type: {
      type: "string",
      description: "Memory type (episodic, semantic, procedural)",
      default: "semantic",
    },
    emotion: {
      type: "string",
      description: `Emotional tag (${Object.values(Emotion).join(", ")})`,
      default: "neutral",
    },
    context: {
      type: "string",
      description: "Context tag (e.g. project:acme)",
    },
    emotionWeight: {
      type: "string",
      description: "Emotion intensity 0-1 (overrides default)",
      alias: "w",
    },
  },
  run({ args }) {
    const typeStr = args.type ?? "semantic";
    if (!isValidMemoryType(typeStr)) {
      console.error(
        `Invalid type: ${typeStr}. Valid: episodic, semantic, procedural`
      );
      process.exit(1);
    }

    const emotionStr = args.emotion ?? "neutral";
    if (!isValidEmotion(emotionStr)) {
      console.error(
        `Invalid emotion: ${emotionStr}. Valid: ${Object.values(Emotion).join(
          ", "
        )}`
      );
      process.exit(1);
    }

    const engine = EngramEngine.create();
    try {
      const memory = encode(
        engine.storage,
        {
          content: args.content,
          type: typeStr,
          emotion: emotionStr,
          emotionWeight: args.emotionWeight
            ? Number(args.emotionWeight)
            : undefined,
          context: args.context ?? engine.projectContext ?? undefined,
        },
        engine.config
      );

      console.log(formatMemoryEncoded(memory));
    } finally {
      engine.close();
    }
  },
});
