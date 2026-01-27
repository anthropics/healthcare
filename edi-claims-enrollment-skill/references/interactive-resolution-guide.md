# Interactive Error Resolution Guide

This guide provides step-by-step resolution workflows for common EDI validation errors. Use these decision trees and workflows to systematically resolve exceptions.

## How to Use This Guide

1. **Identify the error code** from the validation report (e.g., E-ELG-001)
2. **Navigate to the corresponding section** below
3. **Follow the decision tree** step-by-step
4. **Document your findings** at each decision point
5. **Apply the recommended resolution** based on the path you followed

---

## E-ELG-001: Member Not Eligible on Service Date

### Quick Decision Tree

```
START: Member not eligible on service date

├─ Step 1: Check service type
│  ├─ Emergency service (99281-99285, POS 23)? ──> Go to EMERGENCY PATH
│  └─ Non-emergency service ──> Continue to Step 2
│
├─ Step 2: Check termination timing
│  ├─ Terminated < 14 days before service? ──> Go to RECENT TERM PATH
│  ├─ Terminated 14-90 days before service? ──> Go to STANDARD PATH
│  └─ Terminated > 90 days before service? ──> Go to OLD TERM PATH
│
└─ Final Decision: Deny, Approve, Pend, or Escalate
```

### EMERGENCY PATH

**When to use:** Service code indicates emergency (CPT 99281-99285, place of service 23)

```
┌─────────────────────────────────────────────────────────────┐
│ EMERGENCY SERVICE DETECTED                                   │
└─────────────────────────────────────────────────────────────┘

Step E1: Verify emergency nature
  [ ] Review procedure code (99281-99285 range)
  [ ] Review diagnosis codes (acute/emergency condition?)
  [ ] Check place of service (23 = ER)

  Is this clearly an emergency service?
  ├─ YES → Continue to Step E2
  └─ NO → Switch to STANDARD PATH

Step E2: Check your emergency services policy
  [ ] Open policy document: [link to emergency services policy]

  Does your policy cover emergency services for ineligible members?
  ├─ YES → Continue to Step E3
  └─ NO → Continue to Step E3 anyway (check state mandates)

Step E3: Check state mandates
  [ ] Identify member's state: _____________
  [ ] Check state emergency mandate: [link to state requirements]

  Does state mandate emergency coverage?
  ├─ YES → Continue to Step E4
  └─ NO → Check policy from Step E2
      ├─ Policy covers → Continue to Step E4
      └─ Policy doesn't cover → Go to STANDARD PATH

Step E4: Verify emergency exception timeframe
  Days between termination and service: _______ days

  Is service within exception window (typically 30-90 days)?
  ├─ YES → Continue to Step E5 (APPROVE PATH)
  └─ NO → Go to STANDARD PATH

Step E5: Apply emergency exception and approve
  ┌─────────────────────────────────────────────────────┐
  │ RESOLUTION: APPROVE WITH EMERGENCY EXCEPTION         │
  │                                                      │
  │ Actions:                                             │
  │ [ ] Apply emergency benefit tier and cost-sharing    │
  │ [ ] Add claim note: "Emergency exception applied"    │
  │ [ ] Reference policy/state mandate used             │
  │ [ ] Process claim with emergency handling code       │
  │                                                      │
  │ Documentation:                                       │
  │ - Exception type: Emergency services                 │
  │ - Policy reference: _______________________         │
  │ - State mandate (if applicable): ___________        │
  │                                                      │
  │ Estimated time: 20-25 minutes                        │
  └─────────────────────────────────────────────────────┘
```

### RECENT TERM PATH

**When to use:** Member terminated < 14 days before service date

