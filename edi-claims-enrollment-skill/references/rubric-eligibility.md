# Eligibility Validation Rubric (X12 270/271)

This rubric defines validation rules for reviewing and processing X12 270 Eligibility Inquiry and X12 271 Eligibility Response transactions. These rules serve as guidance for draft automation only and do not replace payer-specific policy manuals, benefit documents, state regulations, or clinical review.

## Overview

This rubric is organized into six validation categories:

1. **Structural Validation** - EDI format, segment order, mandatory fields
2. **Request/Response Validation** - Inquiry format, response completeness, TRN matching
3. **Member/Subscriber Validation** - Subscriber identification, demographics, matching
4. **Provider/Payer Validation** - Information source/receiver validation, NPI validity
5. **Inquiry Scope and Benefit Data** - Service type codes, coverage dates, benefit information
6. **Business Logic Validation** - Duplicate detection, timeliness, configuration rules

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
| S-ENV-003 | Error | ST | ST segment must indicate 270 or 271 transaction (ST01 = 270 or 271) | Reject file; wrong transaction type submitted |
| S-ENV-004 | Error | SE | SE segment must match ST control number and segment count | Reject file; transmission error likely |
| S-ENV-005 | Error | GE | GE segment must match GS control number and transaction count | Reject file; envelope integrity issue |
| S-ENV-006 | Error | IEA | IEA segment must match ISA control number and group count | Reject file; envelope integrity issue |
| S-ENV-007 | Warning | ISA/GS dates | Transmission date should be within 7 days of current date | Flag for review; possible delayed or resubmitted file |

### HL Hierarchy Structure (270 and 271)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| S-270-001 | Error | HL | HL hierarchy required for 270 inquiry | Reject inquiry; malformed transaction |
| S-270-002 | Error | HL*20 | 2000A loop (Information Source) required in 270 | Reject inquiry; missing payer identification |
| S-270-003 | Error | HL*21 | 2000B loop (Information Receiver) required in 270 | Reject inquiry; missing provider identification |
| S-270-004 | Error | HL*22 | 2000C loop (Subscriber) required in 270 | Reject inquiry; missing subscriber information |
| S-270-005 | Warning | HL parent | HL parent-child relationships must be valid (2000A→2000B→2000C) | Flag for review; hierarchy structure issue |
| S-271-001 | Error | HL | HL hierarchy required for 271 response | Reject response; malformed transaction |
| S-271-002 | Error | HL*20 | 2000A loop (Information Source) required in 271 | Reject response; missing payer information |
| S-271-003 | Error | HL*21 | 2000B loop (Information Receiver) required in 271 | Reject response; missing provider information |
| S-271-004 | Error | HL*22 | 2000C loop (Subscriber) required in 271 | Reject response; missing subscriber information |
| S-271-005 | Warning | HL*23 | 2000D loop (Dependent) optional in 271 | Informational; dependent info provided separately |

### Required Segments

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| S-REQ-001 | Error | TRN | Trace number (TRN) required in both 270 and 271 | Reject transaction; missing trace identifier |
| S-REQ-002 | Error | NM1*PR | Information source/payer name (NM1*PR in 2000A) required | Reject transaction; missing payer identification |
| S-REQ-003 | Error | NM1*1P | Information receiver/provider (NM1*1P in 2000B) required | Reject transaction; missing provider identification |
| S-REQ-004 | Error | NM1*IL | Subscriber name (NM1*IL in 2000C) required | Reject transaction; missing subscriber information |
| S-270-006 | Warning | EQ | Eligibility inquiry (EQ) segment recommended in 270 | Flag for review; inquiry scope not specified |
| S-271-006 | Error | EB | At least one EB segment required in 271 response | Reject response; no benefit information provided |
| S-REQ-005 | Warning | REF*0F/1L | Member ID reference (REF*0F or REF*1L) recommended in 2000C | Flag for review; member identification may be incomplete |

## Validation Category 2: Request/Response Validation

