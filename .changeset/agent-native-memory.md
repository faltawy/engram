---
"@cogmem/engram": minor
---

Agent-native memory: decay now follows agent activity instead of wall-clock time by default (`clockMode: "agent"`, opt out with `ENGRAM_CLOCK_MODE=wall`) — idle time between sessions no longer fades memories. Adds first-class sessions with `session_begin`/`session_end` MCP actions, plus `forget`, `associate`, and `contexts`. MCP tool schemas are now properly typed (they previously serialized empty, so clients called tools blind). Breaking for MCP callers of `associate`: the `type` parameter is now `associationType`. Retrieval ranking improved: cue matches now boost activation (Scale-500 MRR 18%→47% on the built-in benchmarks). Existing databases are migrated automatically.
