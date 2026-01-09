# Technical Architecture

## Waypoint File Formats

**JSON Waypoints** (Steps 0, 1):
- Structured data for programmatic access
- Small file sizes (1-15KB)
- Easy to parse and reference

**Markdown Waypoints** (Steps 2, 3, 4):
- Step 2: `02_protocol_foundation.md` (Sections 1-6)
- Step 3: `03_protocol_intervention.md` (Sections 7-8)
- Step 4: `04_protocol_operations.md` (Sections 9-12)
- Step 4: `02_protocol_draft.md` (concatenated complete protocol)
- Human-readable protocol documents
- Can be directly edited by users
- Individual section files preserved for easier regeneration

## Data Minimization Strategy

Each step implements aggressive summarization:
- **Keep:** Top-N results (5-10 max)
- **Keep:** Key facts and IDs (NCT numbers, endpoint types)
- **Keep:** Concise rationale (2-3 sentences)
- **Discard:** Raw MCP query results (not needed after analysis)
- **Discard:** Full FDA guidance text (only excerpts/citations kept)
- **Discard:** Lower-ranked search results

## Step Independence

Each reference workflow is designed to:
- Read only from waypoint files (not conversation history)
- Produce complete output in single execution
- Not depend on conversation context from previous steps
- Be runnable standalone
