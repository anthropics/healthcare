# Enrollment Validation Rubric (X12 834)

This rubric defines validation rules for reviewing and processing X12 834 Benefit Enrollment and Maintenance transactions. These rules serve as guidance for draft automation only and do not replace payer-specific enrollment policies, group contracts, state regulations, or compliance requirements.

## Overview

This rubric is organized into six validation categories:

1. **Structural Validation** - EDI format, segment order, mandatory fields
2. **Member Information Validation** - Demographics, identifiers, relationships
3. **Coverage and Dates Validation** - Effective dates, termination dates, maintenance actions
4. **Plan and Product Validation** - Plan IDs, product codes, coverage levels
5. **Provider Assignment Validation** - PCP assignments, network requirements
6. **Business Logic Validation** - Retroactive changes, COB, compliance rules

Each validation rule includes:
- **Rule ID:** Unique identifier for traceability
- **Severity:** Error (blocking), Warning (non-blocking), or Info (informational)
- **Field/Segment:** Where the rule applies
- **Description:** What the rule validates
- **Remediation:** Suggested next steps when rule fails

## Validation Category 1: Structural Validation

### Envelope Structure

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| S-ENV-001 | Error | ISA | ISA segment must be present and first segment | Reject file; request resubmission with valid ISA |
| S-ENV-002 | Error | GS | GS segment must follow ISA with matching sender/receiver | Reject file; verify trading partner configuration |
| S-ENV-003 | Error | ST | ST segment must indicate 834 transaction (ST01 = 834) | Reject file; wrong transaction type submitted |
| S-ENV-004 | Error | SE | SE segment must match ST control number and segment count | Reject file; transmission error likely |
| S-ENV-005 | Error | GE | GE segment must match GS control number and transaction count | Reject file; envelope integrity issue |
| S-ENV-006 | Error | IEA | IEA segment must match ISA control number and group count | Reject file; envelope integrity issue |
| S-ENV-007 | Warning | ISA/GS dates | Transmission date should be within 7 days of current date | Flag for review; possible delayed or resubmitted file |

### Transaction Header (1000A/1000B Loops)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| S-HDR-001 | Error | BGN | BGN segment (Beginning Segment) required | Reject transaction; malformed enrollment file |
| S-HDR-002 | Error | BGN01 | BGN01 must be valid transaction type (00, 04, etc.) | Reject transaction; invalid transaction type |
| S-HDR-003 | Error | BGN02 | Reference identification (BGN02) required and unique | Reject transaction; missing transaction identifier |
| S-HDR-004 | Error | BGN03 | Transaction date (BGN03) required in CCYYMMDD format | Reject transaction; missing or invalid date |
| S-HDR-005 | Warning | REF*38 | Group policy number recommended in 1000A loop | Flag for review; aids in group identification |

### Required Segments by Member

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| S-REQ-001 | Error | INS | Member level detail (INS segment in 2000 loop) required | Reject member; missing INS segment |
| S-REQ-002 | Error | INS01 | Member indicator (Y/N) required | Reject member; invalid member indicator |
| S-REQ-003 | Error | INS02 | Individual relationship code required | Reject member; missing relationship code |
| S-REQ-004 | Error | INS03 | Maintenance type code required (001-030, etc.) | Reject member; missing maintenance action |
| S-REQ-005 | Error | REF*0F | Subscriber number required in 2000 loop | Reject member; missing subscriber identifier |
| S-REQ-006 | Error | NM1*IL | Member name information required (2100A loop) | Reject member; missing member demographics |
| S-REQ-007 | Error | DMG | Member demographic information required | Reject member; missing DOB or gender |
| S-REQ-008 | Error | DTP*348 | Coverage effective date required for adds/changes | Reject member; missing effective date |

### Subscriber vs. Dependent Requirements

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| S-SUB-001 | Error | INS01 = Y | Subscriber must have INS01 = Y (Yes, insured) | Reject member; subscriber must be insured |
| S-SUB-002 | Error | INS02 = 18 | Subscriber must have relationship code 18 (Self) | Reject member; subscriber relationship must be Self |
| S-DEP-001 | Error | INS02 ≠ 18 | Dependent must have relationship code other than 18 | Reject member; dependent cannot have Self relationship |
| S-DEP-002 | Warning | Subscriber Link | Dependent should link to valid subscriber in same file or system | Flag for review; orphaned dependent record |

