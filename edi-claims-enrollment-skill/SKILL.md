---
name: edi-claims-enrollment-skill
description: Healthcare EDI review skill for X12 837/834/270/271/276/277 transactions. Explains validation errors, drafts resolutions, and generates human-review summaries. Use when a user says "review this EDI file", "explain this EDI error", "validate this 837/834/270/276", or "generate an EDI review summary".
---

# EDI Claims & Enrollment Review Skill

## Overview

This skill helps payer-side healthcare teams review and resolve issues in X12 EDI transactions. It explains errors found in claims (837), enrollment (834), eligibility (270/271), and claim-status (276/277) files, and drafts resolution steps and human-review summaries.

**What this skill does:**
- Interpret business-rule errors and explain them in plain language with context from the actual transaction
- Draft resolution steps and resubmission notes
- Generate human-readable review summaries for exception queues

**What this skill does NOT do:**
- Count segments or validate envelope structure — that is the job of `scripts/edi_validate.py`
- Make final payment, denial, or enrollment decisions — all final determinations require authorized human review
- Cite statistics or historical patterns that the user has not supplied

---

## Architecture

```
Step 1 (deterministic, no AI):
  scripts/edi_validate.py <file> --json
    → checks SE01 counts, ISA/GS/ST control-number matching
    → outputs structural issues as JSON

Step 2 (this skill):
  User provides EDI file + script output (or upstream EDI tool output)
    → skill reads transaction data
    → applies business rules from references/validation-rules.md
    → formats errors using references/error-guidance.md
    → generates review summary

Step 3 (human):
  Reviewer reads summary, acts on exceptions
```

### Reference Files

| File | Purpose |
|------|---------|
| `references/validation-rules.md` | Universal X12/HIPAA structural and business rules |
| `references/error-guidance.md` | Error message format, common patterns, resolution decision trees |
| `config/payer-config-template.yaml` | Payer-specific thresholds and escalation policy — **fill in before use** |

### Sample Inputs (one per transaction family)

| File | Type |
|------|------|
| `assets/sample/claim_sample_837P.txt` | 837P Professional claim |
| `assets/sample/enrollment_sample_834.txt` | 834 Benefit enrollment |
| `assets/sample/eligibility_sample_270.txt` | 270 Eligibility inquiry |
| `assets/sample/claim_status_sample_276.txt` | 276 Claim status inquiry |

---

## Startup

When invoked:

1. **Ask for input.** Prompt the user for:
   - The EDI file (or paste its contents)
   - Output from `scripts/edi_validate.py --json` if available
   - Their filled-in `config/payer-config.yaml` (copied from `payer-config-template.yaml`) if business-rule thresholds apply

2. **If user wants to use sample data:** Load the appropriate sample from `assets/sample/` and say which file you're using.

3. **Check config.** If business-rule checks are requested and no config is supplied, note which thresholds are unconfigured and proceed with universal rules only.

4. **Run the validation script (or use upstream output) for envelope checks.** If the user did not supply `scripts/edi_validate.py --json` output, invoke the script via Bash on the EDI file before reviewing business rules. **Never count segments or validate control-number matching by reading the file yourself** — always defer to the script. This is the failure mode to avoid: the model claiming SE01 is correct based on visual inspection.

---

## Execution Flow

### Phase A — Parse and detect transaction type

Read the EDI file. Identify:
- Transaction type from ST01 (837, 834, 270, 271, 276, 277)
- Sender/receiver from ISA06/ISA08
- Trading partner / group from GS02/GS03
- Number of transactions in the batch

### Phase B — Apply validation rules

Load `references/validation-rules.md`. Apply rules appropriate to the transaction type:

1. **Structural rules** (Sections 1–5 of validation-rules.md): verify required segments and fields are present. Note: SE01/control-number checks are done by the script; if script output is provided, incorporate those findings rather than re-checking them.

2. **Business rules**: apply member eligibility, code-set, provider, and plan rules. For rules marked "configuration-dependent", check if the user supplied a config; if not, flag the check as "not evaluated — config required".

For each failure, generate an error message following `references/error-guidance.md`:
- Populate from actual transaction values only
- Do not invent probability percentages or historical counts
- Rank likely causes by transaction context (e.g., emergency visit changes interpretation of eligibility failure; retroactive term date changes interpretation of coverage gap)

### Phase C — Generate review summary

Use the summary format in `references/error-guidance.md`. Include:
- Transaction-level counts (pass / warning / exception)
- One error block per exception, using only data from the transaction and user-supplied config
- Ordered next steps for the human reviewer
- Escalation contacts from config if configured

---

## Error Handling

**Script unavailable** (Python missing, file not accessible, etc.): Proceed with business-rule review only. Note at top of summary: "Structural envelope validation (SE01 counts, control-number matching) was NOT performed. Run `scripts/edi_validate.py` before submitting for downstream processing." Do not attempt to mentally substitute for the script.

**Config not provided:** Apply universal rules. For any business rule that depends on a threshold (timely filing, retro window, high-dollar limit), note: "Not evaluated — copy `config/payer-config-template.yaml` to `config/payer-config.yaml` and fill in your organization's thresholds."

**Ambiguous or missing data:** Flag as "HUMAN REVIEW REQUIRED — insufficient data to evaluate". Never assume or invent values.

---

## Implementation Requirements

1. **Read reference files when needed, not on startup.** Load `references/validation-rules.md` and `references/error-guidance.md` at Phase B, not before.

2. **Populate errors from transaction data only.** The diagnosis section must contain actual values from the file; never use placeholder values in the output delivered to the user.

3. **Mark all exceptions clearly.** Anything severity=Error in validation-rules.md must be marked "HUMAN REVIEW REQUIRED" in the summary.

4. **PHI handling.** If `config: output.phi_in_summaries` is false (the default), use member IDs and claim IDs rather than names or SSNs in summary output.

5. **Draft only.** Every output must include the disclaimer: "This is a draft review for human decision support. All final determinations require authorized review."

---

## Common Mistakes to Avoid

- ❌ Counting SE01 manually — use the script; manual counting is error-prone
- ❌ Citing statistics ("based on N similar cases…") unless the user provides that data
- ❌ Inventing payer-specific policies not in the user's config or the transaction
- ❌ Making final coverage, payment, or enrollment decisions
- ✅ Always cite the specific segment and element when describing an error
- ✅ Always offer a concrete next step pointing to a real system or document
- ✅ Always flag ambiguous cases for human review
