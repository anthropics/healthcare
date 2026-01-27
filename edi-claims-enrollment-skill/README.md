# EDI Claims and Enrollment Review Skill

A Claude Code Agent Skill for healthcare payer organizations to review, validate, and pre-process EDI transactions (X12 837/834/270/271/276/277) with structured waypoints and human-review-ready summaries.

## Overview

This skill assists healthcare payer organizations in automating the initial review and validation of Electronic Data Interchange (EDI) transactions for:

- **Claims Processing** (X12 837 - Institutional, Professional, Dental)
- **Enrollment and Maintenance** (X12 834 - Benefit Enrollment and Maintenance)
- **Eligibility Verification** (X12 270/271 - Inquiry and Response)
- **Claim Status** (X12 276/277 - Inquiry and Response)

The skill helps payer operations teams by:

1. **Parsing** raw X12 EDI files into structured, machine-readable JSON waypoints
2. **Validating** EDI structure and applying configurable business rules
3. **Extracting** key data elements into normalized formats
4. **Identifying** transactions requiring human review or exception handling
5. **Generating** audit-ready summaries for operations and compliance teams

### Value Proposition

- **Accelerate EDI intake processing** by automatically flagging clean vs. exception transactions
- **Reduce manual review burden** for straightforward, valid transactions
- **Improve data quality** through systematic structural and business rule validation
- **Create audit trails** with complete JSON waypoints from parsing through final review
- **Standardize review processes** across different trading partners and transaction types

### Error Messages

- **Context-aware guidance**: Every error includes specific transaction details, possible causes ranked by likelihood, and actionable next steps
- **Historical patterns**: Learn from similar cases processed previously to improve resolution accuracy
- **Decision trees**: Step-by-step workflows guide reviewers through complex scenarios
- **Time estimates**: Know how long each issue typically takes to resolve
- **Escalation criteria**: Clear guidance on when to escalate vs. resolve independently

Instead of generic errors like "Member not eligible on service date," you get:

```
❌ Member Not Eligible on Service Date

QUICK DIAGNOSIS:
  Member ID: MBR87654321
  Service Date: 2024-03-05
  Coverage terminated: 2024-03-01 (4 days before service)

POSSIBLE CAUSES:
  1. ✓ Most likely: Actual termination (60% confidence)
  2. ⚠️ Possible: Retroactive error awaiting correction (25%)
  3. 🔍 Consider: Emergency services exception applies (15%)

NEXT STEPS:
  → Verify member status in eligibility system
  → If emergency: Review emergency services policy
  → If error: Request 834 correction from employer

TIME TO RESOLVE: ~15 minutes
```

See `references/intelligent-errors.md` for comprehensive error message templates and examples.

## Important Disclaimers

### Draft Recommendations Only

**This skill produces draft validation results and recommendations only.** All outputs are preliminary and designed to assist human reviewers, not replace them.

- **NO automated claim payments or denials** are made by this skill
- **NO automated enrollment or disenrollment decisions** are made by this skill
- **NO final determinations** regarding coverage, eligibility, or benefits are made by this skill

### Human Review Required

**Human review by authorized personnel is REQUIRED** for:

- All transactions flagged with "Exception" status
- All transactions with blocking validation errors
- Any ambiguous scenarios not clearly covered by configured rules
- High-dollar claims above your organization's threshold
- Any eligibility, provider, or coding questions flagged by the skill
- Suspected fraud, waste, abuse, or unusual billing patterns

### Final Responsibility

Your payer organization's production systems and authorized staff retain **full and final responsibility** for:

- All claim adjudication decisions (approve, deny, pend)
- All enrollment and disenrollment actions
- Member eligibility determinations
- Provider credentialing and network status
- Benefit coverage interpretations
- Compliance with federal, state, and contractual requirements
- Appeals and exceptions to policy

This skill is a **decision support tool**, not a decision-making system.

