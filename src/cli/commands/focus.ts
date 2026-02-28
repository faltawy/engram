import { defineCommand } from "citty";

import { EngramEngine } from "../../core/engine.ts";
import {
  pushFocus,
  popFocus,
  getFocus,
  clearFocus,
  focusUtilization,
} from "../../core/working-memory.ts";
import { bold, dim, cyan, isInteractive } from "../format.ts";

export const focusCommand = defineCommand({
  meta: {
    name: "focus",
    description: "Manage working memory (what you're actively thinking about)",
  },
  args: {
    content: {
      type: "positional",
      description:
        "Content to push into working memory (omit to view current focus)",
    },
    clear: {
      type: "boolean",
      description: "Clear all working memory",
      default: false,
    },
    pop: {
      type: "boolean",
      description: "Remove the most recent item from working memory",
      default: false,
    },
  },
  run({ args }) {
    const engine = EngramEngine.create();
    try {
      if (args.clear) {
        const count = clearFocus(engine.storage);
        if (!isInteractive()) {
          console.log(JSON.stringify({ cleared: count }));
        } else {
          console.log(dim(`  Cleared ${count} items from working memory.`));
        }
        return;
      }

      if (args.pop) {
        const popped = popFocus(engine.storage);
        if (!isInteractive()) {
          console.log(
            JSON.stringify(
              popped ? { slot: popped.slot, content: popped.content } : null
            )
          );
        } else if (popped) {
          console.log(dim("  Removed: ") + bold(popped.content));
        } else {
          console.log(dim("  Working memory is empty."));
        }
        return;
      }

      if (args.content) {
        const { slot, evicted } = pushFocus(
          engine.storage,
          args.content,
          engine.config
        );
        if (!isInteractive()) {
          console.log(
            JSON.stringify({
              slot: slot.slot,
              content: slot.content,
              evicted: evicted
                ? { slot: evicted.slot, content: evicted.content }
                : null,
            })
          );
        } else {
          console.log(
            cyan("  Focused on: ") +
              bold(slot.content) +
              dim(` [slot ${slot.slot}]`)
          );
          if (evicted) {
            console.log(
              dim(
                `  Evicted: "${evicted.content}" (oldest item, capacity reached)`
              )
            );
          }
        }
        return;
      }

      const slots = getFocus(engine.storage);
      const { used, capacity } = focusUtilization(
        engine.storage,
        engine.config
      );

      if (!isInteractive()) {
        console.log(
          JSON.stringify({
            used,
            capacity,
            slots: slots.map((s) => ({
              slot: s.slot,
              content: s.content,
              memoryRef: s.memoryRef,
            })),
          })
        );
        return;
      }

      if (slots.length === 0) {
        console.log(dim("  Working memory is empty."));
        return;
      }

      console.log(bold(`  Working Memory`) + dim(` [${used}/${capacity}]`));
      for (const slot of slots) {
        console.log(
          `  ${cyan(">")} ${slot.content}` + dim(` [slot ${slot.slot}]`)
        );
      }
    } finally {
      engine.close();
    }
  },
});