### Trace Number Matching

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| R-TRN-001 | Error | TRN02 | TRN02 (trace number) must be present and non-empty | Reject transaction; missing trace identifier |
| R-TRN-002 | Error | TRN02 | TRN02 must be alphanumeric, max 50 characters | Reject transaction; invalid trace number format |
| R-271-001 | Error | TRN02 | 271 response TRN must match corresponding 270 request TRN | HUMAN REVIEW REQUIRED: Verify matching request; reject if no match |
| R-TRN-003 | Warning | TRN03/04 | TRN03/04 originator information recommended for tracking | Flag for review; enhanced tracking information missing |

### 270 Inquiry Validation

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| R-270-001 | Warning | EQ01 | Service type code (EQ01) should be valid code (01-99, A1-A9) | Flag for review; invalid service type code |
| R-270-002 | Info | EQ02 | Coverage level code (EQ02) optional but recommended | Informational; coverage level not specified |
| R-270-003 | Warning | III01 | Information type code (III01) should be valid if present | Flag for review; invalid information type |
| R-270-004 | Info | DTP | Date range (DTP) segments provide inquiry context | Informational; date range for inquiry |
| R-270-005 | Warning | Multiple EQ | Multiple EQ segments for different service types allowed | Informational; multiple service inquiries in one transaction |

### 271 Response Validation

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| R-271-002 | Error | EB01 | Eligibility status code (EB01) must be valid (1-8, C, I, N, U, Y) | Reject response; invalid eligibility status |
| R-271-003 | Warning | EB03 | Service type code (EB03) should match 270 inquiry if applicable | Flag for review; response may not match inquiry |
| R-271-004 | Warning | EB06 | Benefit coverage level (EB06) recommended | Flag for review; coverage level not specified |
| R-271-005 | Info | EB segments | Multiple EB segments provide detailed benefit information | Informational; comprehensive response |
| R-271-006 | Warning | DTP*346/347 | Coverage dates (DTP*346 effective, DTP*347 term) recommended | Flag for review; coverage period not specified |
| R-271-007 | Info | MSG | Message text (MSG) provides additional context | Informational; additional response details |

### AAA Rejection Validation

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| R-AAA-001 | Warning | AAA*N | Rejection reason (AAA with AAA01=N) indicates inquiry cannot be processed | HUMAN REVIEW REQUIRED: Review rejection reason |
| R-AAA-002 | Warning | AAA03 | Reject reason code (AAA03) should be valid code | Flag for review; invalid rejection reason |
| R-AAA-003 | Info | AAA04 | Follow-up action code (AAA04) provides guidance | Informational; follow-up action needed |
| R-AAA-004 | Warning | Common AAA codes | Common codes: 51 (system unavailable), 64 (unsupported inquiry), 72 (member not found) | Flag for review; determine appropriate action |

## Validation Category 3: Member/Subscriber Validation

**IMPORTANT:** Member validation rules are draft checks only. Final member identification must be verified through authoritative member database.

### Subscriber Identification

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| M-SUB-001 | Error | NM1*IL | Subscriber name required (NM108-09 last/first name) | Reject transaction; missing subscriber name |
| M-SUB-002 | Error | REF*0F/1L | Member/subscriber ID required (REF*0F or REF*1L in 2000C) | HUMAN REVIEW REQUIRED: Cannot identify member without ID |
| M-SUB-003 | Warning | NM109 | Subscriber first name recommended | Flag for review; incomplete subscriber identification |
| M-SUB-004 | Warning | Name format | Subscriber name should not contain special characters or numbers | Flag for review; possible data quality issue |
| M-SUB-005 | Info | NM106 | Name prefix (Mr., Mrs., Dr.) optional | Informational; additional name information |

### Dependent Identification (if applicable)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| M-DEP-001 | Warning | HL*23 | 2000D loop (Dependent) requires parent subscriber loop | Flag for review; dependent without subscriber |
| M-DEP-002 | Error | NM1*03 | Dependent name required if 2000D loop present | Reject transaction; missing dependent identification |
| M-DEP-003 | Warning | INS01 | Relationship code (INS01) should be valid for dependent | Flag for review; invalid relationship code |
| M-DEP-004 | Info | DMG | Dependent demographics (DMG) recommended | Informational; enhanced dependent identification |

