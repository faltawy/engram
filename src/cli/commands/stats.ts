import { defineCommand } from "citty";
import { EngramEngine } from "../../core/engine.ts";
import { focusUtilization } from "../../core/working-memory.ts";
import { bold, dim, green, yellow, red, isInteractive } from "../format.ts";
import { refreshActivations } from "../../core/forgetting.ts";

export const statsCommand = defineCommand({
  meta: {
    name: "stats",
    description: "Memory system health overview",
  },
  run() {
    const engine = EngramEngine.create();
    try {
      const { atRisk } = refreshActivations(engine.storage, engine.config);

      const episodicCount = engine.storage.getMemoryCount("episodic");
      const semanticCount = engine.storage.getMemoryCount("semantic");
      const proceduralCount = engine.storage.getMemoryCount("procedural");
      const associationCount = engine.storage.getAssociationCount();
      const { used, capacity } = focusUtilization(engine.storage, engine.config);

      const lastConsolidation = engine.storage.getLastConsolidation();

      const projectContext = engine.projectContext;
      const projectCounts = projectContext
        ? {
            episodic: engine.storage.getMemoryCountByContext(projectContext, "episodic"),
            semantic: engine.storage.getMemoryCountByContext(projectContext, "semantic"),
            procedural: engine.storage.getMemoryCountByContext(projectContext, "procedural"),
            total: engine.storage.getMemoryCountByContext(projectContext),
          }
        : null;

      if (!isInteractive()) {
        console.log(
          JSON.stringify({
            workingMemory: { used, capacity },
            episodic: episodicCount,
            semantic: semanticCount,
            procedural: proceduralCount,
            associations: associationCount,
            atRisk,
            lastConsolidation: lastConsolidation ? { ranAt: lastConsolidation.ranAt } : null,
            ...(projectCounts ? { project: { context: projectContext, ...projectCounts } } : {}),
          }),
        );
        return;
      }

      console.log(bold("  engram — memory system stats\n"));

      const wmStatus =
        used >= capacity
          ? red(`${used}/${capacity} slots used (FULL)`)
          : used > capacity * 0.7
            ? yellow(`${used}/${capacity} slots used`)
            : green(`${used}/${capacity} slots used`);
      console.log(`  Working Memory:  ${wmStatus}`);

      console.log(
        `  Episodic:        ${episodicCount} memories` +
          (atRisk > 0 ? ` ${yellow(`(${atRisk} at risk of forgetting)`)}` : ""),
      );
      console.log(`  Semantic:        ${semanticCount} facts`);
      console.log(`  Procedural:      ${proceduralCount} skills ${dim("(immune to decay)")}`);

      console.log(`  Associations:    ${associationCount} links`);

      if (lastConsolidation) {
        const hoursAgo = Math.round((Date.now() - lastConsolidation.ranAt) / 3600000);
        const consolidationStatus =
          hoursAgo > 12
            ? red(`${hoursAgo}h ago (overdue)`)
            : hoursAgo > 6
              ? yellow(`${hoursAgo}h ago`)
              : green(`${hoursAgo}h ago`);
        console.log(`  Last sleep:      ${consolidationStatus}`);
      } else {
        console.log(`  Last sleep:      ${dim("never")}`);
      }

      if (projectCounts) {
        console.log("");
        console.log(bold(`  project: ${projectContext}\n`));
        console.log(`  Episodic:        ${projectCounts.episodic} memories`);
        console.log(`  Semantic:        ${projectCounts.semantic} facts`);
        console.log(`  Procedural:      ${projectCounts.procedural} skills`);
        console.log(dim(`  Total:           ${projectCounts.total} memories`));
      }
    } finally {
      engine.close();
    }
  },
});
