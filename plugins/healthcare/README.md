# Claude for Healthcare

One plugin for healthcare work. Skills only load when relevant, so the bundle stays cheap — install once, use what applies to you.

```
/plugin marketplace add anthropics/healthcare
/plugin install healthcare@healthcare
```

## What's inside

| Skill | Audience | What it does |
|---|---|---|
| `skills/prior-auth` | payer, provider | Review prior authorization requests with clinical documentation synthesis |
| `skills/clinical-trial-protocol` | pharma | Generate FDA/NIH-compliant clinical trial protocols for devices or drugs |
| `skills/fhir-developer` | general | FHIR API development — R4 resources, SMART authorization, endpoint patterns |

Connected MCP servers (`.mcp.json`), hosted, no setup: CMS Coverage, ICD-10 Codes, NPI Registry, Clinical Trials, PubMed.

## Layout

- `skills/` — procedures Claude reads: steps, templates, domain reasoning
- `agents/` — specialists that skills and workflows delegate narrow judgments to
- `workflows/` — pipeline jobs (fan out → verify → roll up), run via `/workflows`

Components land here as they pass internal evals — coming next: appeal letters, coding validation, denial-backlog triage.
