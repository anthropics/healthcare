# Intelligent Error Messages

This guide defines how to generate contextual, helpful error messages that teach users and accelerate resolution. Transform generic validation failures into opportunities for learning and rapid problem-solving.

## Philosophy

**Bad error message:**
```
Error: Member not eligible on service date
```

**Intelligent error message:**
```
❌ Member not eligible on service date

QUICK DIAGNOSIS:
  Member ID: MBR87654321
  Service Date: 2024-03-05
  Coverage Status: Terminated 2024-03-01 (4 days before service)

POSSIBLE CAUSES (ranked by likelihood):
  1. ✓ Most likely: Actual termination - member left coverage
  2. ⚠️ Possible: Retroactive termination error awaiting correction
  3. 🔍 Consider: Emergency services exception may apply

NEXT STEPS:
  → Verify member status in eligibility system
  → If emergency visit: Review emergency services policy
  → If error: Request 834 correction from employer

TIME TO RESOLVE: ~15 minutes
CHECKLIST: Step 2 of Checklist 1
```

## Intelligent Error Template Structure

Every intelligent error message should include:

### 1. Clear Problem Statement
- Use emoji indicators: ❌ (error), ⚠️ (warning), ℹ️ (info)
- State the problem in plain language
- Show severity and impact

### 2. Quick Diagnosis Section
- Key facts about the transaction
- Specific data values causing the issue
- Context about what was expected vs. what was found
- Relevant dates, amounts, codes, identifiers

### 3. Possible Causes (Ranked)
- List 3-5 potential root causes
- Rank by likelihood based on:
  - Historical patterns for this error type
  - Transaction context (emergency visit, high dollar, etc.)
  - Trading partner history
  - Time patterns (end of month, after holidays)
- Use visual indicators:
  - ✓ Most likely (>60% probability)
  - ⚠️ Possible (20-60% probability)
  - 🔍 Consider/Check (5-20% probability)
  - 💡 Less likely but seen before (<5% probability)

### 4. Similar Cases Reference
- "You've seen X similar cases this month/quarter"
- Show distribution of how those were resolved
- Link to relevant examples if available
- Pattern detection: "This trading partner has this issue frequently"

### 5. Contextual Next Steps
- Ordered action items (not just generic advice)
- System-specific: "Check eligibility system" not just "verify eligibility"
- Include shortcuts/links where applicable
- Conditional steps: "If X, then Y; If A, then B"

### 6. Metadata
- Estimated resolution time
- Related rules and checklists
- Who typically handles this (specialist vs. general reviewer)
- When to escalate

## Error Message Library

### Claims Errors

#### E-ELG-001: Member Not Eligible on Service Date

```markdown
❌ Member Not Eligible on Service Date

QUICK DIAGNOSIS:
  Member ID: {member_id}
  Service Date: {service_date}
  Coverage Status: {coverage_status}
  Termination Date: {term_date} ({days_difference} before service)
  Plan: {plan_name}

CONTEXT:
  Claim Amount: ${claim_amount}
  Service Type: {service_type}
  Place of Service: {pos_description}
  Provider: {provider_name}

POSSIBLE CAUSES:
  1. ✓ Most likely: Member coverage actually terminated
     - Common after: Employment termination, non-payment, voluntary drop
     - Verify: Check member status in eligibility system

  2. ⚠️ Possible: Retroactive termination error
     - Pattern: {trading_partner} has {retro_error_rate}% retro error rate
     - Verify: Check for pending 834 corrections
     - Action: Contact employer group if suspicious

  3. 🔍 Consider: Emergency services exception
     {if emergency_service}
     - Detected: Service code {cpt_code} indicates emergency care
     - Rule: Emergency services covered regardless of eligibility status
     - Verify: Confirm emergency nature and apply exception
     {endif}

  4. 🔍 Consider: COBRA continuation coverage
     {if recently_terminated}
     - Member termed {days_since_term} days ago
     - Check: Did member elect COBRA?
     - Action: Search for COBRA 834 transaction
     {endif}

SIMILAR CASES:
  You've processed {similar_count} similar eligibility exceptions this month:
  - {approved_count} approved after verification ({approved_pct}%)
  - {denied_count} denied - confirmed ineligible ({denied_pct}%)
  - Top resolution: {top_resolution}

{if trading_partner_pattern}
TRADING PARTNER PATTERN:
  ⚠️ {trading_partner_name} has high rate of eligibility issues
  - Exception rate: {tp_exception_rate}% (yours: {avg_exception_rate}%)
  - Root cause: {common_root_cause}
  - Recommendation: {recommendation}
{endif}

NEXT STEPS:
  1. Open eligibility system and search member ID: {member_id}
  2. Verify coverage dates and termination reason
  3. {conditional_step_based_on_context}
  4. If confirmed ineligible → Deny with reason code {reason_code}
     If error/exception applies → Document and approve
     If uncertain → Escalate to {escalation_target}

BUSINESS IMPACT:
  Financial: ${claim_amount} at risk
  Member satisfaction: {impact_level} - {impact_description}
  Provider: {provider_impact}

REVIEW CHECKLIST: Checklist 1, Step 2
ESTIMATED TIME: 15-20 minutes
ESCALATE IF: Unclear eligibility status after system check

LEARN MORE:
  → Eligibility troubleshooting guide: [link]
  → Emergency services policy: [link]
  → COBRA coverage rules: [link]
```

#### C-DX-003: Invalid ICD-10 Diagnosis Code

```markdown
❌ Invalid ICD-10 Diagnosis Code

QUICK DIAGNOSIS:
  Submitted Code: {submitted_code}
  Position: {diagnosis_position} (Primary/Secondary)
  Service Date: {service_date}
  Procedure: {procedure_code} - {procedure_description}

WHAT'S WRONG:
  {if code_not_exists}
  - Code does not exist in ICD-10-CM code set
  - This is not a valid diagnosis code format or value
  {endif}

  {if code_outdated}
  - Code was valid until {discontinued_date}
  - Code status: Deleted/Obsolete in {year} code set
  - Replacement code: {replacement_code}
  {endif}

  {if wrong_version}
  - Code exists but not in {service_year} code set
  - Code became valid: {valid_from_date}
  - Service was before code's effective date
  {endif}

POSSIBLE CAUSES:
  1. ✓ Most likely: Provider using outdated code set
     - Pattern: {provider_name} has {outdated_code_rate}% outdated code rate
     - Action: Pend claim and request corrected diagnosis

  2. ⚠️ Possible: Typo in diagnosis code
     - Similar valid codes:
       • {similar_code_1} - {description_1}
       • {similar_code_2} - {description_2}
     - Action: Cannot assume - must get clarification from provider

  3. 🔍 Consider: Code set version mismatch
     - Your validator: ICD-10-CM {your_version}
     - Provider may be using: {suspected_version}
     - Action: Verify your code set is current

DID YOU MEAN?
  {if fuzzy_matches}
  Based on similarity and procedure {procedure_code}, possible matches:

  → {match_1_code} - {match_1_description}
    Confidence: {confidence_1}%
    Usage: Used {usage_count_1}x with this procedure in your claims

  → {match_2_code} - {match_2_description}
    Confidence: {confidence_2}%
    Usage: Used {usage_count_2}x with this procedure in your claims

  ⚠️ DO NOT auto-correct - request clarification from provider
  {endif}

CLINICAL CONTEXT:
  Procedure billed: {procedure_code} - {procedure_description}
  Typical diagnoses for this procedure:
  - {common_dx_1} ({frequency_1}% of cases)
  - {common_dx_2} ({frequency_2}% of cases)
  - {common_dx_3} ({frequency_3}% of cases)

PROVIDER PATTERN:
  {provider_name} coding quality:
  - Total claims: {provider_claim_count}
  - Coding error rate: {coding_error_rate}%
  - Common issue: {common_provider_issue}
  {if high_error_rate}
  - ⚠️ Consider: Provider education opportunity
  {endif}

NEXT STEPS:
  1. Verify your ICD-10-CM code set is updated to {current_year}
  2. If code set is current → Pend claim
  3. Generate provider correspondence:
     "The diagnosis code {submitted_code} is invalid for service date
      {service_date}. Please review and resubmit with correct diagnosis."
  4. If provider requests guidance → Share "Did You Mean?" suggestions above
  5. Once corrected code received → Reprocess claim

REVIEW CHECKLIST: Checklist 1, Step 4
ESTIMATED TIME: 10 minutes (pend) + provider response time
ESCALATE IF: Multiple claims from same provider with invalid codes

AUTO-FIX AVAILABLE: No - requires provider clarification
PREVENTION: Consider provider education outreach if recurring

RESOURCES:
  → ICD-10-CM code lookup: [link to CMS ICD-10 tool]
  → Code set updates: [link to annual updates]
  → Provider coding resources: [link]
```

