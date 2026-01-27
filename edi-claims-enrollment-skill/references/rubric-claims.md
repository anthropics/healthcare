# Claims Validation Rubric (X12 837)

This rubric defines validation rules for reviewing and processing X12 837 healthcare claims transactions (Professional, Institutional, and Dental). These rules serve as guidance for draft automation only and do not replace payer-specific policy manuals, benefit documents, state regulations, or clinical review.

## Overview

This rubric is organized into five validation categories:

1. **Structural Validation** - EDI format, segment order, mandatory fields
2. **Member Eligibility Validation** - Coverage dates, plan match, member status
3. **Provider Validation** - NPI validity, network status, credentialing
4. **Code Set Validation** - ICD, CPT/HCPCS, revenue codes, modifiers
5. **Business Logic Validation** - Clinical edits, benefit rules, duplicates

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
| S-ENV-003 | Error | ST | ST segment must indicate 837 transaction (ST01 = 837) | Reject file; wrong transaction type submitted |
| S-ENV-004 | Error | SE | SE segment must match ST control number and segment count | Reject file; transmission error likely |
| S-ENV-005 | Error | GE | GE segment must match GS control number and transaction count | Reject file; envelope integrity issue |
| S-ENV-006 | Error | IEA | IEA segment must match ISA control number and group count | Reject file; envelope integrity issue |
| S-ENV-007 | Warning | ISA/GS dates | Transmission date should be within 7 days of current date | Flag for review; possible delayed or resubmitted file |

### Transaction Header (2000A/2300 Loops)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| S-HDR-001 | Error | BHT | BHT segment (Beginning of Hierarchical Transaction) required | Reject claim; malformed transaction |
| S-HDR-002 | Error | BHT02 | BHT02 must be valid claim type (00, 01, etc.) | Reject claim; invalid claim type code |
| S-HDR-003 | Error | REF | Patient Control Number (REF*D9) required in 2300 loop | Flag exception; missing required identifier |
| S-HDR-004 | Warning | NM1 | Billing provider name (NM1*85) should not contain special characters | Flag for review; potential data quality issue |

### Required Segments by Claim Type

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| S-REQ-001 | Error | NM1*IL | Subscriber information (2000B loop) required | Reject claim; missing subscriber |
| S-REQ-002 | Error | NM1*QC | Patient information required if patient ≠ subscriber | Reject claim; missing patient demographics |
| S-REQ-003 | Error | NM1*85 | Billing provider information (2010AA loop) required | Reject claim; missing billing provider |
| S-REQ-004 | Error | CLM | Claim information segment (2300 loop) required | Reject claim; missing claim data |
| S-REQ-005 | Error | DTP*431 or 434 | Claim date(s) required in 2300 loop | Reject claim; missing service dates |
| S-REQ-006 | Error | HI*ABK or BK | Principal diagnosis required in 2300 loop | Reject claim; missing diagnosis |
| S-REQ-007 | Error | SV1 or SV2 | Service line information required (2400 loop) | Reject claim; no services billed |
| S-REQ-008 | Warning | DTP*472 | Service date recommended at line level (2400 loop) | Flag for review; may cause adjudication delays |

### Professional (837P) Specific

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| S-837P-001 | Error | NM1*82 | Rendering provider required if ≠ billing provider | Reject claim; missing rendering provider NPI |
| S-837P-002 | Warning | REF*G2 | Referring provider recommended for specialist claims | Flag for review; may be required by plan |
| S-837P-003 | Error | SV101-02 | CPT/HCPCS code and charge amount required | Reject claim; missing procedure or charge |