### Regulatory and Compliance Notes

- The skill does not interpret or enforce specific state insurance regulations
- Users must configure payer-specific policies, benefit rules, and compliance requirements
- The skill follows general EDI standards but does not replace legal or compliance review
- Organizations remain responsible for HIPAA compliance, timely filing, and all regulatory obligations

## Prerequisites

- **Claude Code** installed and configured
- **EDI knowledge:** Familiarity with X12 EDI standards (837, 834)
- **Input files:** Raw X12 EDI transaction files in plain text format
- **Configuration:** Payer-specific rubrics and validation rules (optional customization)

## Installation

1. Clone or download this skill repository to your local machine
2. Place the `edi-claims-enrollment-skill/` folder in your Claude Code skills directory
3. Load the skill in Claude Code:

```bash
claude --skill edi-claims-enrollment-skill
```

Or activate during a session:

```bash
/skill edi-claims-enrollment-skill
```

## Quick Start

### Running a Complete Claims Review

1. **Place your EDI file** in the `assets/input/` directory:
   ```bash
   cp /path/to/your/claim_file.837 edi-claims-enrollment-skill/assets/input/
   ```

2. **Run the intake parsing subskill:**
   ```bash
   claude "Parse EDI claim file assets/input/claim_file.837"
   ```

   This creates `waypoints/intake.json` with structured claim data.

3. **Run the validation subskill:**
   ```bash
   claude "Validate claims using the claims rubric"
   ```

   This creates `waypoints/validation.json` with validation results.

4. **Generate review summaries:**
   ```bash
   claude "Generate claim review summaries for human reviewers"
   ```

   This creates:
   - `waypoints/review.json` - Consolidated review data
   - `outputs/review_summary.txt` - Human-readable summary

5. **Review the outputs:**
   - Open `outputs/review_summary.txt` to see executive summary and exceptions
   - Handle all Exception transactions with manual review
   - Process Pass and Warning transactions through your normal workflow

### Running a Complete Enrollment Review

1. **Place your EDI file** in the `assets/input/` directory:
   ```bash
   cp /path/to/your/enrollment.834 edi-claims-enrollment-skill/assets/input/
   ```

2. **Run the intake parsing subskill:**
   ```bash
   claude "Parse EDI enrollment file assets/input/enrollment.834"
   ```

3. **Run the validation subskill:**
   ```bash
   claude "Validate enrollment using the enrollment rubric"
   ```

4. **Generate review summaries:**
   ```bash
   claude "Generate enrollment review summaries"
   ```

5. **Review the outputs** as described above

### Demo Mode with Sample Data

To see the skill in action with sample data:

```bash
claude "Run EDI claim review demo using the sample claim file"
```

This processes `assets/sample/claim_sample_837P.txt` through the complete workflow and generates example outputs.

```bash
claude "Run EDI enrollment review demo using the sample enrollment file"
```

This processes `assets/sample/enrollment_sample_834.txt` through the complete workflow.

## Detailed Workflow

### Subskill A: Intake & Parsing

**Purpose:** Convert raw X12 EDI files into structured JSON representations.

**What it does:**
- Detects transaction type from ST segment (837, 834, etc.)
- Validates envelope structure (ISA/GS/ST/SE/GE/IEA hierarchy)
- Parses transaction-specific segments into structured data
- Extracts key identifiers, dates, codes, and amounts
- Records structural validation errors and warnings

**Input files:**
- Raw X12 EDI file(s) - plain text format with segment terminators
- Optional: Trading partner configuration JSON

**Output files:**
- `waypoints/intake.json` - Structured representation of all transactions
- Includes metadata, parsed data fields, and initial validation results

**Key data extracted for Claims (837):**
- Transaction control numbers and identifiers
- Subscriber/patient demographics (name, DOB, member ID)
- Provider identifiers (billing, rendering, referring NPIs)
- Service dates and place of service
- Diagnosis codes (ICD-10-CM) with pointers
- Procedure codes (CPT, HCPCS) with modifiers
- Charge amounts, units, and revenue codes
- Claim type and bill type codes