#### P-NPI-003: Provider NPI Not Found or Invalid

```markdown
⚠️ Provider NPI Not Found or Invalid

QUICK DIAGNOSIS:
  Submitted NPI: {submitted_npi}
  Provider Type: {provider_type} (Billing/Rendering/Referring)
  Provider Name: {provider_name}
  Claim Amount: ${claim_amount}

VALIDATION RESULTS:
  {if format_invalid}
  ❌ Format Check: FAILED
    - NPI must be exactly 10 digits
    - Submitted: {submitted_npi} ({length} characters)
  {endif}

  {if checksum_invalid}
  ❌ Checksum: FAILED
    - NPI checksum validation failed (Luhn algorithm)
    - This is not a valid NPI number
  {endif}

  {if not_found}
  ⚠️ NPPES Registry: NOT FOUND
    - NPI not found in National Plan and Provider Enumeration System
    - NPI may be deactivated, invalid, or never issued
  {endif}

  {if deactivated}
  ⚠️ NPPES Registry: DEACTIVATED
    - NPI was valid but is now deactivated
    - Deactivation date: {deactivation_date}
    - Reason: {deactivation_reason}
  {endif}

POSSIBLE CAUSES:
  1. ✓ Most likely: Typo in NPI
     - Common errors: Transposed digits, missing digit, extra digit
     - Similar NPIs in your system:
       {if similar_npis}
       • {similar_npi_1} - {provider_name_1} (Levenshtein distance: {distance_1})
       • {similar_npi_2} - {provider_name_2} (Levenshtein distance: {distance_2})
       {endif}

  2. ⚠️ Possible: Provider using old/incorrect NPI
     - Pattern: Individual provider submitted Organization NPI or vice versa
     - Check: Does provider name match an existing NPI in your directory?

  3. 🔍 Consider: Recently enrolled provider
     - NPI may exist but not yet in your provider directory
     - Action: Check NPPES directly and add to directory if valid

PROVIDER DIRECTORY SEARCH:
  Searching your directory for "{provider_name}"...

  {if directory_matches}
  ✓ Found matching providers in your system:

  → {match_name_1}
    NPI: {match_npi_1}
    Specialty: {match_specialty_1}
    Status: {match_status_1}
    Network: {match_network_1}
    Last claim: {match_last_claim_1}

  {if high_confidence_match}
  💡 HIGH CONFIDENCE: This is likely the intended provider
     - Name similarity: {similarity_score}%
     - Provider has submitted {claim_history_count} claims previously
     - Recommendation: Pend claim and confirm correct NPI with provider
  {endif}
  {else}
  ❌ No matching providers found in your directory
  {endif}

NETWORK STATUS CHECK:
  {if npi_valid_but_not_in_network}
  ⚠️ NPI is valid BUT provider not in network for this plan
  - NPI verified in NPPES: {nppes_provider_name}
  - Specialty: {nppes_specialty}
  - Your network: {required_network}
  - Provider network status: Out of network
  {endif}

HISTORICAL PATTERN:
  {if provider_history}
  This provider has submitted {historical_claim_count} claims previously:
  - Previous NPI used: {previous_npi}
  - Changed on: {npi_change_date}
  - Possible: Provider changed practice/organization
  {endif}

NEXT STEPS:
  {if format_invalid}
  1. Reject claim immediately - invalid NPI format
  2. Notify provider of NPI format requirements
  {else if checksum_invalid}
  1. Reject claim - NPI checksum failed
  2. Provider likely has typo - request corrected NPI
  {else if directory_match}
  1. Pend claim for provider clarification
  2. Send correspondence: "NPI {submitted_npi} not found. Did you mean {match_npi_1}?"
  3. Upon confirmation → Update claim and reprocess
  {else}
  1. Check NPPES registry manually: https://npiregistry.cms.hhs.gov
  2. If valid in NPPES → Add to your provider directory
  3. If not in NPPES → Reject claim and request valid NPI
  {endif}

AUTO-FIX SUGGESTION:
  {if high_confidence_match}
  ⚠️ Auto-correction available but requires approval:
  - Change NPI from {submitted_npi} to {suggested_npi}
  - Confidence: {confidence}%
  - Approve auto-fix? [Y/N] (Requires manager approval if >$1,000)
  {endif}

BUSINESS IMPACT:
  Claim value: ${claim_amount}
  Member impact: {member_impact}
  Timely filing: {days_remaining} days remaining
  {if urgent}
  ⚠️ URGENT: Claim approaching timely filing deadline
  {endif}

REVIEW CHECKLIST: Checklist 1, Step 3
ESTIMATED TIME: 10-15 minutes
ESCALATE IF: Unable to determine correct NPI after NPPES check

PREVENTION:
  {if recurring_issue}
  - This provider has NPI issues on {issue_percentage}% of claims
  - Recommendation: Proactive outreach to verify correct NPI
  - Action: Add to provider education list
  {endif}

RESOURCES:
  → NPPES NPI Registry: https://npiregistry.cms.hhs.gov
  → NPI checksum validator: [link to tool]
  → Provider directory: [link to your system]
```

### Enrollment Errors

#### D-RET-001: Retroactive Enrollment

