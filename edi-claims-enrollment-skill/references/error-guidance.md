# Error Guidance

How to explain validation failures and help reviewers resolve them.

---

## Principle

Every error message should answer three questions from user-supplied data:
1. **What failed and why** — specific values from the actual transaction
2. **Most likely causes** — ranked by plausibility given the transaction context; never invent statistics
3. **Next steps** — concrete, ordered actions pointing to real systems

Never cite historical case counts or probability percentages unless the user supplies that data.  
Never simulate historical context. If context is unavailable, say so.

---

## Error Message Format

```
❌ [Plain-language problem statement]

DIAGNOSIS (from transaction):
  Field:   [segment/element]
  Found:   [actual value]
  Expected: [valid value or constraint]

LIKELY CAUSES (ranked by context):
  1. [Most plausible given transaction context]
  2. [Next most plausible]
  3. [Less common but worth checking]

NEXT STEPS:
  → [Specific action — name the system or document to check]
  → [Conditional: "If X, then Y"]
  → [Escalation path if unresolved]

HUMAN REVIEW REQUIRED: [Yes/No — Yes whenever marked Error in validation-rules.md]
```

Omit sections that don't apply. Keep language plain and specific to the actual data in hand.

---

## Common Claims Errors

### E-ELG-001 — Member not eligible on service date

```
DIAGNOSIS: Service date {DTP431} falls outside coverage period.
           Coverage status in system: {from eligibility API or user input}.

LIKELY CAUSES:
  1. Coverage was genuinely terminated before service date
  2. Retroactive termination not yet reflected in claims system
  3. Emergency services — check if state mandate or plan policy applies

NEXT STEPS:
  → Look up member {member_id} in eligibility system on {service_date}
  → If terminated: confirm date and reason; apply timely-filing or denial rules
  → If retroactive error: request 834 correction from sponsor/employer
  → If emergency (CPT 99281-99285 / POS 23): check your emergency services policy
  → If unresolved after eligibility check: escalate per config escalation_contacts
```

### C-DX-001 — Invalid ICD-10-CM code

```
DIAGNOSIS: Code {code} in HI segment is not a valid ICD-10-CM code
           for service date {service_date}.

LIKELY CAUSES:
  1. Typographical error in submitted code
  2. Code is valid ICD-9 but not ICD-10
  3. Code was deleted or not yet effective for this service date year

NEXT STEPS:
  → Verify code against ICD-10-CM tabular for fiscal year of service date
  → Contact billing provider to resubmit with corrected code
  → If partial code: check for required 5th/6th character specificity
```

### P-NPI-001 — NPI format or check-digit failure

```
DIAGNOSIS: NPI {npi} in {segment} fails format or Luhn algorithm validation.

LIKELY CAUSES:
  1. Data entry error (transposed digits, wrong length)
  2. Legacy provider ID submitted instead of NPI
  3. Organization NPI used where individual NPI required (or vice versa)

NEXT STEPS:
  → Look up correct NPI in NPPES registry (nppes.cms.hhs.gov)
  → Contact billing provider to correct and resubmit
  → Verify Type 1 (individual) vs. Type 2 (organization) NPI is appropriate here
```

### B-PA-001 — Prior authorization missing

```
DIAGNOSIS: Service {cpt_code} on {service_date} appears to require prior authorization;
           no REF*G1 (PA number) found in 2300 loop.

LIKELY CAUSES:
  1. PA was obtained but not included in transaction
  2. Service was rendered without obtaining required PA
  3. PA requirement does not apply to this plan or provider contract

NEXT STEPS:
  → Check PA system for member {member_id} and service {cpt_code} on {service_date}
  → If PA on file: resubmit with REF*G1 populated
  → If no PA: apply your plan's missing-PA denial or pend policy
  → If not required for this plan/contract: document and clear exception
```

### B-DUP-001 — Potential duplicate claim

```
DIAGNOSIS: Claim {claim_id} has same member/provider/DOS/procedure as {existing_claim_id}
           (or: no existing claim ID supplied for comparison).

NEXT STEPS:
  → Search claims history for {member_id} / {billing_npi} / {service_date} / {procedure_code}
  → If true duplicate: deny as duplicate; reference original claim number in denial
  → If corrected claim: verify REF*F8 original claim number is present
  → If concurrent services: verify distinct procedures and modifier usage
```

