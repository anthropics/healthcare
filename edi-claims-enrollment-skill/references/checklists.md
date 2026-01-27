# Human Review Checklists

This document provides step-by-step checklists for human reviewers to evaluate EDI transactions flagged by the automated skill. These checklists ensure consistent, thorough review of exceptions and support compliance and audit requirements.

## Purpose

Human review is **REQUIRED** for:
- All transactions flagged with "Exception" status
- Ambiguous scenarios not clearly covered by automated rules
- High-dollar claims above organizational thresholds
- Suspected fraud, waste, or abuse
- Retroactive coverage changes
- Complex eligibility or benefit interpretation questions

These checklists guide reviewers through the validation process and document key decision points.

---

## Claims Review Checklists

### Checklist 1: General Claims Exception Review

Use this checklist for all claims flagged with Exception status.

**Transaction Information**
- [ ] Claim ID / Control Number: _______________________
- [ ] Member ID: _______________________
- [ ] Provider NPI: _______________________
- [ ] Service Date(s): _______________________
- [ ] Total Charge Amount: $_______________________
- [ ] Exception Reason(s): _______________________

**Step 1: Verify Transaction Data**
- [ ] Confirm all required segments are present (ISA, GS, ST, CLM, NM1, etc.)
- [ ] Verify claim identifiers match across segments
- [ ] Check that charge amounts are reasonable and add up correctly
- [ ] Review diagnosis and procedure codes for obvious errors

**Step 2: Member Eligibility Verification**
- [ ] Look up member in eligibility system using member ID
- [ ] Verify coverage was active on service date(s)
- [ ] Confirm plan/product matches what is on file
- [ ] Check for coordination of benefits (COB) - is this primary or secondary?
- [ ] Review any recent eligibility changes or retroactive terminations
- [ ] **Decision:** Member eligible? ☐ Yes ☐ No ☐ Needs escalation

**Step 3: Provider Credentialing and Network**
- [ ] Look up provider in provider directory using NPI
- [ ] Verify provider is credentialed and active
- [ ] Confirm provider specialty matches service type
- [ ] Check network status (in-network vs. out-of-network) for member's plan
- [ ] Verify provider was in-network on service date if required
- [ ] **Decision:** Provider eligible to render and bill? ☐ Yes ☐ No ☐ Needs escalation

**Step 4: Code Set and Medical Necessity**
- [ ] Verify all ICD-10 diagnosis codes are valid for service date
- [ ] Verify all CPT/HCPCS procedure codes are valid for service date
- [ ] Check that diagnosis codes support medical necessity for procedures
- [ ] Review age and gender edits (procedure appropriate for patient?)
- [ ] Check for coding errors (unbundling, upcoding, modifier misuse)
- [ ] **Decision:** Codes valid and medically necessary? ☐ Yes ☐ No ☐ Needs clinical review

**Step 5: Benefit Coverage and Prior Authorization**
- [ ] Review benefit plan document for member's plan
- [ ] Confirm service type is a covered benefit
- [ ] Check for exclusions or limitations that may apply
- [ ] Verify prior authorization (PA) if required for this service
- [ ] If PA required, verify PA number and PA was active on service date
- [ ] **Decision:** Service covered and PA in order? ☐ Yes ☐ No ☐ Needs benefits specialist

**Step 6: Duplicate and Timely Filing Check**
- [ ] Search claims history for potential duplicates (same member, provider, DOS, procedure)
- [ ] If duplicate found, compare to determine if this is correction, void, or true duplicate
- [ ] Calculate days from service date to claim receipt date
- [ ] Verify claim is within timely filing limits per contract
- [ ] **Decision:** No duplicate and timely filed? ☐ Yes ☐ No ☐ Needs appeals review

**Step 7: Final Determination**
- [ ] **Approve for payment** - Claim passes all validations
- [ ] **Deny claim** - Specify denial reason code: _______________________
- [ ] **Pend for additional information** - Specify info needed: _______________________
- [ ] **Escalate** - Escalate to: ☐ Clinical review ☐ Benefits ☐ SIU ☐ Compliance ☐ Management

**Reviewer Actions**
- [ ] Document all findings and decision rationale in claims system
- [ ] Apply appropriate claim status and reason codes
- [ ] Generate correspondence to provider if needed (denial, pend letter)
- [ ] Update claim record with final determination
- [ ] If fraud/abuse suspected, complete SIU referral form

**Reviewer Information**
- Reviewer Name: _______________________
- Review Date: _______________________
- Review Time (minutes): _______________________
- Signature: _______________________

---

### Checklist 2: High-Dollar Claims Review