**Key data extracted for Enrollment (834):**
- Transaction control numbers and effective dates
- Subscriber/dependent demographics
- Member identifiers (SSN, member ID, external IDs)
- Plan and product identifiers
- Coverage effective and termination dates
- Maintenance type codes (add, change, delete)
- Relationship codes
- PCP assignments and provider IDs
- Coordination of Benefits (COB) information

### Subskill B: Validation & Business Rules

**Purpose:** Apply validation rules and business logic to identify issues.

**What it does:**
- Reads structured data from `waypoints/intake.json`
- Applies validation rules from the appropriate rubric:
  - `references/rubric-claims.md` for Claims
  - `references/rubric-enrollment.md` for Enrollment
- Performs structural validation (required fields, formats, lengths)
- Performs business validation (eligibility, coding, benefit checks)
- Categorizes issues by severity (Error, Warning, Info)
- Assigns draft recommendation status to each transaction

**Validation categories:**

1. **Structural Validation**
   - Required segments and fields present
   - Data element formats and lengths
   - Code values within valid ranges
   - Segment order and relationships

2. **Member Eligibility**
   - Coverage dates vs. service dates
   - Plan/product match
   - Member status (active, terminated)
   - Coordination of Benefits (COB) rules

3. **Provider Validation**
   - NPI format and validity
   - Provider taxonomy codes
   - Network status (in-network vs. out-of-network)
   - Specialty match to service type

4. **Code Set Validation**
   - ICD-10-CM diagnosis codes
   - CPT and HCPCS procedure codes
   - Revenue codes (institutional claims)
   - Place of service codes
   - Modifier usage and combinations

5. **Business Logic**
   - Diagnosis-procedure clinical edits
   - Age and gender edits
   - Benefit plan exclusions and limitations
   - Duplicate claim detection
   - Timely filing compliance

**Status assignments:**
- **Pass:** Valid, ready for downstream processing
- **Warning:** Valid but with non-blocking issues noted
- **Exception:** Requires human review before processing

**Input files:**
- `waypoints/intake.json`
- `references/rubric-claims.md` or `rubric-enrollment.md`
- Optional: External API responses (eligibility, provider directory)

**Output files:**
- `waypoints/validation.json` - Detailed validation results with issue lists

### Subskill C: Review, Exceptions & Summaries

**Purpose:** Generate human-readable outputs for reviewers and downstream systems.

**What it does:**
- Consolidates intake and validation data
- Generates structured review waypoint
- Creates executive summary with transaction counts
- Lists all exceptions with details and recommendations
- Provides actionable next steps for human reviewers

**Output formats:**

1. **JSON waypoint** (`waypoints/review.json`):
   - Complete consolidated data for each transaction
   - All validation results
   - Recommended status and next actions
   - Audit trail references

2. **Text summary** (`outputs/review_summary.txt`):
   - Executive summary (counts by status)
   - Detailed exception listings
   - Warning summaries
   - Recommended next steps

**Example summary structure:**