```markdown
⚠️ Retroactive Enrollment Detected

QUICK DIAGNOSIS:
  Member: {member_name} ({member_id})
  Transaction Date: {transaction_date}
  Effective Date: {effective_date}
  Days Retroactive: {days_retro} days ({months_retro} months)
  Group: {group_name} ({group_number})

RISK ASSESSMENT:
  {if days_retro < 30}
  🟢 Low Risk: Within standard 30-day correction window
  {else if days_retro < 90}
  🟡 Medium Risk: 30-90 days retroactive
  {else}
  🔴 High Risk: Over 90 days retroactive - Enhanced review required
  {endif}

  Retroactive Period: {start_date} to {end_date}
  Potential Claims Impact: {estimated_claim_count} claims may be affected

POSSIBLE REASONS:
  1. ✓ Most likely: Late employer notification
     - Common after: New hire waiting period, open enrollment, life event
     - Reason code: {maintenance_reason_code}

  2. ⚠️ Possible: Administrative error correction
     - Pattern: Employer discovers enrollment was missed
     - Check: Is this a new hire or existing employee?

  3. 🔍 Consider: Qualifying life event
     - Events allowing retroactive: Birth, adoption, marriage, loss of coverage
     - Verify: QLF documentation should be on file

  4. 💡 Consider: HIPAA special enrollment
     - HIPAA allows 30-day retroactive for certain events
     - Check: Does reason align with HIPAA special enrollment rules?

GROUP CONTRACT CHECK:
  Group: {group_name}
  Contract Term: {contract_start} to {contract_end}
  Retroactive Policy: {retro_policy}
  Maximum Retro Days: {max_retro_days} days

  {if exceeds_limit}
  ❌ EXCEEDS CONTRACT LIMIT
  - Your policy allows: {max_retro_days} days maximum
  - This enrollment: {days_retro} days
  - Action: Requires exception approval or must be rejected
  {else}
  ✓ Within contract retroactive limits
  {endif}

CLAIMS IMPACT ANALYSIS:
  Searching claims history for member {member_id}...

  {if claims_found}
  ⚠️ CLAIMS FOUND during retroactive period:

  Total claims: {claim_count}
  Total denied for eligibility: {denied_count}
  Total amount: ${total_amount}

  Claims requiring reprocessing:
  {for each claim}
  → Claim {claim_id}: ${claim_amount} - DOS: {dos} - Status: {status}
     Provider: {provider_name}
     Action required: {claim_action}
  {endfor}

  💰 FINANCIAL IMPACT:
  - Claims to pay retroactively: ${retro_payment_amount}
  - Premium adjustment: ${premium_adjustment}
  - Net financial impact: ${net_impact}

  {else}
  ✓ No claims found during retroactive period
  - Financial impact: Premium adjustment only
  - Estimated premium: ${premium_only}
  {endif}

COMPLIANCE CHECK:
  {if days_retro > 180}
  ⚠️ Regulatory Review Required
  - Retroactive period > 180 days may have compliance implications
  - ACA considerations: {aca_considerations}
  - State regulations: {state_regs}
  - Action: Compliance team review required before approval
  {endif}

HISTORICAL PATTERN:
  {group_name} retroactive enrollment history:
  - Total retroactive enrollments this year: {retro_count}
  - Average retroactive days: {avg_retro_days}
  - Most common reason: {common_reason}

  {if high_retro_rate}
  📊 GROUP PATTERN ALERT:
  - This employer has {retro_rate}% retroactive enrollment rate
  - Industry average: {industry_avg}%
  - Recommendation: Schedule group training on timely enrollment procedures
  {endif}

DEPENDENT IMPACT:
  {if has_dependents}
  This transaction includes {dependent_count} dependents:
  {for each dependent}
  - {dependent_name}: {dependent_relationship}, Age {dependent_age}
  {endfor}

  ⚠️ All dependents have same retroactive effective date
  - Magnifies claims impact
  - Magnifies premium adjustment
  {endif}

NEXT STEPS:
  1. IMMEDIATE - Document reason for retroactive enrollment:
     □ Review maintenance reason code: {reason_code}
     □ Verify QLF documentation on file (if applicable)
     □ Confirm employer authorization

  2. FINANCIAL ANALYSIS:
     □ Run claims search for member (done above)
     □ Calculate premium adjustment: ${premium_adjustment}
     □ Estimate total financial impact: ${net_impact}
     □ Document all amounts in enrollment system

  3. COMPLIANCE VERIFICATION:
     {if compliance_review_required}
     □ Submit to compliance team for review
     □ Wait for compliance approval before proceeding
     {else}
     □ Verify within contract and regulatory limits
     {endif}

  4. APPROVAL WORKFLOW:
     {if high_risk}
     □ Enrollment Specialist review
     □ Enrollment Manager approval required
     □ Compliance approval required
     {else}
     □ Enrollment Specialist review
     {if medium_risk}
     □ Enrollment Manager approval recommended
     {endif}
     {endif}

  5. IF APPROVED:
     □ Process enrollment with effective date {effective_date}
     □ Generate member ID card with correct effective date
     □ Route affected claims for reprocessing
     □ Send retro premium bill to employer
     □ Generate member welcome letter noting retro coverage

  6. IF DENIED:
     □ Reject transaction
     □ Notify employer with specific reason
     □ Offer alternative: Standard effective date {alternative_date}

DECISION TREE:
  → If QLF documented AND within 30 days → Likely approve
  → If QLF documented AND 30-90 days → Manager approval
  → If QLF documented AND >90 days → Compliance + Manager approval
  → If no QLF and administrative error → Case-by-case review
  → If exceeds contract limits → Likely deny OR exception request

REVIEW CHECKLISTS: Checklist 4 + Checklist 5
ESTIMATED TIME: 45-60 minutes (due to claims research)
ESCALATE IF:
  - Claims impact > $10,000
  - Retroactive period > 180 days
  - No clear reason for retroactive enrollment

APPROVAL SIGNATURES REQUIRED:
  Enrollment Specialist: _________________ Date: _____
  {if manager_approval_required}
  Enrollment Manager: _________________ Date: _____
  {endif}
  {if compliance_approval_required}
  Compliance Officer: _________________ Date: _____
  {endif}

LEARN MORE:
  → Retroactive enrollment policy: [link]
  → HIPAA special enrollment rules: [link]
  → Claims reprocessing procedures: [link]
  → Premium adjustment guide: [link]
```

#### B-ELG-001: Dependent Age Limit Exceeded

