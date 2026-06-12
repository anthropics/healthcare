# servers/

Customer-hosted MCP server source — for data that never leaves the customer's network (FHIR, clearinghouse 835s, eligibility).

Packages here follow the `modelcontextprotocol/servers` convention: runnable via `npx`/`uvx`, referenced by `command` in a plugin's `.mcp.json`. They are npm/PyPI artifacts, not installable plugins, so they do not get `marketplace.json` entries.

Nothing here yet — the first candidate is a FHIR server.