```
EDI CLAIMS REVIEW SUMMARY
=========================
Generated: 2024-03-15 14:30:00 UTC
Input File: claim_batch_001.837
Transaction Type: 837P (Professional)

EXECUTIVE SUMMARY
-----------------
Total Claims: 25
  - Pass: 18 (72.0%)
  - Warning: 5 (20.0%)
  - Exception: 2 (8.0%)

EXCEPTIONS REQUIRING HUMAN REVIEW (2)
--------------------------------------

Claim ID: 2024031501234
Control Number: 000000001
Status: Exception
Primary Issue: Member not eligible on date of service

Details:
  - Member ID: 12345678
  - Service Date: 2024-03-10
  - Coverage Term Date: 2024-03-01
  - Error Code: E-ELG-001

Validation Errors:
  - [E-ELG-001] Member coverage terminated before service date
  - [W-CLM-015] Missing secondary diagnosis code

Recommendation:
  *** HUMAN REVIEW REQUIRED ***
  1. Verify member eligibility through eligibility system
  2. Check for retroactive reinstatement or appeals
  3. If confirmed ineligible, deny claim with appropriate reason code
  4. If eligible, correct termination date and resubmit for processing

---

[Additional exceptions...]

WARNINGS - NON-BLOCKING (5)
---------------------------
[Warning details...]

NEXT STEPS
----------
1. Operations team: Review 2 Exception transactions immediately
2. Verify member eligibility for all exceptions through authoritative source
3. Apply payer-specific policies and benefit interpretations
4. Document all review decisions in claims management system
5. Process 18 Pass transactions through normal adjudication workflow
6. Monitor 5 Warning transactions for potential issues during adjudication
```

**Input files:**
- `waypoints/intake.json`
- `waypoints/validation.json`

**Output files:**
- `waypoints/review.json`
- `outputs/review_summary.txt`
- Optional: `outputs/exceptions_report.txt`

## Configuration and Customization

### Customizing Validation Rubrics

Each payer organization will need to customize the validation rubrics to reflect:

1. **Benefit plan rules** - Plan-specific exclusions, limitations, and coverage rules
2. **Network configurations** - Provider network definitions and participation agreements
3. **State-specific requirements** - Varying by jurisdiction and line of business
4. **Trading partner agreements** - Submitter-specific validation requirements
5. **Internal policies** - Organization-specific business rules and thresholds

**To customize:**

1. Copy the default rubric:
   ```bash
   cp references/rubric-claims.md references/rubric-claims-custom.md
   ```

2. Edit the custom rubric to add/modify rules
3. Reference the custom rubric when running validation:
   ```bash
   claude "Validate claims using references/rubric-claims-custom.md"
   ```

### Integrating External Data Sources

The skill can be extended to integrate with external systems and APIs:

- **Eligibility verification system** - Real-time member eligibility checks
- **Provider directory** - NPI validation, network status, credentialing
- **Code set validators** - ICD, CPT, NDC code validation services
- **Prior authorization system** - PA status lookups
- **Claims history database** - Duplicate claim detection

To integrate:

1. Configure API credentials and endpoints (not stored in skill repository)
2. Document expected API contracts in configuration files
3. Update validation rubrics to reference external connector rules
4. Handle API failures gracefully - flag for human review on errors

### Payer-Specific Configuration Files

Create configuration JSON files for your organization:

**`config/plans.json`** - Benefit plan definitions:
```json
{
  "plans": [
    {
      "plan_id": "PLAN001",
      "plan_name": "Gold PPO",
      "network": "PPO_NETWORK_1",
      "exclusions": ["cosmetic", "experimental"],
      "prior_auth_required": ["inpatient", "surgery"]
    }
  ]
}
```

**`config/networks.json`** - Provider network definitions:
```json
{
  "networks": [
    {
      "network_id": "PPO_NETWORK_1",
      "network_name": "National PPO",
      "provider_npis": ["1234567890", "0987654321"]
    }
  ]
}
```

**`config/trading_partners.json`** - Trading partner profiles:
```json
{
  "trading_partners": [
    {
      "submitter_id": "12345",
      "submitter_name": "ABC Billing Services",
      "transaction_types": ["837P", "837I"],
      "special_validations": []
    }
  ]
}
```

## Sample Data and Demo Mode

The `assets/sample/` directory contains synthetic EDI files and expected outputs for demonstration and testing purposes:

### Sample Files

