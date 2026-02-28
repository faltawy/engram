---
"@cogmem/engram": patch
---

Fix `engram install` writing MCP config to wrong files — global now writes to `~/.claude.json` instead of `~/.claude/settings.json`, project writes to `.mcp.json` instead of `.claude/settings.local.json`