```markdown
⚠️ Dependent Exceeds Age Limit

QUICK DIAGNOSIS:
  Dependent: {dependent_name} ({member_id})
  Date of Birth: {dob}
  Current Age: {age} years, {months} months
  Relationship: {relationship}
  Subscriber: {subscriber_name}

PLAN RULES:
  Plan: {plan_name}
  Standard dependent age limit: {age_limit} years
  Exceptions allowed: {exceptions_allowed}

AGE CALCULATION:
  Date of Birth: {dob}
  {if effective_date}
  Age on effective date ({effective_date}): {age_on_effective} years
  {else}
  Current age: {age} years, {months} months
  {endif}

  {if approaching_limit}
  📅 Age-out date: {ageout_date} ({days_until_ageout} days from now)
  {endif}

POSSIBLE EXCEPTIONS:
  1. ✓ Full-time student status
     - Documentation required: Enrollment verification
     - Typical extension: Until age {student_age_limit}
     - Verification frequency: {verification_frequency}
     {if student_status_claimed}
     - Status on file: {student_status}
     - Last verified: {student_verification_date}
     {endif}

  2. ⚠️ Disabled dependent
     - Documentation required: Physician certification
     - Extension: Indefinite while disabled
     - Requirements:
       • Disability onset before age {age_limit}
       • Financially dependent on subscriber
       • Incapable of self-support
     {if disabled_status_claimed}
     - Status on file: {disabled_status}
     - Certification date: {certification_date}
     - Next recertification: {recertification_date}
     {endif}

  3. 🔍 State mandate extension
     {if state_mandate}
     - State: {state}
     - Extended age limit: {state_age_limit}
     - Requirements: {state_requirements}
     {endif}

DOCUMENTATION STATUS:
  {if exception_docs_on_file}
  ✓ Exception documentation on file:
  - Type: {exception_type}
  - Documentation date: {doc_date}
  - Verified by: {verified_by}
  - Status: {doc_status}

  {if expiring_soon}
  ⚠️ Documentation expires in {days_to_expiration} days
  - Action: Request updated documentation
  {endif}

  {else}
  ❌ No exception documentation on file
  - Action: Request documentation from subscriber
  - Pend enrollment until received
  {endif}

SIMILAR CASES:
  You've reviewed {similar_count} age limit exceptions this year:
  - {student_count} approved with student verification ({student_pct}%)
  - {disabled_count} approved with disability certification ({disabled_pct}%)
  - {denied_count} denied - no valid exception ({denied_pct}%)

SUBSCRIBER HISTORY:
  {subscriber_name} dependent history:
  - Total dependents: {total_dependents}
  - Previous age limit extensions: {previous_extensions}
  {if previous_extensions > 0}
  - Previous extension type: {previous_extension_type}
  - Pattern: {pattern_description}
  {endif}

TIMING CONSIDERATIONS:
  {if new_enrollment}
  - This is a NEW enrollment
  - More scrutiny required for over-age new dependents
  - Verify: Why is over-age dependent newly enrolling?
  {else if existing_dependent}
  - This is an EXISTING dependent
  - {if had_previous_exception}
  - Previously approved exception: {previous_exception_type}
  - Verify: Is exception still valid?
  {endif}
  {endif}

FINANCIAL IMPACT:
  Coverage cost (monthly): ${monthly_premium}
  Annual cost: ${annual_premium}
  {if claims_history}
  Historical utilization: ${annual_claims_average}/year average
  {endif}

NEXT STEPS:
  {if exception_valid}
  ✓ Exception documentation valid and current
  1. Approve dependent enrollment
  2. Note exception type in enrollment system
  3. Set reminder for next verification date: {next_verification}

  {else if exception_docs_submitted}
  📄 Exception documentation submitted - REVIEW REQUIRED
  1. Review submitted documentation:
     {if student_claimed}
     → Verify enrollment verification is official and current
     → Confirm full-time status (typically 12+ credits)
     → Check school is accredited institution
     {endif}
     {if disabled_claimed}
     → Verify physician certification is complete
     → Confirm disability onset date before age {age_limit}
     → Check financial dependency documentation
     {endif}
  2. If documentation adequate → Approve with exception
     If documentation inadequate → Request additional info
     If no valid exception → Deny dependent enrollment

  {else}
  ❌ No exception documentation on file
  1. Pend enrollment pending documentation
  2. Send correspondence to subscriber:
     "Your dependent {dependent_name} is age {age}, which exceeds
      our plan's age {age_limit} limit. To continue coverage, please provide:
      {required_documentation_list}"
  3. Set follow-up date: {followup_date}
  4. If documentation received → Review and process
     If no response by deadline → Deny enrollment
  {endif}

CORRESPONDENCE TEMPLATE:
  {if pend_for_docs}
  "Dear {subscriber_name},

  We received your enrollment for {dependent_name}, who is currently age {age}.

  Our plan's dependent age limit is {age_limit}. However, we can extend coverage
  if your dependent meets one of these exceptions:

  • Full-time student (provide enrollment verification)
  • Disabled and unable to support themselves (provide physician certification)

  Please submit documentation within 30 days to:
  [Enrollment Department contact information]

  If we don't receive documentation, coverage will not be activated."
  {endif}

DECISION CRITERIA:
  APPROVE IF:
  → Age under {age_limit}, OR
  → Valid student verification on file and attending full-time, OR
  → Valid disability certification on file with onset before age {age_limit}, OR
  → State mandate requires coverage and requirements met

  DENY IF:
  → Age exceeds {age_limit} AND
  → No exception applies OR
  → Exception documentation not provided OR
  → Exception documentation is inadequate/expired

REVIEW CHECKLIST: Checklist 6 (Dependent Eligibility Review)
ESTIMATED TIME: 20-30 minutes (if docs on file), 5 minutes + waiting (if pend for docs)
ESCALATE IF:
  - Unusual circumstances (e.g., age 30+ claimed as student)
  - Disability certification appears questionable
  - State mandate interpretation unclear

QUALITY ASSURANCE:
  {if approved_with_exception}
  - Manager review recommended for first-time exceptions
  - Random audit: {audit_percentage}% of age exceptions reviewed quarterly
  {endif}

PREVENTION:
  - Set system reminder {reminder_months} months before dependent ages out
  - Proactive outreach to subscriber to gather documentation
  - Annual recertification for ongoing exceptions

LEARN MORE:
  → Student verification requirements: [link]
  → Disability certification guide: [link]
  → State-specific age limit mandates: [link]
  → Age-out communication templates: [link]
```

### Eligibility Errors

#### E-270-001: Incomplete Eligibility Inquiry

```markdown
❌ Incomplete Eligibility Inquiry

QUICK DIAGNOSIS:
  Transaction: 270 Eligibility Inquiry
  Trace Number: {trn}
  Information Receiver: {provider_name}
  Subscriber: {subscriber_name} (ID: {member_id})
  Missing Elements: {missing_elements}

WHAT'S WRONG:
  {if missing_subscriber_id}
  - Member ID (REF*0F or REF*1L) is missing
  - Cannot look up member without unique identifier
  {endif}

  {if missing_subscriber_name}
  - Subscriber name (NM1*IL) is incomplete or missing
  - Name is required for member matching
  {endif}

  {if missing_service_type}
  - No EQ segment or service type specified
  - Inquiry scope is unclear - will return general eligibility only
  {endif}

POSSIBLE CAUSES:
  1. ✓ Most likely: Data mapping error in provider system (60% confidence)
     - Pattern: {provider_name} has {error_rate}% incomplete inquiry rate
     - Common issue: Member ID not populated from practice management system
     - Action: Review trading partner configuration and data mapping

  2. ⚠️ Possible: Manual inquiry with incomplete data entry (25%)
     - Pattern: Occurs during {time_pattern}
     - Check: Is this a manual real-time inquiry vs. batch?
     - Action: Train staff on required fields for eligibility checks

  3. 🔍 Consider: System integration issue (15%)
     - Pattern: Multiple inquiries from this provider missing same fields
     - Check: Recent changes to provider's practice management system?
     - Action: Contact provider to investigate system updates

SIMILAR CASES:
  You've processed {similar_count} incomplete inquiries this month:
  - {accepted_count} processed with available data ({accepted_pct}%)
  - {rejected_count} rejected - insufficient information ({rejected_pct}%)
  - Top resolution: {top_resolution}

{if trading_partner_pattern}
TRADING PARTNER PATTERN:
  ⚠️ {provider_name} has high rate of incomplete inquiries
  - Exception rate: {tp_exception_rate}% (average: {avg_exception_rate}%)
  - Root cause: {common_root_cause}
  - Recommendation: {recommendation}
{endif}

NEXT STEPS:
  {if member_id_missing}
  1. Reject 270 inquiry - cannot process without member identifier
  2. Generate 271 response with AAA*N*72 (Member ID not found/invalid)
  3. Send correspondence to provider:
     "Member ID is required for eligibility verification. Please resubmit
      with complete member identification (REF*0F or REF*1L segment)."
  4. If recurring issue → Schedule training with provider

  {else if name_missing_but_id_present}
  1. Attempt lookup using member ID only
  2. If member found → Process inquiry with warning
     If member not found → Request additional identifiers
  3. Log warning for quality review

  {else if service_type_missing}
  1. Process inquiry with general eligibility (EQ01=30)
  2. Return active/inactive status and coverage dates
  3. Note: Specific benefit details not provided without service type
  4. Log informational message - not an error
  {endif}

BUSINESS IMPACT:
  Inquiry turnaround: {estimated_delay}
  Provider satisfaction: {impact_level}
  Member impact: {member_impact_description}

REVIEW CHECKLIST: Checklist 7 (Eligibility Inquiry), Step 3
ESTIMATED TIME: 5-10 minutes
ESCALATE IF: Pattern of incomplete inquiries from this provider

PREVENTION:
  {if recurring_issue}
  - This provider has incomplete inquiry issue on {issue_percentage}% of submissions
  - Recommendation: Proactive outreach and training
  - Action: Add to provider education list
  {endif}

RESOURCES:
  → 270 transaction requirements: [link]
  → Trading partner setup guide: [link]
  → Provider communication templates: [link]
```