### Institutional (837I) Specific

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| S-837I-001 | Error | CLM05-1 | Facility type code (bill type first digit) required | Reject claim; missing bill type |
| S-837I-002 | Error | CLM05-3 | Frequency code (bill type third digit) required | Reject claim; incomplete bill type |
| S-837I-003 | Error | DTP*435 | Admission date required for inpatient claims | Reject claim; missing admission date |
| S-837I-004 | Warning | DTP*096 | Discharge date recommended for inpatient claims | Flag for review; claim may still be open |
| S-837I-005 | Error | SV201 | Revenue code required at service line | Reject claim; missing revenue code |
| S-837I-006 | Warning | SV204 | Unit count recommended for revenue code charges | Flag for review; adjudication may estimate units |

## Validation Category 2: Member Eligibility Validation

**IMPORTANT:** Eligibility validation rules are draft checks only. Final eligibility must be verified through authoritative eligibility system.

### Coverage Dates

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| E-ELG-001 | Error | DTP*431/434 vs. Coverage | Service date must fall within member's coverage period | HUMAN REVIEW REQUIRED: Verify eligibility; deny if confirmed ineligible |
| E-ELG-002 | Warning | DTP*431/434 | Service date within 30 days of coverage termination | Flag for review; verify no retroactive termination |
| E-ELG-003 | Warning | DTP*431/434 | Service date within 30 days of coverage effective date | Flag for review; verify retroactive coverage if applicable |
| E-ELG-004 | Error | DTP*435 vs. Coverage | Admission date (inpatient) must be during coverage period | HUMAN REVIEW REQUIRED: Verify eligibility on admit date |
| E-ELG-005 | Info | Coverage | Coverage effective date is retroactive (> 90 days prior) | Informational: May require special handling |

### Plan and Product Match

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| E-PLN-001 | Error | REF*1L vs. Plan | Group or plan number must match member's current plan | HUMAN REVIEW REQUIRED: Verify correct plan; may be COB issue |
| E-PLN-002 | Warning | SBR01 | Payer responsibility code should match coordination of benefits | Flag for review; verify COB status |
| E-PLN-003 | Warning | Plan Type | Plan type (HMO, PPO, etc.) affects network requirements | Apply appropriate network validation below |

### Member Status

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| E-STS-001 | Error | Member Status | Member status must be Active or Active with retro coverage | HUMAN REVIEW REQUIRED: Deny if terminated before service |
| E-STS-002 | Warning | Member Status | Member has pending termination effective after service date | Flag for review; may process normally if currently active |
| E-STS-003 | Info | Member Status | Member has COB with other payer | Informational: Apply COB rules |

### Coordination of Benefits (COB)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| E-COB-001 | Warning | SBR01 = S | Secondary claim should include primary payer EOB information | Flag for review; may need to request EOB from provider |
| E-COB-002 | Warning | SBR01 = T | Tertiary claim should include primary and secondary EOB | Flag for review; verify COB sequence |
| E-COB-003 | Info | OI03 | Assignment of benefits indicator affects payment routing | Informational: Route payment accordingly |

## Validation Category 3: Provider Validation

**IMPORTANT:** Provider validation rules are draft checks only. Final credentialing and network status must be verified through authoritative provider directory.

### NPI Validation

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| P-NPI-001 | Error | NM109 (NPI) | NPI must be exactly 10 numeric digits | Reject claim; invalid NPI format |
| P-NPI-002 | Error | NM109 | NPI must pass Luhn algorithm check digit validation | Reject claim; invalid NPI checksum |
| P-NPI-003 | Warning | NM109 | NPI should be verified active in NPPES registry | Flag for review; call NPPES API or check manually |
| P-NPI-004 | Warning | NPI vs. Taxonomy | NPI taxonomy should match service type (if available) | Flag for review; potential billing error |

### Billing Provider

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| P-BIL-001 | Error | NM1*85 | Billing provider NPI required | Reject claim; missing billing provider |
| P-BIL-002 | Warning | N3/N4 | Billing provider address should match NPI registry | Flag for review; address mismatch may indicate fraud |
| P-BIL-003 | Warning | REF*EI | Billing provider Tax ID recommended | Flag for review; may be required for payment |
| P-BIL-004 | Info | Provider Type | Billing provider type (organization vs. individual) | Informational: Different validation rules may apply |