```
┌─────────────────────────────────────────────────────────────┐
│ RECENT TERMINATION (< 14 days)                              │
│ Higher likelihood of error or pending correction             │
└─────────────────────────────────────────────────────────────┘

Step R1: Check eligibility system details
  [ ] Open eligibility system
  [ ] Search member ID: _____________
  [ ] Review termination details

  Record findings:
  - Termination date: _____________
  - Termination reason code: _____________
  - Termination reason: _____________

  Reason code indicates:
  ├─ Employment termination → Continue to Step R2
  ├─ Non-payment → Continue to Step R3
  ├─ Administrative/Other → Continue to Step R4
  └─ Unclear → Escalate to Eligibility Specialist

Step R2: Employment termination path
  [ ] Check employment end date alignment

  Does termination date align with reasonable employment end?
  ├─ YES (e.g., month-end, payroll cycle) → Continue to Step R2a
  └─ NO (e.g., mid-week, unusual date) → Continue to Step R2b

  Step R2a: Likely valid termination
    [ ] Verify no COBRA election pending
    [ ] Confirm with employer if possible (high-dollar claims)

    ┌─────────────────────────────────────────────────────┐
    │ RESOLUTION: DENY - MEMBER NOT ELIGIBLE              │
    │                                                      │
    │ Actions:                                             │
    │ [ ] Deny claim with reason code 27                   │
    │ [ ] Generate provider denial letter                  │
    │ [ ] Note: Member responsible for charges             │
    │                                                      │
    │ Estimated time: 12-15 minutes                        │
    └─────────────────────────────────────────────────────┘

  Step R2b: Suspicious termination timing
    [ ] Check for pending 834 corrections
    [ ] Review trading partner error patterns
    [ ] Consider contacting employer

    Confidence in termination accuracy:
    ├─ High confidence it's correct → Go to Step R2a (DENY)
    ├─ Medium confidence → Continue to Step R5 (PEND)
    └─ Low confidence → Continue to Step R5 (PEND)

Step R3: Non-payment termination path
  [ ] Check premium payment history
  [ ] Verify grace period compliance
  [ ] Check for pending reinstatement

  Is there a pending reinstatement or payment?
  ├─ YES → Continue to Step R5 (PEND)
  └─ NO → Verify no COBRA, then Go to Step R2a (DENY)

Step R4: Administrative termination path
  [ ] Review termination reason details
  [ ] Check for data entry errors
  [ ] Look for pending corrections in queue

  Does this appear to be an error?
  ├─ YES → Continue to Step R5 (PEND)
  ├─ NO → Go to Step R2a (DENY)
  └─ UNCLEAR → Escalate

Step R5: Pend for verification
  ┌─────────────────────────────────────────────────────┐
  │ RESOLUTION: PEND PENDING ELIGIBILITY VERIFICATION    │
  │                                                      │
  │ Actions:                                             │
  │ [ ] Pend claim with code: Eligibility verification   │
  │ [ ] Contact employer for confirmation                │
  │ [ ] Set follow-up date: ______ (recommend 14 days)   │
  │ [ ] Monitor for 834 corrections                      │
  │                                                      │
  │ If verified ineligible → Deny per Step R2a           │
  │ If verified eligible → Process claim normally        │
  │ If no response by deadline → Deny per policy         │
  │                                                      │
  │ Estimated time: 15 min + waiting period              │
  └─────────────────────────────────────────────────────┘
```

### STANDARD PATH

**When to use:** Member terminated 14-90 days before service, non-emergency

```
┌─────────────────────────────────────────────────────────────┐
│ STANDARD INELIGIBILITY (14-90 days)                         │
│ Less likely to be error; check for COBRA                     │
└─────────────────────────────────────────────────────────────┘

Step S1: Verify termination is correct
  [ ] Open eligibility system
  [ ] Confirm termination date and reason

  Termination appears correct?
  ├─ YES → Continue to Step S2
  └─ NO → Go to RECENT TERM PATH, Step R5 (PEND)

Step S2: Check for COBRA coverage
  [ ] Search for COBRA election
  [ ] Check COBRA premium payment status
  [ ] Verify COBRA effective date

  Found COBRA coverage?
  ├─ YES, active COBRA → Continue to Step S2a (APPROVE)
  └─ NO COBRA or not elected → Continue to Step S3

  Step S2a: COBRA coverage found
    ┌─────────────────────────────────────────────────────┐
    │ RESOLUTION: APPROVE - COBRA COVERAGE ACTIVE          │
    │                                                      │
    │ Actions:                                             │
    │ [ ] Update claim with COBRA coverage                 │
    │ [ ] Apply COBRA benefit rules                        │
    │ [ ] Process claim with COBRA handling code           │
    │ [ ] Note: COBRA premium billing may apply            │
    │                                                      │
    │ Estimated time: 18-22 minutes                        │
    └─────────────────────────────────────────────────────┘

Step S3: Check for pending appeals or reinstatement
  [ ] Review member account for active appeals
  [ ] Check for reinstatement requests

  Found pending action?
  ├─ YES → Pend claim pending resolution
  └─ NO → Continue to Step S4 (DENY)

Step S4: Deny claim for ineligibility
  ┌─────────────────────────────────────────────────────┐
  │ RESOLUTION: DENY - MEMBER NOT ELIGIBLE              │
  │                                                      │
  │ Actions:                                             │
  │ [ ] Deny claim with reason code 27                   │
  │ [ ] Generate provider denial letter                  │
  │ [ ] Generate member explanation of benefits (EOB)    │
  │ [ ] Note: Member responsible for charges             │
  │                                                      │
  │ Estimated time: 10-12 minutes                        │
  └─────────────────────────────────────────────────────┘
```