#### E-271-002: Eligibility Response Missing Benefit Data

```markdown
⚠️ Eligibility Response Missing Benefit Data

QUICK DIAGNOSIS:
  Transaction: 271 Eligibility Response
  Trace Number: {trn}
  Member: {member_name} (ID: {member_id})
  Service Type Requested: {requested_service_type}
  Response Status: {response_status}

WHAT'S WRONG:
  - 271 response generated but contains no EB segments
  - OR EB segments present but missing critical benefit information
  - Response does not provide actionable eligibility data

CURRENT RESPONSE:
  {if no_eb_segments}
  ❌ No EB segments included in response
  - 271 response must include at least one EB segment
  {endif}

  {if missing_coverage_dates}
  ⚠️ EB segments present but missing coverage dates
  - No DTP*346 (effective date) or DTP*347 (term date)
  - Provider cannot determine coverage period
  {endif}

  {if missing_eligibility_status}
  ⚠️ EB segments missing eligibility status (EB01)
  - Required: Active (1), Inactive (6), COBRA (7), etc.
  {endif}

POSSIBLE CAUSES:
  1. ✓ Most likely: Member found but benefit data incomplete in system (55% confidence)
     - Based on {similar_cases} similar cases
     - Common scenario: Recently enrolled member, benefits not fully loaded
     - Action: Manual benefit lookup and update response

  2. ⚠️ Possible: System error generating 271 response (30%)
     - Pattern: Response template incomplete or data mapping issue
     - Check: Are other responses from same batch also incomplete?
     - Action: Investigate response generation logic

  3. 🔍 Consider: Service type not covered by member's plan (15%)
     - Inquiry: Service type {requested_service_type}
     - Check: Does member's plan cover this service?
     - Action: Return EB with status 6 (Inactive) for uncovered services

MEMBER LOOKUP RESULTS:
  Member Status: {member_status}
  Plan: {plan_name}
  Effective Date: {effective_date}
  {if term_date}Term Date: {term_date}{endif}
  Coverage: {coverage_description}

{if benefit_data_available}
AVAILABLE BENEFIT DATA:
  ✓ Member eligibility confirmed
  ✓ Coverage dates: {coverage_dates}
  ✓ Plan type: {plan_type}
  {if benefits_loaded}
  ✓ Benefits loaded in system
  {else}
  ❌ Benefits NOT fully loaded - manual lookup required
  {endif}
{endif}

NEXT STEPS:
  {if member_active_and_benefits_available}
  1. Regenerate 271 response with complete benefit information:
     → EB01: Eligibility status (1=Active)
     → EB03: Service type matching inquiry
     → DTP*346: Coverage effective date
     → DTP*347: Coverage term date (if applicable)
     → EB06: Coverage level (IND, FAM, etc.)
  2. Include benefit amounts if requested:
     → Deductible (EB with time period qualifier)
     → Copayment amounts
     → Out-of-pocket maximum
  3. Validate response completeness before sending

  {else if member_active_but_benefits_not_loaded}
  1. MANUAL REVIEW: Look up benefits in plan documents
  2. Generate 271 with available data:
     → EB01: 1 (Active coverage)
     → DTP*346/347: Coverage dates
     → MSG: "Contact customer service for specific benefit details"
  3. Flag member record for benefit data completion

  {else if member_inactive}
  1. Generate 271 with inactive status:
     → EB01: 6 (Inactive)
     → DTP*347: Termination date
     → MSG: Coverage terminated on {term_date}
  2. Process normally - not an error
  {endif}

QUALITY CHECK:
  Before sending 271, verify:
  □ At least one EB segment present
  □ EB01 (eligibility status) is populated
  □ Coverage dates (DTP*346/347) included if member active
  □ Service type (EB03) matches inquiry if specific request
  □ Response is actionable for provider

REVIEW CHECKLIST: Checklist 7 (Eligibility Response), Step 7
ESTIMATED TIME: 15-20 minutes (manual benefit lookup)
ESCALATE IF:
  - Benefits system unavailable
  - Member record corrupted or incomplete
  - Multiple responses missing benefit data

PREVENTION:
  - Ensure benefit data loaded within 24 hours of enrollment
  - Validate 271 response templates include all required EB elements
  - Monitor benefit data completeness by plan

RESOURCES:
  → 271 response requirements: [link]
  → Benefit lookup procedures: [link]
  → EB segment usage guide: [link]
```

#### M-SUB-002: Subscriber Not Found

```markdown
❌ Subscriber Not Found

QUICK DIAGNOSIS:
  Transaction: 270 Eligibility Inquiry
  Trace Number: {trn}
  Submitted Member ID: {submitted_member_id}
  Submitted Name: {submitted_name}
  Submitted DOB: {submitted_dob}
  Information Receiver: {provider_name}

SEARCH RESULTS:
  Member ID search: {member_id_result}
  Name search: {name_search_result}
  Combined search: {combined_result}

POSSIBLE CAUSES:
  1. ✓ Most likely: Member ID typo or format error (45% confidence)
     - Based on {similar_count} similar "not found" cases this month
     - {typo_pattern_pct}% were typos or transposed digits
     - Similar IDs in system:
       {if similar_ids}
       • {similar_id_1} - {member_name_1} (Levenshtein distance: {distance_1})
       • {similar_id_2} - {member_name_2} (Levenshtein distance: {distance_2})
       {endif}

  2. ⚠️ Possible: Member not yet enrolled or enrollment pending (30%)
     - Pattern: Inquiry within 48 hours of enrollment effective date
     - Check: Search enrollment queue for pending transactions
     - Action: If found in queue, return AAA*N*72 with "enrollment pending" message

  3. 🔍 Consider: Member enrolled under different plan/group (15%)
     - Name matches found in other groups:
       {if name_matches_other_groups}
       • {match_name_1}: Group {match_group_1}, ID {match_id_1}
       {endif}
     - Action: Confirm provider is inquiring about correct plan

  4. 💡 Consider: Member ID format mismatch (10%)
     - Your system format: {your_format}
     - Submitted format: {submitted_format}
     - Example: Leading zeros, dashes, spaces
     - Action: Try alternate ID formats

FUZZY MATCHING RESULTS:
  {if fuzzy_matches}
  🔍 Possible matches found with similar data:

  → {match_name_1}
    Member ID: {match_id_1}
    DOB: {match_dob_1}
    Similarity Score: {similarity_score_1}%
    Status: {match_status_1}
    Plan: {match_plan_1}
    Confidence: {match_confidence_1}

  {if high_confidence_match}
  💡 HIGH CONFIDENCE: This is likely the intended member
     - Name similarity: {name_similarity}%
     - DOB match: {dob_match}
     - Recommendation: Confirm with provider and process inquiry
  {endif}
  {else}
  ❌ No similar members found in member database
  - Member genuinely not in system
  {endif}

PROVIDER PATTERN:
  {provider_name} inquiry accuracy:
  - Total inquiries: {total_inquiry_count}
  - "Not found" rate: {not_found_rate}%
  - Average not found rate: {avg_not_found_rate}%
  {if high_not_found_rate}
  - ⚠️ Above average "not found" rate - may indicate data quality issue
  {endif}

NEXT STEPS:
  {if high_confidence_match}
  1. PEND inquiry for manual verification
  2. Generate correspondence to provider:
     "Member ID {submitted_member_id} not found. Did you mean
      {match_id_1} for {match_name_1}, DOB {match_dob_1}?"
  3. If provider confirms → Process inquiry with correct member ID
     If provider denies → Proceed with "not found" response

  {else if name_match_different_group}
  1. Generate 271 response with AAA*N*72 (Member not found)
  2. Include MSG segment: "Member found in different group/plan"
  3. Send correspondence: "Please verify member's group number and plan"

  {else if pending_enrollment}
  1. Generate 271 with AAA*N*72
  2. Include MSG: "Enrollment pending - effective {effective_date}"
  3. Recommend provider resubmit inquiry after {effective_date}

  {else}
  1. Generate 271 response with AAA*N*72 (Member not found)
  2. AAA segment:
     AAA*N**72~  (Member ID not found or invalid)
  3. Include MSG: "Member not found in our system. Please verify
     member ID and plan information with member."
  4. Process normally - valid "not found" response
  {endif}

AUTO-FIX SUGGESTION:
  {if high_confidence_match}
  ⚠️ Auto-correction available but requires approval:
  - Change member ID from {submitted_member_id} to {suggested_member_id}
  - Confidence: {confidence}%
  - Approve auto-fix? [Y/N] (Requires supervisor approval)
  {endif}

BUSINESS IMPACT:
  Provider impact: {provider_impact}
  Member impact: {member_impact}
  {if urgent}
  ⚠️ NOTE: Provider may be attempting to verify eligibility before service
  {endif}

REVIEW CHECKLIST: Checklist 7 (Eligibility Inquiry), Step 5
ESTIMATED TIME: 10-15 minutes
ESCALATE IF:
  - Multiple "not found" inquiries from same provider
  - Pattern suggests enrollment system issue

PREVENTION:
  {if recurring_provider_issue}
  - This provider has "not found" issue on {issue_percentage}% of inquiries
  - Recommendation: Training on member ID verification
  - Action: Schedule provider education session
  {endif}

RESOURCES:
  → Member lookup procedures: [link]
  → AAA rejection code guide: [link]
  → Provider inquiry best practices: [link]
```

