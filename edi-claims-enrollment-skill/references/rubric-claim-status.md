# Claim Status Validation Rubric (X12 276/277)

This rubric defines validation rules for reviewing and processing X12 276 Claim Status Inquiry and X12 277 Claim Status Response transactions. These rules serve as guidance for draft automation only and do not replace payer-specific policy manuals, claim processing procedures, state regulations, or operational guidelines.

## Overview

This rubric is organized into six validation categories:

1. **Structural Validation** - EDI format, segment order, mandatory fields, HL hierarchy
2. **Request/Response Validation** - Inquiry format, response completeness, TRN matching, status codes
3. **Claim Identification** - Claim identifiers, service dates, reference numbers
4. **Status Information** - Status codes, claim amounts, adjustment codes
5. **Subscriber/Patient Validation** - Subscriber identification, patient demographics
6. **Business Logic Validation** - Duplicate detection, timeliness, status consistency

Each validation rule includes:
- **Rule ID:** Unique identifier for traceability
- **Field/Segment:** Where the rule applies
- **Severity:** Error (blocking), Warning (non-blocking), or Info (informational)
- **Description:** What the rule validates
- **Remediation:** Suggested next steps when rule fails

## Validation Category 1: Structural Validation

### Envelope Structure

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| S-ENV-001 | Error | ISA | ISA segment must be present and first segment | Reject file; request resubmission with valid ISA |
| S-ENV-002 | Error | GS | GS segment must follow ISA with matching sender/receiver | Reject file; verify trading partner configuration |
| S-ENV-003 | Error | ST | ST segment must indicate 276 or 277 transaction (ST01 = 276 or 277) | Reject file; wrong transaction type submitted |
| S-ENV-004 | Error | SE | SE segment must match ST control number and segment count | Reject file; transmission error likely |
| S-ENV-005 | Error | GE | GE segment must match GS control number and transaction count | Reject file; envelope integrity issue |
| S-ENV-006 | Error | IEA | IEA segment must match ISA control number and group count | Reject file; envelope integrity issue |
| S-ENV-007 | Warning | ISA/GS dates | Transmission date should be within 7 days of current date | Flag for review; possible delayed or resubmitted file |

### HL Hierarchy Structure (276 and 277)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| S-276-001 | Error | HL | HL hierarchy required for 276 inquiry | Reject inquiry; malformed transaction |
| S-276-002 | Error | HL*20 | 2000A loop (Information Source) required in 276 | Reject inquiry; missing payer identification |
| S-276-003 | Error | HL*21 | 2000B loop (Information Receiver) required in 276 | Reject inquiry; missing provider identification |
| S-276-004 | Error | HL*19 | 2000C loop (Service Provider) required in 276 | Reject inquiry; missing provider information |
| S-276-005 | Error | HL*22 | 2000D loop (Subscriber) required in 276 | Reject inquiry; missing subscriber information |
| S-276-006 | Warning | HL*23 | 2000E loop (Dependent/Patient) optional in 276 | Informational; patient inquiry if different from subscriber |
| S-277-001 | Error | HL | HL hierarchy required for 277 response | Reject response; malformed transaction |
| S-277-002 | Error | HL*20 | 2000A loop (Information Source) required in 277 | Reject response; missing payer information |
| S-277-003 | Error | HL*21 | 2000B loop (Information Receiver) required in 277 | Reject response; missing provider information |
| S-277-004 | Error | HL*19 | 2000C loop (Service Provider) required in 277 | Reject response; missing provider information |
| S-277-005 | Error | HL*22 | 2000D loop (Subscriber) required in 277 | Reject response; missing subscriber information |
| S-277-006 | Warning | HL*PT | 2000E loop (Patient) optional in 277 | Informational; patient info if different from subscriber |