### OLD TERM PATH

**When to use:** Member terminated > 90 days before service

```
┌─────────────────────────────────────────────────────────────┐
│ OLD TERMINATION (> 90 days)                                 │
│ Very unlikely to be an error; straightforward denial         │
└─────────────────────────────────────────────────────────────┘

Step O1: Quick verification
  [ ] Confirm termination date in system
  [ ] Verify no recent reinstatement

  Everything checks out?
  ├─ YES → Continue to Step O2 (DENY)
  └─ NO (something unusual) → Escalate

Step O2: Deny claim
  ┌─────────────────────────────────────────────────────┐
  │ RESOLUTION: DENY - MEMBER NOT ELIGIBLE              │
  │                                                      │
  │ Actions:                                             │
  │ [ ] Deny claim with reason code 27                   │
  │ [ ] Generate standard denial letter                  │
  │ [ ] No additional research needed                    │
  │                                                      │
  │ Estimated time: 5-8 minutes                          │
  └─────────────────────────────────────────────────────┘
```

---

## D-RET-001: Retroactive Enrollment

### Quick Decision Tree

```
START: Retroactive enrollment detected

├─ Step 1: Assess retroactive period
│  ├─ < 30 days? ──> LOW RISK PATH
│  ├─ 30-90 days? ──> MEDIUM RISK PATH
│  └─ > 90 days? ──> HIGH RISK PATH
│
├─ Step 2: Identify reason
│  ├─ New hire/waiting period? ──> NEW HIRE PATH
│  ├─ Qualifying life event? ──> QLF PATH
│  ├─ Administrative error? ──> CORRECTION PATH
│  └─ No reason provided? ──> DENY PATH
│
└─ Final Decision: Approve, Limit Period, Deny, or Escalate
```

### LOW RISK PATH (<30 days retroactive)

```
┌─────────────────────────────────────────────────────────────┐
│ LOW RISK: < 30 days retroactive                             │
│ Typically approved; standard enrollment processing           │
└─────────────────────────────────────────────────────────────┘

Step L1: Verify group contract allows retroactive
  [ ] Open group contract for: _______________
  [ ] Check retroactive enrollment provisions

  Contract allows retroactive enrollment?
  ├─ YES → Continue to Step L2
  └─ NO → Escalate (contract vs. received enrollment conflict)

Step L2: Check for claims during retroactive period
  [ ] Search claims for member: _______________
  [ ] Date range: ________ to ________

  Found claims in retroactive period?
  ├─ YES → Note claims for reprocessing
  │   Claims to reprocess: _______
  │   Total amount: $_______
  │   Continue to Step L3
  └─ NO → Continue to Step L3

Step L3: Approve enrollment
  ┌─────────────────────────────────────────────────────┐
  │ RESOLUTION: APPROVE RETROACTIVE ENROLLMENT           │
  │                                                      │
  │ Actions:                                             │
  │ [ ] Process enrollment with effective date as stated │
  │ [ ] Generate member ID card                          │
  │ [ ] Send welcome packet                              │
  │ [ ] Route claims for reprocessing (if any)           │
  │ [ ] Calculate premium adjustment: $______           │
  │ [ ] Send premium bill to employer                    │
  │                                                      │
  │ Estimated time: 25-30 minutes                        │
  └─────────────────────────────────────────────────────┘
```

### MEDIUM RISK PATH (30-90 days retroactive)

