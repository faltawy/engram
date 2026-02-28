import { defineCommand } from "citty";

import { EngramEngine } from "../../core/engine.ts";
import { refreshActivations } from "../../core/forgetting.ts";
import { focusUtilization } from "../../core/working-memory.ts";
import { bold, dim, green, yellow, red, isInteractive } from "../format.ts";

export const healthCommand = defineCommand({
  meta: {
    name: "health",
    description: "Brain health check — diagnose memory system issues",
  },
  run() {
    const engine = EngramEngine.create();
    try {
      const { atRisk } = refreshActivations(engine.storage, engine.config);
      const { used, capacity } = focusUtilization(
        engine.storage,
        engine.config
      );
      const lastConsolidation = engine.storage.getLastConsolidation();
      const totalMemories = engine.storage.getMemoryCount();
      const associationCount = engine.storage.getAssociationCount();

      if (!isInteractive()) {
        const hoursAgo = lastConsolidation
          ? (Date.now() - lastConsolidation.ranAt) / 3600000
          : null;
        console.log(
          JSON.stringify({
            atRisk,
            workingMemory: { used, capacity },
            totalMemories,
            associations: associationCount,
            lastConsolidationHoursAgo: hoursAgo ? Math.round(hoursAgo) : null,
          })
        );
        return;
      }

      console.log(bold("  engram — health check\n"));

      if (atRisk > 0) {
        console.log(
          yellow(`  ! ${atRisk} memories at risk of being forgotten`)
        );
      } else {
        console.log(green("  + All memories above retrieval threshold"));
      }

      if (used <= capacity) {
        console.log(
          green(`  + Working memory within capacity (${used}/${capacity})`)
        );
      } else {
        console.log(
          red(`  ! Working memory over capacity (${used}/${capacity})`)
        );
      }

      if (lastConsolidation) {
        const hoursAgo = (Date.now() - lastConsolidation.ranAt) / 3600000;
        if (hoursAgo > 18) {
          console.log(
            red(
              `  ! Consolidation overdue (last: ${Math.round(hoursAgo)}h ago)`
            )
          );
        } else if (hoursAgo > 8) {
          console.log(
            yellow(
              `  ~ Consolidation recommended soon (last: ${Math.round(
                hoursAgo
              )}h ago)`
            )
          );
        } else {
          console.log(
            green(
              `  + Consolidation recent (last: ${Math.round(hoursAgo)}h ago)`
            )
          );
        }
      } else if (totalMemories > 0) {
        console.log(
          yellow("  ! No consolidation has ever run — run `engram sleep`")
        );
      } else {
        console.log(dim("  ~ No memories encoded yet"));
      }

      if (totalMemories > 5 && associationCount === 0) {
        console.log(
          yellow(
            "  ! No associations formed — run `engram sleep` to discover links"
          )
        );
      } else if (associationCount > 0) {
        const ratio = associationCount / Math.max(1, totalMemories);
        if (ratio > 1) {
          console.log(
            green(`  + Association network is rich (${associationCount} links)`)
          );
        } else {
          console.log(
            green(
              `  + Association network is healthy (${associationCount} links)`
            )
          );
        }
      }
    } finally {
      engine.close();
    }
  },
});
