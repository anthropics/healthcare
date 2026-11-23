# EDI Validation Rules

Guidance for draft automation only. All final determinations require authorized human review.

**Scope:** Universal X12/HIPAA structural and business rules applicable to any payer.  
**Out of scope:** Payer-specific thresholds, escalation contacts, timely-filing limits, and PA requirement lists — configure those in `config/payer-config-template.yaml`.

---

## Who checks what

| Check | Responsibility |
|-------|---------------|
| SE01 segment count | `scripts/edi_validate.py` |
| ISA/IEA, GS/GE, ST/SE control-number matching | `scripts/edi_validate.py` |
| IEA01 group count, GE01 transaction count | `scripts/edi_validate.py` |
| Business-rule interpretation, error explanations, resolutions | This skill (Claude) |

Run `python scripts/edi_validate.py <file> --json` and pass the output to the skill before requesting business-rule review.

---

## 1. Shared Envelope Rules (all transaction types)

| Rule ID | Severity | Segment | Description |
|---------|----------|---------|-------------|
| S-ENV-001 | Error | ISA | Must be first segment |
| S-ENV-002 | Error | GS | Must follow ISA; sender/receiver must match trading-partner config |
| S-ENV-003 | Error | ST | ST01 must match expected transaction type (837, 834, 270, 276, etc.) |
| S-ENV-004 | Error | SE | SE01 (segment count) and SE02 (control number) must match ST |
| S-ENV-005 | Error | GE | GE01 (transaction count) and GE02 must match GS06 |
| S-ENV-006 | Error | IEA | IEA01 (group count) and IEA02 must match ISA13 |
| S-ENV-007 | Warning | ISA/GS dates | Transmission date should be within 7 days of today |

> S-ENV-004 through S-ENV-006 are verified by the script. The skill interprets *why* a mismatch occurred and drafts the resubmission note.

---

## 2. X12 837 — Claims (Professional, Institutional, Dental)

### 2a. Required structure

| Rule ID | Severity | Segment | Description |
|---------|----------|---------|-------------|
| S-CLM-001 | Error | BHT | BHT (Beginning of Hierarchical Transaction) required |
| S-CLM-002 | Error | NM1*85 | Billing provider (2010AA loop) required |
| S-CLM-003 | Error | NM1*IL | Subscriber (2000B/2010BA) required |
| S-CLM-004 | Error | CLM | Claim information segment (2300 loop) required |
| S-CLM-005 | Error | DTP*431 or *434 | Service date(s) required |
| S-CLM-006 | Error | HI*ABK or *BK | At least one ICD-10-CM diagnosis required |
| S-CLM-007 | Error | SV1 or SV2 | At least one service line required |
| S-CLM-008 | Error | CLM02 / SV102 | Charge amount required and must be > 0 |
| S-CLM-009 | Error (837P) | NM1*82 | Rendering provider required when ≠ billing provider |
| S-CLM-010 | Error (837I) | SV201 | Revenue code required at each service line |
| S-CLM-011 | Error (837I) | CLM05-1 | Facility/bill type first digit required |
| S-CLM-012 | Warning | REF*D9 | Patient control number (PCN) recommended |

### 2b. Code set rules

| Rule ID | Severity | Field | Description |
|---------|----------|-------|-------------|
| C-DX-001 | Error | ICD code | Must be valid ICD-10-CM format (3–7 alphanumeric) |
| C-DX-002 | Error | ICD code | Must exist in code set effective for service date |
| C-CPT-001 | Error | CPT/HCPCS | Must be 5-character alphanumeric; must exist in code set |
| C-NPI-001 | Error | NM109 | NPI must be exactly 10 numeric digits passing Luhn check |
| C-POS-001 | Error | CLM05-1 (Prof) | Place of service required; must be a valid 2-digit CMS code |
| C-MOD-001 | Warning | Modifier | Must be a valid 2-character alphanumeric modifier |

### 2c. Business rules (configuration-dependent)

| Rule ID | Severity | Description |
|---------|----------|-------------|
| B-CLM-001 | Warning | Member coverage must be active on date of service — verify in eligibility system |
| B-CLM-002 | Warning | Provider NPI should be active in NPPES on date of service |
| B-CLM-003 | Warning | Claim date vs. receipt date — apply your timely-filing limit (`config: timely_filing.standard_days`) |
| B-CLM-004 | Warning | Duplicate check: same member/provider/DOS/procedure — check claims history |
| B-CLM-005 | Warning | PA-required service without PA number — apply your PA list (`config: prior_auth`) |
| B-CLM-006 | Warning | Charge exceeds high-dollar threshold — apply `config: high_dollar_claims` |
| B-CLM-007 | Warning | Procedure/diagnosis mismatch — apply medical-necessity criteria |
| B-FWA-001 | Warning | Unusual billing pattern — HUMAN REVIEW REQUIRED; refer to SIU if indicated |

---

## 3. X12 834 — Benefit Enrollment and Maintenance

### 3a. Required structure

