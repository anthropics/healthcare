# healthcare plugin — conventions

- **Local data**: skills and bundled MCP servers write to `~/.claude/data/healthcare/<component-name>/`, where the component is the *server's* name, not the skill's (the contracts skill's server writes to `documents/`). Override the parent dir with `$CLAUDE_HEALTHCARE_DATA`; each component appends its own name. The user adds `~/.claude/data/healthcare` to `sandbox.filesystem.allowWrite` in `~/.claude/settings.json` once; subagents and Workflow workers inherit it. Never write under the plugin install path (versioned cache, wiped on upgrade).
