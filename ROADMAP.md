# Healthcare Skills Roadmap

This is the working backlog of skills for the Claude Code `healthcare` plugin marketplace, prioritized by the healthcare team. The ranking reflects where Claude can most credibly reduce administrative burden for providers and payers today while we build out evaluation coverage. See the [prioritization rationale doc](https://docs.google.com/document/d/1H5IZoECsCSdxUqB7i1NhM8f-kWZsIc1GW4bBEQJLbH4) (internal access only) for the full reasoning behind the ordering.

## Priority backlog

| Skill | Priority | Status | Owner | Customer signal | Notes |
|---|---|---|---|---|---|
| **Prior Auth Request** | P0 | TODO | [@chris-lovejoy](https://github.com/chris-lovejoy) | — | Provider-side: assemble a prior-authorization request (clinical justification, policy criteria, supporting documentation) from chart data. Pairs with the existing `prior-auth-review` skill on the payer side. Leverage the `cms-coverage` and `npi-registry` MCP connectors. |
| **Medical Coding** | P0 | TODO | — | — | **ICD-10-CM and HCPCS Level II only** for initial release — see [Code-set licensing](#code-set-licensing) below. Chart → diagnosis/procedure code assignment. Leverage the `icd10-codes` MCP connector. Thinnest current eval coverage; ship with a chart→multi-label eval. |
| **Claims Processing** | P1 | TODO | — | Partner interest (first-pass claims) | Payer-side adjudication support: provider-contract review, fraud/waste/abuse (FW&A) detection, claim-line validation. Likely decomposes into 2–3 sub-skills. |
| **Clinical Documentation** | P1 | TODO | — | — | Encounter-note drafting and structuring (SOAP notes, H&P, discharge summaries). Overlaps with existing `chart-documentation` prototype — reconcile scope. |
| **Prior Auth Review** | P2 | **Exists (v1)** | — | **Active partner work order** | Payer-side review of incoming prior-auth requests. Already in `prior-auth-review-skill/`. Current v1 is a rough one-shot build that predates the skill-builder tooling — needs a proper rebuild and hillclimbing, not just iteration. **Strongest current customer pull** — aligned with an active partner work order for agentic payer-side PA review (human-in-the-loop). Needs eval coverage. |
| **Provider Credentialing** | Proposed | TODO | — | — | Verify and maintain provider credentialing data (licenses, board certifications, payer enrollment). Leverage the `npi-registry` MCP connector. |
| **Care Gap Analysis** | Proposed | TODO | — | — | Review patient records against HEDIS quality measures and evidence-based guidelines to surface care gaps. |
| **HIPAA Compliance Check** | Proposed | TODO | — | — | Review documentation, policies, and data-handling procedures for HIPAA compliance; flag potential violations with remediation guidance. |

> **Note on ordering vs. customer signal:** The Priority column reflects where net-new skill work has the highest general leverage. The Customer signal column reflects current partner pull. Prior Auth Review sits at P2 for *build* effort because a version already ships, but it carries the strongest active customer engagement — iteration there may outrank greenfield P0 work in near-term planning.

### Other existing skills in this repo

These predate the stackrank and should be mapped onto the priorities above or tracked separately:

- `fhir-developer-skill/` — FHIR resource authoring/validation. Infrastructure skill; supports most of the above.
- `clinical-trial-protocol-skill/` — research-facing; out of scope for the provider/payer admin-burden focus but retained.

A further ~10 prototype skills exist from earlier benchmark work (chart-documentation, clinical-trial-finder, icd10-code-assignment, letter-of-medical-necessity, and others). Audit which of these live in this repo vs. elsewhere and fold the relevant ones into the backlog above.

## Constraints & context

### Code-set licensing

| Code set | Status | Notes |
|---|---|---|
| **ICD-10-CM / ICD-10-PCS** | :white_check_mark: Public domain (CMS/NCHS) | Safe to use and ship. |
| **HCPCS Level II** | :white_check_mark: Public domain (CMS) | Safe to use and ship, **excluding D-codes (D0000–D9999)**, which are CDT dental codes copyrighted by the ADA and require a separate license. |
| **CPT (HCPCS Level I)** | :no_entry: Proprietary (AMA) | **No license in place.** Any skill that assigns, looks up, or validates CPT codes is blocked on a licensing agreement with the AMA. Legal engagement required before scoping CPT-dependent work. |
| **SNOMED CT** | :warning: Licensed | Free in member countries via national release centers; verify terms before embedding. |
| **LOINC** | :white_check_mark: Open (Regenstrief) | Free with attribution. |
| **RxNorm** | :white_check_mark: Open (NLM) | Free; note that some source vocabularies within RxNorm carry their own restrictions. |

The Medical Coding skill (P0) is scoped to **ICD-10-CM and HCPCS II (ex-CDT) only** until CPT licensing is resolved. This covers diagnosis coding and the supply/DME/non-physician-service portion of procedure coding, which is a meaningful first release.

### Reusable MCP connectors

The following MCP connectors ship in this marketplace (see the [README](README.md)) and should be wired into skills rather than reimplemented:

- `icd10-codes` — ICD-10-CM/PCS code lookup, validation, and hierarchy traversal
- `cms-coverage` — Medicare coverage policies (NCDs/LCDs)
- `npi-registry` — NPPES provider lookup
- `pubmed` — biomedical literature search

Additional hosted healthcare/life-sciences MCP servers (ClinicalTrials.gov, ChEMBL, bioRxiv/medRxiv) are available in the Claude connector directory and can be registered here as connectors when a skill needs them.

### Evaluation coverage

Each new skill ships with at least one eval. Current gaps identified in the May 2026 eval-coverage review:

- **Medical coding** is the thinnest axis — only three registered evals, and none implements the field-standard *chart → multi-label ICD code set* task scored by micro/macro-F1. This is the highest-priority eval to build.
- No registered eval for **medical hallucination / factual grounding** in clinical contexts.
- No registered eval for **drug-interaction** checking.
- No registered eval for **differential-diagnosis** generation.

---

*Draft — awaiting team feedback.*