### Rendering/Attending Provider (Professional Claims)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| P-REN-001 | Error | NM1*82 | Rendering provider NPI required if ≠ billing provider | Reject claim; missing rendering provider |
| P-REN-002 | Warning | NM1*82 Taxonomy | Rendering provider specialty should match procedure codes | Flag for review; possible upcoding or incorrect provider |
| P-REN-003 | Warning | PRV*PE | Provider specialty code recommended | Flag for review; aids in credentialing verification |

### Referring Provider

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| P-REF-001 | Warning | NM1*DN/P3 | Referring provider recommended for specialist services | Flag for review; may be required by plan or state law |
| P-REF-002 | Info | REF*0B | State license number recommended for referring provider | Informational: Useful for credentialing |

### Network Status

**Configuration Point:** Network definitions and participation agreements vary by payer and plan.

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| P-NET-001 | Warning | Provider NPI vs. Network | Provider should be in-network for member's plan (if HMO/EPO) | HUMAN REVIEW REQUIRED: Verify network status; apply OON benefits if confirmed |
| P-NET-002 | Info | Provider NPI vs. Network | Provider is out-of-network (PPO/POS plans) | Informational: Apply out-of-network benefit levels |
| P-NET-003 | Warning | Provider NPI vs. Network | Provider participation effective date vs. service date | Flag for review; verify provider was contracted on DOS |

## Validation Category 4: Code Set Validation

### ICD Diagnosis Codes

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| C-DX-001 | Error | HI*ABK/BK | At least one diagnosis code required | Reject claim; missing diagnosis |
| C-DX-002 | Error | ICD Code | ICD-10-CM code must be valid format (3-7 characters, alphanumeric) | Reject claim; invalid diagnosis code format |
| C-DX-003 | Error | ICD Code | ICD-10-CM code must exist in valid code set for service date | Reject claim; invalid diagnosis code |
| C-DX-004 | Warning | ICD Code | ICD code should not be outdated or deleted for service date year | Flag for review; verify correct code version |
| C-DX-005 | Warning | ICD Code | ICD code should not require additional specificity (5th/6th/7th character) | Flag for review; may need more specific code |
| C-DX-006 | Info | HI01-1 | Principal diagnosis code (ABK) vs. secondary (ABF) | Informational: Ensure correct sequencing |

### CPT and HCPCS Procedure Codes (Professional)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| C-CPT-001 | Error | SV101-2 | CPT/HCPCS code required at service line | Reject claim; missing procedure code |
| C-CPT-002 | Error | CPT/HCPCS | Code must be valid format (5 characters, alphanumeric) | Reject claim; invalid procedure code format |
| C-CPT-003 | Error | CPT/HCPCS | Code must exist in valid code set for service date | Reject claim; invalid procedure code |
| C-CPT-004 | Warning | CPT/HCPCS | Code should not be outdated or deleted for service date year | Flag for review; verify correct code version |
| C-CPT-005 | Warning | CPT/HCPCS vs. ICD | Procedure code should be clinically appropriate for diagnosis | Flag for review; apply medical necessity edits |
| C-CPT-006 | Info | Modifier | Modifier usage (SV101-3 through SV101-6) | Informational: Validate modifier combinations |

### Revenue Codes (Institutional)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| C-REV-001 | Error | SV201 | Revenue code required at service line (institutional) | Reject claim; missing revenue code |
| C-REV-002 | Error | Revenue Code | Revenue code must be 3-4 digits numeric | Reject claim; invalid revenue code format |
| C-REV-003 | Error | Revenue Code | Revenue code must be valid per NUBC standards | Reject claim; invalid revenue code |
| C-REV-004 | Warning | Revenue Code vs. Bill Type | Revenue code should be appropriate for bill type | Flag for review; coding inconsistency |
| C-REV-005 | Warning | Revenue Code vs. HCPCS | HCPCS code (if present) should align with revenue code | Flag for review; possible billing error |

