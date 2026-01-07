# Prior Authorization Review Skill

Automate payer review of prior authorization requests using AI-powered clinical reasoning and coverage policy matching.

---

## Overview

This Claude Code skill automates the health insurance payer's prior authorization (PA) review process. It processes incoming PA requests from healthcare providers, validates medical necessity against coverage policies, and generates authorization decisions with complete documentation.

**Target Users:** Health insurance payer organizations (Medicare Advantage, Commercial, Medicaid MCOs)

**Value Proposition:**
- Reduce PA review time from 30-60 minutes to under 5 minutes
- Enable auto-approval for 40-60% of straightforward cases
- Consistent, auditable decision-making
- Regulatory-compliant documentation
- Free clinical reviewers to focus on complex cases

---

## Key Features

✅ **Automated Request Intake** - Validates provider credentials, diagnosis/procedure codes, and extracts clinical data
✅ **Coverage Policy Matching** - Identifies applicable LCDs/NCDs and medical policies
✅ **Medical Necessity Assessment** - Maps clinical evidence to policy criteria
✅ **Decision Generation** - Generates approvals, denials, or pends with complete rationale
✅ **Provider Notifications** - Creates regulatory-compliant approval/denial/pend letters (supports custom templates)
✅ **Audit Trail** - Complete documentation for compliance and appeals defense
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