## Validation Category 2: Member Information Validation

### Demographics

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| M-DEM-001 | Error | NM103 | Last name required | Reject member; missing last name |
| M-DEM-002 | Error | NM104 | First name required | Reject member; missing first name |
| M-DEM-003 | Warning | NM105 | Middle name or initial recommended | Flag for review; aids in member matching |
| M-DEM-004 | Error | DMG02 | Date of birth required in CCYYMMDD format | Reject member; missing or invalid DOB |
| M-DEM-005 | Error | DMG03 | Gender code required (M/F/U) | Reject member; missing gender |
| M-DEM-006 | Warning | DOB Range | DOB should be reasonable (not future, not > 120 years ago) | Flag for review; potential data entry error |

### Member Identifiers

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| M-ID-001 | Error | REF*0F | Subscriber number required | Reject member; missing subscriber ID |
| M-ID-002 | Warning | REF*1L | Group or policy number recommended | Flag for review; aids in group assignment |
| M-ID-003 | Info | REF*23 | Social Security Number optional but recommended | Informational: SSN aids in unique identification |
| M-ID-004 | Warning | REF*6O | Previous member ID recommended for maintenance changes | Flag for review; aids in member matching |
| M-ID-005 | Error | Member ID Uniqueness | Member ID must be unique within payer system | HUMAN REVIEW REQUIRED: Check for duplicate member IDs |

### Contact Information

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| M-ADR-001 | Error | N3 | Street address required in 2100A loop | Reject member; missing address |
| M-ADR-002 | Error | N4 | City, state, ZIP required in 2100A loop | Reject member; missing city/state/ZIP |
| M-ADR-003 | Warning | N401 | City name should not be blank or "Unknown" | Flag for review; invalid address data |
| M-ADR-004 | Warning | N402 | State code must be valid 2-character abbreviation | Flag for review; invalid state code |
| M-ADR-005 | Warning | N403 | ZIP code should be valid 5 or 9-digit format | Flag for review; invalid ZIP code |
| M-ADR-006 | Info | PER | Communication contact information optional | Informational: Phone/email aids in outreach |

### Relationship Codes

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| M-REL-001 | Error | INS02 | Relationship code must be valid per X12 standards | Reject member; invalid relationship code |
| M-REL-002 | Warning | INS02 vs. Age | Spouse (01) should typically be adult age | Flag for review; verify relationship is correct |
| M-REL-003 | Warning | INS02 = 19 | Child relationship - verify age is appropriate (typically < 26) | Flag for review; dependent age limit rules |
| M-REL-004 | Info | INS02 = 53 | Life partner relationship | Informational: Apply appropriate eligibility rules |

## Validation Category 3: Coverage and Dates Validation

### Effective Dates

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| D-EFF-001 | Error | DTP*348 | Coverage effective date required for new enrollments | Reject member; missing effective date |
| D-EFF-002 | Error | DTP*348 | Effective date must be valid CCYYMMDD format | Reject member; invalid effective date format |
| D-EFF-003 | Warning | DTP*348 | Effective date should not be > 90 days in past (retroactive) | HUMAN REVIEW REQUIRED: Verify retroactive enrollment is allowed |
| D-EFF-004 | Warning | DTP*348 | Effective date should not be > 60 days in future | Flag for review; verify future effective date is intentional |
| D-EFF-005 | Info | DTP*348 | Effective date is 1st of month | Informational: Standard enrollment cycle |

### Termination Dates

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| D-TRM-001 | Error | DTP*349 | Termination date required for term maintenance type (024, 025, etc.) | Reject member; missing termination date for term action |
| D-TRM-002 | Error | DTP*349 | Termination date must be valid CCYYMMDD format | Reject member; invalid termination date format |
| D-TRM-003 | Error | DTP*349 vs. 348 | Termination date must be >= effective date | Reject member; termination before effective date |
| D-TRM-004 | Warning | DTP*349 | Termination date in past should result in immediate inactivation | Flag for review; process termination immediately |
| D-TRM-005 | Warning | DTP*349 | Future termination date noted | Flag for review; schedule termination for future date |