### Required Segments (276)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| S-276-007 | Error | TRN | Trace number (TRN) required in 276 inquiry | Reject inquiry; missing trace identifier |
| S-276-008 | Error | NM1*PR | Information source/payer name (NM1*PR in 2000A) required | Reject inquiry; missing payer identification |
| S-276-009 | Error | NM1*1P | Information receiver/provider (NM1*1P in 2000B) required | Reject inquiry; missing provider identification |
| S-276-010 | Error | NM1*IL | Subscriber name (NM1*IL in 2000D) required | Reject inquiry; missing subscriber information |
| S-276-011 | Warning | CLP | Claim payment information (CLP) in 2220D loop recommended | Flag for review; claim identification may be incomplete |
| S-276-012 | Warning | REF*D9/1K | Patient control or payer claim number recommended | Flag for review; insufficient claim identifiers |

### Required Segments (277)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| S-277-007 | Error | TRN | Trace number (TRN) required in 277 response | Reject response; missing trace identifier |
| S-277-008 | Error | STC | Status information (STC) required in 2200D loop | Reject response; no status provided |
| S-277-009 | Warning | CLP | Claim payment information (CLP) recommended in 2220D loop | Flag for review; claim details incomplete |
| S-277-010 | Info | DTP | Service dates (DTP) provide claim context | Informational; additional claim information |

## Validation Category 2: Request/Response Validation

### Trace Number Matching

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| R-TRN-001 | Error | TRN02 | TRN02 (trace number) must be present and non-empty | Reject transaction; missing trace identifier |
| R-TRN-002 | Error | TRN02 | TRN02 must be alphanumeric, max 50 characters | Reject transaction; invalid trace number format |
| R-277-001 | Error | TRN02 | 277 response TRN should reference corresponding 276 request TRN | HUMAN REVIEW REQUIRED: Verify matching request |
| R-TRN-003 | Warning | TRN03/04 | TRN03/04 originator information recommended for tracking | Flag for review; enhanced tracking information missing |

### Status Category Codes (277 Response)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| R-STC-001 | Error | STC01-1 | Status category must be valid (A1-A8, B1-B6, C1-C6, D1-D7, E0-E9, F1-F5) | Reject response; invalid status category |
| R-STC-002 | Warning | STC01-2 | Status code should be valid per X12 specifications | Flag for review; invalid status code |
| R-STC-003 | Info | Status meanings | Common categories: A=Acknowledgement, F=Finalized, P=Pending, E=Error | Informational; status category reference |
| R-STC-004 | Info | STC02 | Status effective date (STC02) provides timing context | Informational; when status became effective |
| R-STC-005 | Warning | STC03 | Action code (STC03) should be valid if present | Flag for review; invalid action code |
| R-STC-006 | Info | STC10-1/2 | Category and code should be consistent (finalized claims should have F-codes) | Flag for review; status inconsistency |

### Common Status Categories

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| R-STA-001 | Info | A1 | Acknowledgement - claim received | Informational; initial receipt |
| R-STA-002 | Info | A4/A7 | Claim not found - no record | Informational; claim not in system |
| R-STA-003 | Info | P0-P9 | Pending - claim in process | Informational; claim being processed |
| R-STA-004 | Info | F1 | Finalized - paid | Informational; claim adjudicated and paid |
| R-STA-005 | Info | F2 | Finalized - denied | Informational; claim adjudicated and denied |
| R-STA-006 | Info | F3 | Finalized - partial payment | Informational; claim partially paid |
| R-STA-007 | Info | E0 | Entity not found | Informational; provider or member not found |

### Response Completeness

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| R-CMP-001 | Warning | STC for each claim | Each claim inquiry should have corresponding STC in 277 | Flag for review; incomplete response |
| R-CMP-002 | Info | Service line status | STC may be provided at claim level and/or service line level | Informational; detail level of status |
| R-CMP-003 | Warning | Match inquiry | 277 should respond to all claims requested in 276 | Flag for review; partial response |

## Validation Category 3: Claim Identification

### Claim Reference Numbers

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| C-REF-001 | Error | REF*D9/1K | At least one claim identifier required (patient control or payer number) | Reject inquiry; cannot identify claim |
| C-REF-002 | Warning | REF*D9 | Patient control number (REF*D9) recommended | Flag for review; provider's claim identifier missing |
| C-REF-003 | Warning | REF*1K | Payer claim number (REF*1K) recommended if known | Flag for review; payer's claim identifier not provided |
| C-REF-004 | Info | REF*EA | Medical record number (REF*EA) optional | Informational; additional claim identifier |
| C-REF-005 | Info | Multiple identifiers | Multiple identifiers improve claim matching accuracy | Informational; enhanced claim identification |

