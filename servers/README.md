# servers/

Customer-hosted MCP server source — standalone deployables for data that never leaves the customer's network (clearinghouse 835s, eligibility).

Packages here follow the `modelcontextprotocol/servers` convention: runnable via `npx`/`uvx`, referenced by `command` in a plugin's `.mcp.json`. They are npm/PyPI artifacts, not installable plugins.

Nothing here yet. (The FHIR connector ships bundled inside the healthcare plugin instead — see `plugins/healthcare/servers/`.)
