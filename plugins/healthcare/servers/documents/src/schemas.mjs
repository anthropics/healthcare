// The wire format, hand-written. No zod, no emission layer: what you read here is
// the exact bytes an agent sees. `tool()` only stamps the boilerplate every entry
// repeats — the schema test asserts the running server emits this array verbatim,
// and that every schema is draft 2020-12 clean (an array-form `items` or a union
// `type` makes agent spawns fail with "input_schema is invalid" and no field name).

/**
 * One tool entry. `hints` rides into annotations (readOnlyHint, destructiveHint).
 * @param {{name: string, title: string, description: string, properties: object,
 *          required?: string[], hints?: object}} t
 */
const tool = ({ name, title, description, properties, required, hints }) => ({
  name,
  title,
  description,
  inputSchema: {
    type: "object",
    properties,
    ...(required ? { required } : {}),
    additionalProperties: false,
    $schema: "http://json-schema.org/draft-07/schema#",
  },
  annotations: { title, ...hints },
  execution: { taskSupport: "forbidden" },
});

export const TOOLS = [
  tool({
    name: "corpus_register",
    title: "Registering your documents folder",
    description:
      "Register a corpus: give a name to a local folder of documents (pdf/docx/xlsx/pptx sources, txt/md/html direct text). The ONLY tool that accepts a filesystem path; the path is canonicalized and must be an existing directory. Re-registering a name updates its root. Never give to sweep workers.",
    properties: {
      name: {
        type: "string",
        description: "corpus name, e.g. 'acme-msa'",
      },
      dir: {
        type: "string",
        description: "path to the folder",
      },
    },
    required: ["name", "dir"],
  }),
  tool({
    name: "corpus_prepare",
    title: "Getting your documents ready",
    description:
      "Register a folder of documents, check what changed, and read in anything new — in one call. Use this instead of corpus_register + corpus_sync + ingest, which is three model turns to say the same thing. Returns {documents, already_current, ingested?, missing?}. The ONLY tool besides corpus_register that accepts a filesystem path.",
    properties: {
      name: {
        type: "string",
        description: "corpus name, e.g. 'acme-msa'",
      },
      dir: {
        type: "string",
        description: "path to the folder",
      },
      force: {
        type: "boolean",
        description: "re-extract even cached files",
      },
    },
    required: ["name", "dir"],
  }),
  tool({
    name: "ingest",
    title: "Reading in your documents",
    description:
      "Extract text from every source file in a registered corpus (liteparse if installed, pdftotext fallback for PDFs) and load it into the database. Idempotent; re-run after files change. force re-extracts cached files. Never give to sweep workers.",
    properties: {
      corpus: {
        type: "string",
      },
      force: {
        type: "boolean",
      },
    },
    required: ["corpus"],
  }),
  tool({
    name: "corpus_sync",
    title: "Checking your documents for changes",
    description:
      "Read-only diff of a registered corpus folder vs the database: which files are new, changed, missing, or unparsed. Run before answering to know whether an ingest is needed.",
    properties: {
      corpus: {
        type: "string",
      },
    },
    required: ["corpus"],
    hints: { readOnlyHint: true },
  }),
  tool({
    name: "find",
    title: "Saving what was found (with its citation)",
    description:
      "Record findings with span-verified citations. Every finding carries `cites`: one or more {doc_id, lines+has | quote}. Cite by `lines` + `has` — the passage's 1-indexed [first, last] line range from your numbered Read output, plus the claim's load-bearing fragment; the engine stores those lines' own text and verifies the fragment is inside. Lines work for tables (a table row is a line). Use a verbatim `quote` instead when your text came without line numbers. A finding resting on two clauses (a contradiction, a clause and the rider that guts it) is ONE row with two cites — across documents if the conflict spans an amendment — never two mirrored rows. **Batch with `rows`** — every finding for a document in ONE call, verified per row: good rows commit, bad rows return in `rejected` with {index, error, hint}; resend only those. For non-contiguous content a quote can't express, first write an audits row (kind='citation_judge'), then pass span + audit on that cite. This and coverage are the only write tools sweep workers hold.",
    properties: {
      run_id: {
        type: "string",
      },
      brief_id: {
        type: "integer",
      },
      round: {
        type: "integer",
      },
      worker: {
        type: "string",
      },
      kind: {
        type: "string",
        enum: ["finding", "unknown"],
      },
      claim: {
        type: "string",
      },
      cites: {
        type: "array",
        items: {
          type: "object",
          properties: {
            doc_id: {
              type: "integer",
            },
            lines: {
              type: "array",
              items: {
                type: "integer",
              },
              minItems: 2,
              maxItems: 2,
              description:
                "[first, last] 1-indexed line range from your numbered Read output (use with has, instead of quote); the engine stores those lines' text",
            },
            has: {
              type: "string",
              minLength: 1,
              description:
                "the claim's load-bearing fragment (a value, a defined term), verified present inside the cited lines; loose here on purpose — the engine's stricter check rejects per row instead of failing the call",
            },
            quote: {
              type: "string",
              minLength: 1,
              description: "verbatim passage — use only when your text came without line numbers",
            },
            near: {
              type: "integer",
              description: "approximate character offset of the quote",
            },
            span: {
              type: "array",
              items: {
                type: "integer",
              },
              minItems: 2,
              maxItems: 2,
            },
            audit: {
              type: "integer",
            },
          },
          required: ["doc_id"],
          additionalProperties: false,
        },
        minItems: 1,
        description:
          "the span(s) this finding rests on — one usually, two for a contradiction; the engine caps the count per row",
      },
      rows: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: ["finding", "unknown"],
            },
            claim: {
              type: "string",
            },
            cites: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  doc_id: {
                    type: "integer",
                  },
                  lines: {
                    type: "array",
                    items: {
                      type: "integer",
                    },
                    minItems: 2,
                    maxItems: 2,
                  },
                  has: {
                    type: "string",
                    minLength: 1,
                  },
                  quote: {
                    type: "string",
                    minLength: 1,
                  },
                  near: {
                    type: "integer",
                  },
                  span: {
                    type: "array",
                    items: {
                      type: "integer",
                    },
                    minItems: 2,
                    maxItems: 2,
                  },
                  audit: {
                    type: "integer",
                  },
                },
                required: ["doc_id"],
                additionalProperties: false,
              },
              minItems: 1,
            },
          },
          required: ["kind", "claim", "cites"],
          additionalProperties: false,
        },
        minItems: 1,
        maxItems: 50,
        description: "many findings in one call — returns {inserted, rejected} with per-row errors",
      },
    },
    required: ["run_id", "brief_id", "round", "worker"],
  }),
  tool({
    name: "coverage",
    title: "Marking documents as read",
    description:
      "Read-receipt for shard documents: status 'read' (processed, even if nothing relevant) or 'error'. Distinguishes 'nothing relevant' from 'worker crashed'. Stamp your whole shard in one call with rows — one call per document wastes a turn each at the end of the sweep.",
    properties: {
      scope_id: {
        type: "integer",
      },
      doc_id: {
        type: "integer",
      },
      worker: {
        type: "string",
      },
      status: {
        type: "string",
        enum: ["read", "error"],
      },
      note: {
        type: "string",
      },
      rows: {
        type: "array",
        items: {
          type: "object",
          properties: {
            scope_id: {
              type: "integer",
            },
            doc_id: {
              type: "integer",
            },
            worker: {
              type: "string",
            },
            status: {
              type: "string",
              enum: ["read", "error"],
            },
            note: {
              type: "string",
            },
          },
          required: ["scope_id", "doc_id", "worker", "status"],
          additionalProperties: false,
        },
      },
    },
  }),
  tool({
    name: "cite",
    title: "Verifying a quote",
    description:
      "Mint standalone citations (brief_id, created_by, verbatim quotes). Same verification as find's quote form (no lines+has here — this tool is for composition, where you type the quote you're using). **Batch with `rows`** — citations mint in clusters during composition, so pass them all in ONE call: good rows return in `minted`, bad rows in `rejected` with {index, error, hint}; resend only those. Single form: doc_id/quote at top level. Then attach via *_citations joins (write rows).",
    properties: {
      brief_id: {
        type: "integer",
      },
      by: {
        type: "string",
      },
      doc_id: {
        type: "integer",
      },
      quote: {
        type: "string",
        minLength: 1,
      },
      near: {
        type: "integer",
      },
      span: {
        type: "array",
        items: {
          type: "integer",
        },
        minItems: 2,
        maxItems: 2,
      },
      audit: {
        type: "integer",
      },
      rows: {
        type: "array",
        items: {
          type: "object",
          properties: {
            doc_id: {
              type: "integer",
            },
            quote: {
              type: "string",
              minLength: 1,
            },
            near: {
              type: "integer",
            },
            span: {
              type: "array",
              items: {
                type: "integer",
              },
              minItems: 2,
              maxItems: 2,
            },
            audit: {
              type: "integer",
            },
          },
          required: ["doc_id", "quote"],
          additionalProperties: false,
        },
        minItems: 1,
        maxItems: 50,
        description: "many citations in one call — returns {minted, rejected} with per-row errors",
      },
    },
    required: ["brief_id", "by"],
  }),
  tool({
    name: "write",
    title: "Saving progress",
    description:
      "Insert validated rows. Tables: runs, briefs, scopes, shard_coverage, scope_documents, findings, finding_citations, queue_items, queue_citations, knowledge, knowledge_citations, audits. Pass ONE of: row (returns the inserted row) or rows (an array — inserted in a single transaction, returns their ids). **Always batch with rows when you have more than one** — each tool call costs a full turn, so writing 40 rows one at a time wastes minutes. Never give to sweep workers.",
    properties: {
      table: {
        type: "string",
        enum: [
          "runs",
          "briefs",
          "scopes",
          "shard_coverage",
          "scope_documents",
          "findings",
          "finding_citations",
          "queue_items",
          "queue_citations",
          "knowledge",
          "knowledge_citations",
          "audits",
        ],
      },
      row: {
        type: "object",
        additionalProperties: {},
      },
      rows: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: {},
        },
      },
    },
    required: ["table"],
  }),
  tool({
    name: "set",
    title: "Updating progress",
    description:
      "Update allowlisted columns: runs.{status,round,session_id}, briefs.status, queue_items.{status,answer,answered_by,answered_at}, knowledge.{status,ratified_by}. **Batch with `updates`** — a transition usually sets several (run status + round, a queue item's answer/answered_by/status): pass them all in ONE call, applied in one transaction. Single form: table/id/col/value at top level. Never give to sweep workers.",
    properties: {
      table: {
        type: "string",
        enum: ["runs", "briefs", "queue_items", "knowledge"],
      },
      id: {
        type: "string",
        description: "primary key value (run_id for runs, numeric id otherwise)",
      },
      col: {
        type: "string",
      },
      value: {
        type: "string",
      },
      updates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            table: {
              type: "string",
              enum: ["runs", "briefs", "queue_items", "knowledge"],
            },
            id: {
              type: "string",
            },
            col: {
              type: "string",
            },
            value: {
              type: "string",
            },
          },
          required: ["table", "id", "col", "value"],
          additionalProperties: false,
        },
        minItems: 1,
        maxItems: 100,
        description: "many updates in one transaction — all land or none do",
      },
    },
  }),
  tool({
    name: "sql",
    title: "Checking the records",
    description:
      "Run SQL against the documents database (SELECT returns rows; writes return {changes}). `query` takes an ARRAY — independent queries (prescan probes, status checks, triage pulls) go in ONE call, results keyed per query with per-query errors; a lone string works too. Never SELECT the content column of documents — full text overflows tool results; use dump instead. The schema's triggers still enforce citation verification and immutability. Conductor only — never expose to workers processing document content.",
    properties: {
      query: {
        anyOf: [
          {
            type: "string",
            minLength: 1,
          },
          {
            type: "array",
            items: {
              type: "string",
              minLength: 1,
            },
            minItems: 1,
            maxItems: 20,
          },
        ],
      },
    },
    required: ["query"],
  }),
  tool({
    name: "db_schema",
    title: "Checking the filing system",
    description: "List the database schema (tables, views, triggers).",
    properties: {},
    hints: { readOnlyHint: true },
  }),
  tool({
    name: "doc_search",
    title: "Searching your documents",
    description:
      "LITERAL substring search across a corpus's documents — no regex, no wildcards, no | alternation (a pipe is searched as a pipe character and will match nothing). `pattern` takes an ARRAY: pass each phrasing as its OWN entry ('service credit', 'indemnif', 'hold harmless') in ONE call; results come back keyed per pattern. A lone string works too. Case-insensitive by default, so prefer short stems ('indemnif' catches indemnify/indemnification). Use this BEFORE doc_text when you can't grep the dumped shard files, so you page in only the documents that hit. Case-insensitive by default.",
    properties: {
      corpus: {
        type: "string",
      },
      pattern: {
        anyOf: [
          {
            type: "string",
            minLength: 1,
          },
          {
            type: "array",
            items: {
              type: "string",
              minLength: 1,
            },
            minItems: 1,
            maxItems: 10,
          },
        ],
      },
      ignore_case: {
        type: "boolean",
      },
      max_docs: {
        type: "integer",
        description:
          "returned-hit cap, max 200 (default 200); docs_matched always reports the TRUE match count, so a capped reply is self-evident",
      },
      max_per_doc: {
        type: "integer",
        description: "match snippets per document; capped at 20",
      },
    },
    required: ["corpus", "pattern"],
    hints: { readOnlyHint: true },
  }),
  tool({
    name: "doc_text",
    title: "Reading a contract",
    description:
      "Read document text straight from the database, paginated (follow each next_offset until null). **Batch with `docs`** — page every document you're reading in ONE call: `docs: [{doc_id, offset?}, …]`, sharing one char budget (`limit`, same cap as a single call), consumed in array order; a doc the budget didn't reach returns chars:0 with next_offset unchanged — page it next call. Use ONLY when the dumped shard files aren't readable from where you run — otherwise Read the shard file, which is cheaper. Returns per doc {doc_id, uri, family, offset, chars, total_chars, next_offset, text}.",
    properties: {
      doc_id: {
        type: "integer",
      },
      offset: {
        type: "integer",
        minimum: 0,
      },
      limit: {
        type: "integer",
        minimum: 1,
        description: "char budget for the call (shared across docs in batch form); capped at 60000",
      },
      docs: {
        type: "array",
        items: {
          type: "object",
          properties: {
            doc_id: {
              type: "integer",
            },
            offset: {
              type: "integer",
              minimum: 0,
            },
          },
          required: ["doc_id"],
          additionalProperties: false,
        },
        minItems: 1,
        maxItems: 20,
        description: "many documents in one call under one shared char budget",
      },
    },
    hints: { readOnlyHint: true },
  }),
  tool({
    name: "dump",
    title: "Preparing the reading batches",
    description:
      "Write shard text to files for sweep workers, and (when given the rubric) each shard's ready-made worker prompt. Pass every shard in one call. Returns each shard's files and prompt_path. Give it the rubric: otherwise you retype the whole rubric into every reader's prompt, which costs more wall-clock than the reading does. Never give to sweep workers.",
    properties: {
      run_id: {
        type: "string",
      },
      shards: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
            },
            doc_ids: {
              type: "array",
              items: {
                type: "integer",
              },
              minItems: 1,
            },
            hunter: {
              type: "boolean",
            },
          },
          required: ["label", "doc_ids"],
          additionalProperties: false,
        },
        minItems: 1,
      },
      rubric: {
        type: "string",
        description: "the brief's rubric, verbatim — written into each shard's prompt file",
      },
      brief_id: {
        type: "integer",
      },
      round: {
        type: "integer",
      },
      scope_id: {
        type: "integer",
      },
    },
    required: ["run_id", "shards"],
  }),
  tool({
    name: "shard_prompt",
    title: "Fetching reading instructions",
    description:
      "Fetch a shard's worker prompt as text (rubric + your documents). Use it when you can't open the prompt file dump wrote — i.e. the engine is on another machine. Never sweep without your rubric.",
    properties: {
      run_id: {
        type: "string",
      },
      label: {
        type: "string",
      },
    },
    required: ["run_id", "label"],
    hints: { readOnlyHint: true },
  }),
  tool({
    name: "drop",
    title: "Removing old runs",
    description:
      "Delete runs (and sweep orphaned citations/documents). Pass run_ids, or prefix to glob-match. Citations backing ratified knowledge survive. Never give to sweep workers.",
    properties: {
      run_ids: {
        type: "array",
        items: {
          type: "string",
        },
      },
      prefix: {
        type: "string",
      },
    },
    hints: { destructiveHint: true },
  }),
  tool({
    name: "log_observation",
    title: "Logging run notes",
    description:
      "Append one de-identified entry to the observations log (<data>/observations.md), creating it with its header on first use. The entry must contain no contract text, file names, or question text. Returns the file path.",
    properties: {
      entry: {
        type: "string",
        minLength: 1,
      },
    },
    required: ["entry"],
  }),
];