- **`claim_sample_837P.txt`** - Sample professional claim (837P)
- **`claim_sample_837I.txt`** - Sample institutional claim (837I)
- **`enrollment_sample_834.txt`** - Sample enrollment transaction (834)
- **`sample_intake_claims.json`** - Expected output from Claims intake parsing
- **`sample_validation_claims.json`** - Expected output from Claims validation
- **`sample_review_claims.json`** - Expected output from Claims review
- **`sample_review_summary.txt`** - Expected human-readable summary

### Demo Scenarios

The sample files demonstrate:

1. **Clean transaction with minor warnings** - Shows a mostly valid claim with non-blocking warnings
2. **Exception transaction requiring human review** - Shows eligibility issue flagged for review
3. **Structural validation error** - Shows malformed EDI segment detected and flagged

### Running Demo Mode

```bash
# Claims demo
claude "Run complete claims review workflow on sample data"

# Enrollment demo
claude "Run complete enrollment review workflow on sample data"
```

Demo mode uses simulated external data sources where applicable (e.g., eligibility checks may return mock responses).

## File Structure

```
edi-claims-enrollment-skill/
├── SKILL.md                           # Skill definition and Claude instructions
├── README.md                          # This file - user documentation
├── CLAUDE.md                          # Development status and roadmap
├── assets/
│   ├── input/                         # Place EDI files here for processing
│   └── sample/                        # Sample EDI files and outputs
│       ├── claim_sample_837P.txt
│       ├── claim_sample_837P_exception.txt
│       ├── enrollment_sample_834.txt
│       ├── enrollment_sample_834_retro.txt
│       ├── sample_intake_claims.json
│       ├── sample_intake_enrollment.json
│       ├── sample_validation_claims.json
│       ├── sample_validation_enrollment.json
│       ├── sample_validation_intelligent_errors.json
│       ├── sample_review_claims.json
│       ├── sample_review_summary_claims.txt
│       ├── sample_review_summary_enrollment.txt
│       └── sample_review_intelligent_errors.txt
├── references/                        # Validation rubrics and guidance
│   ├── rubric-claims.md              # Claims validation rules (80+ rules)
│   ├── rubric-enrollment.md          # Enrollment validation rules (70+ rules)
│   ├── checklists.md                 # Human reviewer checklists (6 checklists)
│   ├── intelligent-errors.md         # Intelligent error message framework
│   ├── error-patterns.json           # Historical error patterns and resolutions
│   └── interactive-resolution-guide.md  # Decision trees for common scenarios
├── waypoints/                         # Intermediate JSON outputs (created at runtime)
│   ├── intake.json
│   ├── validation.json
│   └── review.json
└── outputs/                           # Final human-readable outputs (created at runtime)
    ├── review_summary.txt
    └── exceptions_report.txt
```

## Best Practices

### Operations Workflow

1. **Batch processing:** Process EDI files in batches during off-peak hours
2. **Exception handling:** Prioritize Exception transactions for immediate human review
3. **Quality monitoring:** Track Pass/Warning/Exception rates over time to identify issues
4. **Feedback loop:** Update rubrics based on human reviewer corrections and decisions
5. **Audit trail:** Retain all waypoint JSON files for compliance and audit purposes

### Security and PHI

1. **Minimize PHI exposure:** Use identifiers rather than names/SSNs in outputs where possible
2. **Secure storage:** Store waypoint and output files in HIPAA-compliant storage
3. **Access control:** Limit skill access to authorized personnel only
4. **Encryption:** Encrypt EDI files and outputs at rest and in transit
5. **Retention:** Follow your organization's data retention and destruction policies

### Performance Optimization

1. **File size:** Process large EDI batches in chunks if needed
2. **External API calls:** Batch eligibility and provider lookups where possible
3. **Caching:** Cache code set validations and provider directory lookups
4. **Parallelization:** Process multiple independent transactions concurrently

### Continuous Improvement

1. **Monitor false positives:** Track transactions flagged as Exception that were actually valid
2. **Monitor false negatives:** Track transactions that passed but should have been flagged
3. **Update rubrics regularly:** Incorporate new payer policies and regulatory changes
4. **Collect metrics:** Measure time savings and accuracy improvements
5. **User feedback:** Gather input from operations teams and adjust accordingly