### Demographics Validation

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| M-DMG-001 | Warning | DMG02 | Date of birth (DMG02) recommended for accurate member matching | Flag for review; DOB missing may cause matching issues |
| M-DMG-002 | Warning | DMG02 format | DOB should be valid date format (CCYYMMDD) | Flag for review; invalid date format |
| M-DMG-003 | Warning | DMG03 | Gender code (DMG03) should be valid (M, F, U) | Flag for review; invalid gender code |
| M-DMG-004 | Info | DMG04 | Marital status (DMG04) optional | Informational; additional demographic information |
| M-DMG-005 | Warning | Future DOB | DOB should not be in the future | Flag for review; invalid date of birth |
| M-DMG-006 | Warning | Age validation | Age calculated from DOB should be reasonable (0-120 years) | Flag for review; DOB may be incorrect |

### Member Matching

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| M-MATCH-001 | Info | Multiple identifiers | More identifiers improve matching accuracy (name + DOB + ID) | Informational; enhanced matching data |
| M-MATCH-002 | Warning | Name matching | Submitted name should match member database (case-insensitive) | HUMAN REVIEW REQUIRED: Verify member identity if mismatch |
| M-MATCH-003 | Warning | ID matching | Submitted member ID should exist in member database | HUMAN REVIEW REQUIRED: Member not found |
| M-MATCH-004 | Info | Fuzzy matching | Consider fuzzy matching for name variations | Informational; may need manual verification |

## Validation Category 4: Provider/Payer Validation

**IMPORTANT:** Provider validation rules are draft checks only. Final provider verification must be through authoritative provider directory.

### Information Source/Payer Validation (2000A)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| P-PAY-001 | Error | NM1*PR | Payer name required in 2000A loop | Reject transaction; missing payer identification |
| P-PAY-002 | Warning | NM109 | Payer identifier (NM109) recommended | Flag for review; payer identification incomplete |
| P-PAY-003 | Info | N3/N4 | Payer address segments optional | Informational; additional payer information |
| P-PAY-004 | Warning | PER | Payer contact information (PER) recommended for follow-up | Flag for review; no contact information provided |

### Information Receiver/Provider Validation (2000B)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| P-PRV-001 | Error | NM1*1P | Provider name required in 2000B loop | Reject transaction; missing provider identification |
| P-PRV-002 | Warning | NM109 | Provider NPI (NM109) recommended | Flag for review; provider not identified by NPI |
| P-PRV-003 | Warning | NM108/09 | Provider name or NPI required | HUMAN REVIEW REQUIRED: Insufficient provider identification |
| P-PRV-004 | Info | PRV | Provider specialty (PRV) segment provides context | Informational; provider specialty information |
| P-PRV-005 | Info | REF*0B | State license number (REF*0B) optional | Informational; additional provider identification |

### NPI Validation (Reuse from Claims Rubric)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| P-NPI-001 | Error | NM109 (NPI) | NPI must be exactly 10 numeric digits | Reject transaction; invalid NPI format |
| P-NPI-002 | Error | NM109 | NPI must pass Luhn algorithm check digit validation | Reject transaction; invalid NPI checksum |
| P-NPI-003 | Warning | NM109 | NPI should be verified active in NPPES registry | Flag for review; call NPPES API or check manually |
| P-NPI-004 | Info | NPI vs. Type | NPI type (individual vs. organization) provides context | Informational; provider type information |

### Entity Code Validation

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| P-ENT-001 | Error | NM101 | Entity identifier code must be valid (PR, 1P, IL, 03, etc.) | Reject transaction; invalid entity code |
| P-ENT-002 | Warning | NM101 in loop | Entity code should match loop requirements (PR in 2000A, 1P in 2000B, IL in 2000C) | Flag for review; entity code mismatch |

## Validation Category 5: Inquiry Scope and Benefit Data

