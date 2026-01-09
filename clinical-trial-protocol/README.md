# Clinical Trial Protocol

Generate clinical trial protocols for medical devices or drugs (phase 2 or 3). Modular waypoint-based architecture with interactive sample size calculation and research-driven recommendations.

## Key Features

- **Device & Drug Support** - Handles both medical devices (IDE) and drugs (IND) with appropriate regulatory terminology
- **Token-Efficient** - Modular protocol development (Steps 2, 3, 4) to stay within output token limits
- **Resume from Any Step** - Interrupted workflows can continue from any step
- **Sample Size Calculation** - Interactive statistical power analysis (continuous/binary endpoints)
- **Research-Driven** - Leverages ClinicalTrials.gov and FDA guidance documents

## Configuration
- Add your own custom templates to the `clinical-trial-protocol-skill/assets/` folder
- Replace sample size calculator script in `clinical-trial-protocol-skill/scripts/` if needed

## Prerequisites

1. **Python Dependencies** - `pip install -r requirements.txt` (scipy, numpy for sample size calculations)
2. **ClinicalTrials.gov MCP Server** - For searching similar trials (install in Claude Desktop settings)
3. **WebSearch** - For FDA guidance documents and published protocols

## Usage

```bash
# In Claude Desktop, invoke the skill:
Use the clinical-trial-protocol-skill
```

**Select Option 1** for full workflow (or resume from saved progress):
- Provide intervention info (device/drug) when prompted
- Steps execute automatically: Step 0 → 1 → 2 → 3 → 4 → 5
- Protocol saved after each step (can resume anytime)
- Interactive sample size calculation in Step 4
- Final output: Complete protocol in markdown format (`waypoints/protocol_complete.md`)

## Workflow Steps

**Step 0: Initialize Intervention**
- Collects intervention info (device/drug, indication, population)
- Creates `intervention_metadata.json`

**Step 1: Research Similar Protocols**
- Searches ClinicalTrials.gov for similar trials
- Finds FDA guidance documents
- Recommends study design and endpoints
- Saves `01_clinical_research_summary.json`

**Step 2: Protocol Foundation** (Sections 1-6)
- Compliance, Summary, Introduction, Objectives, Design, Population
- Saves `02_protocol_foundation.md`

**Step 3: Protocol Intervention** (Sections 7-8)
- Administration, Dose Modifications, Discontinuation
- Saves `03_protocol_intervention.md`

**Step 4: Protocol Operations** (Sections 9-12)
- Assessments, Statistics (with sample size calc), Regulatory, References
- Saves `04_protocol_operations.md`
- Saves `02_sample_size_calculation.json`

**Step 5: Concatenate Final Protocol**
- Combines all section files (Steps 2, 3, 4) into single document
- Creates `protocol_complete.md`
- Preserves individual section files for easy regeneration

## File Structure

```
clinical-trial-protocol/                 # Repository root
├── README.md                            # This file (practitioner documentation)
├── requirements.txt                     # Python dependencies
├── samples/                             # Sample protocol PDFs
│   ├── sample_device.pdf
│   └── sample_drug.pdf
└── clinical-trial-protocol-skill/       # Skill package
    ├── SKILL.md                         # Main orchestrator [START HERE]
    ├── scripts/
    │   └── sample_size_calculator.py    # Statistical power analysis
    ├── assets/
    │   └── FDA-Clinical-Protocol-Template.md
    └── references/                      # Step implementations
        ├── 00-initialize-intervention.md
        ├── 01-research-protocols.md
        ├── 02-protocol-foundation.md
        ├── 03-protocol-intervention.md
        ├── 04-protocol-operations.md
        └── 05-concatenate-protocol.md

waypoints/                               # Generated at runtime
├── intervention_metadata.json
├── 01_clinical_research_summary.json
├── 02_protocol_foundation.md
├── 03_protocol_intervention.md
├── 04_protocol_operations.md
├── protocol_complete.md
├── 02_protocol_metadata.json
└── 02_sample_size_calculation.json
```

