# Claude for Healthcare

One plugin for healthcare work: skills for payer, provider, pharma, and general engineering, with hosted MCP servers connected. Skills only load when relevant, so the bundle stays cheap.

## Quick Start

```bash
/plugin marketplace add anthropics/healthcare
/plugin install healthcare@healthcare
```

## What's inside

<!-- generated:skills:begin -->
| Skill | What it does |
|---|---|
| clinical-note-extract | Extract structured data from clinical notes with span-level provenance and null-safety. |
| clinical-trial-protocol | Generate clinical trial protocols for medical devices or drugs. |
| contracts | Answer a question across a corpus of contract documents with verified citations. |
| doc-extract | Extract plain text from a document file - PDF, DOCX, XLSX, PPTX, RTF, or plain text/markdown/HTML. |
| fhir | Connect to a hospital's FHIR R4 server (Epic, Oracle Health/Cerner, MEDITECH, athenahealth, or any SMART-on-FHIR endpoint), pull a patient's clinical data and notes, and extract structured findings. |
| fhir-developer | FHIR API development guide for building healthcare endpoints. |
| fraud-detection | Screen a Medicare/Medicaid claims corpus for fraud, waste, and abuse and produce ranked, fully-cited investigation referrals for an SIU / program-integrity team. |
| icd10-cm | Extract billable ICD-10-CM diagnosis codes from a clinical note the way a professional coder builds the claim. |
| prior-auth | Automate payer review of prior authorization (PA) requests. |
| procedure-coding | Assign CPT and HCPCS Level II procedure codes from clinical documentation the way a professional coder builds the claim. |
<!-- generated:skills:end -->

## Connected MCP servers

Hosted, no setup — referenced from the plugin's `.mcp.json`:

<!-- generated:servers:begin -->
| Server | URL |
|--------|-----|
| CMS Coverage | https://hcls.mcp.claude.com/cms_coverage/mcp |
| ICD10 Codes | https://hcls.mcp.claude.com/icd10_codes/mcp |
| NPI Registry | https://hcls.mcp.claude.com/npi_registry/mcp |
| Clinical Trials | https://hcls.mcp.claude.com/clinical_trials/mcp |
| PubMed | https://pubmed.mcp.claude.com/mcp |
| Contracts Analyzer | bundled with the plugin (local stdio) |
| FHIR | bundled with the plugin (local stdio) |
<!-- generated:servers:end -->

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