```
┌─────────────────────────────────────────────────────────────┐
│ MEDIUM RISK: 30-90 days retroactive                         │
│ Requires justification and enhanced review                   │
└─────────────────────────────────────────────────────────────┘

Step M1: Identify and verify reason
  [ ] Check maintenance reason code: _______________
  [ ] Review employer notes/documentation

  Reason provided:
  ├─ New hire (late notification) → Continue to Step M2a
  ├─ Qualifying life event → Continue to Step M2b
  ├─ Administrative error → Continue to Step M2c
  └─ No valid reason → Go to DENY PATH

Step M2a: New hire verification
  [ ] Verify employment start date: _______________
  [ ] Check waiting period: _______ days
  [ ] Calculate when coverage should have started

  Does the math add up?
  ├─ YES (late notification explains delay) → Continue to Step M3
  └─ NO (doesn't explain full delay) → Request justification

Step M2b: Qualifying life event verification
  [ ] Identify QLF type: _______________
  [ ] Check QLF date: _______________
  [ ] Verify documentation on file

  Documentation adequate:
  ├─ Birth certificate / Marriage license / etc. provided → Continue to Step M3
  ├─ Documentation pending → Pend enrollment
  └─ No documentation / inadequate → Request documentation

Step M2c: Administrative error verification
  [ ] Review error explanation
  [ ] Check if member was previously enrolled
  [ ] Verify this is correction, not new enrollment

  Error explanation valid?
  ├─ YES → Continue to Step M3
  └─ NO → Request additional justification

Step M3: Financial impact analysis
  [ ] Search claims for member during retroactive period
  [ ] Calculate total financial impact

  Claims found: _______
  Total claims amount: $_______
  Premium adjustment: $_______
  Net financial impact: $_______

  Continue to Step M4

Step M4: Manager approval
  [ ] Document findings from Steps M1-M3
  [ ] Prepare approval request with:
      - Reason for retroactive enrollment
      - Financial impact
      - Supporting documentation
  [ ] Submit to Enrollment Manager

  Manager decision:
  ├─ APPROVED → Continue to Step M5
  ├─ APPROVED WITH LIMITED PERIOD → Adjust effective date, then Step M5
  └─ DENIED → Go to DENY PATH

Step M5: Approve with documentation
  ┌─────────────────────────────────────────────────────┐
  │ RESOLUTION: APPROVE RETROACTIVE ENROLLMENT           │
  │                                                      │
  │ Actions:                                             │
  │ [ ] Process enrollment with justified effective date │
  │ [ ] Document approval reason and manager sign-off    │
  │ [ ] Route claims for reprocessing                    │
  │ [ ] Calculate and bill premium adjustment            │
  │ [ ] Generate member materials                        │
  │                                                      │
  │ Required signatures:                                 │
  │ Enrollment Specialist: ______________ Date: ______   │
  │ Enrollment Manager: ______________ Date: ______      │
  │                                                      │
  │ Estimated time: 45-55 minutes                        │
  └─────────────────────────────────────────────────────┘
```

### HIGH RISK PATH (>90 days retroactive)

```
┌─────────────────────────────────────────────────────────────┐
│ HIGH RISK: > 90 days retroactive                            │
│ Requires extensive justification and compliance review       │
└─────────────────────────────────────────────────────────────┘

Step H1: Immediate escalation check
  Days retroactive: _______ days

  Is this > 180 days (6 months)?
  ├─ YES → MANDATORY compliance review required
  │   [ ] Submit to Compliance team immediately
  │   [ ] Do not process without Compliance approval
  └─ NO (91-180 days) → Continue to Step H2

Step H2: Gather comprehensive justification
  [ ] Request detailed explanation from employer
  [ ] Identify specific reason for delay
  [ ] Collect all supporting documentation

  Required documentation checklist:
  [ ] Employer justification letter
  [ ] QLF documentation (if applicable)
  [ ] Evidence of when issue was discovered
  [ ] Explanation for why correction took so long

  Documentation complete?
  ├─ YES → Continue to Step H3
  └─ NO → Pend enrollment, request missing docs

Step H3: Comprehensive financial impact analysis
  [ ] Search all claims for member
  [ ] Date range: ________ to ________ (full retro period)
  [ ] Include all family members if family enrollment

  Financial Impact Summary:
  ┌──────────────────────────────────────────────┐
  │ Claims denied for eligibility: _______        │
  │ Total denied amount: $_______                 │
  │                                               │
  │ Other claims in period: _______               │
  │ Other claims amount: $_______                 │
  │                                               │
  │ Premium for retro period: $_______            │
  │                                               │
  │ NET IMPACT: $_______                          │
  └──────────────────────────────────────────────┘

  Continue to Step H4

Step H4: Compliance review (if > 180 days)
  [ ] Submit complete package to Compliance
  [ ] Include: Justification, documentation, financial impact
  [ ] Await Compliance decision

  Compliance decision:
  ├─ APPROVED → Continue to Step H5
  ├─ APPROVED WITH CONDITIONS → Document conditions, continue to Step H5
  └─ DENIED → Go to DENY PATH

Step H5: Executive approval workflow
  [ ] Prepare comprehensive approval request
  [ ] Document chain: Specialist → Manager → Compliance
  [ ] Include all research, documentation, financial impact

  Required approvals:
  [ ] Enrollment Specialist
  [ ] Enrollment Manager
  [ ] Compliance Officer (if > 180 days)
  [ ] Finance review (if net impact > $10,000)

  All approvals obtained?
  ├─ YES → Continue to Step H6
  └─ NO → Await remaining approvals or escalate if denied

Step H6: Approve with comprehensive documentation
  ┌─────────────────────────────────────────────────────┐
  │ RESOLUTION: APPROVE HIGH-RISK RETROACTIVE ENROLLMENT │
  │                                                      │
  │ Actions:                                             │
  │ [ ] Process enrollment with fully justified date     │
  │ [ ] Attach all approvals and documentation           │
  │ [ ] Create claims reprocessing work order            │
  │ [ ] Calculate and document financial impact          │
  │ [ ] Generate audit trail report                      │
  │ [ ] Send comprehensive notification to employer      │
  │                                                      │
  │ Required signatures:                                 │
  │ Enrollment Specialist: ____________ Date: ______     │
  │ Enrollment Manager: ____________ Date: ______        │
  │ Compliance Officer: ____________ Date: ______ (if req)│
  │ Finance (if applicable): ________ Date: ______       │
  │                                                      │
  │ Estimated time: 60-90 minutes + approval wait time   │
  └─────────────────────────────────────────────────────┘
```

