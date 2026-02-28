---
name: engram
description: Cognitive memory for AI agents — use when encoding, recalling, or managing persistent memories across sessions
---

# Engram — Cognitive Memory Protocol

You have a biologically-inspired memory system. Use it like a brain, not a database.

## Session Lifecycle

**Start:** Recall what you know about the current context.
```
memory_recall → { action: "recall", cue: "<project or topic>" }
memory_manage → { action: "focus_get" }
```

**During:** Encode insights as they emerge. Don't batch everything at the end.
```
memory_store → { action: "encode", content: "...", type: "...", emotion: "..." }
```

**End:** Consolidate to strengthen and link memories.
```
memory_manage → { action: "consolidate" }
```

## Memory Types

| Type | Use when | Examples |
|------|----------|---------|
| `episodic` | Something *happened* — events, interactions, debugging sessions | "User reported login failing on Safari", "Deployed v2.3 with new caching" |
| `semantic` | A *fact* or *concept* — knowledge, definitions, relationships | "Auth uses JWT with 24h expiry", "The payments module depends on Stripe SDK" |
| `procedural` | A *skill* or *process* — how to do things, patterns, workflows | "To deploy: run tests → build → push to staging → verify → promote" |

**Default to `semantic`** when unsure. Procedural memories never decay — use them for durable skills.

## Emotion Tags

Tag memories with emotional context. This affects recall priority — emotional memories surface faster.

| Emotion | When to use |
|---------|-------------|
| `joy` | Something worked well, positive outcome, breakthrough |
| `satisfaction` | Task completed successfully, clean solution |
| `curiosity` | Interesting finding, worth exploring further |
| `surprise` | Unexpected behavior, counter-intuitive result |
| `anxiety` | Risk identified, potential failure, fragile code |
| `frustration` | Recurring problem, friction, workaround needed |
| `neutral` | Routine fact, no emotional significance |

Omit emotion for routine facts. Tag frustration on pain points — it helps surface them when they recur.

## MCP Tools Reference

### memory_store
| Action | Required | Optional |
|--------|----------|----------|
| `encode` | `content` | `type`, `emotion`, `emotionWeight` (0-1), `context` |
| `encode_batch` | `memories[]` (1-50) | each: `type`, `emotion`, `emotionWeight`, `context` |
| `reconsolidate` | `id` | `newContext`, `currentEmotion`, `currentEmotionWeight` |

### memory_recall
| Action | Required | Optional |
|--------|----------|----------|
| `recall` | `cue` | `limit`, `type`, `context`, `associative` (bool), `format` |
| `list` | — | `type`, `context`, `limit`, `offset`, `format` |
| `inspect` | `id` | — |
| `stats` | — | — |

### memory_manage
| Action | Required | Optional |
|--------|----------|----------|
| `consolidate` | — | — |
| `focus_push` | `content` | `memoryRef` |
| `focus_pop` | — | — |
| `focus_get` | — | — |
| `focus_clear` | — | — |
| `recall_to_focus` | `cue` | `limit`, `type`, `context` |

## Working Memory (Focus Buffer)

7 slots. Use it to hold active context during complex tasks.

- **Push** key facts you'll reference repeatedly during a task
- **Recall to focus** loads top recall results into the buffer
- **Pop/clear** when switching contexts
- The buffer is LIFO — newest items pop first

**Priming pattern:** At session start, recall + focus to seed your working context:
```
memory_manage → { action: "recall_to_focus", cue: "<current task>" }
```

## Key Behaviors

- **Recall strengthens memories** — each recall boosts activation (use-it-or-lose-it)
- **List does NOT strengthen** — use list for browsing without side effects
- **Procedural memories never decay** — once encoded, they persist permanently
- **Consolidation discovers associations** — run it to link related memories
- **Emotional memories resist decay** — tagged memories survive longer
- **Context scopes memories** — use `context: "project:name"` to partition

## What to Encode

**Encode:** decisions and their rationale, architectural insights, debugging breakthroughs, user preferences, recurring patterns, project-specific knowledge, lessons learned

**Don't encode:** transient task state, information already in code/docs, obvious facts, raw data without interpretation

## Context Convention

Use hierarchical context tags: `project:engram`, `project:acme/auth`, `topic:deployment`.
This lets you recall scoped to a project or topic without noise from other domains.