### Maintenance Type Codes

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| D-MNT-001 | Error | INS03 | Maintenance type code required | Reject member; missing maintenance action |
| D-MNT-002 | Error | INS03 | Maintenance type must be valid code (001, 021, 024, 025, 030, etc.) | Reject member; invalid maintenance type |
| D-MNT-003 | Info | INS03 = 001 | Change or update - verify existing member record | Informational: Locate existing member for update |
| D-MNT-004 | Info | INS03 = 021 | Addition - new enrollment | Informational: Create new member record |
| D-MNT-005 | Info | INS03 = 024 | Cancellation or termination | Informational: Terminate member coverage |
| D-MNT-006 | Info | INS03 = 025 | Reinstatement | Informational: Reinstate previously terminated member |
| D-MNT-007 | Warning | INS03 = 030 | Audit or compare - informational only, no action | Flag for review; audit transaction, no enrollment change |

### Retroactive Changes

**IMPORTANT:** Retroactive enrollment changes require special handling and human review.

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| D-RET-001 | Warning | Effective Date | Effective date > 90 days in past (retroactive enrollment) | HUMAN REVIEW REQUIRED: Verify retro is allowed; check for prior claims |
| D-RET-002 | Warning | Termination Date | Retroactive termination (past date) | HUMAN REVIEW REQUIRED: Verify retro term; identify affected claims for recovery |
| D-RET-003 | Warning | Maintenance Type | Change with retroactive effective date | HUMAN REVIEW REQUIRED: Verify changes; reprocess claims if coverage changed |
| D-RET-004 | Info | Retro > 6 months | Retroactive change > 6 months in past | Informational: High-risk retro; escalate for review |

## Validation Category 4: Plan and Product Validation

**Configuration Point:** Plan and product definitions vary by payer organization and group contract.

### Plan Identifiers

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| P-PLN-001 | Error | HD | Health coverage (HD segment in 2300 loop) required | Reject member; missing coverage information |
| P-PLN-002 | Error | HD01 | Maintenance type code required in HD segment | Reject member; missing coverage maintenance action |
| P-PLN-003 | Warning | REF*1L | Group or policy number should match employer group contract | Flag for review; verify correct group assignment |
| P-PLN-004 | Warning | REF*18 | Plan number should be valid for payer | HUMAN REVIEW REQUIRED: Verify plan exists in system |
| P-PLN-005 | Error | HD03 | Insurance line code required (e.g., HLT, DEN, VIS) | Reject member; missing line of coverage |

### Product Codes

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| P-PRD-001 | Warning | HD04-05 | Plan coverage description should be provided | Flag for review; aids in benefit assignment |
| P-PRD-002 | Warning | Product Match | Product code should be valid for group and effective date | HUMAN REVIEW REQUIRED: Verify product offering exists |
| P-PRD-003 | Info | HD03 | Insurance line code indicates coverage type (Medical, Dental, Vision) | Informational: Apply appropriate benefit rules |

### Coverage Levels

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| P-COV-001 | Warning | INS04 | Maintenance reason code should indicate enrollment reason | Flag for review; useful for special enrollment periods |
| P-COV-002 | Info | Coverage Tier | Coverage level (EE, EE+Spouse, EE+Child, Family) should match dependents | Informational: Verify coverage tier assignment |
| P-COV-003 | Warning | Multiple HD Loops | Member enrolled in multiple coverage types | Flag for review; verify all coverages are intended |

### Benefit Coordination

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| P-COB-001 | Info | COB | Coordination of Benefits segment present | Informational: Member has other coverage |
| P-COB-002 | Warning | COB01 | Payer responsibility sequence code should be valid (P, S, T, U) | Flag for review; verify COB sequence |
| P-COB-003 | Info | COB02 | Other payer subscriber information | Informational: Capture for claims COB processing |

## Validation Category 5: Provider Assignment Validation

**Configuration Point:** PCP assignment rules and network requirements vary by plan type (HMO, PPO, etc.).

### Primary Care Provider (PCP)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| V-PCP-001 | Warning | NM1*P3 | PCP assignment recommended for HMO/EPO plans | HUMAN REVIEW REQUIRED: Assign PCP if required by plan |
| V-PCP-002 | Error | NM109 (PCP NPI) | PCP NPI must be valid 10-digit format if provided | Reject member; invalid PCP NPI |
| V-PCP-003 | Warning | PCP NPI | PCP should be in-network for member's plan | HUMAN REVIEW REQUIRED: Verify PCP network participation |
| V-PCP-004 | Warning | PCP Specialty | PCP should have appropriate specialty (Family Practice, Internal Medicine, Pediatrics) | Flag for review; verify PCP specialty match |
| V-PCP-005 | Info | DTP*303 | PCP effective date provided | Informational: PCP assignment effective date |