See **[subskills/01-intake-assessment.md](subskills/01-intake-assessment.md#prerequisites)** for complete details including:
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

5. **Review and proceed to Subskill 2:**
   - Review assessment summary
   - Confirm to proceed to decision subskill

6. **Receive final decision:**
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

When both conditions are met, the skill skips NPPES lookup and accepts the provider for demonstration purposes. This allows the sample data in `sample/` to complete the full workflow.

**Safety feature:** If only the demo NPI is present without the sample member ID, the skill proceeds with normal NPPES validation. This prevents accidental demo mode activation in production if a real case happens to use one of these NPIs.

---

## Workflow Subskills

### Subskill 1: Intake & Assessment
**Duration:** 3-4 minutes

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
- `waypoints/assessment.json` - Consolidated assessment with recommendation (~45-60 KB)

**Data Sources:**
- NPI MCP, ICD-10 MCP, CMS Coverage MCP (executed in parallel)
- CMS Physician Fee Schedule (web-based, sequential)

---

### Subskill 2: Decision & Notification
**Duration:** 1-2 minutes

**What it does:**
- Loads assessment from Subskill 1
- Confirms or allows override of recommendation
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
├── assessment.json          # Subskill 1 output: Consolidated assessment (~45-60 KB)
└── decision.json           # Subskill 2 output: Final decision (~15-25 KB)
```

### Outputs Directory

Final deliverables (gitignored):

```
outputs/
└── notification_letter.txt  # Provider notification (3-5 KB)
```

### Archive Directory

When starting a new request, existing waypoints are archived:

```
waypoints/archive/
└── [request-id]_[timestamp]/
    ├── assessment.json
    └── decision.json
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
- Valid dates (typically 90 days)
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
- Overall confidence < 70%

**Includes:**
- Specific list of required documentation
- Deadline for submission (typically 14 days)
- Submission instructions
- What happens if deadline missed
- Provider notification letter

---

## Target Metrics

> **Note:** These are design targets, not guaranteed outcomes. Actual performance will vary by implementation. Validate in your environment before production use.

### Operational Efficiency (Projected)
- **Average Review Time:** <5 minutes (vs. 30-60 min manual)
- **Auto-Approval Rate:** 40-60% of requests (high confidence cases)
- **Throughput:** 10,000+ requests/day per instance

### Quality Metrics (Targets)
- **Inter-Rater Reliability:** >95% agreement with human reviewers
- **Appeal Overturn Rate:** <10% (denials are defensible)
- **Policy Accuracy:** 99%+ correct policy identification

### Business Impact (Estimated)
- **Cost Savings:** $30-50 per PA processed
- **Turnaround Time:** <24 hours average (vs. 3-7 days manual)
- **Provider Satisfaction:** +20% improvement
- **Regulatory Compliance:** 100% on-time decisions

---

## Use Cases

### High-Volume, Rule-Based Requests (Ideal for Auto-Approval)

✅ **Imaging (MRI, CT, PET)**
- Clear appropriate use criteria
- Objective clinical findings
- High policy match confidence

✅ **DME (Durable Medical Equipment)**
- Straightforward functional need assessments
- Clear policy criteria
- Typically low risk

✅ **Standard Procedures**
- Well-defined indications
- Common services with clear policies
- Experienced provider specialties

### Complex Requests (AI-Assisted, Human Review)

⚠️ **Specialty Drugs**
- Complex step therapy requirements
- Multiple comorbidities
- Off-label use considerations

⚠️ **High-Cost Procedures**
- Surgical procedures >$50K
- Transplants
- Novel/experimental procedures

⚠️ **Borderline Cases**
- Conflicting clinical evidence
- Unusual clinical presentations
- Policy interpretation required

---

## Adaptability

The skill is designed to handle diverse PA scenarios across:

| Category | Examples | Key Requirements |
|----------|----------|------------------|
| **Procedures** | Surgeries, biopsies, diagnostic procedures | Provider specialty, surgical candidacy |
| **Medications** | Specialty drugs, oncology, biologics | Step therapy, formulary tier |
| **Imaging** | MRI, CT, PET, advanced imaging | Appropriate use criteria |
| **Devices** | DME, prosthetics, orthotics | Functional need assessment |
| **Therapy** | PT, OT, speech, behavioral health | Frequency/duration limits |

---

## Configuration Options

### Auto-Approval Thresholds

Edit subskill files to adjust:
- Confidence threshold for auto-approval (default: 90%)
- Cost threshold for human review (default: varies by payer)
- Service types eligible for auto-approval

### Data Source Customization

Replace default healthcare data sources with your organization's systems:

**CPT/HCPCS Code Validation**
- **Default:** CMS Physician Fee Schedule (WebFetch to cms.gov)
- **Custom option:** AMA CPT API with your license key
- **Configure in:** `subskills/01-intake-assessment.md` Step 4

**Coverage Policy Database**
- **Default:** CMS Coverage MCP Connector (Medicare LCDs/NCDs)
- **Custom option:** Your organization's medical policy database (custom MCP server)
- **Configure in:** `subskills/01-intake-assessment.md` Step 3

**Provider Verification**
- **Default:** NPI MCP Connector (NPPES national registry)
- **Custom option:** Your provider network and credentialing database
- **Configure in:** `subskills/01-intake-assessment.md` Step 2

### Decision Logic Customization

Customize validation failure policies in `rubric.md`:
- **STRICT vs LENIENT enforcement** for each validation type (provider NPI, code validity, medical necessity)
- **Automatic DENY vs PEND outcomes** for validation failures
- **Override authority rules** for clinical reviewers
- **Pre-configured examples:** Lenient mode (default to PEND), strict compliance mode, auto-approval mode

Edit [rubric.md](rubric.md) to adjust decision logic without modifying skill implementation files.

### Coverage Policies

Configure policy data sources in Subskill 1:
- CMS LCD/NCD databases
- Payer-specific medical policies
- State Medicaid policies
- Clinical guidelines databases

### Notification Templates

Place custom letter templates in the `template/` folder. The skill automatically detects and uses templates for approval, denial, or pend letters.

See **`template/README.md`** for:
- Complete list of 20+ available placeholders
- File naming conventions
- Template creation examples
- Fallback behavior

If no custom template is found, the skill uses built-in default templates with standard letterhead and regulatory disclosures.

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

⚠️ **IMPORTANT:** This skill generates **draft recommendations only**. The payer organization remains fully responsible for all final authorization decisions.

**AI Decision Behavior:**
- Default mode: APPROVE or PEND only - never automatically DENY
- Users may override recommendations with documented justification
- Decision logic is configurable in `rubric.md`

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

---

## Compliance & Security

### HIPAA Compliance
- All waypoint files contain PHI - treat as confidential
- Secure storage and transmission required
- Retention policies per payer requirements
- Proper disposal procedures

### Audit Trail
- Complete audit trail in `waypoints/decision.json`
- Documents all review steps, data sources, decision logic
- Includes confidence scores and quality metrics
- Defensible for appeals and regulatory audits

### Regulatory Requirements
- Turnaround time compliance (CMS: 14 days standard, 72 hours expedited)
- Appeal rights disclosure (all denials)
- ERISA compliance (employer-sponsored plans)
- State-specific PA requirements

---

## Future Enhancements

🔮 **Planned Features:**
- Direct integration with payer eligibility systems
- Real-time policy database updates
- Multi-language support
- Appeals processing workflow
- Peer-to-peer discussion scheduling
- Claims system integration for authorization tracking
- Provider portal integration
- Member notification generation
- Analytics dashboard (approval rates, turnaround times, appeal rates)

---

## Support & Contribution

### Getting Help
- Review troubleshooting section above
- Check waypoint files for error details
- Review SKILL.md for execution flow and standards

### Reporting Issues
- Provide request ID and error details
- Include relevant waypoint files (redact PHI)
- Describe expected vs. actual behavior

### Contributing
- Suggest policy database improvements
- Share anonymized test cases
- Propose enhancements to criteria evaluation
- Improve notification letter templates

---

## License

[Specify license]

---

## Version History

**v2.0** (2025-12-07) - Simplified Architecture
- **BREAKING CHANGE:** Consolidated from 3-subskill to 2-subskill workflow
- Simplified waypoint structure (2 files instead of 4)
- Subskill 1 now handles intake, validation, and assessment in single consolidated subskill
- Added explicit CPT/HCPCS validation via WebFetch to CMS Fee Schedule
- Added MCP invocation notifications for user visibility
- Enhanced documentation with detailed tool usage and parameters
- Updated file organization for simplified architecture

**v1.0.0** (2025-12-03) - Initial Release
- Three-subskill workflow (intake, review, decision)
- Healthcare MCP connectors integration (CMS Coverage, ICD-10, NPI)
- CMS web resources for CPT/HCPCS validation (constrained to official government URLs)
- Automated medical necessity assessment
- Provider notification generation
- Audit trail documentation

---

## Acknowledgments

Built following the Claude Code skill-builder architecture pattern.

Based on industry best practices for prior authorization review and CMS coverage determination processes.

---

**Skill Version:** 2.0 (Simplified)
**Last Updated:** 2025-12-07
**Architecture:** 2-Subskill Consolidated Workflow
