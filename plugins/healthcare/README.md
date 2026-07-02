# Claude for Healthcare

> **Experimental.** Everything in this plugin is under active development and provided as-is for evaluation against test/sandbox systems. It is not validated for clinical use, not a medical device, and should not drive patient-care or coverage decisions without qualified human review. The FHIR connector ships read-only by default; write tools require an explicit opt-in scope at login — do not point them at a production EHR.

One plugin for healthcare work. Skills only load when relevant, so the bundle stays cheap — install once, use what applies to you.

```
/plugin marketplace add anthropics/healthcare
/plugin install healthcare@healthcare
```

## What's inside

| Skill | Audience | What it does |
|---|---|---|
| `skills/prior-auth` | payer, provider | Review prior authorization requests with clinical documentation synthesis |
| `skills/icd10-cm` | payer, provider | Turn clinical notes into claim-ready ICD-10-CM diagnosis codes via the ICD-10 connector |
| `skills/clinical-trial-protocol` | pharma | Generate FDA/NIH-compliant clinical trial protocols for devices or drugs |
| `skills/fhir-developer` | general | FHIR API development — R4 resources, SMART authorization, endpoint patterns |
| `skills/fraud-detection` | payer | FWA detection: 22-detector deterministic sweep + LLM adjudication + investigator packets |
| `skills/contracts` | payer, provider | Answer questions across a corpus of contract documents with verified citations |
| `skills/clinical-note-extract` | provider, research | Extract structured data from clinical notes with span-level provenance |
| `skills/fhir` | provider | Connect to an EHR's FHIR R4 endpoint (SMART on FHIR), pull a patient's chart and notes |

Connected MCP servers (`.mcp.json`), hosted, no setup: CMS Coverage, ICD-10 Codes, NPI Registry, Clinical Trials, PubMed. Plus one bundled local server: `fhir` (runs on your machine; see `servers/fhir/README.md`).

## Layout

- `skills/` — procedures Claude reads: steps, templates, domain reasoning
- `agents/` — specialists that skills and workflows delegate narrow judgments to
- `workflows/` — pipeline jobs (fan out → verify → roll up), run via `/workflows`

Components land here as they pass internal evals — coming next: appeal letters, coding validation, denial-backlog triage.