### Claim Status Errors

#### C-276-003: Claim Not Found

```markdown
❌ Claim Not Found

QUICK DIAGNOSIS:
  Transaction: 276 Claim Status Inquiry
  Trace Number: {trn}
  Patient Control Number: {patient_control_number}
  Payer Claim Number: {payer_claim_number}
  Service Date: {service_date}
  Provider: {provider_name} (NPI: {provider_npi})
  Subscriber: {subscriber_name} (ID: {member_id})

SEARCH CRITERIA USED:
  {if patient_control_number}✓ Patient Control Number: {patient_control_number}{endif}
  {if payer_claim_number}✓ Payer Claim Number: {payer_claim_number}{endif}
  {if service_date}✓ Service Date: {service_date}{endif}
  {if provider_npi}✓ Provider NPI: {provider_npi}{endif}
  {if member_id}✓ Member ID: {member_id}{endif}

SEARCH RESULTS:
  Claim database search: No matches found
  Pending claims queue: {pending_queue_result}
  Archive database: {archive_result}

POSSIBLE CAUSES:
  1. ✓ Most likely: Claim recently submitted and not yet in system (40% confidence)
     - Based on {recent_submission_count} cases this month
     - Service date: {service_date}
     - Days since service: {days_since_service}
     - {if days_since_service < 5}
       Pattern: Claims typically enter system 2-7 days after submission
       {endif}

  2. ⚠️ Possible: Claim identifier mismatch (30%)
     - Provider using different claim number than system assigned
     - Common issue: Paper vs. electronic claim number confusion
     - Action: Search by alternate identifiers (member ID + service date + provider)

  3. 🔍 Consider: Claim submitted to wrong payer (15%)
     - Member may have multiple coverages
     - Check: Is this provider inquiring about correct payer?
     - Action: Verify member's COB status

  4. 💡 Consider: Claim never received or rejected at intake (15%)
     - Check intake rejection logs for this provider
     - Pattern: {intake_rejection_rate}% of this provider's claims rejected at intake
     - Action: Search intake rejection logs

ALTERNATE SEARCH RESULTS:
  {if alternate_matches}
  🔍 Possible matches found with similar data:

  → Claim {alternate_claim_id_1}
    Service Date: {alternate_service_date_1}
    Member: {alternate_member_1}
    Provider: {alternate_provider_1}
    Amount: ${alternate_amount_1}
    Status: {alternate_status_1}
    Match Confidence: {alternate_confidence_1}%

  {if high_confidence_match}
  💡 HIGH CONFIDENCE: This is likely the intended claim
  {endif}
  {else}
  ❌ No similar claims found for this member/provider/date combination
  {endif}

CLAIM AGE ANALYSIS:
  Service Date: {service_date}
  Days Since Service: {days_since_service}

  {if days_since_service < 5}
  🟢 RECENT CLAIM (<5 days)
  - Likely still in intake/scanning process
  - Expected entry to system: {expected_entry_date}
  - Recommendation: Return STC*A1 (Acknowledgement received)

  {else if days_since_service < 30}
  🟡 STANDARD TIMEFRAME (5-30 days)
  - Should be in claims system if submitted
  - Check: Intake logs, pending queue, recent batches

  {else if days_since_service < 180}
  🟡 OLDER CLAIM (30-180 days)
  - Should definitely be processed or have status
  - If truly not found: Likely submitted to wrong payer or never received

  {else}
  🔴 ARCHIVE TIMEFRAME (>180 days)
  - Check archive database
  - Extended search time required
  {endif}

INTAKE LOG SEARCH:
  {if intake_logs_available}
  Searching intake logs for {provider_name}...

  {if found_in_intake_rejected}
  ⚠️ FOUND: Claim rejected at intake
  - Rejection Date: {rejection_date}
  - Rejection Reason: {rejection_reason}
  - Status: Never entered claims system
  - Action: Return STC*E0 with rejection reason
  {else}
  ✓ No intake rejections found for this claim
  {endif}
  {endif}

NEXT STEPS:
  {if days_since_service < 5}
  1. Generate 277 response with "claim in process" status:
     STC*A1**20240315~  (Received - in process)
  2. Include MSG: "Claim received and in initial processing.
     Please allow 5-7 business days for full processing."
  3. Set expected completion date: {expected_date}
  4. Process normally - not an error

  {else if found_in_intake_rejected}
  1. Generate 277 with rejection status:
     STC*E0*{rejection_code}*{rejection_date}~
  2. Include explanation of rejection in MSG segment
  3. Recommend provider correct issue and resubmit

  {else if high_confidence_alternate_match}
  1. PEND inquiry for manual verification
  2. Generate correspondence to provider:
     "Claim {patient_control_number} not found. Did you mean
      Claim {alternate_claim_id_1} for DOS {alternate_service_date_1}?"
  3. If provider confirms → Return status of alternate claim
     If provider denies → Return "not found" response

  {else if archive_search_needed}
  1. Initiate archive database search (may take 24-48 hours)
  2. Generate interim 277 response:
     STC*A7*{inquiry_date}~  (Claim not on file)
     MSG: "Searching historical records - response within 48 hours"
  3. Follow up with complete status when archive search completes

  {else}
  1. Generate 277 response with "not found" status:
     STC*A7*{inquiry_date}~  (Claim not on file)
  2. Include MSG: "No record of this claim in our system. Possible reasons:
     - Claim not yet received
     - Submitted to different payer
     - Claim information does not match our records
     Please verify and resubmit if needed."
  3. Suggest provider verify:
     → Member's current insurance information
     → Claim submission confirmation
     → Correct payer identification
  {endif}

COMPREHENSIVE SEARCH CHECKLIST:
  □ Active claims database (done)
  □ Pending/suspense claims queue: {pending_result}
  □ Intake logs and rejections: {intake_result}
  □ Duplicate claim holds: {duplicate_result}
  □ Archive database (>180 days): {archive_result}
  □ Alternate identifiers (member+DOS): {alternate_result}
  □ Provider's recent claim history: {provider_history_result}

REVIEW CHECKLIST: Checklist 8 (Claim Status), Step 5
ESTIMATED TIME: 20-30 minutes (comprehensive search)
ESCALATE IF:
  - Multiple "not found" inquiries for same provider
  - Pattern suggests claims submission system issue

PREVENTION:
  - Implement claim submission confirmation for providers
  - Educate providers on claim tracking procedures
  - Monitor claim intake rejection rates by provider

RESOURCES:
  → Claim search procedures: [link]
  → STC status code guide: [link]
  → Provider claim submission guide: [link]
```