### Modifier Validation

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| C-MOD-001 | Warning | Modifiers | Modifier must be valid 2-character alphanumeric code | Flag for review; invalid modifier |
| C-MOD-002 | Warning | Modifiers | Modifier combination should be clinically valid | Flag for review; incorrect modifier usage |
| C-MOD-003 | Info | Modifier 59/X{EPSU} | Distinct procedural service modifier usage | Informational: May affect bundling edits |
| C-MOD-004 | Info | Modifier 25 | Significant, separately identifiable E&M service | Informational: Verify separate service documented |

### Place of Service

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| C-POS-001 | Error | CLM05-1 (Prof) | Place of service code required (professional claims) | Reject claim; missing place of service |
| C-POS-002 | Error | POS Code | Place of service must be valid 2-digit code | Reject claim; invalid POS code |
| C-POS-003 | Warning | POS vs. CPT | Place of service should be appropriate for procedure type | Flag for review; coding inconsistency |
| C-POS-004 | Warning | POS = 02 | Telehealth place of service may require special handling | Flag for review; verify telehealth coverage |

## Validation Category 5: Business Logic Validation

**IMPORTANT:** Business logic rules are highly payer-specific and plan-specific. These are examples only and must be customized for each organization.

### Medical Necessity and Clinical Edits

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-MED-001 | Warning | CPT vs. ICD | Procedure should have medically necessary diagnosis | HUMAN REVIEW REQUIRED: Apply medical necessity criteria |
| B-MED-002 | Warning | Age vs. Service | Service should be age-appropriate for patient | Flag for review; verify patient DOB and service type |
| B-MED-003 | Warning | Gender vs. Service | Service should be gender-appropriate for patient | Flag for review; verify patient gender and service type |
| B-MED-004 | Info | Diagnosis Severity | Diagnosis code indicates high severity or complexity | Informational: May trigger case management |

### Benefit Plan Rules

**Configuration Point:** Benefit plan rules vary significantly by plan, product, and contract.

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-BEN-001 | Warning | Service Type vs. Plan | Service type should be covered benefit for member's plan | HUMAN REVIEW REQUIRED: Verify benefit coverage; deny if excluded |
| B-BEN-002 | Warning | Service | Cosmetic or experimental services typically not covered | HUMAN REVIEW REQUIRED: Verify medical necessity; apply plan rules |
| B-BEN-003 | Warning | Frequency | Service may exceed frequency limits (e.g., annual physical) | Flag for review; check claims history for duplicates |
| B-BEN-004 | Info | Deductible/OOP | Service subject to deductible and out-of-pocket max | Informational: Calculate member cost share |

### Prior Authorization

**Configuration Point:** Prior authorization requirements vary by plan and service type.

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-PA-001 | Warning | Service Type | Service typically requires prior authorization | HUMAN REVIEW REQUIRED: Verify PA on file; pend if missing |
| B-PA-002 | Error | REF*G1 | Prior authorization number missing for PA-required service | HUMAN REVIEW REQUIRED: Request PA number or deny if none obtained |
| B-PA-003 | Warning | PA Date Range | Service date should fall within PA effective dates | Flag for review; verify PA was active on DOS |

### Duplicate Claim Detection

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-DUP-001 | Warning | Claim Data | Potential duplicate claim (same member, provider, DOS, procedure) | HUMAN REVIEW REQUIRED: Check claims history; deny or adjust if duplicate |
| B-DUP-002 | Info | REF*F8 | Original reference number indicates corrected/voided claim | Informational: Link to original claim for replacement processing |
| B-DUP-003 | Warning | Claim Frequency | Multiple claims from same provider on same DOS | Flag for review; verify all services were rendered |

### Timely Filing

**Configuration Point:** Timely filing limits vary by plan, contract, and state law.

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-TFL-001 | Warning | DOS vs. Receipt | Claim received beyond standard timely filing limit (e.g., 365 days) | HUMAN REVIEW REQUIRED: Verify contract TFL; deny if untimely unless exception applies |
| B-TFL-002 | Info | DOS vs. Receipt | Claim approaching timely filing deadline | Informational: Prioritize for processing |

