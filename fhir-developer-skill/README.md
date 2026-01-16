# FHIR Developer Skill

Quick reference for building HL7 FHIR R4 healthcare APIs with proper resource structures, validation patterns, and SMART on FHIR authorization.

## Overview

This Claude Code skill provides specialized knowledge for developing FHIR REST endpoints. It helps developers implement healthcare data exchange APIs following HL7 FHIR R4 specifications with correct resource validation, HTTP status codes, and coding system usage.

**Target Users:** Backend developers building healthcare APIs, FHIR implementers, health IT engineers

**Key Features:**

- Resource Validation - Proper required/optional field handling for Patient, Observation, Encounter, Condition, MedicationRequest
- HTTP Status Codes - Correct status codes for FHIR operations (422 vs 400, 412 for ETag conflicts)
- Coding Systems - LOINC, SNOMED CT, RxNorm, ICD-10 system URLs and usage
- SMART on FHIR - OAuth 2.0 authorization, scope validation, token handling
- Search & Pagination - Proper Bundle responses and `_count`/`_offset` parameters
- Error Handling - OperationOutcome generation with proper severity and code values

## Requirements

None - This skill is a reference guide and doesn't require external dependencies.

## What This Skill Provides

**Quick Reference Tables:**

- HTTP status codes (200, 201, 400, 401, 403, 404, 412, 422)
- Required vs optional fields by resource type (critical: only 1..1 or 1..* are required)
- Value sets and enum validation (status, gender, intent, etc.)
- Coding system URLs (LOINC, SNOMED CT, RxNorm, ICD-10)

**Validation Patterns:**

Complete validation examples in Python/FastAPI and TypeScript/Express showing:
- Required field validation
- Enum value validation
- Proper OperationOutcome error responses
- HTTP status code selection

**Reference Documentation:**

- **resource-examples.md** - Complete JSON examples for all major resource types
- **smart-auth.md** - SMART on FHIR OAuth 2.0 authorization implementation guide
- **pagination.md** - Search result pagination with Bundle responses
- **bundles.md** - Bundle transaction/batch operations for atomic updates

**Project Setup Script:**

- **setup_fhir_project.py** - Generates FastAPI project scaffold with validation, error handling, and SMART auth stubs

## Common Pitfalls Addressed

- **422 vs 400** - Use 422 for invalid field values, 400 for malformed JSON
- **ETag conflicts** - Return 412 (not 400) for If-Match header mismatches
- **Optional fields** - Don't require `subject` or `period` on Encounter (they're 0..1)
- **Encounter.class** - It's a Coding object, not a string
- **SMART scopes** - Proper format is `patient/Observation.read` not `read:observation`

## Related MCP Connectors

This skill works well with healthcare MCP connectors for code validation:

- **ICD-10 Codes** - Diagnosis and procedure code validation
- **NPI Registry** - Provider credential verification

## Getting Started

See [SKILL.md](SKILL.md) for complete reference tables and validation patterns.