#### C-277-004: Conflicting Status Information

```markdown
⚠️ Conflicting Status Information

QUICK DIAGNOSIS:
  Transaction: 277 Claim Status Response being generated
  Claim ID: {claim_id}
  Payer Claim Number: {payer_claim_number}
  Service Date: {service_date}
  Member: {member_name} (ID: {member_id})
  Provider: {provider_name}

STATUS CONFLICTS DETECTED:
  {if entity_claim_conflict}
  ❌ Entity-level vs. Claim-level status conflict
  - Entity status: {entity_status}
  - Claim status: {claim_status}
  - Conflict: {conflict_description}
  {endif}

  {if claim_line_conflict}
  ❌ Claim-level vs. Service line-level status conflict
  - Claim status: {claim_status_code}
  - Service lines:
    • Line 1: {line_1_status} (conflicts)
    • Line 2: {line_2_status}
  {endif}

  {if payment_status_conflict}
  ❌ Status code vs. Payment amount conflict
  - Status: {status_code} ({status_description})
  - Payment amount: ${payment_amount}
  - Conflict: {payment_conflict_description}
  {endif}

CLAIM DETAILS:
  Claim Status in System: {system_status}
  Claim Total Charge: ${total_charge}
  Payment Amount: ${payment_amount}
  Patient Responsibility: ${patient_responsibility}
  Adjudication Date: {adjudication_date}
  Service Lines: {service_line_count}

DETAILED STATUS BREAKDOWN:
  System Status: {detailed_system_status}

  Service Line Status:
  {for each line}
  Line {line_number}: {line_status}
    Procedure: {procedure_code}
    Charge: ${line_charge}
    Payment: ${line_payment}
    Status: {line_status_description}
  {endfor}

POSSIBLE CAUSES:
  1. ✓ Most likely: Partial claim adjudication (50% confidence)
     - Based on {partial_adjudication_count} similar cases
     - Some lines finalized, others still pending
     - Common with: Multiple procedure codes, clinical review needed
     - Action: Separate status by service line in 277 response

  2. ⚠️ Possible: System data integrity issue (30%)
     - Status fields not synchronized across tables
     - Pattern: Recent system update or data migration?
     - Check: Other claims showing similar inconsistencies?
     - Action: ESCALATE to IT for data investigation

  3. 🔍 Consider: Manual override not fully processed (20%)
     - Claim may have been manually adjusted
     - Override applied to claim level but not lines, or vice versa
     - Check: Audit log for recent manual changes
     - Action: Verify intended status and update inconsistent records

CONSISTENCY CHECKS:
  {if status_finalized_but_no_payment}
  ⚠️ INCONSISTENCY: Status shows "Finalized/Paid" (F1) but payment = $0
  - Expected: F1 status should have payment > 0
  - OR: Status should be F2 (Denied) if payment = 0
  - Action: Review claim adjudication results
  {endif}

  {if status_denied_but_has_payment}
  ⚠️ INCONSISTENCY: Status shows "Denied" (F2) but payment > 0
  - Denied claims should not have payment
  - Possible: Partial payment or payment on different line
  - Action: Verify claim-level vs. line-level adjudication
  {endif}

  {if status_pending_but_has_final_amounts}
  ⚠️ INCONSISTENCY: Status shows "Pending" (P-codes) but has final payment
  - Pending claims should not have final adjudication
  - Possible: Status not updated after adjudication
  - Action: Update status to finalized (F-codes)
  {endif}

ADJUDICATION HISTORY:
  {if audit_log_available}
  Recent adjudication activity:
  - {activity_1_date}: {activity_1_description}
  - {activity_2_date}: {activity_2_description}

  {if recent_manual_change}
  🔍 Manual change detected:
  - Date: {manual_change_date}
  - User: {user_name}
  - Change: {change_description}
  - Possible cause of inconsistency
  {endif}
  {endif}

NEXT STEPS:
  {if partial_adjudication_identified}
  1. Generate 277 with service line-level status detail:
     → Claim-level STC showing overall status (P-code pending)
     → Service line-level STC for each line:
       • Finalized lines: F1 (Paid) or F2 (Denied)
       • Pending lines: Appropriate P-code with reason
  2. Include MSG explaining partial adjudication:
     "Claim partially processed. Lines 1-3 finalized, Line 4 pending
      additional review. Expected completion: {expected_date}"
  3. Process as normal - not an error, just complex claim

  {else if data_integrity_issue_suspected}
  1. DO NOT generate 277 response yet
  2. ESCALATE to Claims System Administrator:
     - Claim ID: {claim_id}
     - Issue: Status field inconsistencies
     - Impact: Cannot generate accurate status response
  3. Manual review required:
     → Verify correct claim status from adjudication system
     → Update inconsistent fields
     → Re-run consistency checks
  4. Generate 277 after data corrected

  {else if manual_override_needs_completion}
  1. Review manual adjustment audit log
  2. Determine intended final status
  3. Complete status update across all affected fields:
     → Claim header status
     → Service line statuses
     → Payment amounts
     → Adjustment codes (CAS segments)
  4. Verify consistency
  5. Generate 277 with corrected status

  {else}
  1. HUMAN REVIEW REQUIRED
  2. Cannot determine root cause of status conflict
  3. Checklist for reviewer:
     □ Review claim in adjudication system
     □ Verify correct status and payment amounts
     □ Check for pending actions or holds
     □ Determine appropriate STC codes for 277
     □ Document resolution for future reference
  {endif}

RESOLUTION CHECKLIST:
  □ Identify source of status conflict
  □ Determine correct/intended status for claim and lines
  □ Update any incorrect status fields in system
  □ Verify payment amounts align with status
  □ Generate accurate 277 response
  □ Document issue and resolution
  □ If systemic issue → IT escalation for fix

REVIEW CHECKLIST: Checklist 8 (Claim Status), Step 8
ESTIMATED TIME: 30-45 minutes
ESCALATE IF:
  - Multiple claims showing similar inconsistencies
  - Data integrity issue suspected
  - Unable to determine correct status after review

QUALITY ASSURANCE:
  Before sending 277, verify:
  □ Status codes are consistent (entity → claim → line)
  □ Payment amounts align with status (F1 has payment, F2 has $0)
  □ Pending status (P-codes) don't have final payment amounts
  □ Finalized status (F-codes) include all required payment details
  □ CAS adjustments explain denials or payment reductions

PREVENTION:
  - Implement automated consistency checks before 277 generation
  - Regular data integrity audits on claims status fields
  - Training for manual claim adjustment procedures
  - System validation rules to prevent inconsistent status updates

RESOURCES:
  → STC status code guide: [link]
  → Claim status consistency rules: [link]
  → Data integrity procedures: [link]
```

#### I-EQ-001: Invalid Service Type Code