### DENY PATH

```
┌─────────────────────────────────────────────────────────────┐
│ DENIAL: Insufficient justification for retroactive enrollment│
└─────────────────────────────────────────────────────────────┘

Step D1: Verify denial is appropriate
  [ ] Reviewed all possible justifications
  [ ] Confirmed no valid reason exists
  [ ] Verified exceeds policy limits

  Confident in denial?
  ├─ YES → Continue to Step D2
  └─ NO → Escalate for second opinion

Step D2: Offer alternative
  [ ] Calculate standard effective date
  [ ] Determine earliest allowable effective date per policy

  Alternative effective date: _______________

  Continue to Step D3

Step D3: Deny and communicate
  ┌─────────────────────────────────────────────────────┐
  │ RESOLUTION: DENY RETROACTIVE ENROLLMENT              │
  │                                                      │
  │ Actions:                                             │
  │ [ ] Reject enrollment transaction                    │
  │ [ ] Generate employer notification with:             │
  │     - Specific reason for denial                     │
  │     - Policy/contract provision cited                │
  │     - Alternative: Standard effective date offered   │
  │ [ ] Provide appeal rights information                │
  │ [ ] Document decision and rationale                  │
  │                                                      │
  │ Estimated time: 20-25 minutes                        │
  └─────────────────────────────────────────────────────┘
```

---

## Quick Reference: When to Escalate

Escalate IMMEDIATELY if:

- 🔴 **Financial impact > $25,000**
- 🔴 **Regulatory or compliance concerns**
- 🔴 **Potential fraud indicators**
- 🔴 **Conflicting information cannot be resolved**
- 🔴 **Member safety concerns (for clinical/emergency issues)**

Escalate for guidance if:

- 🟡 **Uncertain about policy interpretation**
- 🟡 **Novel scenario not covered in guides**
- 🟡 **Trading partner dispute**
- 🟡 **Approaching timely filing deadline with unresolved issue**

Can handle without escalation:

- 🟢 **Straightforward denials matching policy**
- 🟢 **Standard approvals with clear justification**
- 🟢 **Routine corrections and updates**
- 🟢 **Low-risk retroactive enrollments <30 days**

---

## Tips for Efficient Resolution

### Documentation Best Practices

✓ **DO:**
- Document every decision point and why you chose that path
- Record system checks performed and results found
- Note any calls made or emails sent
- Capture timestamps for audit trail
- Take screenshots of key system screens (if permitted)

✗ **DON'T:**
- Assume anything without verification
- Skip steps because they "usually" turn out a certain way
- Forget to document negative findings (e.g., "searched for COBRA, none found")
- Rush through high-dollar or complex cases

### Time Management

- Set timer for estimated resolution time
- If exceeding time estimate by 50%, consider escalating
- Batch similar issues when possible
- Use templates for common correspondence
- Pre-populate forms with data from waypoint JSONs

### Quality Checks

Before finalizing any decision:

1. ✓ **Completeness check:** Did I answer all questions in the decision tree?
2. ✓ **Documentation check:** Is my work audit-ready?
3. ✓ **Policy check:** Does this align with our policies?
4. ✓ **Reasonableness check:** Does this decision make business sense?
5. ✓ **Member impact check:** Have I considered member experience?

---

## Version History

- v1.0.0 (2024-03) - Initial interactive resolution guide with decision trees for E-ELG-001 and D-RET-001