### Service Type Codes (270 Inquiry)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| I-EQ-001 | Warning | EQ01 | Service type code should be valid per X12 specifications | Flag for review; invalid service type code |
| I-EQ-002 | Info | Common codes | Common codes: 30 (health benefit plan coverage), 47 (deductible), 60 (copayment), 88 (pharmacy) | Informational; common inquiry types |
| I-EQ-003 | Warning | EQ01 scope | Broad inquiry (30) vs. specific (88, 98) affects response detail | Informational; inquiry scope |
| I-EQ-004 | Info | Multiple EQ | Multiple EQ segments allow multiple service type inquiries | Informational; comprehensive inquiry |

### Coverage Level (EQ02)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| I-COV-001 | Info | EQ02 | Coverage level codes: IND (individual), FAM (family), ESP (employee + spouse), etc. | Informational; coverage level context |
| I-COV-002 | Warning | EQ02 validity | Coverage level code should be valid if provided | Flag for review; invalid coverage level |

### Date Range Validation

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| I-DTP-001 | Warning | DTP*291 | Plan/coverage begin date (DTP*291) recommended | Flag for review; coverage period not specified |
| I-DTP-002 | Warning | DTP*307 | Eligibility date (DTP*307) provides inquiry context | Informational; specific date inquiry |
| I-DTP-003 | Warning | Date format | Dates should be valid format (D8, RD8) | Flag for review; invalid date format |
| I-DTP-004 | Warning | Date logic | Begin date should be before end date if both provided | Flag for review; invalid date range |

### Benefit Information (271 Response)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-EB-001 | Error | EB | At least one EB segment required in 271 response | Reject response; no benefit information |
| B-EB-002 | Warning | EB01 | Eligibility code should be valid (1-8, C, I, N, U, Y) | Flag for review; invalid eligibility status |
| B-EB-003 | Info | EB01 codes | 1=Active, 2=Active-Full Risk, 6=Inactive, 7=COBRA, 8=Active-Pending | Informational; eligibility status meanings |
| B-EB-004 | Warning | EB03 | Service type in response should match inquiry | Flag for review; response mismatch |
| B-EB-005 | Info | EB06 | Coverage level (EB06) indicates specific vs. family coverage | Informational; coverage scope |
| B-EB-006 | Info | EB09 | In-plan network indicator (EB09) Y/N/W/U | Informational; network status |
| B-EB-007 | Warning | EB13 | Insurance type code (EB13) provides plan type context | Informational; plan type (HMO, PPO, etc.) |

### Coverage Dates (271 Response)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-DTP-001 | Warning | DTP*346 | Plan coverage begin date (DTP*346) recommended | Flag for review; effective date not specified |
| B-DTP-002 | Warning | DTP*347 | Plan coverage end date (DTP*347) recommended if terminated | Flag for review; termination date not specified |
| B-DTP-003 | Warning | DTP*348 | Eligibility date (DTP*348) provides coverage context | Informational; specific coverage date |
| B-DTP-004 | Warning | Date consistency | Coverage dates should align with eligibility status | Flag for review; date inconsistency |
| B-DTP-005 | Warning | Future dates | Coverage end date in future indicates active coverage | Informational; ongoing coverage |

### Benefit Amounts (271 Response)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-AMT-001 | Info | EB | EB segments may include monetary amounts (deductible, OOP max, copay) | Informational; benefit amounts provided |
| B-AMT-002 | Warning | Monetary format | Monetary amounts should be valid numeric format | Flag for review; invalid amount format |
| B-AMT-003 | Info | Time period | HSD segment indicates time period for amounts (per year, per visit, etc.) | Informational; benefit period context |

## Validation Category 6: Business Logic Validation

**IMPORTANT:** Business logic rules are highly payer-specific. These are examples only and must be customized for each organization.

### Duplicate Request Detection

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-DUP-001 | Warning | TRN + Member | Duplicate inquiry (same TRN, member, date) detected | HUMAN REVIEW REQUIRED: Check if duplicate or resubmission |
| B-DUP-002 | Info | Recent inquiry | Same member inquired within last 24 hours | Informational; recent duplicate inquiry |
| B-DUP-003 | Info | Pattern detection | Multiple inquiries from same provider for same member | Informational; may indicate issue |

