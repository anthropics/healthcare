# Prior Authorization Review Skill

Automate payer review of prior authorization requests using AI-powered clinical reasoning and coverage policy matching to aid the payer's determination and workflow.

---

## Overview

This Claude Code skill helps automate the health insurance payer professional's prior authorization (PA) review process. It processes incoming PA requests from healthcare providers, validates medical necessity against coverage policies, and generates proposed authorization decisions with complete documentation for the professional's review and sign-off.

**Target Users:** Health insurance payer organizations (Medicare Advantage, Commercial, Medicaid MCOs)

**Value Proposition:**
- Consistent, auditable decision-making
- Structured documentation for review processes
- Free clinical reviewers to focus on complex cases

---

## Key Features

✅ **Automated Request Intake** - Validates provider credentials, diagnosis/procedure codes, and extracts clinical data
✅ **Coverage Policy Matching** - Identifies applicable LCDs/NCDs and medical policies
✅ **Medical Necessity Assessment** - Maps clinical evidence to policy criteria
✅ **Proposed Decision Generation** - Generates proposed approvals, denials, or pends with complete rationale
✅ **Provider Notifications** - Creates approval/denial/pend letters (supports custom templates)
✅ **Audit Trail** - Complete documentation of review steps and decision rationale
✅ **Resume Capability** - Can pause and resume at any subskill

---

## Prerequisites

### Required

1. **Claude Code** - This skill runs in Claude Code
2. **Healthcare MCP Connectors** - Required for clinical data access
   - **CMS Coverage MCP Connector** - Medicare coverage policies (NCDs, LCDs)
   - **ICD-10 MCP Connector** - Diagnosis code validation and lookup
   - **NPI MCP Connector** - Provider credential verification
3. **CMS Web Resources** - For CPT/HCPCS code validation (WebFetch access)
   - Physician Fee Schedule: https://www.cms.gov/medicare/physician-fee-schedule/search
   - NCCI Edits: https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits

### Data Sources & Configuration