```markdown
⚠️ Invalid Service Type Code in Eligibility Inquiry

QUICK DIAGNOSIS:
  Transaction: 270 Eligibility Inquiry
  Trace Number: {trn}
  Submitted Service Type: {submitted_service_type}
  Information Receiver: {provider_name}
  Subscriber: {subscriber_name} (ID: {member_id})

VALIDATION RESULTS:
  ❌ Service type code validation: FAILED
  - Submitted code: {submitted_service_type}
  - Valid codes: 01-99, A1-A9 (per X12 specifications)
  - Error: {validation_error}

POSSIBLE CAUSES:
  1. ✓ Most likely: Typo in service type code (60% confidence)
     - Pattern: {typo_count} similar errors this month
     - Similar valid codes:
       {if similar_codes}
       • {similar_code_1} - {description_1}
       • {similar_code_2} - {description_2}
       {endif}

  2. ⚠️ Possible: Using incorrect code set (25%)
     - Provider may be using older version of code set
     - Or mixing up eligibility codes with other code sets
     - Action: Educate on current X12 service type codes

  3. 🔍 Consider: System mapping error (15%)
     - Provider system not mapping correctly to X12 codes
     - Check: Are multiple inquiries from this provider showing same issue?
     - Action: Review trading partner interface configuration

COMMON SERVICE TYPE CODES (for reference):
  • 30 - Health Benefit Plan Coverage (general eligibility)
  • 47 - Deductible
  • 48 - Out of Pocket Maximum
  • 60 - Co-payment
  • 88 - Pharmacy
  • 98 - Professional (Physician Visit)
  • AL - Vision
  • F6 - Maternity
  • UC - Urgent Care

{if provider_pattern}
PROVIDER PATTERN:
  {provider_name} service type code usage:
  - Total inquiries: {total_inquiry_count}
  - Invalid code rate: {invalid_code_rate}%
  - Most common codes used: {common_codes}
  {if high_error_rate}
  - ⚠️ Higher than average error rate suggests training needed
  {endif}
{endif}

NEXT STEPS:
  {if can_infer_intent}
  1. Infer likely intent based on provider specialty and context:
     {if_specialist} → Assume 98 (Professional Physician Visit)
     {if_pharmacy} → Assume 88 (Pharmacy)
     {if_general} → Assume 30 (General Health Coverage)
  2. Process inquiry with inferred service type
  3. Log warning for quality review
  4. Include note in response about assumed service type

  {else}
  1. Generate 271 response with AAA*N*64 (Unsupported inquiry type)
  2. AAA segment:
     AAA*N**64~  (Request type not supported)
  3. Include MSG: "Invalid service type code '{submitted_service_type}'.
     Please use valid X12 service type codes (01-99, A1-A9)."
  4. Send correspondence with valid code reference

  OR (if payer policy allows):

  1. Process inquiry as general eligibility (service type 30)
  2. Return basic active/inactive status and coverage dates
  3. Include MSG: "Invalid service type provided - returning general
     eligibility. For specific benefits, use valid service type codes."
  {endif}

CORRESPONDENCE TEMPLATE:
  "Dear {provider_name},

  We received your eligibility inquiry with service type '{submitted_service_type}'.
  This is not a valid X12 service type code.

  Valid service type codes include:
  - 30: General health coverage
  - 47: Deductible information
  - 60: Copayment information
  - 88: Pharmacy benefits
  - 98: Professional physician visit

  Please resubmit with a valid service type code for specific benefit information.

  Reference: X12 270/271 Service Type Code List"

REVIEW CHECKLIST: Checklist 7 (Eligibility Inquiry), Step 4
ESTIMATED TIME: 5 minutes
ESCALATE IF: Multiple providers showing same invalid code

PREVENTION:
  {if recurring_issue}
  - This provider has invalid code issue on {issue_percentage}% of inquiries
  - Recommendation: Provide service type code reference sheet
  - Action: Include in next provider communication
  {endif}

RESOURCES:
  → X12 service type code list: [link]
  → 270/271 implementation guide: [link]
  → Provider education materials: [link]
```

## Context-Gathering Patterns

When generating intelligent error messages, gather these contextual elements:

### Transaction Context
- Transaction type and identifiers
- Dollar amounts and financial impact
- Dates and timing (approaching deadlines?)
- Related segments and data elements

### Historical Context
- How many times has this error occurred?
- What was the resolution last time?
- Is there a pattern (time of month, day of week, specific trading partner)?
- How do humans typically resolve this?

### Relationship Context
- Trading partner history and patterns
- Provider history and quality metrics
- Member utilization patterns
- Group/employer patterns

### Business Context
- Financial impact (high-dollar claims need different treatment)
- Regulatory implications (HIPAA, ACA, state mandates)
- Timeliness (timely filing deadlines approaching?)
- Member satisfaction impact

### Technical Context
- System capabilities (can we auto-fix this?)
- Data availability (do we have the information needed to resolve?)
- Integration points (need to call external API?)

## Visual Indicators

Use consistent emoji/symbols throughout:

### Status Indicators
- ❌ Error / Critical issue
- ⚠️ Warning / Caution needed
- ✓ Success / Verified / Confirmed
- ℹ️ Information / Note
- 🔍 Investigation needed
- 💡 Suggestion / Tip
- 📊 Pattern / Trend
- 💰 Financial impact
- 📅 Date/time related
- 🚀 Quick action available
- 📄 Documentation required

### Priority Indicators
- 🔴 High risk / Urgent
- 🟡 Medium risk / Attention needed
- 🟢 Low risk / Standard processing

## Tone and Language Guidelines

### Do:
- Use plain language, not jargon
- Be specific with data and examples
- Provide context, not just facts
- Offer multiple resolution paths
- Show confidence levels
- Give time estimates
- Explain "why" not just "what"

### Don't:
- Be vague ("check the system")
- Assume knowledge ("obviously this means...")
- Use only technical terms without explanation
- Provide steps without context
- Make assumptions about root cause
- Hide uncertainty
- Skip the "so what" (impact)

## Confidence Scoring

Every suggestion should indicate confidence level:

```markdown
SUGGESTED RESOLUTION (Confidence: 85%)
  Based on {data_points} and {historical_pattern}

  {if confidence > 90%}
  ✓ HIGH CONFIDENCE: This resolution works {success_rate}% of the time
  {else if confidence > 70%}
  ⚠️ GOOD CONFIDENCE: This resolution works {success_rate}% of the time
  {else if confidence > 50%}
  🔍 MODERATE CONFIDENCE: Consider alternatives below
  {else}
  💡 LOW CONFIDENCE: Multiple possibilities - investigation needed
  {endif}
```

## Learning from Feedback

Track resolution outcomes to improve future error messages:

```json
{
  "error_code": "E-ELG-001",
  "suggestion_given": "Check for retroactive termination error",
  "actual_resolution": "Was retroactive termination",
  "user_followed_suggestion": true,
  "time_to_resolve": 18,
  "outcome": "approved",
  "feedback_rating": 5
}
```

Use this data to:
- Improve cause ranking
- Refine time estimates
- Add new common patterns
- Update "similar cases" statistics
- Enhance resolution steps

## Implementation Notes

1. **Progressive Enhancement**: Start with basic intelligent errors, add complexity over time
2. **User Feedback Loop**: Allow users to rate helpfulness of error messages
3. **A/B Testing**: Test different error message formats to see what resonates
4. **Personalization**: Over time, tailor messages to user's experience level
5. **Performance**: Pre-compute expensive context (patterns, history) during validation phase

## Version History

- v1.0.0 (2024-03) - Initial intelligent error message framework
