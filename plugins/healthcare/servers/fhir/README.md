# mcp-server-fhir

Local stdio MCP server for clinical data access against any SMART-on-FHIR R4 endpoint — Epic, Oracle Health (Cerner), MEDITECH, athenahealth, OpenEMR, HAPI, and other conformant servers. Uses the SMART client_id your organization has registered with its EHR.

Runs as a subprocess on the user's machine: the FHIR API leg is direct between this process and the EHR. Tool results returned to the calling agent become part of that agent's conversation with its LLM provider — handle that leg under the appropriate agreement for your deployment. This README is not compliance advice.

**Status: experimental, pre-release.** For evaluation against test/sandbox FHIR servers. Not validated for clinical use; do not point write tools at a production EHR.

## Install

Ships bundled inside the `healthcare` plugin (`servers/fhir.js`, single file, deps inlined) and is wired via `${CLAUDE_PLUGIN_ROOT}` in the plugin's `.mcp.json` — installing the plugin is the install step. To point it at your EHR, add `env` to that entry:

```jsonc
"fhir": {
  "command": "node",
  "args": ["${CLAUDE_PLUGIN_ROOT}/servers/fhir.js"],
  "env": {
    "FHIR_BASE_URL": "https://<your-fhir-r4-base>",
    "FHIR_CLIENT_ID": "<your-org's-SMART-client-id>"
  }
}
```

## Tools

**Auth/session** (always prompt): `connect({base_url?, client_id?, bearer_token?, scope?})` · `connect_complete({callback_url})` · `disconnect()`

**Read** (annotated `readOnlyHint`): `status()` · `capability()` · `search_patients` · `get_patient` · `search_conditions` · `search_observations` · `search_medication_requests` · `search_allergies` · `search_document_references` · `get_document_content` · `search_resource(type, params)` · `read_resource(type, id)`

**Local file write** (no `readOnlyHint`, so it prompts): `save_document_for_extraction(doc_ref_id)` — writes a binary attachment to a server-chosen tmpdir file (0600) and returns the path for an external extractor (the plugin's `doc-extract` skill); the caller deletes the file after.

**Write** (annotated `destructiveHint`; 403 unless `connect()` was passed a write scope like `user/*.cruds`): `create_resource(type, body)` · `update_resource(type, id, body)`

`get_document_content` follows `attachment.url` → `Binary/{id}` (same-origin only) and decodes text-family types in-process — plain text, markdown, HTML/XHTML, RTF/richtext, and XML/C-CDA (narrative sections; a CDA wrapping a base64 body is treated as binary). Returns `{id, content_type, text, untrusted: true}`; binary types (PDF, DOCX, images, ...) → `{text: null, reason: "binary_not_extracted"}`, recoverable via `save_document_for_extraction` + doc-extract (OCR included). Multi-rendition documents: `get_document_content` picks the text rendition, `save_document_for_extraction` the binary one. Save accepts any content type — unknown ones get a magic-byte-sniffed or subtype-derived temp-file extension and the extractor decides.

## Auth

`connect()` with no args reads `FHIR_BASE_URL` + `FHIR_CLIENT_ID` from env and runs SMART standalone PKCE: on a desktop, opens the browser and listens on `localhost:53682/53683`; in a headless/VM environment (`FHIR_AUTH_MODE=manual`), returns the sign-in URL and you finish via `connect_complete` with the pasted callback URL. Default scope is `user/*.rs` (one login, whole panel, read+search only). Scope syntax negotiates v2→v1 against servers that don't advertise `permission-v2`.

The connection (base URL + access token, ≤1h TTL) is cached to `os.tmpdir()` (mode 0600, ownership-checked) so it survives the host respawning the stdio subprocess. The refresh token is held in memory only.

## Limitations

- **RTF decode is minimal, not a full parser.** Group-aware strip with cp1252/`\uN`/`\bin` handling — fine for EHR note bodies; exotic RTF (nested tables, fields) degrades to plain text.
- **PDFs/images need the extraction hop** — `get_document_content` returns `binary_not_extracted`; recover via `save_document_for_extraction` + the doc-extract skill.
- **No DELETE.** `create_resource`/`update_resource` only.
- **No bulk export** (`$export`). Per-resource reads scoped by the clinician's auth only.
- **SSRF guard is hostname-pattern, not socket-level.** Literal private/link-local IPs and known metadata hostnames are rejected; a hostname that DNS-resolves to a private IP is not (TOCTOU). Mitigated by the user's-own-machine threat model; full socket-level filtering is a follow-up.
- **Re-auth per session.** The refresh token is not persisted (no OS keyring); a fresh SMART login is needed once per session/host where the access token has expired.
- **`launch.smarthealthit.org`** works no-auth with the bare `/v/r4/fhir` URL; SMART login against it needs a sim-encoded `iss` from its launcher UI.

## Dev

```sh
bun install
bun run build    # tsc --noEmit typecheck
bun run bundle   # → ../../plugins/healthcare/servers/fhir.js
bun run dev      # tsx stdio
```
