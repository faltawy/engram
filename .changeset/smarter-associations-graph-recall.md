---
"@cogmem/engram": minor
---

Enrich association graph with emotional and causal link types, restructure recall to be graph-first with working memory priming, and add benchmark suite.

- **Emotional associations**: Link memories sharing same emotion (or same arousal tier with weaker strength), gated by emotionWeight > 0.3. Formed at encoding and during consolidation.
- **Causal associations**: Directional source→target links within shared context, strength decreases with sequence gap. Formed at encoding and during consolidation.
- **Context-aware temporal associations**: Memories in same context linked by position gap instead of time window; 300s fallback for context-less memories.
- **Graph-first recall**: Recall seeds from working memory refs + FTS + context + top-activation, then traverses association graph (depth 3) before scoring candidates.
- **Working memory priming**: Current focus contents prime recall through spreading activation.
- **Benchmark suite**: 3-tier test suite — retrieval quality (precision/recall/MRR), cognitive realism (serial position, spacing, mood congruence, causal chains), and practical agent scenarios (multi-session, debugging history, preference learning, context switching).
- **New config params**: `temporalContextWindow`, `recallSpreadingDepth`, `workingMemoryPrimingWeight`.