### Claim Payment Information (CLP)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| C-CLP-001 | Warning | CLP01 | Claim identifier (CLP01) recommended in 2220D loop | Flag for review; claim ID not provided |
| C-CLP-002 | Warning | CLP02 | Claim status code (CLP02) should be valid (1-23) | Flag for review; invalid claim status |
| C-CLP-003 | Info | CLP02 codes | 1=Processed primary, 2=Processed secondary, 4=Denied, 19=Processed as primary/forwarded to secondary | Informational; claim status meanings |
| C-CLP-004 | Warning | CLP03 | Total charge amount (CLP03) should be numeric and positive | Flag for review; invalid charge amount |
| C-CLP-005 | Warning | CLP04 | Payment amount (CLP04) should be numeric and >= 0 | Flag for review; invalid payment amount |
| C-CLP-006 | Warning | CLP05 | Patient responsibility (CLP05) should be numeric and >= 0 | Flag for review; invalid patient responsibility |
| C-CLP-007 | Info | Amount consistency | CLP04 + CLP05 should not exceed CLP03 | Flag for review; payment amounts inconsistent |

### Service Date Identification

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| C-DTP-001 | Warning | DTP*472 | Service date (DTP*472) recommended for claim identification | Flag for review; service date not provided |
| C-DTP-002 | Warning | Date format | Service date should be valid format (D8, RD8) | Flag for review; invalid date format |
| C-DTP-003 | Warning | Date range | Date range (RD8) should have begin date <= end date | Flag for review; invalid date range |
| C-DTP-004 | Info | DTP*232 | Claim statement period (DTP*232) for institutional claims | Informational; claim period context |

### Provider Identification

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| C-PRV-001 | Warning | NM1*1P/82 | Provider NPI helps identify claim | Flag for review; provider identification incomplete |
| C-PRV-002 | Info | Multiple providers | Billing vs. rendering vs. service provider all help matching | Informational; comprehensive provider identification |
| C-PRV-003 | Warning | NPI validity | Provider NPI should be valid format if provided | Flag for review; invalid NPI |

## Validation Category 4: Status Information

### Status Code Validation

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| S-STC-001 | Error | STC01-1 | Status category must be valid code | Reject response; invalid status category |
| S-STC-002 | Warning | STC01-2 | Status code should be appropriate for category | Flag for review; status code mismatch |
| S-STC-003 | Info | STC hierarchy | Status may be provided at entity, claim, and service line levels | Informational; status detail levels |
| S-STC-004 | Warning | Consistency | Entity status should be consistent with claim status | Flag for review; status inconsistency |

### Claim Amount Validation (in 277 Response)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| S-AMT-001 | Warning | CLP03 | Charge amount should match inquiry if provided | Flag for review; charge amount mismatch |
| S-AMT-002 | Warning | CLP04 | Payment amount should be provided for paid claims (F1 status) | Flag for review; paid claim without payment amount |
| S-AMT-003 | Info | CLP04 = 0 | Zero payment for denied claims (F2 status) is expected | Informational; denied claim |
| S-AMT-004 | Warning | AMT segments | Additional amounts (approved, copay, deductible) provide detail | Informational; comprehensive payment information |

### Adjustment Codes (CAS in 277)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| S-CAS-001 | Info | CAS | Claim adjustment segments explain payment differences | Informational; adjustment reasons |
| S-CAS-002 | Warning | CAS01 | Group code should be valid (CO, CR, OA, PI, PR) | Flag for review; invalid adjustment group |
| S-CAS-003 | Warning | CAS02/03 | Reason code and amount should be valid | Flag for review; invalid adjustment |
| S-CAS-004 | Info | Multiple CAS | Multiple CAS segments provide comprehensive adjustment details | Informational; detailed adjustment information |
| S-CAS-005 | Info | CAS for denials | Denied claims (F2) should include CAS explaining denial | Flag for review; denial without reason |