### Other Provider Assignments

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| V-PRV-001 | Info | NM1*Y2 | Other provider (specialist) assignment | Informational: Capture provider assignment |
| V-PRV-002 | Warning | Provider NPI | Provider NPI should be active and credentialed | Flag for review; verify provider credentials |

## Validation Category 6: Business Logic Validation

**IMPORTANT:** Business logic rules are highly payer-specific and plan-specific. These are examples only and must be customized for each organization.

### Member Eligibility Business Rules

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-ELG-001 | Warning | Dependent Age | Dependent age should comply with plan rules (typically < 26) | HUMAN REVIEW REQUIRED: Verify dependent age exception (disabled, student) |
| B-ELG-002 | Warning | Dependent Age | Child dependent age >= 26 without student or disabled status | HUMAN REVIEW REQUIRED: Verify eligibility exception exists |
| B-ELG-003 | Info | Student Status | Student dependent status indicated | Informational: May extend dependent eligibility |
| B-ELG-004 | Info | Disabled Dependent | Disabled dependent status indicated | Informational: May extend dependent eligibility indefinitely |

### Group and Contract Validation

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-GRP-001 | Warning | Group Number | Group number should match active employer group contract | HUMAN REVIEW REQUIRED: Verify group is active and contracted |
| B-GRP-002 | Warning | Effective Date vs. Group | Effective date should be within group contract dates | HUMAN REVIEW REQUIRED: Verify group contract covers this period |
| B-GRP-003 | Warning | Minimum Hours | Member should meet minimum hours requirement (if applicable) | Flag for review; verify full-time or part-time status |
| B-GRP-004 | Info | Waiting Period | Enrollment may be subject to waiting period per group contract | Informational: Apply waiting period if configured |

### Enrollment Period Validation

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-ENR-001 | Warning | Open Enrollment | Enrollment effective date should align with open enrollment period | HUMAN REVIEW REQUIRED: Verify open enrollment or qualifying event |
| B-ENR-002 | Warning | Qualifying Event | Mid-year enrollment should have qualifying life event | HUMAN REVIEW REQUIRED: Request QLF documentation |
| B-ENR-003 | Info | INS04 Reason | Maintenance reason code indicates enrollment trigger | Informational: Document enrollment reason |

### Compliance and Regulatory Validation

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-REG-001 | Warning | COBRA | COBRA continuation coverage indicated | Flag for review; apply COBRA rules and premium |
| B-REG-002 | Info | Medicare | Member has Medicare coverage (age >= 65 or disabled) | Informational: Apply Medicare coordination rules |
| B-REG-003 | Warning | State Requirements | State-specific enrollment requirements may apply | HUMAN REVIEW REQUIRED: Verify state mandates (e.g., CA, NY special rules) |
| B-REG-004 | Info | ACA Compliance | Affordable Care Act rules may apply to group | Informational: Verify ACA compliance (employer size, affordability) |

### Duplicate Detection

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-DUP-001 | Warning | Member Match | Potential duplicate member record (same SSN, DOB, name) | HUMAN REVIEW REQUIRED: Match to existing member or create new record |
| B-DUP-002 | Info | Subscriber Match | Potential duplicate subscriber (same group, subscriber ID) | Informational: Link dependents to existing subscriber |
| B-DUP-003 | Warning | Coverage Overlap | Member has overlapping coverage periods | HUMAN REVIEW REQUIRED: Resolve overlap or confirm dual coverage |

### Data Quality and Consistency

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-DQ-001 | Warning | Name Match | Name does not match existing member record | Flag for review; verify name change or correct match |
| B-DQ-002 | Warning | DOB Match | DOB does not match existing member record | HUMAN REVIEW REQUIRED: Verify DOB or correct match |
| B-DQ-003 | Warning | Gender Match | Gender does not match existing member record | Flag for review; verify gender or data entry error |
| B-DQ-004 | Info | Address Change | Address differs from previous enrollment | Informational: Update address on file |

