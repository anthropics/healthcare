# healthcare plugin — conventions

- **Local data**: skills write to `~/.claude/data/healthcare/<skill-name>/`. Override the parent dir with `$CLAUDE_HEALTHCARE_DATA`; each skill appends its own name. The user adds `~/.claude/data/healthcare` to `sandbox.filesystem.allowWrite` in `~/.claude/settings.json` once; subagents and Workflow workers inherit it. Never write under the plugin install path (versioned cache, wiped on upgrade).
