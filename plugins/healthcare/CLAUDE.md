# healthcare plugin — conventions

- **Local data**: skills that need disk state write to `~/.claude/data/healthcare/<skill-name>/`. The user adds `~/.claude/data/healthcare` to `sandbox.filesystem.allowWrite` in `~/.claude/settings.json` once; subagents and Workflow workers inherit it. Honor `$ANT_<SKILL>_DATA` as an override. Never write under the plugin install path (versioned cache, wiped on upgrade).
