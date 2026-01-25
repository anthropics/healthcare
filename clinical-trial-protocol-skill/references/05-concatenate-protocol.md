# Step 5: Concatenate Final Protocol

## Purpose

This subskill concatenates all protocol section files (from Steps 2, 3, and 4) into a single, complete protocol markdown file. This is the final assembly step that produces the complete clinical trial protocol.

## Prerequisites

**Required Files:**
- `waypoints/intervention_metadata.json`
- `waypoints/02_protocol_metadata.json` (must show step_4_status: "completed")
- `waypoints/02_protocol_foundation.md` (Sections 1-5 from Step 2)
- `waypoints/03_protocol_intervention.md` (Sections 6-7 from Step 3)
- `waypoints/04_protocol_operations.md` (Sections 8-11 from Step 4)

## What This Subskill Does

1. Verifies all section files exist
2. Concatenates sections 1-11 into final protocol
3. Updates metadata to mark protocol as complete
4. Displays final summary

## Execution Flow

### Step 1: Verify Prerequisites

Read `waypoints/02_protocol_metadata.json` and verify:
- `step_4_status` is "completed"
- All section files exist:
  - `waypoints/02_protocol_foundation.md`
  - `waypoints/03_protocol_intervention.md`
  - `waypoints/04_protocol_operations.md`

**If Step 4 not completed:**
```
Error: Step 4 must be completed before concatenation.
Phase 4 status: [current status]

Please complete Step 4 to generate final protocol sections (8-11).
```
Exit.

**If any section files missing:**
```
Error: Required protocol section files not found.
Expected:
  - waypoints/02_protocol_foundation.md (Step 2 output)
  - waypoints/03_protocol_intervention.md (Step 3 output)
  - waypoints/04_protocol_operations.md (Step 4 output)

Please ensure Steps 2, 3, and 4 are completed.
```
Exit.

**If prerequisites verified:** Proceed to Step 2.

### Step 2: Concatenate Protocol Sections

Combine all three protocol section files into the final complete protocol.

**Procedure:**
1. Use `cat` command to concatenate files in order:
   ```bash
   cat waypoints/02_protocol_foundation.md waypoints/03_protocol_intervention.md waypoints/04_protocol_operations.md > waypoints/protocol_complete.md
   ```
2. Verify `waypoints/protocol_complete.md` was created successfully
3. Check file size and line count to ensure all content was included
4. Display file statistics

**Expected output:**
- Filename: `waypoints/protocol_complete.md`
- Size: ~400KB-1.5MB
- Lines: ~4,000-12,000 lines
- Sections: All 11 sections (1-11)

### Step 3: Verify Complete Protocol

Read the concatenated file to verify:
- File is readable
- Contains all 11 section headers
- No missing content or truncation
- Proper markdown formatting preserved

**Section headers to verify:**
```
STATEMENT OF COMPLIANCE

# 1 PROTOCOL SUMMARY
# 2 INTRODUCTION
# 3 OBJECTIVES AND ENDPOINTS
# 4 STUDY DESIGN
# 5 STUDY POPULATION
# 6 STUDY INTERVENTION
# 7 STUDY INTERVENTION DISCONTINUATION AND PARTICIPANT DISCONTINUATION/WITHDRAWAL
# 8 STUDY ASSESSMENTS AND PROCEDURES
# 9 STATISTICAL CONSIDERATIONS
# 10 SUPPORTING DOCUMENTATION AND OPERATIONAL CONSIDERATIONS
# 11 REFERENCES
```

### Step 4: Update Metadata

**Update `waypoints/02_protocol_metadata.json`:**
```json
{
  "intervention_id": "[from metadata]",
  "intervention_name": "[from metadata]",
  "protocol_version": "1.0 Draft",
  "protocol_date": "[current date]",
  "study_design": "[from Step 1]",
  "enrollment_target": "[from sample size calculation]",
  "primary_endpoint": "[from Section 4]",
  "duration_months": "[from Step 1 or generated]",
  "regulatory_pathway": "[IDE or IND]",
  "protocol_status": "complete",
  "final_protocol_file": "protocol_complete.md",
  "waypoint_files": {
    "foundation": "02_protocol_foundation.md",
    "intervention": "03_protocol_intervention.md",
    "operations": "04_protocol_operations.md",
    "complete": "protocol_complete.md"
  },
  "step_2_status": "completed",
  "step_3_status": "completed",
  "step_4_status": "completed",
  "step_5_status": "completed",
  "sections_completed": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  "sections_pending": [],
  "concatenation_date": "[current date]",
  "notes": [
    "DRAFT for planning purposes",
    "Complete protocol (Sections 1-11) concatenated in protocol_complete.md",
    "Requires biostatistician review",
    "Requires clinical expert review",
    "Requires IRB approval",
    "Requires FDA feedback"
  ]
}
```