### Remittance Information

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| S-REM-001 | Info | REF*2U | Payer claim control number (REF*2U) links to remittance | Informational; remittance reference |
| S-REM-002 | Info | DTP*573 | Claim paid date (DTP*573) for finalized claims | Informational; payment date |
| S-REM-003 | Info | QTY | Service line quantity information | Informational; units processed |

## Validation Category 5: Subscriber/Patient Validation

### Subscriber Identification (2000D Loop)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| M-SUB-001 | Error | NM1*IL | Subscriber name required (NM108-09 last/first name) | Reject transaction; missing subscriber name |
| M-SUB-002 | Warning | REF*0F/1L | Member/subscriber ID recommended | Flag for review; member identification incomplete |
| M-SUB-003 | Warning | DMG | Subscriber demographics (DOB, gender) help with matching | Flag for review; demographics missing |
| M-SUB-004 | Info | Name matching | Subscriber name should match claim inquiry | Flag for review; name mismatch |

### Patient Identification (2000E Loop, if applicable)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| M-PAT-001 | Warning | NM1*QC/03 | Patient name required if patient ≠ subscriber | Reject transaction; missing patient information |
| M-PAT-002 | Warning | Patient vs. Sub | Patient demographics should be different from subscriber if separate loop | Flag for review; duplicate patient information |
| M-PAT-003 | Info | Relationship | Patient relationship to subscriber provides context | Informational; dependent relationship |

### Demographics Validation

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| M-DMG-001 | Warning | DMG02 | Date of birth (DMG02) helps with claim matching | Flag for review; DOB missing |
| M-DMG-002 | Warning | DMG02 format | DOB should be valid date format (CCYYMMDD) | Flag for review; invalid date format |
| M-DMG-003 | Warning | DMG03 | Gender code (DMG03) should be valid (M, F, U) | Flag for review; invalid gender code |
| M-DMG-004 | Warning | DOB consistency | DOB should match claim records | Flag for review; DOB mismatch |

### Member Matching for Claim Lookup

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| M-MATCH-001 | Warning | Identifiers | More identifiers improve claim matching (name + DOB + ID + service date) | Informational; comprehensive claim search |
| M-MATCH-002 | Warning | Match quality | Submitted identifiers should match claim records | HUMAN REVIEW REQUIRED: Claims search may fail |
| M-MATCH-003 | Info | Fuzzy matching | Consider fuzzy matching for name variations | Informational; may need manual claim lookup |

## Validation Category 6: Business Logic Validation

**IMPORTANT:** Business logic rules are highly payer-specific. These are examples only and must be customized for each organization.

### Duplicate Inquiry Detection

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-DUP-001 | Warning | TRN + Claim | Duplicate inquiry (same TRN, claim, date) detected | HUMAN REVIEW REQUIRED: Check if duplicate or resubmission |
| B-DUP-002 | Info | Recent inquiry | Same claim inquired within last 24 hours | Informational; recent duplicate inquiry |
| B-DUP-003 | Info | Pattern detection | Multiple inquiries from same provider for same claim | Informational; may indicate issue with status |

### Response Timeliness

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-TIME-001 | Warning | Transaction date | 277 response should be generated within SLA (typically 24-48 hours) | Flag for review; delayed response |
| B-TIME-002 | Info | Real-time | Real-time inquiries expect immediate response | Informational; response latency expectation |
| B-TIME-003 | Info | Batch vs. Real-time | Batch file inquiries may have longer response time | Informational; processing mode affects SLA |

### Claim Search and Retrieval (for 276 Processing)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-SRCH-001 | Warning | Claim not found | Claim identifiers do not match any claims in system | Return 277 with A4 or A7 status (not found) |
| B-SRCH-002 | Info | Multiple matches | Multiple claims match inquiry criteria | HUMAN REVIEW REQUIRED: Determine which claim or return multiple |
| B-SRCH-003 | Warning | Search criteria | Insufficient search criteria may result in no match or multiple matches | Flag for review; request more identifiers |
| B-SRCH-004 | Info | Date range | Service date helps narrow claim search | Informational; date improves matching |