Use this checklist in addition to Checklist 1 for claims exceeding the high-dollar threshold (e.g., >$25,000).

**High-Dollar Specific Validations**
- [ ] Total claim amount: $_______________________
- [ ] High-dollar threshold: $_______________________
- [ ] Amount exceeds threshold by: $_______________________

**Additional Review Steps**
- [ ] Verify itemized charges are reasonable and align with service type
- [ ] Compare charges to contracted rates or fee schedule
- [ ] Check for outlier pricing (charges significantly above usual and customary)
- [ ] Review medical records or clinical documentation if available
- [ ] Verify units billed are appropriate (e.g., not 999 units of a procedure)
- [ ] Confirm place of service matches charge levels (e.g., inpatient vs. outpatient)
- [ ] For institutional claims, review DRG or per diem calculations

**Case Management Review**
- [ ] Does this claim trigger case management involvement?
- [ ] Is this part of a catastrophic case requiring special handling?
- [ ] Should claims be referred to utilization management or medical director?

**Approval Requirements**
- [ ] Claims Manager Review: ☐ Approved ☐ Denied ☐ Escalate
- [ ] Medical Director Review (if applicable): ☐ Approved ☐ Denied ☐ More info needed
- [ ] Finance Review (if applicable): ☐ Approved ☐ Denied ☐ More info needed