### Response Timeliness

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-TIME-001 | Warning | Transaction date | 271 response should be generated within SLA (typically 24-48 hours) | Flag for review; delayed response |
| B-TIME-002 | Info | Real-time | Real-time inquiries expect immediate response | Informational; response latency expectation |

### Coordination of Benefits (COB)

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-COB-001 | Info | EB12 | COB indicator (EB12) shows other coverage | Informational; member has other insurance |
| B-COB-002 | Info | COB details | Additional COB information in REF segments | Informational; other payer details |
| B-COB-003 | Warning | COB consistency | COB information should be consistent with member records | Flag for review; verify COB status |

### Configuration-Specific Rules

**Configuration Point:** The following rules must be customized for each payer organization.

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-CFG-001 | Warning | Trading partner | Verify trading partner is authorized for eligibility inquiries | Flag for review; unauthorized trading partner |
| B-CFG-002 | Warning | Service type | Some payers restrict inquiry types by trading partner | Flag for review; inquiry type not supported |
| B-CFG-003 | Info | Response detail | Level of detail in 271 response varies by payer configuration | Informational; payer-specific response |
| B-CFG-004 | Warning | AAA requirements | Rejection criteria and AAA codes vary by payer | Informational; payer-specific rejection handling |

### Business Rules and Exceptions

| Rule ID | Severity | Field/Segment | Description | Remediation |
|---------|----------|---------------|-------------|-------------|
| B-BUS-001 | Warning | Member status | Member found but status is "Terminated" | HUMAN REVIEW REQUIRED: Return AAA*N*72 or EB with term date |
| B-BUS-002 | Warning | Plan coverage | Service type inquiry for uncovered benefit | Return EB with appropriate status (6=Inactive) |
| B-BUS-003 | Info | Inquiry limits | Some payers limit inquiry frequency per member | Informational; rate limiting may apply |
| B-BUS-004 | Warning | PCP assignment | HMO plans may require PCP in response | Flag for review; include PCP in 271 if required |

## Configuration Points Summary

The following aspects of this rubric **MUST be customized** for each payer organization:

1. **Trading partner authorization** - Which providers/submitters can submit eligibility inquiries
2. **Supported inquiry types** - Which EQ service type codes are supported
3. **Response detail level** - How much benefit detail to include in 271 responses
4. **AAA rejection criteria** - When to reject vs. return partial information
5. **Member matching rules** - Fuzzy matching tolerance, required identifiers
6. **Timeliness SLAs** - Response time requirements for 271 generation
7. **COB handling** - How to represent coordination of benefits in responses
8. **Network information** - Whether to include in-network/out-of-network status
9. **PCP requirements** - HMO plans may require PCP assignment in response
10. **Benefit detail** - Deductible, copay, OOP max amounts and time periods

## Severity Definitions

- **Error:** Blocking issue that prevents inquiry/response from being processed. Requires correction or human review before processing.
- **Warning:** Non-blocking issue that should be reviewed but does not prevent processing. May be resolved during processing.
- **Info:** Informational note for context. No action required but may inform processing or response generation.

## Remediation Actions

- **Reject transaction:** Send back to submitter for correction and resubmission
- **Flag for review:** Route to human reviewer or exception queue
- **HUMAN REVIEW REQUIRED:** Must be evaluated by authorized staff before final determination
- **Return AAA rejection:** Generate 271 with AAA segment indicating rejection reason
- **Process with warnings:** Continue processing but document warnings
- **Apply payer rules:** Use payer-specific configuration and business rules

## Version Control

This rubric should be version-controlled and updated regularly to reflect:
- New payer policies and benefit plan changes
- Trading partner agreement changes
- Regulatory and compliance updates
- X12 specification updates
- Lessons learned from inquiry/response review and appeals

**Current Version:** 1.0.0
**Last Updated:** 2024-03-15
**Next Review Date:** 2024-06-15

## Disclaimer

This rubric provides guidance for draft automation and decision support only. It does not constitute final eligibility determination policy, medical advice, or legal interpretation of benefit plans or regulations. All final determinations regarding member eligibility, benefit coverage, and network status must be made by authorized personnel following the payer organization's official policies and procedures.
