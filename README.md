# engram

> **Note:** This is an experiment in cognitive memory architecture. It's a research prototype, not production software.

Every AI agent today has amnesia. They process, respond, and forget. engram fixes this — not with a smarter key-value store, but with a cognitive memory system modeled on how the human brain actually forms, stores, recalls, and forgets information.

The name comes from neuroscience: an **engram** is the physical trace a memory leaves in the brain.

## Installation

Requires [Bun](https://bun.sh) v1.0+.

```bash
# Run directly (no install)
bunx @cogmem/engram

# Or install globally
bun install -g @cogmem/engram
engram --help
```

## The Science

engram is built on memory research. Every design decision traces back to how the brain operates.

### Memory Systems

The brain has distinct memory systems with different properties:

| System | Brain Region | Duration | engram Mapping |
|---|---|---|---|
| **Working Memory** | Prefrontal Cortex | Seconds | `engram focus` — capacity-limited buffer (Miller's Law: 7 ± 2 items) |
| **Episodic Memory** | Hippocampus → Neocortex | Minutes to lifetime | Contextual experiences — the *what, when, where, how it felt* |
| **Semantic Memory** | Neocortex | Very long-term | Facts and concepts, detached from when you learned them |
| **Procedural Memory** | Basal Ganglia | Lifetime | Skills and habits — immune to decay, expressed through action |

### ACT-R Activation Model

Memory retrieval uses the [ACT-R cognitive architecture](https://act-r.psy.cmu.edu/about/) (Anderson, 1993), the most validated computational model of human memory.

**Total activation** of a memory determines whether it can be recalled:

```
A_i = B_i + Σ(W_j · S_ji) + ε
```

- `B_i` = base-level activation (how inherently strong the memory is)
- `Σ(W_j · S_ji)` = spreading activation from associated memories
- `ε` = stochastic noise (recall isn't perfectly deterministic)

**Base-level activation** follows the power law of forgetting:

```
B_i = ln(Σ t_j^{-d})
```

Where `n` = number of accesses, `t_j` = time since j-th access, `d` ≈ 0.5. This captures two human behaviors: **recency** (recent accesses contribute more) and **frequency** (more accesses = higher activation).

**Retrieval threshold**: A memory can only be recalled if `A_i > τ`. Below this, it's effectively "forgotten" — it still exists but can't be accessed.

**Retrieval latency**: `Time = F · e^{-f·A_i}` — stronger memories are recalled faster. Weak memories take longer (the "tip of the tongue" feeling).

### Ebbinghaus Forgetting Curve

Retention decays exponentially without reinforcement (Ebbinghaus, 1885):

```
R(t) = e^{-t/S}
```

Where `S` (memory strength) increases with recall count, emotional weight, and number of associative links.

### Spreading Activation

When one memory is activated, activation spreads along associative links to related memories (Collins & Loftus, 1975). Thinking of "coffee" activates "morning" → "commute" → "that conversation." The spreading strength is:

```
S_ji = S - ln(fan_j)
```

Memories with many connections receive *less* boost from each (diffusion). Specific cues work better than generic ones.

### Consolidation (Sleep)

During sleep, the brain replays, strengthens, prunes, extracts patterns, and discovers connections. engram's `sleep` command mirrors this:

1. **Replay** — refresh activation levels for all memories
2. **Strengthen** — boost frequently-accessed memories (2+ accesses in 24h)
3. **Prune** — remove memories below activation threshold
4. **Extract** — distill repeated episodic patterns into semantic facts
5. **Link** — discover temporal and semantic associations

### Reconsolidation

When you recall a memory, it temporarily becomes unstable and can be modified (Nader et al., 2000). It then re-stabilizes with updates incorporated. **Every act of remembering is also an act of rewriting.**

### Emotional Modulation

The amygdala modulates encoding strength. High-arousal emotions (anxiety, surprise) produce stronger memory traces than low-arousal states. Emotional memories decay slower.

## CLI Usage

### Encoding Memories

```bash
# Semantic memory (facts, knowledge)
engram encode "TypeScript is a superset of JavaScript" --type semantic

# Episodic memory (experiences with context)
engram encode "deployed v2.0 to prod at 3am, monitoring broke" \
  --type episodic --emotion anxiety --context "project:acme"

# Procedural memory (skills, immune to decay)
engram encode "always run smoke tests before deploying" --type procedural
```

### Recalling Memories

```bash
# Associative recall — cue activates related memories via spreading activation
engram recall "deployment issues"

# Filter by type or context
engram recall "user preferences" --type semantic
engram recall "incidents" --context "project:acme"

# Disable spreading activation
engram recall "TypeScript" --no-associative
```

### Working Memory

```bash
engram focus "refactoring the auth module"   # push to working memory
engram focus                                  # view current focus
engram focus --pop                            # remove most recent
engram focus --clear                          # clear all
```

### Consolidation (Sleep)

```bash
engram sleep                  # run full consolidation cycle
engram sleep --report         # with detailed report
```

### Inspection

```bash
engram stats                  # memory system health overview
engram health                 # diagnostic health check
engram inspect <memory-id>    # examine a memory's full lifecycle
```

## MCP Server

engram exposes its cognitive model as an MCP (Model Context Protocol) server, so AI agents can use it as a memory backend.

### Setup

Add to your MCP client configuration (e.g., Claude Code `settings.json`):

```json
{
  "mcpServers": {
    "engram": {
      "command": "bunx",
      "args": ["-p", "@cogmem/engram", "engram-mcp"]
    }
  }
}
```

### Available Tools

| Tool | Description |
|---|---|
| `memory_store` | Encode new memories or reconsolidate existing ones |
| `memory_recall` | Cue-based retrieval, memory inspection, or system stats |
| `memory_manage` | Run consolidation or manage working memory |

## Programmatic API

```typescript
import { EngramEngine, encode, recall, consolidate } from "engram";

const engine = EngramEngine.inMemory();

// Encode
const memory = encode(engine.storage, {
  content: "important fact",
  type: "semantic",
  emotion: "curiosity",
}, engine.config);

// Recall
const results = recall(engine.storage, "important", engine.config);

// Consolidate
const report = consolidate(engine.storage, engine.config);

engine.close();
```

## Configuration

Cognitive parameters can be tuned via environment variables or the `loadConfig()` function:

| Parameter | Default | Env Variable | Description |
|---|---|---|---|
| `decayRate` | 0.5 | `ENGRAM_DECAY_RATE` | ACT-R power law decay parameter |
| `retrievalThreshold` | -1.0 | `ENGRAM_RETRIEVAL_THRESHOLD` | Minimum activation for recall |
| `workingMemoryCapacity` | 7 | `ENGRAM_WM_CAPACITY` | Miller's Law capacity limit |
| `dbPath` | `~/.engram/memory.db` | `ENGRAM_DB_PATH` | SQLite database location |

All parameters are also configurable programmatically:

```typescript
import { EngramEngine } from "engram";

const engine = new EngramEngine({
  decayRate: 0.3,
  workingMemoryCapacity: 5,
  emotionalBoostFactor: 3.0,
});
```

## References

- Anderson, J.R. (1993). *Rules of the Mind*. ACT-R Cognitive Architecture.
- Ebbinghaus, H. (1885). *Uber das Gedachtnis*. Memory and forgetting curves.
- Collins, A.M. & Loftus, E.F. (1975). A spreading-activation theory of semantic processing.
- Nader, K., Schafe, G.E. & Le Doux, J.E. (2000). Fear memories require protein synthesis in the amygdala for reconsolidation after retrieval.
- Miller, G.A. (1956). The magical number seven, plus or minus two.