### Status Consistency Validation

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-STA-001 | Warning | Entity vs. Claim | Entity-level status should align with claim-level status | Flag for review; status inconsistency |
| B-STA-002 | Warning | Claim vs. Line | Claim-level status should align with service line status | Flag for review; status inconsistency |
| B-STA-003 | Info | Finalized claims | Finalized status (F-codes) should include payment/denial amounts | Flag for review; incomplete finalized status |
| B-STA-004 | Warning | Pending claims | Pending status (P-codes) should not include final payment amounts | Flag for review; status/payment inconsistency |

### Provider Action Guidance

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-ACT-001 | Info | STC03 | Action code indicates what provider should do next | Informational; provider guidance |
| B-ACT-002 | Info | Common actions | WQ=Wait for more information, RN=Resubmit, CO=Correct and resubmit | Informational; action code meanings |
| B-ACT-003 | Info | Pend reasons | STC with pending status should explain what is being reviewed | Flag for review; incomplete pending information |

### Configuration-Specific Rules

**Configuration Point:** The following rules must be customized for each payer organization.

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-CFG-001 | Warning | Trading partner | Verify trading partner is authorized for claim status inquiries | Flag for review; unauthorized trading partner |
| B-CFG-002 | Warning | Inquiry frequency | Some payers limit inquiry frequency per claim | Flag for review; rate limiting may apply |
| B-CFG-003 | Info | Response detail | Level of detail in 277 response varies by payer configuration | Informational; payer-specific response |
| B-CFG-004 | Info | Status granularity | Some payers provide service line status, others claim-level only | Informational; response detail level |

### Business Rules

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-BUS-001 | Info | Claim age | Recent claims (<5 days) may not be fully processed | Return A1 (received) or P-code (pending) status |
| B-BUS-002 | Info | Archive claims | Old claims (>180 days) may require archive search | Extended response time for archived claims |
| B-BUS-003 | Warning | Claim replaced | Original claim may have been replaced/voided | Return status of most recent claim version |
| B-BUS-004 | Info | Appeal status | Claims under appeal have special status handling | Return appropriate status with appeal information |

## Configuration Points Summary

The following aspects of this rubric **MUST be customized** for each payer organization:

1. **Trading partner authorization** - Which providers/submitters can submit status inquiries
2. **Claim matching rules** - Required identifiers, fuzzy matching tolerance
3. **Response detail level** - Claim-level vs. service line-level status
4. **Status code usage** - Which STC codes are used for various claim states
5. **Timeliness SLAs** - Response time requirements for 277 generation
6. **Archive search** - How to handle inquiries for old/archived claims
7. **Inquiry frequency limits** - Rate limiting to prevent excessive inquiries
8. **Action code usage** - Which STC03 action codes to use for provider guidance
9. **Payment information** - How much financial detail to include in 277
10. **Adjustment codes** - Which CAS codes to use for denials and adjustments

## Severity Definitions

- **Error:** Blocking issue that prevents inquiry/response from being processed. Requires correction or human review before processing.
- **Warning:** Non-blocking issue that should be reviewed but does not prevent processing. May be resolved during processing.
- **Info:** Informational note for context. No action required but may inform processing or response generation.

## Remediation Actions

- **Reject transaction:** Send back to submitter for correction and resubmission
- **Flag for review:** Route to human reviewer or exception queue
- **HUMAN REVIEW REQUIRED:** Must be evaluated by authorized staff before final determination
- **Return status response:** Generate 277 with appropriate STC codes
- **Process with warnings:** Continue processing but document warnings
- **Apply payer rules:** Use payer-specific configuration and business rules

## Version Control

This rubric should be version-controlled and updated regularly to reflect:
- New payer policies and claim processing changes
- Trading partner agreement changes
- Regulatory and compliance updates
- X12 specification updates
- Lessons learned from claim status inquiry/response review

**Current Version:** 1.0.0
**Last Updated:** 2024-03-15
**Next Review Date:** 2024-06-15

## Disclaimer

This rubric provides guidance for draft automation and decision support only. It does not constitute final claim status determination policy, claims processing procedures, or legal interpretation of claim adjudication. All final determinations regarding claim status, payment information, and provider actions must be made by authorized personnel following the payer organization's official policies and procedures.
