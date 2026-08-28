# EDI Claims & Enrollment Review Skill

A Claude Code skill for healthcare payer organizations to review X12 EDI transactions (837/834/270/271/276/277), explain validation errors in plain language, and generate human-review summaries.

## What it does

- **Explains** structural and business-rule failures with context drawn from the actual transaction
- **Drafts** resolution steps and resubmission notes for each exception
- **Generates** human-readable review summaries for exception queues
- **Does not** count segments, validate control numbers, or make final adjudication decisions

## Workflow

```
1. Run the validation script (deterministic checks):
   python scripts/edi_validate.py <edi_file> --json > validation.json

2. Invoke the skill:
   "Review this 837 file: [paste or path]. Validation output: [paste validation.json]"

3. The skill explains errors and generates a review summary.
   Human reviewers act on exceptions.
```

## Prerequisites

No MCP servers required. The skill works from raw EDI files and an optional payer config.

**Python 3.9+** required to run `scripts/edi_validate.py`.

## Setup

1. Copy and fill in the payer config:
   ```
   cp config/payer-config-template.yaml config/payer-config.yaml
   # Edit config/payer-config.yaml with your organization's thresholds
   ```

2. Test the validation script on a sample file:
   ```
   python scripts/edi_validate.py assets/sample/claim_sample_837P.txt
   ```

## File Organization

```
edi-claims-enrollment-skill/
├── SKILL.md                          # Skill instructions (read by Claude)
├── README.md                         # This file
├── assets/
│   └── sample/                       # One sample input per transaction family
│       ├── claim_sample_837P.txt     # 837P Professional claim
│       ├── enrollment_sample_834.txt # 834 Benefit enrollment
│       ├── eligibility_sample_270.txt # 270 Eligibility inquiry
│       └── claim_status_sample_276.txt # 276 Claim status inquiry
├── config/
│   └── payer-config-template.yaml   # Payer-specific thresholds — copy and fill in
├── references/
│   ├── validation-rules.md           # Universal X12/HIPAA rules (all transaction types)
│   └── error-guidance.md            # Error format, common patterns, resolution trees
└── scripts/
    └── edi_validate.py               # Deterministic envelope validator (run before skill)
```

## Sample Invocations

**Claim review:**
```
Review this 837P claim file.
[paste contents of claim_sample_837P.txt]
```

**With script output:**
```
Review this 834 enrollment file. Here is the structural validation output:
[paste edi_validate.py --json output]
[paste enrollment_sample_834.txt]
```

**Explain a specific error:**
```
Explain rule D-RET-001 for this enrollment transaction and suggest resolution steps.
[paste relevant 834 segments]
```

## Customization

**Payer-specific rules** (timely-filing limits, retro-enrollment windows, high-dollar thresholds, escalation contacts) belong in `config/payer-config.yaml`. The skill reads these at review time.

**Universal X12/HIPAA rules** are in `references/validation-rules.md` and should not require modification for standard payer use.

## Disclaimer

All outputs are draft recommendations for human decision support only. Final determinations on claim payment, denial, member enrollment, and benefit coverage must be made by authorized personnel following your organization's official policies.
