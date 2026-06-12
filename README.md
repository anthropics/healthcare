# Claude for Healthcare

One plugin for healthcare work: skills for payer, provider, pharma, and general engineering, with hosted MCP servers connected. Skills only load when relevant, so the bundle stays cheap.

## Quick Start

```bash
/plugin marketplace add anthropics/healthcare
/plugin install healthcare@healthcare
```

## What's inside

| Skill | Audience | What it does |
|---|---|---|
| prior-auth | payer, provider | Review prior authorization requests with clinical documentation synthesis |
| clinical-trial-protocol | pharma | Generate FDA/NIH-compliant clinical trial protocols for devices or drugs |
| fhir-developer | general | FHIR API development — R4 resources, SMART authorization, endpoint patterns |

## Connected MCP servers

Hosted, no setup — referenced from the plugin's `.mcp.json`:

| Server | URL |
|--------|-----|
| CMS Coverage | https://hcls.mcp.claude.com/cms_coverage/mcp |
| ICD-10 Codes | https://hcls.mcp.claude.com/icd10_codes/mcp |
| NPI Registry | https://hcls.mcp.claude.com/npi_registry/mcp |
| Clinical Trials | https://hcls.mcp.claude.com/clinical_trials/mcp |
| PubMed | https://pubmed.mcp.claude.com/mcp |

## Layout

```
healthcare/
├── .claude-plugin/marketplace.json
├── plugins/healthcare/        # the plugin: skills/ · agents/ · workflows/ · .mcp.json
├── servers/                   # customer-hosted MCP server source (npx/uvx runnable)
└── managed-agents/            # agent.yaml templates for the Managed Agents API
```

- `skills/` — procedures Claude reads; `agents/` — specialists for narrow judgments; `workflows/` — pipeline jobs run via `/workflows`.
- Servers for customer-private data (FHIR, claims feeds) will live in `servers/` as runnable packages.

## Migrating from v1

The v1 per-skill and per-server plugins (`prior-auth-review`, `fhir-developer`, `clinical-trial-protocol`, `cms-coverage`, `icd10-codes`, `npi-registry`, `pubmed`) remain installable as deprecated aliases resolving into the single `healthcare` plugin. Switch to `healthcare@healthcare`; the aliases will be removed in a future release.

## License

Provided under Anthropic's terms of service.
