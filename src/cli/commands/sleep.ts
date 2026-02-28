import { defineCommand } from "citty";

import { discoverChunks } from "../../core/chunking.ts";
import { consolidate } from "../../core/consolidation.ts";
import { EngramEngine } from "../../core/engine.ts";
import { bold, dim, green, cyan, isInteractive } from "../format.ts";

export const sleepCommand = defineCommand({
  meta: {
    name: "sleep",
    description:
      "Run consolidation cycle (replay, strengthen, prune, extract, link)",
  },
  args: {
    report: {
      type: "boolean",
      description: "Show detailed consolidation report",
      default: false,
    },
  },
  run({ args }) {
    const engine = EngramEngine.create();
    try {
      const result = consolidate(engine.storage, engine.config);
      const chunks = discoverChunks(engine.storage, engine.config);

      if (!isInteractive()) {
        console.log(
          JSON.stringify({
            memoriesStrengthened: result.memoriesStrengthened,
            memoriesPruned: result.memoriesPruned,
            factsExtracted: result.factsExtracted,
            associationsDiscovered: result.associationsDiscovered,
            chunksFormed: chunks.length,
            ...(args.report
              ? {
                  extractedFacts: result.extractedFacts,
                  prunedIds: result.prunedIds,
                  chunks: chunks.map((c) => ({
                    id: c.id,
                    label: c.label,
                    members: c.memberIds.length,
                  })),
                }
              : {}),
          })
        );
        return;
      }

      console.log(dim("  Running consolidation cycle...\n"));
      console.log(green("  Consolidation complete:\n"));
      console.log(
        `  ${cyan("Strengthened")} ${
          result.memoriesStrengthened
        } frequently-accessed memories`
      );
      console.log(
        `  ${cyan("Pruned")}       ${
          result.memoriesPruned
        } memories below activation threshold`
      );
      console.log(
        `  ${cyan("Extracted")}    ${
          result.factsExtracted
        } semantic facts from episodic patterns`
      );
      console.log(
        `  ${cyan("Discovered")}   ${
          result.associationsDiscovered
        } new associations`
      );
      if (chunks.length > 0) {
        console.log(
          `  ${cyan("Chunked")}      ${chunks.length} new memory groups`
        );
      }

      if (args.report) {
        console.log(dim("\n  ─── Detailed Report ───────────────────────\n"));

        if (result.extractedFacts.length > 0) {
          console.log(bold("  Extracted Facts:"));
          for (const fact of result.extractedFacts) {
            console.log(`    ${dim(">")} ${fact}`);
          }
          console.log("");
        }

        if (result.prunedIds.length > 0) {
          console.log(bold("  Pruned Memories:"));
          for (const id of result.prunedIds) {
            console.log(`    ${dim(">")} ${id.slice(0, 8)}`);
          }
          console.log("");
        }

        if (chunks.length > 0) {
          console.log(bold("  New Chunks:"));
          for (const chunk of chunks) {
            console.log(
              `    ${dim(">")} ${chunk.label} (${
                chunk.memberIds.length
              } memories)`
            );
          }
          console.log("");
        }

        if (result.discoveredAssociationPairs.length > 0) {
          console.log(
            bold(
              `  Associations Discovered: ${result.discoveredAssociationPairs.length}`
            )
          );
        }
      }
    } finally {
      engine.close();
    }
  },
});
