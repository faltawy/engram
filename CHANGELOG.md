# @cogmem/engram

## 0.3.0

### Minor Changes

- 1acccc2: Add `engram install` command that installs the SKILL.md cognitive protocol and configures the MCP server for your AI editor. Supports `--provider`, `--global`/`--project` scope, `--dry-run`, and interactive prompts when flags are omitted.

## 0.2.1

### Patch Changes

- 32dd802: Expand benchmark suite from 20 to 40 tests with scale testing (100/250/500 memories), interference disambiguation, memory pressure validation, fan effect measurements, multi-week project scenarios, and stress/throughput benchmarks. Extract shared metrics into helpers module.

## 0.2.0

### Minor Changes

- 226e157: Enrich association graph with emotional and causal link types, restructure recall to be graph-first with working memory priming, and add benchmark suite.
  - **Emotional associations**: Link memories sharing same emotion (or same arousal tier with weaker strength), gated by emotionWeight > 0.3. Formed at encoding and during consolidation.
  - **Causal associations**: Directional source→target links within shared context, strength decreases with sequence gap. Formed at encoding and during consolidation.
  - **Context-aware temporal associations**: Memories in same context linked by position gap instead of time window; 300s fallback for context-less memories.
  - **Graph-first recall**: Recall seeds from working memory refs + FTS + context + top-activation, then traverses association graph (depth 3) before scoring candidates.
  - **Working memory priming**: Current focus contents prime recall through spreading activation.
  - **Benchmark suite**: 3-tier test suite — retrieval quality (precision/recall/MRR), cognitive realism (serial position, spacing, mood congruence, causal chains), and practical agent scenarios (multi-session, debugging history, preference learning, context switching).
  - **New config params**: `temporalContextWindow`, `recallSpreadingDepth`, `workingMemoryPrimingWeight`.

## 0.1.0

### Minor Changes

- ab180d5: Add batch encode, list/browse, recall format param, and recall_to_focus actions based on LLM consumer feedback.
  - **encode_batch**: Store multiple memories in one call, returns compact `{stored: [ids]}`.
  - **list**: Browse memories without activation effects, with offset/limit pagination and format param.
  - **format param**: Recall and list support `format: "full" | "content" | "ids"` for token-efficient responses.
  - **recall_to_focus**: Combo action that recalls memories and pushes them to working memory in one step.
  - **Compact responses**: Encode returns `{id}` only; reconsolidate drops echoed fields.
  - **Context filtering fix**: Recall now surfaces context-tagged memories even when FTS cue doesn't match content.
  - **Better errors**: Validation errors include valid values inline.
  - **Trimmed descriptions**: Tool descriptions condensed to single-line summaries; fixed phantom emotions in enum.