## Troubleshooting

### Common Issues

**Issue: Parsing fails with "Invalid segment" error**
- Check that EDI file uses correct segment terminators (typically `~` for segment, `*` for element)
- Verify file encoding (should be ASCII or UTF-8)
- Ensure no extraneous characters or line breaks within segments

**Issue: Validation shows "Configuration required" warnings**
- Provide payer-specific configuration files (plans, networks, trading partners)
- Customize rubrics with your organization's business rules
- Document which external APIs are available for eligibility and provider checks

**Issue: Too many false positive exceptions**
- Review and tune validation thresholds in rubrics
- Adjust severity levels (Error vs. Warning) based on your risk tolerance
- Add organization-specific exceptions for known edge cases

**Issue: Performance is slow on large files**
- Process files in smaller batches
- Reduce external API calls by caching results
- Disable non-critical validation rules for initial triage

## Support and Contributions

This is a reference implementation designed to be customized for your organization's specific needs.

**For issues or questions:**
- Review the documentation in `SKILL.md` and this README
- Check the sample files in `assets/sample/` for examples
- Consult the rubrics in `references/` for validation rule details

**To extend or customize:**
- Fork the skill repository
- Create organization-specific configuration files
- Customize rubrics for your payer policies
- Add support for additional EDI transaction types (270/271, 276/277, etc.)

## License and Disclaimer

This skill is provided as-is for use by healthcare payer organizations to assist with EDI transaction review and validation.

**Disclaimer:** This skill is a decision support tool only and does not replace professional judgment, clinical expertise, or compliance review. Healthcare payer organizations using this skill retain full responsibility for all claim adjudication, enrollment decisions, and regulatory compliance.

## Key Features Summary

### Comprehensive Validation
- **220+ validation rules** across four transaction types
- **Claims (837):** 80+ rules in 5 categories (structural, eligibility, provider, code sets, business logic)
- **Enrollment (834):** 70+ rules in 6 categories (structural, member info, coverage dates, plans, providers, business logic)
- **Eligibility (270/271):** 75+ rules in 6 categories (structural, request/response, member, provider/payer, inquiry scope, business logic)
- **Claim Status (276/277):** 77+ rules in 6 categories (structural, request/response, claim identification, status info, subscriber/patient, business logic)
- Configurable severity levels (Error, Warning, Info)
- Support for X12 837, 834, 270, 271, 276, and 277 transactions

### Error Messages
- **Context-aware guidance** with specific transaction details
- **Ranked possible causes** with confidence scores (e.g., 60%, 25%, 15%)
- **Historical patterns** - Learn from 15,487 transactions analyzed
- **Decision trees** - Step-by-step workflows for complex scenarios
- **Time estimates** - Know resolution time upfront (~15 minutes, ~45 minutes, etc.)
- **Escalation criteria** - Clear guidance on when to escalate
- **10+ error templates** covering claims, enrollment, eligibility, and claim status

### Human Review Support
- **8 comprehensive checklists** for different review scenarios
  - Checklist 1-3: Claims review (general, high-dollar, FWA)
  - Checklist 4-6: Enrollment review (general, retroactive, dependents)
  - Checklist 7: Eligibility inquiry/response review
  - Checklist 8: Claim status inquiry/response review
- **Interactive resolution guides** with decision trees
- **Complete audit trail** via JSON waypoints
- **Executive summaries** with counts by status (Pass/Warning/Exception)
- **Actionable next steps** for every exception

### Sample Data and Demo Mode
- **8+ sample EDI files** (claims, enrollment, eligibility, and claim status)
- **20+ example outputs** showing complete workflows
- **Demo scenarios** including clean transactions and exceptions
- Run complete workflows immediately without production data

