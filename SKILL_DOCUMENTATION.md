# Healthcare Best Practices

Repo for the Claude Code Marketplace to use with the Claude for Healthcare Launch. This will continue to host the marketplace.json long-term, but not the actual MCP servers.

---

## Prior Authorization Review Skill

Automate payer review of prior authorization requests using AI-powered clinical reasoning and coverage policy matching to aid the payer's determination and workflow.

### Overview

This Claude Code skill helps automate the health insurance payer professional's prior authorization (PA) review process. It processes incoming PA requests from healthcare providers, validates medical necessity against coverage policies, and generates proposed authorization decisions with complete documentation for the professional's review and sign-off.

**Target Users:** Health insurance payer organizations (Medicare Advantage, Commercial, Medicaid MCOs)

**Value Proposition:**

- Consistent, auditable decision-making
- Structured documentation for review processes
- Free clinical reviewers to focus on complex cases

### Important Disclaimers

> **DRAFT RECOMMENDATIONS ONLY:** This skill generates draft recommendations only. The payer organization remains fully responsible for all final authorization decisions.
>
> **HUMAN REVIEW REQUIRED:** All AI-generated recommendations require review and confirmation by appropriate professionals before becoming final decisions. Users may accept, reject, or override any recommendation with documented justification.
>
> **AI DECISION BEHAVIOR:** In default mode, AI recommends APPROVE or PEND only - never recommends DENY. Decision logic is configurable in the skill's rubric.md file.
>
> **COVERAGE POLICY LIMITATIONS:** Coverage policies are sourced from Medicare LCDs/NCDs via CMS Coverage MCP Connector. If this review is for a commercial or Medicare Advantage plan, payer-specific policies may differ and were not applied.

### Subskill 1: Intake & Assessment

**Purpose:** Collect prior authorization request information, validate credentials and codes, extract clinical data, identify applicable coverage policies, assess medical necessity, and generate approval recommendation.

**What it does:**

- Collects PA request details (member, service, provider, clinical documentation)
- Validates provider credentials via NPI MCP Connector
- Validates ICD-10 codes via ICD-10 MCP Connector (batch validation)
- Validates CPT/HCPCS codes via WebFetch to CMS Fee Schedule
- Searches coverage policies via CMS Coverage MCP Connector
- Extracts structured clinical data from documentation
- Maps clinical evidence to policy criteria
- Performs medical necessity assessment
- Generates recommendation (APPROVE/PEND)

**Output:** `waypoints/assessment.json` - Consolidated assessment with recommendation

**Human Decision Point:** After assessment is generated, the professional reviews the AI recommendation and supporting evidence before proceeding to the decision phase.

### Subskill 2: Decision & Notification

**Purpose:** Finalize authorization decision with human oversight and generate provider notification.

**What it does:**

- Loads assessment from Subskill 1
- Presents recommendation for human review
- Human actively confirms, rejects, or overrides the recommendation
- Generates authorization number (if approved) or documentation requests (if pended)
- Creates provider notification letter
- Documents complete audit trail

**Output:**

- `waypoints/decision.json` - Final decision record
- `outputs/notification_letter.txt` - Provider notification

**Human Decision Point:** The professional must explicitly confirm, reject, or override the AI recommendation. No decision is finalized without human action.

### Installation

See [prior-auth-review-skill/SKILL.md](prior-auth-review-skill/SKILL.md) for complete installation and usage instructions.

### Sample Data

Sample case files are included in `prior-auth-review-skill/assets/sample/` for demonstration purposes. When using sample files, the skill operates in demo mode which:

- Skips NPI MCP lookup for the sample provider only
- Executes all other MCP calls (ICD-10, CMS Coverage) normally
- Demonstrates the complete workflow with a pre-configured lung biopsy case

---

## Clinical Trial Protocol Skill

Generate clinical trial protocols for medical devices or drugs (phase 2 or 3). Modular waypoint-based architecture with interactive sample size calculation and research-driven recommendations.

This Claude Code skill generates comprehensive clinical trial protocols based on NIH/FDA guidelines and similar trials research. It supports both medical devices (IDE pathway) and drugs (IND pathway) with appropriate regulatory terminology.

**Target Users:** Clinical researchers, regulatory affairs professionals, protocol writers

**Key Features:**

- Device & Drug Support - Handles both medical devices (IDE) and drugs (IND)
- Token-Efficient - Modular protocol development to stay within output limits
- Resume from Any Step - Interrupted workflows can continue from any step
- Sample Size Calculation - Interactive statistical power analysis
- Research-Driven - Leverages ClinicalTrials.gov and FDA guidance documents

### Disclaimers

> **PRELIMINARY PROTOCOL ONLY:** This protocol generation tool provides preliminary clinical study protocols based on NIH/FDA guidelines and similar trials. It does NOT constitute official FDA or IRB determination or approval.
>
> **NOT MEDICAL/LEGAL/REGULATORY ADVICE:** Generated protocols do not substitute for professional biostatistician review, FDA Pre-Submission meetings, or legal review.
>
> **PROFESSIONAL CONSULTATION REQUIRED:** Clinical trial protocols are complex, high-stakes documents requiring expertise across multiple disciplines. Professional consultation with clinical trial experts, biostatisticians, and regulatory affairs specialists is essential.

**REQUIRED before proceeding with clinical study:**

- Biostatistician review and sample size validation
- FDA Pre-Submission meeting (Q-Submission for devices, Pre-IND for drugs)
- IRB review and approval
- Clinical expert and regulatory consultant engagement
- Legal review of protocol and informed consent

### Workflow Steps

| Step | Name | Description | Output |
| ---- | ---- | ----------- | ------ |
| 0 | Initialize | Collect intervention info (device/drug, indication) | `intervention_metadata.json` |
| 1 | Research | Search ClinicalTrials.gov, find FDA guidance | `01_clinical_research_summary.json` |
| 2 | Foundation | Sections 1-6: Summary, Objectives, Design, Population | `02_protocol_foundation.md` |
| 3 | Intervention | Sections 7-8: Administration, Dose Modifications | `03_protocol_intervention.md` |
| 4 | Operations | Sections 9-12: Assessments, Statistics, Regulatory | `04_protocol_operations.md` |
| 5 | Concatenate | Combine all sections into final protocol | `protocol_complete.md` |

### Requirements

- **Python Dependencies** - `scipy`, `numpy` for sample size calculations
- **ClinicalTrials.gov MCP Server** - For searching similar trials
- **WebSearch** - For FDA guidance documents

### Getting Started

See [clinical-trial-protocol-skill/SKILL.md](clinical-trial-protocol-skill/SKILL.md) for complete installation and usage instructions.

---

## License

See LICENSE file for details.