| Rule ID | Severity | Segment | Description |
|---------|----------|---------|-------------|
| S-834-001 | Error | BGN | BGN (Beginning Segment) required; BGN02 must be unique |
| S-834-002 | Error | INS | Member-level INS segment required in 2000 loop |
| S-834-003 | Error | INS03 | Maintenance type code required (001/021/024/025/030, etc.) |
| S-834-004 | Error | NM1*IL | Member name in 2100A loop required |
| S-834-005 | Error | DMG | Date of birth and gender required |
| S-834-006 | Error | DTP*348 | Coverage effective date required for add/change transactions |
| S-834-007 | Error | HD | Health coverage segment (2300 loop) required |
| S-834-008 | Error | HD05 | Insurance line code required (HLT, DEN, VIS, etc.) |

### 3b. Member data rules

| Rule ID | Severity | Description |
|---------|----------|-------------|
| M-ID-001 | Error | Subscriber number (REF*0F) required |
| M-REL-001 | Error | INS02 relationship code must be valid per X12 standards |
| M-REL-002 | Error | Subscriber (INS01=Y) must have relationship code 18 (Self) |
| M-DEM-001 | Error | Last name and first name required |
| M-DEM-002 | Error | DOB must be valid CCYYMMDD and not future-dated |
| M-ADR-001 | Error | Street address (N3) and city/state/ZIP (N4) required |
| M-PCP-001 | Error | PCP NPI (NM1*P3) must be 10-digit Luhn-valid when present |

### 3c. Date rules

| Rule ID | Severity | Description |
|---------|----------|-------------|
| D-EFF-001 | Error | Effective date must be valid CCYYMMDD |
| D-TRM-001 | Error | Termination date required when INS03 = 024/025; must be ≥ effective date |
| D-RET-001 | Warning | Effective date > `config: retro_enrollment.warning_threshold_days` in past — HUMAN REVIEW |
| D-RET-002 | Warning | Retroactive termination (past-dated term date) — HUMAN REVIEW; identify affected claims |

### 3d. Business rules (configuration-dependent)

| Rule ID | Severity | Description |
|---------|----------|-------------|
| B-834-001 | Warning | Group number should match active employer group contract |
| B-834-002 | Warning | Dependent age ≥ 26 without student/disabled status — verify exception |
| B-834-003 | Warning | Duplicate member detection: same SSN/DOB/name — HUMAN REVIEW |
| B-834-004 | Warning | Mid-year enrollment without INS04 qualifying-event code — HUMAN REVIEW |
| B-834-005 | Warning | COBRA continuation indicated — apply COBRA premium and election rules |

---

## 4. X12 270/271 — Eligibility Inquiry / Response

### 4a. Required structure (270 inquiry)

| Rule ID | Severity | Segment | Description |
|---------|----------|---------|-------------|
| S-270-001 | Error | HL*20 | Information source (payer) HL loop required |
| S-270-002 | Error | HL*21 | Information receiver (provider) HL loop required |
| S-270-003 | Error | HL*22 | Subscriber HL loop required |
| S-270-004 | Error | NM1*PR | Payer name/ID in 2000A required |
| S-270-005 | Error | NM1*1P | Provider name/ID in 2000B required |
| S-270-006 | Error | NM1*IL | Subscriber identification in 2000C required |
| S-270-007 | Error | TRN | Trace number required for request/response correlation |
| S-270-008 | Warning | EQ | Service type code (EQ) recommended; absence broadens inquiry scope |

### 4b. Required structure (271 response)

| Rule ID | Severity | Segment | Description |
|---------|----------|---------|-------------|
| S-271-001 | Error | TRN | Trace number must match 270 request TRN |
| S-271-002 | Error | EB | At least one EB (Eligibility/Benefit) segment required per subscriber |
| S-271-003 | Warning | AAA | AAA rejection segment indicates inquiry could not be processed — explain code |
| S-271-004 | Warning | DTP*346/347 | Coverage effective/termination dates should be present when status is active |

---

## 5. X12 276/277 — Claim Status Inquiry / Response

### 5a. Required structure (276 inquiry)

| Rule ID | Severity | Segment | Description |
|---------|----------|---------|-------------|
| S-276-001 | Error | HL*20/*21/*19/*22 | Full HL hierarchy (payer/receiver/provider/subscriber) required |
| S-276-002 | Error | TRN | Trace number required |
| S-276-003 | Error | NM1*PR | Payer identification required |
| S-276-004 | Error | REF*D9 or *1K | At least one claim identifier (PCN or payer claim number) required |
| S-276-005 | Error | DTP*472 | Claim service date required |

### 5b. Required structure (277 response)

| Rule ID | Severity | Segment | Description |
|---------|----------|---------|-------------|
| S-277-001 | Error | TRN | Trace number must match 276 request |
| S-277-002 | Error | STC | Status information code(s) required at claim level |
| S-277-003 | Warning | CLP | Claim payment data (CLP) expected for paid/adjusted claims |
| S-277-004 | Warning | CAS | Adjustment reasons (CAS) expected when claim is reduced or denied |

---

## Severity Definitions

| Severity | Meaning |
|----------|---------|
| **Error** | Blocking — transaction cannot be processed without correction or human resolution |
| **Warning** | Non-blocking — route for human review; processing may continue if reviewer approves |
| **Info** | Contextual — no action required; informs adjudication or routing |

## Disclaimer

Draft guidance only. Does not constitute final claims adjudication policy, legal interpretation of benefit plans, or regulatory advice. All final determinations must be made by authorized staff following your organization's official policies.