### Special Handling Scenarios

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-SPC-001 | Info | Newborn Add | Newborn enrollment (INS04 = 02) | Informational: Expedite processing; may have retroactive effective date |
| B-SPC-002 | Warning | Late Enrollee | Enrollment after normal enrollment period | HUMAN REVIEW REQUIRED: Verify late enrollment rules (pre-ex, waiting period) |
| B-SPC-003 | Info | Rehire | Employee rehire indicated | Informational: Check for prior coverage history |
| B-SPC-004 | Warning | QMCSO | Qualified Medical Child Support Order | HUMAN REVIEW REQUIRED: Verify QMCSO documentation; expedite enrollment |

## Configuration Points Summary

The following aspects of this rubric **MUST be customized** for each payer organization:

1. **Group contracts** - Employer group definitions, contract dates, waiting periods
2. **Plan and product catalogs** - Available plans, products, and benefit designs
3. **Network definitions** - Provider networks by plan and geography
4. **PCP requirements** - Which plan types require PCP assignment
5. **Dependent age limits** - Age cutoffs and exceptions (student, disabled)
6. **Open enrollment periods** - Annual enrollment windows by group
7. **Qualifying life events** - Allowed mid-year enrollment triggers
8. **State-specific rules** - Mandated benefits and enrollment requirements by state
9. **COBRA administration** - COBRA eligibility and premium calculation
10. **Medicare coordination** - Primary/secondary payer rules for Medicare members
11. **Member matching rules** - Algorithm for identifying duplicate or existing members
12. **Retroactive policies** - Limits on retroactive enrollments and terminations

## Severity Definitions

- **Error:** Blocking issue that prevents enrollment from being processed. Requires correction or human review.
- **Warning:** Non-blocking issue that should be reviewed but does not prevent processing. May be resolved during enrollment processing.
- **Info:** Informational note for context. No action required but may inform enrollment decisions.

## Remediation Actions

- **Reject member:** Send back to sponsor/employer for correction and resubmission
- **Flag for review:** Route to enrollment specialist or exception queue
- **HUMAN REVIEW REQUIRED:** Must be evaluated by authorized enrollment staff before final determination
- **Verify and approve:** Conditional approval pending verification
- **Apply plan rules:** Use payer-specific enrollment and eligibility rules
- **Escalate:** Potential compliance or regulatory issue - escalate to compliance team

## Special Transaction Types

### 834 Reinstatement (INS03 = 025)

Reinstatement transactions require special validation:
- Verify member was previously terminated
- Check termination reason and reinstatement eligibility
- Verify no gap in coverage if continuous coverage required
- Apply any waiting periods or pre-existing condition exclusions if applicable

### 834 Audit/Compare (INS03 = 030)

Audit transactions are informational only and should not update member records:
- Compare submitted data to payer system data
- Report discrepancies to sponsor/employer
- Do not process as enrollment change
- Generate reconciliation report

### Cancellation vs. Termination

- **Cancellation (024):** Typically retroactive removal (as if never enrolled)
- **Termination (024 with term date):** End coverage on specific date
- Cancellations may require claim recovery and premium refunds
- Terminations are prospective or current-dated changes

## Integration Points

### Member Management System
- Member matching and duplicate detection
- Historical enrollment data for validation
- Current coverage status and effective dates

### Group Management System
- Group contract validation
- Open enrollment periods
- Waiting period rules
- Contribution and premium rates

### Provider Directory
- PCP validation and network status
- Provider credentialing verification
- Specialty and taxonomy validation

### Eligibility System
- Real-time eligibility updates post-enrollment
- Dependent age and eligibility rules
- Qualifying life event verification

### Premium Billing System
- Coverage tier and premium calculation
- Retroactive premium adjustments
- COBRA premium billing

## Version Control

This rubric should be version-controlled and updated regularly to reflect:
- New group contracts and plan offerings
- Regulatory and compliance updates (ACA, HIPAA, state mandates)
- Lessons learned from enrollment audits and member appeals
- Employer/sponsor feedback and requirements
- System integrations and process improvements

**Current Version:** 1.0.0
**Last Updated:** 2024-03-15
**Next Review Date:** 2024-06-15

## Disclaimer

This rubric provides guidance for draft automation and decision support only. It does not constitute final enrollment policy, legal interpretation of benefit plans, or compliance advice. All final determinations regarding member enrollment, eligibility, coverage effective dates, and benefit entitlements must be made by authorized enrollment personnel following the payer organization's official policies, group contracts, and regulatory requirements.