## Key Resources

- [ClinicalTrials.gov](https://clinicaltrials.gov/) - Clinical trial database
- [FDA Device Guidance](https://www.fda.gov/medical-devices/guidance-documents-medical-devices) - Regulatory guidance
- [FDA Drug Guidance](https://www.fda.gov/drugs/guidance-compliance-regulatory-information) - IND requirements
- [NIH Protocol Template](https://osp.od.nih.gov/clinical-research/clinical-trials/) - Template source

⚠️ **IMPORTANT:** This protocol generation tool provides preliminary clinical study protocol based on NIH/FDA guidelines and similar trials. It does NOT constitute:
- Official FDA or IRB determination or approval
- Medical, legal, or regulatory advice
- Substitute for professional biostatistician review
- Substitute for FDA Pre-Submission meeting
- Guarantee of regulatory or clinical success

## Current Limitations

### Phase 1/2 Trial Support

**Optimized for Phase 2/3 trials.** This skill is primarily designed for later-phase confirmatory trials. It can generate reasonable Phase 1/2 protocols from similar trial research, but the following elements require clinical expert review:

| Phase 1/2 Element | Current Support | Manual Work Required |
|-------------------|-----------------|---------------------|
| Dose escalation schemas (3+3, mTPI, BOIN, CRM) | Generates 3+3 framework with decision rules | Sponsor-specific dose levels and thresholds need customization |
| DLT definitions | Basic structure with observation period and grading | Organ-specific toxicities need clinical input for the specific intervention |
| RP2D determination | General criteria included | Sponsor-specific RP2D selection criteria and PK/PD thresholds |
| First-in-human safety | DSMB/SRC oversight included | Sponsor-specific stopping rules and real-time safety monitoring SOPs |
| PK/PD sampling schedules | Basic timepoints generated | Detailed bioanalytical methods, sample handling, and storage conditions |
| Expansion cohort design | Simon two-stage design generated | Cohort-specific go/no-go criteria and adaptive design elements |
| CRS/ICANS grading (bispecifics, CAR-T) | Lee/ASTCT criteria and tocilizumab protocols generated from research | Sponsor-specific management algorithms and institutional protocols |

**Recommendation for Phase 1/2 protocols:** The skill generates a solid foundation from similar trial research. Engage an experienced Phase 1 clinical pharmacologist or oncology protocol writer to customize dose-escalation schemas and safety sections for your specific intervention.

### Sample Size Calculator

The Python sample size calculator (`scripts/sample_size_calculator.py`) supports **Phase 2/3 power calculations** for continuous and binary endpoints. For Phase 1 dose-escalation studies, sample size is determined by design rules (3+3, mTPI, BOIN) based on anticipated dose levels rather than statistical power. The skill generates appropriate Phase 1 sample size rationale from similar trials but does not use the calculator script.

### Biologics and Complex Therapies

While the skill handles IND/BLA pathways appropriately, complex biologics (monoclonal antibodies, bispecifics, cell therapies) may require additional sponsor input for:
- Immunogenicity assessment strategy and ADA monitoring schedules
- CMC (Chemistry, Manufacturing, Controls) considerations
- Biologic-specific safety monitoring (e.g., infusion reactions, cytokine profiles)
- Reference product considerations (if applicable)


**REQUIRED before proceeding with clinical study:**
- Biostatistician review and sample size validation
- FDA Pre-Submission meeting (Q-Submission for devices, Pre-IND for drugs)
- IRB review and approval
- Clinical expert and regulatory consultant engagement
- Legal review of protocol and informed consent
- Site investigator review and input
- Sponsor completion of all [TBD] items in protocol

**PROFESSIONAL CONSULTATION STRONGLY RECOMMENDED**

Clinical trial protocols are complex, high-stakes documents requiring expertise across multiple disciplines. Professional consultation with clinical trial experts, biostatisticians, and regulatory affairs specialists is essential before proceeding with clinical study planning.