**Signatures**
- Claims Reviewer: _______________________ Date: _______
- Claims Manager: _______________________ Date: _______
- Medical Director (if req'd): _______________________ Date: _______

---

### Checklist 3: Suspected Fraud, Waste, or Abuse (FWA) Review

Use this checklist when the automated system flags potential FWA or when reviewer suspects FWA.

**FWA Indicators Detected**
- [ ] High volume of claims from single provider for uncommon service
- [ ] High volume of claims from single member (doctor shopping)
- [ ] Unusual billing patterns (unbundling, upcoding, excessive modifiers)
- [ ] Services billed on behalf of deceased member
- [ ] Services billed for impossible scenarios (gender/age mismatch)
- [ ] Suspicious provider/member relationship (family, business ties)
- [ ] Other: _______________________

**FWA Investigation Steps**
- [ ] Review complete claims history for this provider over past 12 months
- [ ] Review complete claims history for this member over past 12 months
- [ ] Compare provider's billing patterns to peer providers in same specialty
- [ ] Search for other claims with similar suspicious patterns
- [ ] Review provider credentialing file for any red flags
- [ ] Check if provider or member has prior FWA history or is on watchlist

**Clinical Review (if applicable)**
- [ ] Medical records requested from provider
- [ ] Medical records reviewed by clinical staff
- [ ] Services rendered appear to be medically necessary and documented

**Preliminary FWA Assessment**
- [ ] **Low risk** - Anomaly likely explained by data error or one-time event
- [ ] **Medium risk** - Pattern concerning but not conclusive, continue monitoring
- [ ] **High risk** - Strong indicators of potential fraud, waste, or abuse

**Recommended Actions**
- [ ] **Process claim normally** - FWA risk low after review
- [ ] **Pend claim** and request additional documentation from provider
- [ ] **Deny claim** and notify provider of concern
- [ ] **Refer to SIU** for full investigation - complete SIU referral form
- [ ] **Refer to compliance** for potential regulatory reporting (e.g., MEDIC, state fraud bureau)
- [ ] **Place provider on prepayment review** for all future claims

**SIU Referral Information**
- Date referred to SIU: _______________________
- SIU case number: _______________________
- Estimated financial impact: $_______________________
- Referral priority: ☐ Low ☐ Medium ☐ High ☐ Urgent

**Reviewer Information**
- Reviewer Name: _______________________
- Review Date: _______________________
- SIU Investigator (if assigned): _______________________

---

## Enrollment Review Checklists

### Checklist 4: General Enrollment Exception Review

Use this checklist for all enrollment transactions (834) flagged with Exception status.

**Transaction Information**
- [ ] Transaction Control Number: _______________________
- [ ] Subscriber ID: _______________________
- [ ] Member Name: _______________________
- [ ] Group/Employer: _______________________
- [ ] Maintenance Type: ☐ Add ☐ Change ☐ Termination ☐ Reinstatement ☐ Other
- [ ] Effective Date: _______________________
- [ ] Exception Reason(s): _______________________

**Step 1: Verify Transaction Data**
- [ ] Confirm all required segments are present (ISA, GS, ST, BGN, INS, NM1, etc.)
- [ ] Verify member identifiers are consistent across segments
- [ ] Check demographic data (name, DOB, gender, address) for completeness
- [ ] Review relationship codes and subscriber linkages

**Step 2: Group and Contract Verification**
- [ ] Look up group in group management system
- [ ] Verify group contract is active and effective
- [ ] Confirm group number matches active contract
- [ ] Check that effective date falls within group contract period
- [ ] Review waiting period rules for this group (if applicable)
- [ ] **Decision:** Group valid and active? ☐ Yes ☐ No ☐ Needs escalation

**Step 3: Member Eligibility Rules**
- [ ] Verify subscriber meets eligibility criteria (hours worked, job class, etc.)
- [ ] For dependents, verify relationship is valid (spouse, child, etc.)
- [ ] Check dependent age limits (typically < 26 for children)
- [ ] If dependent age >= 26, verify exception (student, disabled)
- [ ] Review documentation for qualifying life event if mid-year enrollment
- [ ] **Decision:** Member eligible under plan rules? ☐ Yes ☐ No ☐ Needs benefits review

**Step 4: Plan and Product Validation**
- [ ] Verify plan ID is valid and available for this group
- [ ] Confirm product offering exists and is active
- [ ] Check that coverage level (EE, EE+Spouse, Family) matches dependents enrolled
- [ ] Validate insurance line codes (Medical, Dental, Vision) are correct
- [ ] **Decision:** Plan/product valid? ☐ Yes ☐ No ☐ Needs benefits configuration

**Step 5: PCP and Provider Assignment (if applicable)**
- [ ] Verify PCP assignment if required by plan type (HMO, EPO)
- [ ] Look up PCP NPI in provider directory
- [ ] Confirm PCP is credentialed and in-network
- [ ] Verify PCP specialty is appropriate (Family Practice, Internal Medicine, Pediatrics)
- [ ] Check PCP accepting new patients
- [ ] **Decision:** PCP assignment valid? ☐ Yes ☐ No ☐ Needs provider services

**Step 6: Duplicate Detection and Member Matching**
- [ ] Search member database for potential duplicate (SSN, DOB, name match)
- [ ] If potential match found, compare demographics to confirm same person
- [ ] Determine if this is new member or update to existing member
- [ ] For existing member, verify subscriber ID matches
- [ ] **Decision:** ☐ New member enrollment ☐ Update existing member ☐ Potential duplicate - needs resolution

**Step 7: Coverage Dates and Retroactive Review**
- [ ] Verify effective date is valid format (CCYYMMDD)
- [ ] Check if effective date is retroactive (> 90 days in past)
- [ ] If retroactive, verify retroactive enrollment is allowed per policy
- [ ] For terminations, verify termination date >= effective date
- [ ] If retroactive termination, identify claims to recover
- [ ] **Decision:** Dates valid? ☐ Yes ☐ No ☐ Needs escalation if retro

**Step 8: Final Determination**
- [ ] **Approve enrollment** - Process enrollment as submitted
- [ ] **Reject enrollment** - Specify rejection reason: _______________________
- [ ] **Pend for additional information** - Specify info needed: _______________________
- [ ] **Escalate** - Escalate to: ☐ Benefits ☐ Compliance ☐ Enrollment manager ☐ Legal

**Reviewer Actions**
- [ ] Document all findings and decision rationale in enrollment system
- [ ] Process enrollment transaction (add, change, or terminate member)
- [ ] Update PCP assignment if applicable
- [ ] Generate member ID card if new enrollment
- [ ] Notify employer/sponsor if enrollment rejected or pended
- [ ] If retroactive, identify and flag affected claims for reprocessing

**Reviewer Information**
- Reviewer Name: _______________________
- Review Date: _______________________
- Review Time (minutes): _______________________
- Signature: _______________________

---

### Checklist 5: Retroactive Enrollment Changes Review

Use this checklist in addition to Checklist 4 for enrollments with retroactive effective or termination dates (> 30 days in past).

**Retroactive Change Information**
- [ ] Type of retroactive change: ☐ Enrollment ☐ Termination ☐ Plan change ☐ Demographics
- [ ] Effective date: _______________________
- [ ] Days retroactive: _______________________
- [ ] Reason for retroactive change: _______________________

**Validation of Retroactive Authorization**
- [ ] Verify retroactive change is allowed per group contract
- [ ] Review documentation supporting retroactive change (QLF, error correction, etc.)
- [ ] Confirm approval from enrollment manager or benefits for retro change
- [ ] Check compliance with regulatory limits (ACA, HIPAA, state mandates)

**Financial Impact Assessment**
- [ ] Search claims history for this member during retroactive period
- [ ] Identify claims that will be affected by enrollment change
- [ ] **For retroactive enrollments:** Estimate claims to be paid retroactively: $_______
- [ ] **For retroactive terminations:** Estimate claims to be recovered: $_______
- [ ] Determine premium adjustments needed: $_______ ☐ Refund ☐ Additional premium

**Claims Coordination**
- [ ] Generate list of affected claims with claim IDs and amounts
- [ ] For retro enrollments, route previously denied claims for reprocessing
- [ ] For retro terminations, initiate claim recovery process (overpayment letters)
- [ ] Update claims system with new eligibility information
- [ ] Notify claims operations of retroactive eligibility change

**Member and Provider Notification**
- [ ] Prepare member notification letter explaining retroactive change
- [ ] For retro terminations, notify member of overpayment responsibility
- [ ] Notify affected providers of eligibility change and claim impacts
- [ ] Document all notifications sent

**Approval Requirements**
- [ ] Enrollment Specialist: ☐ Approved ☐ Denied ☐ Escalate
- [ ] Enrollment Manager: ☐ Approved ☐ Denied ☐ Escalate
- [ ] Compliance (if >180 days retro): ☐ Approved ☐ Denied ☐ Escalate

**Signatures**
- Enrollment Specialist: _______________________ Date: _______
- Enrollment Manager: _______________________ Date: _______
- Compliance (if req'd): _______________________ Date: _______

---

### Checklist 6: Dependent Eligibility Review

Use this checklist for enrollments of dependents with special circumstances (age >= 26, disabled, student, etc.).

**Dependent Information**
- [ ] Dependent Name: _______________________
- [ ] Relationship to Subscriber: ☐ Spouse ☐ Child ☐ Other
- [ ] Date of Birth: _______________________
- [ ] Age at Enrollment: _______________________
- [ ] Special Status: ☐ Student ☐ Disabled ☐ QMCSO ☐ None

**Standard Dependent Verification**
- [ ] Verify dependent relationship documentation on file (marriage certificate, birth certificate, etc.)
- [ ] Confirm dependent DOB and age calculation
- [ ] Check dependent address matches subscriber (or verify different address if applicable)

**Age Limit Verification (if dependent age >= 26)**
- [ ] Verify plan's dependent age limit policy
- [ ] Check for exception categories (student, disabled)
- [ ] **If student:** Request enrollment verification or class schedule
- [ ] **If student:** Verify full-time status and semester dates
- [ ] **If disabled:** Request physician certification of disability
- [ ] **If disabled:** Verify disability onset before age 26 (if required by plan)
- [ ] **Decision:** Exception documentation adequate? ☐ Yes ☐ No ☐ Request additional docs

**QMCSO Review (Qualified Medical Child Support Order)**
- [ ] If QMCSO indicated, verify order is on file
- [ ] Confirm QMCSO has been reviewed and qualified by legal/compliance
- [ ] Check that coverage meets QMCSO requirements
- [ ] Expedite enrollment per QMCSO mandates
- [ ] Notify custodial parent and provider of coverage

**Coordination of Benefits (COB) for Dependents**
- [ ] Check if dependent has other coverage (other parent's plan, own employer)
- [ ] Determine primary vs. secondary coverage (birthday rule, etc.)
- [ ] Update COB information in eligibility system
- [ ] Notify member of COB determination

**Final Determination**
- [ ] **Approve dependent enrollment** - Eligible with documentation
- [ ] **Deny dependent enrollment** - Not eligible, reason: _______________________
- [ ] **Pend for documentation** - Documents needed: _______________________

**Reviewer Information**
- Reviewer Name: _______________________
- Review Date: _______________________
- Signature: _______________________

---

### Checklist 7: Eligibility Inquiry/Response Review (270/271)

Use this checklist for eligibility transactions (270/271) flagged with Exception status or requiring manual review.

**Transaction Information**
- [ ] Transaction Type: ☐ 270 Inquiry ☐ 271 Response
- [ ] Trace Number (TRN): _______________________
- [ ] Information Source/Payer: _______________________
- [ ] Information Receiver/Provider: _______________________
- [ ] Subscriber Name: _______________________
- [ ] Member ID: _______________________
- [ ] Service Type Requested (EQ01): _______________________
- [ ] Exception Reason(s): _______________________

**Step 1: Structural Validation (270)**
- [ ] Verify all required segments present (ISA, GS, ST, HL, TRN, NM1, SE, GE, IEA)
- [ ] Confirm HL hierarchy is valid (2000A→2000B→2000C)
- [ ] Check TRN (trace number) is populated and valid format
- [ ] Verify NM1*PR (information source/payer) is complete
- [ ] Verify NM1*1P (information receiver/provider) is complete
- [ ] Verify NM1*IL (subscriber) is complete
- [ ] **Decision:** Structure valid? ☐ Yes ☐ No ☐ Needs correction

**Step 2: Subscriber/Member Identification**
- [ ] Extract subscriber name from NM1*IL segment (NM108-09)
- [ ] Extract member ID from REF*0F or REF*1L segment
- [ ] Extract demographics if present (DMG: DOB, gender)
- [ ] Verify all required identifiers are present
- [ ] **Decision:** Member identifiable? ☐ Yes ☐ No ☐ Insufficient data

**Step 3: Inquiry Scope Validation**
- [ ] Check if EQ (inquiry) segment is present
- [ ] Verify EQ01 (service type code) is valid (01-99, A1-A9, or compliant codes)
- [ ] Review coverage level code (EQ02) if provided
- [ ] Note date range (DTP) if inquiry is date-specific
- [ ] **Decision:** Inquiry scope clear? ☐ Yes ☐ No ☐ Default to general eligibility

**Step 4: Trading Partner Validation**
- [ ] Verify information receiver/provider is authorized for eligibility inquiries
- [ ] Check provider NPI is valid if provided (NM109)
- [ ] Confirm trading partner setup and configuration
- [ ] **Decision:** Trading partner authorized? ☐ Yes ☐ No ☐ Needs escalation

**Step 5: Member Lookup (for 270 Processing)**
- [ ] Search member database using member ID
- [ ] If not found by ID, try name + DOB search
- [ ] Check for multiple matches or fuzzy matches
- [ ] Verify member status (Active, Inactive, Terminated, COBRA, etc.)
- [ ] Confirm plan and coverage dates
- [ ] **Decision:** Member found? ☐ Yes ☐ No ☐ Multiple matches

**Step 6: Generate 271 Response**
_If processing 270 inquiry:_
- [ ] **If Member Found:**
  - [ ] Include at least one EB segment with eligibility status (EB01)
  - [ ] Provide coverage dates (DTP*346 effective, DTP*347 term if applicable)
  - [ ] Include service type in EB03 if specific inquiry
  - [ ] Provide benefit amounts if requested (deductible, copay, OOP max)
  - [ ] Include coverage level (EB06) - Individual, Family, etc.
  - [ ] Add plan type information (EB13) if applicable

- [ ] **If Member NOT Found:**
  - [ ] Generate AAA*N**72~ segment (Member ID not found/invalid)
  - [ ] Include MSG segment with explanation
  - [ ] Provide guidance to provider

- [ ] **If Inquiry Invalid:**
  - [ ] Generate AAA*N**64~ segment (Unsupported inquiry type)
  - [ ] OR AAA*N**51~ (System unavailable)
  - [ ] Include MSG with specific reason

**Step 7: Response Validation (for 271 Review)**
_If reviewing 271 response:_
- [ ] Verify TRN in 271 matches TRN from 270 inquiry
- [ ] Confirm at least one EB segment is present
- [ ] Verify EB01 (eligibility status) is populated with valid code
- [ ] Check coverage dates are included if member is active
- [ ] Confirm service type in response matches inquiry (if specific)
- [ ] Verify response provides actionable information for provider
- [ ] **Decision:** Response complete and accurate? ☐ Yes ☐ No ☐ Needs correction

**Step 8: Trading Partner Validation**
- [ ] Verify response format complies with trading partner agreement
- [ ] Check response completeness meets requirements
- [ ] Confirm no PHI/HIPAA violations in response
- [ ] **Decision:** Compliance verified? ☐ Yes ☐ No ☐ Needs review

**Step 9: Quality Checks**
- [ ] Response is accurate based on member's current eligibility
- [ ] All required segments and elements are present
- [ ] No conflicting information in response
- [ ] Response provides useful information to provider
- [ ] **Decision:** Quality acceptable? ☐ Yes ☐ No ☐ Needs escalation

**Step 10: Final Determination**
- [ ] **Approve 270 inquiry** - Process and generate 271 response
- [ ] **Reject 270 inquiry** - Generate AAA rejection with reason: _______________________
- [ ] **Approve 271 response** - Send as generated
- [ ] **Modify 271 response** - Corrections needed: _______________________
- [ ] **Escalate** - Escalate to: ☐ Benefits ☐ IT ☐ Compliance ☐ Management

**Reviewer Actions**
- [ ] Document all findings and decision rationale in system
- [ ] Generate 271 response with appropriate EB and/or AAA segments
- [ ] Log inquiry for trading partner pattern analysis
- [ ] If recurring issue, flag provider for education
- [ ] Update member record if eligibility discrepancies found

**Reviewer Information**
- Reviewer Name: _______________________
- Review Date: _______________________
- Review Time (minutes): _______________________
- Signature: _______________________

**Common Issues and Resolutions**

| Issue | AAA Code | Resolution |
|-------|----------|------------|
| Member not found | AAA*N**72 | Verify member ID with provider |
| Multiple members match | N/A | Request additional identifiers (DOB, name) |
| Inquiry type not supported | AAA*N**64 | Provide valid service type codes |
| System unavailable | AAA*N**51 | Retry or manual lookup |
| Member terminated | EB01=6 | Include termination date in DTP*347 |
| Member active | EB01=1 | Include full benefit information |

---

### Checklist 8: Claim Status Inquiry/Response Review (276/277)

Use this checklist for claim status transactions (276/277) flagged with Exception status or requiring manual review.

**Transaction Information**
- [ ] Transaction Type: ☐ 276 Inquiry ☐ 277 Response
- [ ] Trace Number (TRN): _______________________
- [ ] Patient Control Number (REF*D9): _______________________
- [ ] Payer Claim Number (REF*1K): _______________________
- [ ] Service Date: _______________________
- [ ] Provider Name/NPI: _______________________
- [ ] Subscriber Name: _______________________
- [ ] Member ID: _______________________
- [ ] Exception Reason(s): _______________________

**Step 1: Structural Validation (276)**
- [ ] Verify all required segments present (ISA, GS, ST, HL, TRN, NM1, SE, GE, IEA)
- [ ] Confirm HL hierarchy is valid (2000A→2000B→2000C→2000D, optional 2000E)
- [ ] Check TRN (trace number) is populated
- [ ] Verify subscriber information (NM1*IL in 2000D)
- [ ] Verify claim identifiers present (REF*D9 and/or REF*1K)
- [ ] **Decision:** Structure valid? ☐ Yes ☐ No ☐ Needs correction

**Step 2: Structural Validation (277)**
_If reviewing 277 response:_
- [ ] Verify all required segments present
- [ ] Confirm STC (status information) segment is present in 2200D loop
- [ ] Check TRN matches inquiry TRN
- [ ] Verify CLP (claim payment) information if available
- [ ] **Decision:** Structure valid? ☐ Yes ☐ No ☐ Needs correction

**Step 3: Claim Identification**
- [ ] Extract patient control number (REF*D9) if provided
- [ ] Extract payer claim number (REF*1K) if provided
- [ ] Extract service date (DTP*472) if provided
- [ ] Extract provider NPI from NM1*1P or NM1*82
- [ ] Extract member ID from REF*0F or REF*1L
- [ ] **Decision:** Sufficient identifiers to search for claim? ☐ Yes ☐ No ☐ Marginal

**Step 4: Subscriber/Patient Identification**
- [ ] Verify subscriber information (NM1*IL)
- [ ] Check patient information if different from subscriber (NM1*QC or NM1*03)
- [ ] Extract demographics (DMG) if provided
- [ ] **Decision:** Member identifiable? ☐ Yes ☐ No ☐ Needs more info

**Step 5: Claim Search (for 276 Processing)**
- [ ] Search active claims database by patient control number
- [ ] If not found, search by payer claim number
- [ ] If not found, search by member ID + service date + provider
- [ ] Check pending/suspense claims queue
- [ ] Check intake rejection logs
- [ ] Search archive database if claim is old (>180 days)
- [ ] **Decision:** Claim found? ☐ Yes ☐ No ☐ Multiple matches

**Step 6: Retrieve Claim Status**
_If processing 276 and claim found:_
- [ ] Determine current claim status in adjudication system
- [ ] Identify status category (A=Acknowledgement, P=Pending, F=Finalized, E=Error)
- [ ] Check claim-level status
- [ ] Check service line-level status if applicable
- [ ] Retrieve payment amounts if finalized
- [ ] Retrieve adjustment codes (CAS) if denied or partially paid
- [ ] **Status Identified:** _______________________

**Step 7: Generate 277 Response**
_If processing 276 inquiry:_
- [ ] **If Claim Found - In Process:**
  - [ ] Use STC*A1 (Received) or appropriate P-code (Pending)
  - [ ] Include expected completion date if available
  - [ ] Add MSG with current processing stage

- [ ] **If Claim Found - Finalized:**
  - [ ] Use appropriate F-code (F1=Paid, F2=Denied, F3=Partial)
  - [ ] Include CLP with payment amounts
  - [ ] Include CAS adjustments if denied or reduced
  - [ ] Include paid date (DTP*573)

- [ ] **If Claim NOT Found:**
  - [ ] Determine reason (not received, wrong payer, in process <5 days, etc.)
  - [ ] Use STC*A7 (Claim not on file) or STC*A4 (No claim on file for patient)
  - [ ] Include MSG with explanation and recommendations

- [ ] **If Claim Rejected at Intake:**
  - [ ] Use STC*E0 (Entity not found/invalid)
  - [ ] Include rejection reason in MSG
  - [ ] Recommend provider correct and resubmit

**Step 8: Status Consistency Validation**
_If reviewing 277 response:_
- [ ] Verify entity-level status aligns with claim-level status
- [ ] Check claim-level status aligns with service line status
- [ ] Confirm status codes match payment amounts (F1 has payment, F2 has $0)
- [ ] Verify pending status (P-codes) don't have final payment amounts
- [ ] Check finalized status (F-codes) include payment details
- [ ] **Decision:** Status consistent? ☐ Yes ☐ No ☐ Conflicting data

**Step 9: Provider Action Guidance**
- [ ] Include STC03 action code if appropriate (WQ=Wait, RN=Resubmit, CO=Correct)
- [ ] Provide clear MSG text explaining status
- [ ] Include next steps for provider if action required
- [ ] Specify timeframes if applicable
- [ ] **Decision:** Guidance clear and actionable? ☐ Yes ☐ No ☐ Needs improvement

**Step 10: Trading Partner Validation**
- [ ] Verify trading partner is authorized for claim status inquiries
- [ ] Check response format complies with trading partner agreement
- [ ] Confirm no PHI/HIPAA violations
- [ ] **Decision:** Compliance verified? ☐ Yes ☐ No ☐ Needs review

**Step 11: Quality Checks**
- [ ] Response accurately reflects claim status in system
- [ ] All required STC segments are present
- [ ] Payment amounts are accurate if finalized
- [ ] Provider can take appropriate action based on response
- [ ] **Decision:** Quality acceptable? ☐ Yes ☐ No ☐ Needs escalation

**Step 12: Final Determination**
- [ ] **Approve 276 inquiry** - Process and generate 277 response
- [ ] **Reject 276 inquiry** - Insufficient claim identifiers, request more info
- [ ] **Approve 277 response** - Send as generated
- [ ] **Modify 277 response** - Corrections needed: _______________________
- [ ] **Escalate** - Escalate to: ☐ Claims ☐ IT ☐ Provider Services ☐ Management

**Reviewer Actions**
- [ ] Document all findings and decision rationale in system
- [ ] Generate 277 response with appropriate STC codes
- [ ] Log inquiry for provider pattern analysis
- [ ] If claim not found and should exist, investigate submission issues
- [ ] If recurring issue, flag provider for education

**Reviewer Information**
- Reviewer Name: _______________________
- Review Date: _______________________
- Review Time (minutes): _______________________
- Signature: _______________________

**Common Status Codes and Meanings**

| Status Code | Category | Meaning | Provider Action |
|-------------|----------|---------|-----------------|
| A1 | Acknowledgement | Received | Wait for processing (5-7 days) |
| A4 | Acknowledgement | No claim on file for patient | Verify member info, possibly wrong payer |
| A7 | Acknowledgement | Claim not on file | Check submission confirmation, may need to resubmit |
| P0-P9 | Pending | Claim in process | Wait; specific P-code indicates review type |
| F1 | Finalized | Paid | Payment processed; check remittance |
| F2 | Finalized | Denied | Review denial reason in CAS segment |
| F3 | Finalized | Partial payment | Review adjustments in CAS segment |
| E0 | Error | Entity not found | Claim rejected; check rejection reason |

**Claim Age Considerations**

| Days Since Service | Expected Status | Action if Not Found |
|--------------------|----------------|---------------------|
| 0-5 days | A1 (Received/In process) | Normal; claim may not be entered yet |
| 5-30 days | P-code (Pending) or F-code (Finalized) | Check intake logs; may be rejected |
| 30-180 days | F-code (Finalized) | Investigate; should be processed |
| >180 days | F-code or archived | Search archive database |

---

## Common Exception Scenarios and Resolutions

### Scenario 1: Member Not Eligible on Service Date (Claims)

**Automated Flag:** Member coverage terminated before service date

**Review Steps:**
1. Verify termination date in eligibility system
2. Check for retroactive reinstatement or appeals
3. Review employer group records for termination reason
4. Confirm termination was processed correctly (not an error)

**Possible Resolutions:**
- Deny claim with termination reason code if confirmed ineligible
- Reinstate member retroactively if termination was in error
- Pend claim if member is appealing termination
- Process as COBRA if member elected continuation coverage

### Scenario 2: Provider Out-of-Network (Claims)

**Automated Flag:** Provider not found in network for member's plan

**Review Steps:**
1. Verify provider network status on service date (may have joined/left network)
2. Check if emergency services (out-of-network emergency must be covered)
3. Review if member obtained prior authorization for out-of-network care
4. Determine if plan has out-of-network benefits

**Possible Resolutions:**
- Process with out-of-network benefit levels if plan allows
- Process as in-network if emergency services
- Approve if prior authorization was obtained
- Deny if HMO/EPO plan with no out-of-network benefits and not emergency

### Scenario 3: Missing Prior Authorization (Claims)

**Automated Flag:** Service requires PA but no PA number provided

**Review Steps:**
1. Search PA system for member and service date
2. Check if PA was obtained but number not included on claim
3. Verify PA requirements for this service and plan
4. Determine if PA can be obtained retroactively per policy

**Possible Resolutions:**
- Approve claim if PA found in system (provider just didn't include number)
- Pend claim and request PA number from provider
- Deny claim if PA required and not obtained, per contract
- Escalate if extenuating circumstances (emergency, etc.)

### Scenario 4: Retroactive Enrollment (Enrollment)

**Automated Flag:** Effective date > 90 days in past

**Review Steps:**
1. Verify reason for retroactive enrollment (QLF, error correction, late notification)
2. Check group contract allows retroactive enrollment
3. Review supporting documentation (marriage certificate, birth certificate, etc.)
4. Identify claims to reprocess

**Possible Resolutions:**
- Approve retro enrollment if allowed by contract and documented
- Reject if no valid reason for retroactive enrollment
- Limit retroactive period per policy (e.g., max 60 or 90 days)
- Escalate to compliance if regulatory issues (ACA, HIPAA)

### Scenario 5: Dependent Age Limit Exceeded (Enrollment)

**Automated Flag:** Dependent age >= 26 without student or disabled status

**Review Steps:**
1. Verify dependent DOB and calculate age
2. Check for exception categories (student, disabled)
3. Request supporting documentation if exception claimed
4. Review plan's dependent age policy

**Possible Resolutions:**
- Approve if student documentation provided and plan allows
- Approve if disabled certification provided and plan allows
- Terminate dependent coverage if age limit exceeded and no exception
- Pend for documentation if exception claimed but docs not received

---

## Documentation Requirements

All human review decisions must be documented with the following information:

**Required Documentation:**
- Transaction ID (claim ID or enrollment transaction number)
- Member and provider identifiers
- Date and time of review
- Reviewer name and credentials
- All validation steps completed (checkboxes)
- Data sources consulted (eligibility system, provider directory, etc.)
- Final determination and reason
- Approvals obtained (manager, medical director, etc.)
- Correspondence generated (denial letters, pend requests, etc.)

**Retention:**
- Claims review documentation: Retain per claims retention policy (typically 7-10 years)
- Enrollment review documentation: Retain per enrollment retention policy (typically 7-10 years)
- FWA documentation: Retain indefinitely or per compliance requirements

**Audit Trail:**
- All review activity must be logged in appropriate system (claims, enrollment, compliance)
- Changes to automated rule recommendations must be documented with rationale
- Escalations and approvals must be tracked

---

## Quality Assurance

Enrollment and claims operations should conduct regular quality assurance reviews:

**Claims QA:**
- Random sample of approved claims (e.g., 10 per reviewer per month)
- 100% review of high-dollar claims
- 100% review of FWA referrals
- Trending of denial reasons and overturn rates

**Enrollment QA:**
- Random sample of processed enrollments (e.g., 10 per specialist per month)
- 100% review of retroactive enrollments > 90 days
- 100% review of dependent age exceptions
- Trending of rejection reasons and error rates

**Automated Rule Validation:**
- Periodic review of false positive rates (transactions flagged but approved on review)
- Periodic review of false negative rates (transactions not flagged but should have been)
- Update rubrics and rules based on QA findings

---

## Training and Competency

All human reviewers must complete training on:

- EDI transaction standards (X12 837, 834)
- Payer-specific benefit plans and policies
- Eligibility and enrollment rules
- Prior authorization requirements
- Code sets (ICD-10, CPT, HCPCS, revenue codes)
- Fraud, waste, and abuse detection
- Use of these checklists and documentation requirements
- System navigation (claims, enrollment, eligibility, provider directory)

Competency should be validated through:
- Initial training assessment
- QA review of work product
- Annual refresher training
- Ongoing coaching and feedback

---

## Version History

- **v1.0.0** (2024-03) - Initial checklists for Claims and Enrollment review

**Disclaimer:** These checklists are guidance for human reviewers to supplement automated validation. Reviewers must apply professional judgment and follow payer-specific policies and procedures. All final determinations are the responsibility of the authorized reviewer and the payer organization.
