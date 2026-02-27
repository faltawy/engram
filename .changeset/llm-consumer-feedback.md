---
"@cogmem/engram": minor
---

Add batch encode, list/browse, recall format param, and recall_to_focus actions based on LLM consumer feedback.

- **encode_batch**: Store multiple memories in one call, returns compact `{stored: [ids]}`.
- **list**: Browse memories without activation effects, with offset/limit pagination and format param.
- **format param**: Recall and list support `format: "full" | "content" | "ids"` for token-efficient responses.
- **recall_to_focus**: Combo action that recalls memories and pushes them to working memory in one step.
- **Compact responses**: Encode returns `{id}` only; reconsolidate drops echoed fields.
- **Context filtering fix**: Recall now surfaces context-tagged memories even when FTS cue doesn't match content.
- **Better errors**: Validation errors include valid values inline.
- **Trimmed descriptions**: Tool descriptions condensed to single-line summaries; fixed phantom emotions in enum.