### Charge Amount and Pricing

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-CHG-001 | Error | CLM02 or SV102 | Charge amount required and must be > 0 | Reject claim; missing or invalid charge amount |
| B-CHG-002 | Warning | Charge Amount | Charge amount significantly exceeds typical/contracted rate | Flag for review; possible billing error or upcoding |
| B-CHG-003 | Warning | Units | Units billed exceed typical maximum (e.g., > 99) | Flag for review; verify unit count is correct |
| B-CHG-004 | Info | Line Total | Sum of line charges should equal claim total charge | Informational: Flag if mismatch detected |

### Fraud, Waste, and Abuse Indicators

**IMPORTANT:** Any FWA suspicion requires immediate human review and potential referral to Special Investigations Unit (SIU).

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-FWA-001 | Warning | Provider Pattern | Provider has high volume of claims for uncommon service | HUMAN REVIEW REQUIRED: Flag for SIU review |
| B-FWA-002 | Warning | Member Pattern | Member has high volume of claims with multiple providers | Flag for review; potential doctor shopping |
| B-FWA-003 | Warning | Billing Pattern | Unusual billing patterns (e.g., unbundling, upcoding indicators) | HUMAN REVIEW REQUIRED: Apply clinical review; flag for SIU if suspicious |
| B-FWA-004 | Info | Outlier | Claim is statistical outlier (charge, units, or service mix) | Informational: Enhanced review recommended |

## Configuration Points Summary

The following aspects of this rubric **MUST be customized** for each payer organization:

1. **Benefit plan definitions** - Coverage rules, exclusions, limitations by plan
2. **Network configurations** - In-network provider lists and participation agreements
3. **Prior authorization requirements** - Services requiring PA by plan and service type
4. **Timely filing limits** - Days from DOS to receipt, by contract and state
5. **Code set versions** - ICD-10-CM, CPT, HCPCS update schedules
6. **Medical necessity criteria** - Clinical appropriateness guidelines
7. **Pricing and reimbursement** - Fee schedules, contracted rates, usual and customary
8. **State-specific requirements** - Mandated benefits, regulations by jurisdiction
9. **Trading partner rules** - Submitter-specific validation requirements
10. **Threshold values** - High-dollar claim amounts, frequency limits, outlier definitions

## Severity Definitions

- **Error:** Blocking issue that prevents claim from being processed. Requires correction or human review before adjudication.
- **Warning:** Non-blocking issue that should be reviewed but does not prevent processing. May be resolved during adjudication.
- **Info:** Informational note for context. No action required but may inform adjudication or payment decisions.

## Remediation Actions

- **Reject claim:** Send back to submitter for correction and resubmission
- **Flag for review:** Route to human reviewer or exception queue
- **HUMAN REVIEW REQUIRED:** Must be evaluated by authorized staff before final determination
- **Deny if confirmed:** Conditional denial pending verification
- **Apply plan rules:** Use payer-specific benefit and coverage rules
- **Flag for SIU:** Potential fraud, waste, or abuse - escalate to Special Investigations Unit

## Version Control

This rubric should be version-controlled and updated regularly to reflect:
- New payer policies and benefit plan changes
- Regulatory and compliance updates
- Code set updates (annual ICD, CPT updates)
- Lessons learned from claims review and appeals
- Trading partner agreement changes

**Current Version:** 1.0.0
**Last Updated:** 2024-03-15
**Next Review Date:** 2024-06-15

## Disclaimer

This rubric provides guidance for draft automation and decision support only. It does not constitute final claims adjudication policy, medical advice, or legal interpretation of benefit plans or regulations. All final determinations regarding claim payment, denial, member eligibility, and benefit coverage must be made by authorized personnel following the payer organization's official policies and procedures.