---

## Common Enrollment Errors

### D-RET-001 — Retroactive enrollment

```
DIAGNOSIS: Effective date {eff_date} is {N} days in the past,
           exceeding the warning threshold in your config.

NEXT STEPS:
  → Verify qualifying life event or open-enrollment period justifies retro date
  → Check config retro_enrollment.warning_threshold_days and max_allowed_days
  → Identify any claims already adjudicated in the retro period
  → Escalate per config escalation_contacts for your retro window bracket
  → If approved: trigger claim reprocessing review for affected dates
```

### D-RET-002 — Retroactive termination

```
DIAGNOSIS: Termination date {term_date} is in the past.
           Any claims paid after {term_date} may require recovery.

NEXT STEPS:
  → Confirm termination reason with sponsor/employer
  → Generate list of claims paid for {member_id} from {term_date} to today
  → HUMAN REVIEW REQUIRED: determine recovery action per your retro-term policy
  → Notify affected providers if recovery is initiated
```

### M-ID-005 — Duplicate member detected

```
DIAGNOSIS: Member data matches existing record(s): {match_fields}.

NEXT STEPS:
  → Compare new record against existing record in member management system
  → If same person: apply maintenance action to existing record (do not create duplicate)
  → If different person with same demographics: flag for manual verification
  → Document resolution in enrollment audit log
```

---

## Common Eligibility / Claim-Status Errors

### S-271-003 — AAA rejection on eligibility response

```
DIAGNOSIS: 271 contains AAA segment with reject reason code {aaa_code}.

AAA CODES (selected):
  41 — Unknown member ID: subscriber ID not found in payer system
  42 — Unable to respond at current time: system unavailable; retry
  43 — Invalid/missing provider: inquiring provider NPI issue

NEXT STEPS:
  → Use AAA01 reject reason to identify root cause
  → For code 41: verify member ID and resubmit 270
  → For code 42: retry after payer system maintenance window
  → For code 43: verify inquiring provider NPI in 2000B NM1*1P
```

### S-277-002 — Missing or unexpected STC status code

```
DIAGNOSIS: 277 response for claim {claim_id} has STC with entity code {stc_code}.

NEXT STEPS:
  → Look up STC01-1 (claim status category) and STC01-2 (claim status code) in
    ASC X12 277 implementation guide or payer companion document
  → Map status to action: pend / contact provider / no action required
  → If status indicates denial: extract CAS segment reason codes and map to EOB
```

---

## SE01 Count Errors

The script detects SE01 mismatches automatically. When one is found:

```
DIAGNOSIS: SE01 declares {declared} segments but actual count is {actual}.
           Difference: {actual - declared} ({over/under}).

LIKELY CAUSES:
  1. Manual file editing that added or removed segments after SE was written
  2. Translation system bug in segment count calculation
  3. Merged transactions with incorrect re-numbering

NEXT STEPS:
  → Ask trading partner to regenerate the file from source data
  → Do NOT manually patch SE01 — fix the underlying segment structure
  → Reject file and request resubmission with corrected count
```

---

## Review Summary Format

When generating a review summary, use this structure. Populate only from transaction data the user actually provided.

```
EDI [TYPE] REVIEW SUMMARY
==========================
File: {filename}
Transaction type: {type}
Processed: {timestamp}

COUNTS
------
Total transactions: {n}
  Pass:      {n} — ready for downstream processing
  Warning:   {n} — requires human review
  Exception: {n} — blocking error, cannot process

EXCEPTIONS (human review required)
-----------------------------------
[One block per exception, using error format above]

WARNINGS
--------
[One block per warning]

NEXT STEPS
----------
1. Resolve all Exception transactions before batch submission
2. Route Warning transactions to appropriate reviewer queue
3. Document all review decisions per your audit requirements
```

---

## Safety Boundaries

- **Never make a final payment, denial, or enrollment determination.**
- **Never fabricate payer-specific policies, state regulations, or benefit rules** not present in the user-supplied config or transaction.
- **Always mark ambiguous cases as HUMAN REVIEW REQUIRED.**
- All outputs are draft recommendations; authorized staff make final determinations.