**Update `waypoints/intervention_metadata.json`:**
```json
{
  ...existing fields...,
  "completed_steps": [
    "00-initialize-intervention",
    "01-research-protocols",
    "02-protocol-foundation",
    "03-protocol-intervention",
    "04-protocol-operations",
    "05-concatenate-protocol"
  ],
  "protocol_status": "complete",
  "final_protocol_file": "waypoints/protocol_complete.md"
}
```

### Step 5: Display Completion Summary

Display comprehensive summary:

```
✅ CLINICAL TRIAL PROTOCOL GENERATION COMPLETE

Intervention: [Name]
Type: [Device/Drug]
Indication: [Indication]

Protocol Details:
  • Version: 1.0 Draft
  • Date: [Current date]
  • Study Design: [Design]
  • Sample Size: [N subjects]
  • Primary Endpoint: [Endpoint]
  • Study Duration: [Duration]

📄 FINAL PROTOCOL DOCUMENT

File: waypoints/protocol_complete.md
Size: [Size in KB/MB]
Lines: [Line count]
Sections: All 11 sections (1-11)

✓ STATEMENT OF COMPLIANCE
✓ 1 PROTOCOL SUMMARY
✓ 2 INTRODUCTION
✓ 3 OBJECTIVES AND ENDPOINTS
✓ 4 STUDY DESIGN
✓ 5 STUDY POPULATION
✓ 6 STUDY INTERVENTION
✓ 7 STUDY INTERVENTION DISCONTINUATION AND PARTICIPANT DISCONTINUATION/WITHDRAWAL
✓ 8 STUDY ASSESSMENTS AND PROCEDURES
✓ 9 STATISTICAL CONSIDERATIONS
✓ 10 SUPPORTING DOCUMENTATION AND OPERATIONAL CONSIDERATIONS
✓ 11 REFERENCES

Supporting Files:
  • waypoints/02_protocol_foundation.md (Sections 1-5)
  • waypoints/03_protocol_intervention.md (Sections 6-7)
  • waypoints/04_protocol_operations.md (Sections 8-11)
  • waypoints/02_sample_size_calculation.json
  • waypoints/01_clinical_research_summary.json

Similar Trials Referenced: [N trials]
FDA Guidance Documents: [N documents]

⚠️ IMPORTANT DISCLAIMERS

This is a DRAFT protocol for planning and discussion purposes ONLY.

REQUIRED BEFORE STUDY INITIATION:
  ☐ Biostatistician review and sample size validation
  ☐ Clinical expert review of study design and endpoints
  ☐ FDA Pre-Submission meeting or IND/IDE feedback
  ☐ IRB review and approval
  ☐ Sponsor completion of all [TBD] items
  ☐ Legal and regulatory review
  ☐ Site investigator review
  ☐ Data safety monitoring plan finalization

This protocol does NOT constitute:
  ✗ Regulatory approval or authorization
  ✗ Medical or clinical advice
  ✗ Final study protocol
  ✗ Guarantee of regulatory success

Professional consultation with regulatory affairs specialists,
clinical trial experts, and biostatisticians is STRONGLY RECOMMENDED
before proceeding with clinical study planning.

📋 NEXT STEPS

The complete protocol is now available at:
  waypoints/protocol_complete.md

You can:
  • Review the protocol in markdown format
  • Share with clinical experts for review
  • Submit to regulatory affairs for feedback preparation
```

## Output Files

**Created:**
- `waypoints/protocol_complete.md` (Complete protocol with all 11 sections, ~4,000-12,000 lines)

**Updated:**
- `waypoints/02_protocol_metadata.json` (step 5 marked complete, final file path added)
- `waypoints/intervention_metadata.json` (step 5 marked complete)

**Preserved:**
- `waypoints/02_protocol_foundation.md` (Sections 1-5 from Step 2)
- `waypoints/03_protocol_intervention.md` (Sections 6-7 from Step 3)
- `waypoints/04_protocol_operations.md` (Sections 8-11 from Step 4)

## Error Handling

**If concatenation fails:**
```
Error: Unable to concatenate protocol sections.

Please check that all section files exist and are readable:
  - waypoints/02_protocol_foundation.md
  - waypoints/03_protocol_intervention.md
  - waypoints/04_protocol_operations.md

Error details: [error message]
```

**If verification fails:**
```
Warning: Protocol concatenation completed but verification found issues.

The file waypoints/protocol_complete.md was created but may be incomplete.
Please manually verify that all 11 sections are present.

Issues detected: [list issues]
```

## Quality Checks

Before finalizing, verify:
- [ ] All three section files exist and are readable
- [ ] `protocol_complete.md` created successfully
- [ ] File size is reasonable (400KB-1.5MB typical)
- [ ] All 11 section headers present
- [ ] No content truncation or missing sections
- [ ] Line count is appropriate (~4,000-12,000 lines)
- [ ] Metadata updated correctly
- [ ] Final summary displays all information

## Notes

- This is a simple concatenation step - no content generation occurs
- All protocol content was generated in Steps 2, 3, and 4
- The concatenated file is the final deliverable in markdown format
- The protocol is production-ready markdown suitable for version control