See **[prior-auth-review-skill/references/01-intake-assessment.md](prior-auth-review-skill/references/01-intake-assessment.md#prerequisites)** for complete details including:
- MCP connector tools, parameters, and usage patterns
- CMS web resources for CPT/HCPCS validation
- Success notification strings for each data source

---

## Installation

### 1. Clone or Download Skill

```bash
cd ~/your-skills-directory
git clone [repository-url] prior-auth-skill
cd prior-auth-skill
```

### 2. Configure MCP Connectors

Ensure the healthcare MCP connectors are configured in your setup:

```bash
# Required MCP connectors:
# - CMS Coverage MCP Connector
# - ICD-10 MCP Connector
# - NPI MCP Connector
#
# The skill will verify MCP access on first run
# See SKILL.md for MCP connector details
```

### 3. Test Installation

```bash
# Invoke the skill in Claude Code
Use the prior-auth-review-skill

# Verify startup menu appears
# Select Option 3 (Check Status) to verify no errors
```

---

## Usage

### Basic Workflow

1. **Invoke the skill:**
   ```
   Use the prior-auth-review-skill
   ```

2. **The skill will check for existing requests:**
   - If incomplete request found, you'll be prompted to resume or start new
   - If no request exists, workflow begins at Subskill 1

3. **Provide PA request details:**
   - Member information (name, ID, DOB, state)
   - Requested service (type, description, CPT codes, ICD-10 codes)
   - Provider information (NPI, name, specialty)
   - Clinical documentation (paste notes, upload file, or summarize)

4. **Subskill 1 executes automatically:**
   - Validates credentials and codes (NPI, ICD-10, CPT/HCPCS)
   - Searches coverage policies
   - Extracts clinical data
   - Assesses medical necessity
   - Generates recommendation

5. **Review assessment and confirm decision:**
   - Review AI-generated recommendation with rationale
   - Accept, reject, or override the recommendation

6. **Receive final payer decision:**
   - APPROVED: Authorization number, validity dates, provider letter
   - DENIED: Specific denial reasons, appeal rights, provider letter
   - PENDING: Documentation requests, deadline, provider letter

### Example: Lung Biopsy PA Request

```
Use the prior-auth-review-skill

MEMBER INFORMATION:
  Member Name: John Smith
  Member ID: 1EG4TE5MK72
  DOB: 03/15/1957
  State: CA

REQUESTED SERVICE:
  Type: Procedure
  Description: CT-guided transbronchial lung biopsy
  CPT Codes: 31629, 31626
  ICD-10 Codes: R91.1, Z87.891, J44.9

PROVIDER:
  NPI: 1234567890

CLINICAL DOCUMENTATION:
  [Paste pulmonology consult note describing:
   - 1.2cm RUL nodule, growing from 8mm over 6 months
   - PET-CT shows SUV 4.2
   - PFTs adequate (FEV1 68% predicted)
   - Patient is former smoker
   - Pulmonologist recommends navigational bronchoscopy]

> Skill processes request through 2 subskills

RESULT: APPROVED
  Authorization #: PA-20251203-47392
  Valid: 12/03/2025 - 03/03/2026
  Letter: outputs/1EG4TE5MK72_20251203_143022_approval_letter.txt
```

### Demo/Test Mode

Demo mode activates ONLY when **both** conditions are met:

1. **Demo NPI**: `1234567890` or `1234567893`
2. **Sample Member ID**: `1EG4-TE5-MK72` or `1EG4TE5MK72`

**What demo mode does:** Skips NPPES lookup for the sample NPI only. The provider is accepted for demonstration purposes.

**What demo mode does NOT do:** Demo mode does not bypass MCP requirements. All MCP servers (CMS Coverage, ICD-10, NPI) must still be connected. ICD-10 validation and CMS Coverage policy search still execute normally.

**Safety features:**
- If only the demo NPI is present without the sample member ID, normal NPPES validation proceeds
- If MCP servers are not connected, the skill exits regardless of demo mode

---

## Workflow Subskills

### Subskill 1: Intake & Assessment

**What it does:**
- Collects PA request details (member, service, provider, clinical documentation)
- Validates provider credentials via **NPI MCP Connector**
- Validates ICD-10 codes via **ICD-10 MCP Connector** (batch validation)
- Validates CPT/HCPCS codes via **WebFetch to CMS Fee Schedule**
- Searches coverage policies via **CMS Coverage MCP Connector**
- Extracts structured clinical data from documentation
- Maps clinical evidence to policy criteria
- Performs medical necessity assessment
- Identifies documentation gaps
- Generates recommendation (APPROVE/DENY/PEND)

**Output:**
- `waypoints/assessment.json` - Consolidated assessment with recommendation

**Data Sources:**
- NPI MCP, ICD-10 MCP, CMS Coverage MCP (executed in parallel)
- CMS Physician Fee Schedule (web-based, sequential)

---

### Subskill 2: Decision & Notification

**What it does:**
- Loads assessment from Subskill 1
- Human reviews recommendation and actively confirms, rejects, or overrides it
- Generates authorization number (if approved)
- Creates denial rationale with appeal rights (if denied)
- Generates documentation requests (if pended)
- Creates provider notification letter
- Documents complete audit trail

**Output:**
- `waypoints/decision.json` - Final decision record
- `outputs/notification_letter.txt` - Provider notification

---

## File Organization

### Waypoints Directory

Generated data persisting across subskills (gitignored):

```
waypoints/
├── assessment.json          # Subskill 1 output: Consolidated assessment
└── decision.json           # Subskill 2 output: Final decision
```

### Outputs Directory

Final deliverables (gitignored):

```
outputs/
└── notification_letter.txt  # Provider notification
```

---

## Decision Types

### APPROVED

**When issued:**
- All required coverage criteria met
- Strong clinical evidence supports medical necessity
- Provider qualified
- No safety concerns

**Includes:**
- Authorization number (e.g., PA-20251203-47392)
- Valid dates
- Approved services (CPT codes)
- Any limitations or conditions
- Provider notification letter

---

### DENIED

**When issued:**
- Required coverage criteria not met
- Clinical evidence does not support medical necessity
- Service not covered by policy
- Safety concerns
- Provider not qualified

**Includes:**
- Specific denial reasons citing policy criteria
- Policy reference
- Alternative covered services (if applicable)
- Appeal rights and instructions
- Peer-to-peer discussion option (informational text in letter; scheduling not automated)
- Provider notification letter

---

### PENDING (More Information Needed)

**When issued:**
- Insufficient documentation to assess required criteria
- Missing critical clinical information
- Conflicting evidence requires clarification

**Includes:**
- Specific list of required documentation
- Deadline for submission
- Submission instructions
- What happens if deadline missed
- Provider notification letter

---

## Configuration Options

### Decision Logic

The default decision policy is **lenient mode**: validation failures result in PEND (request more information) rather than DENY. Edit [prior-auth-review-skill/references/rubric.md](prior-auth-review-skill/references/rubric.md) to customize decision rules.

### Notification Templates

Place custom letter templates in the `prior-auth-review-skill/assets/` folder. The skill automatically detects and uses templates for approval, denial, or pend letters.

See **[prior-auth-review-skill/references/notification-letter-templates.md](prior-auth-review-skill/references/notification-letter-templates.md)** for:
- Complete list of available placeholders
- File naming conventions
- Template creation examples
- Fallback behavior

If no custom template is found, the skill generates letters based on the decision type and available data.

---

## Troubleshooting

### Common Issues

**MCP Connectors Not Available**
- Verify healthcare MCP connectors are configured (CMS Coverage, ICD-10, NPI)
- See SKILL.md Prerequisites section for MCP connector requirements

**Low Confidence Warnings**
- Indicates incomplete or vague clinical documentation
- Request additional documentation from provider or use PEND decision

**Policy Not Found**
- Service may not require PA or policy database may be incomplete
- Continue with general medical necessity review or request manual policy research

**File Write Errors**
- Check waypoints/ and outputs/ directories exist with proper write permissions
- Verify available disk space

For detailed error messages and troubleshooting steps, refer to SKILL.md error handling section.

---

## Limitations

⚠️ **IMPORTANT:** This skill generates **draft recommendations only**. The payer organization remains fully responsible for all final authorization decisions, and appropriate professionals must review the recommended decision.

**AI Decision Behavior:**
- AI recommends APPROVE or PEND only - never recommends DENY in default mode
- All recommendations require human confirmation before becoming final
- Users may override any recommendation with documented justification
- Decision logic is configurable in `prior-auth-review-skill/references/rubric.md`

**Human Review Required:**
- Clinical reviewer validation for non-auto-approved cases
- Medical director sign-off per payer policy
- Compliance and legal review for denials

**Known Limitations:**

| Data Source | Details |
|-------------|---------|
| **Coverage Policies** | CMS Coverage MCP provides Medicare LCDs/NCDs. Commercial and MA payer-specific policies require custom integration. |
| **Eligibility Verification** | Not implemented. Member coverage status must be verified separately. |
| **Provider Verification** | Verifies provider exists in NPPES. Does not check network participation or credentialing status. |
| **Diagnosis Codes (ICD-10)** | ICD-10 MCP provides code validation and details. |
| **Procedure Codes (CPT/HCPCS)** | WebFetch to CMS Physician Fee Schedule for validation. |

**Other Limitations:**
- English-language documentation only
- Requires structured clinical notes (not handwritten)
