// GENERATED from the live SDK-era server's tools/list output, then frozen.
// These literals ARE the wire format — draft 2020-12 clean, validated by every
// agent spawn since the batching rewrite. Edit deliberately; the schema test
// asserts the running server emits exactly this.
// To regenerate after adding a tool: hand-write the entry here (there is no
// zod to emit it anymore), keeping the same shape.

export const TOOLS = [
  {
    "name": "corpus_register",
    "title": "Registering your documents folder",
    "description": "Register a corpus: give a name to a local folder of documents (pdf/docx/xlsx/pptx sources, txt/md/html direct text). The ONLY tool that accepts a filesystem path; the path is canonicalized and must be an existing directory. Re-registering a name updates its root. Never give to sweep workers.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "corpus name, e.g. 'acme-msa'"
        },
        "dir": {
          "type": "string",
          "description": "path to the folder"
        }
      },
      "required": [
        "name",
        "dir"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    "annotations": {
      "title": "Registering your documents folder"
    },
    "execution": {
      "taskSupport": "forbidden"
    }
  },
  {
    "name": "corpus_prepare",
    "title": "Getting your documents ready",
    "description": "Register a folder of documents, check what changed, and read in anything new \u2014 in one call. Use this instead of corpus_register + corpus_sync + ingest, which is three model turns to say the same thing. Returns {documents, already_current, ingested?, missing?}. The ONLY tool besides corpus_register that accepts a filesystem path.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "corpus name, e.g. 'acme-msa'"
        },
        "dir": {
          "type": "string",
          "description": "path to the folder"
        },
        "force": {
          "type": "boolean",
          "description": "re-extract even cached files"
        }
      },
      "required": [
        "name",
        "dir"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    "annotations": {
      "title": "Getting your documents ready"
    },
    "execution": {
      "taskSupport": "forbidden"
    }
  },
  {
    "name": "ingest",
    "title": "Reading in your documents",
    "description": "Extract text from every source file in a registered corpus (liteparse if installed, pdftotext fallback for PDFs) and load it into the database. Idempotent; re-run after files change. force re-extracts cached files. Never give to sweep workers.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "corpus": {
          "type": "string"
        },
        "force": {
          "type": "boolean"
        }
      },
      "required": [
        "corpus"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    "annotations": {
      "title": "Reading in your documents"
    },
    "execution": {
      "taskSupport": "forbidden"
    }
  },
  {
    "name": "corpus_sync",
    "title": "Checking your documents for changes",
    "description": "Read-only diff of a registered corpus folder vs the database: which files are new, changed, missing, or unparsed. Run before answering to know whether an ingest is needed.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "corpus": {
          "type": "string"
        }
      },
      "required": [
        "corpus"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    "annotations": {
      "title": "Checking your documents for changes",
      "readOnlyHint": true
    },
    "execution": {
      "taskSupport": "forbidden"
    }
  },
  {
    "name": "find",
    "title": "Saving what was found (with its quote)",
    "description": "Record findings with span-verified citations. Each quote must appear verbatim in its document (whitespace/quote-style differences are normalized); the citation is rejected otherwise. **Batch with `rows`** \u2014 every finding for a document in ONE call, verified per row exactly like the single form: good rows commit, bad rows return in `rejected` with {index, error, hint}; resend only those. Single form: kind/claim/doc_id/quote at top level. For non-contiguous content, first write an audits row (kind='citation_judge'), then pass span + audit. This and coverage are the only write tools sweep workers hold.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "run_id": {
          "type": "string"
        },
        "brief_id": {
          "type": "integer"
        },
        "round": {
          "type": "integer"
        },
        "worker": {
          "type": "string"
        },
        "kind": {
          "type": "string",
          "enum": [
            "finding",
            "unknown"
          ]
        },
        "claim": {
          "type": "string"
        },
        "doc_id": {
          "type": "integer"
        },
        "quote": {
          "type": "string",
          "minLength": 1
        },
        "near": {
          "type": "integer",
          "description": "approximate character offset of the quote"
        },
        "span": {
          "type": "array",
          "items": {
            "type": "integer"
          },
          "minItems": 2,
          "maxItems": 2
        },
        "audit": {
          "type": "integer"
        },
        "rows": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "kind": {
                "type": "string",
                "enum": [
                  "finding",
                  "unknown"
                ]
              },
              "claim": {
                "type": "string"
              },
              "doc_id": {
                "type": "integer"
              },
              "quote": {
                "type": "string",
                "minLength": 1
              },
              "near": {
                "type": "integer"
              },
              "span": {
                "type": "array",
                "items": {
                  "type": "integer"
                },
                "minItems": 2,
                "maxItems": 2
              },
              "audit": {
                "type": "integer"
              }
            },
            "required": [
              "kind",
              "claim",
              "doc_id",
              "quote"
            ],
            "additionalProperties": false
          },
          "minItems": 1,
          "maxItems": 50,
          "description": "many findings in one call \u2014 returns {inserted, rejected} with per-row errors"
        }
      },
      "required": [
        "run_id",
        "brief_id",
        "round",
        "worker"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    "annotations": {
      "title": "Saving what was found (with its quote)"
    },
    "execution": {
      "taskSupport": "forbidden"
    }
  },
  {
    "name": "coverage",
    "title": "Marking documents as read",
    "description": "Read-receipt for shard documents: status 'read' (processed, even if nothing relevant) or 'error'. Distinguishes 'nothing relevant' from 'worker crashed'. Stamp your whole shard in one call with rows \u2014 one call per document wastes a turn each at the end of the sweep.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "scope_id": {
          "type": "integer"
        },
        "doc_id": {
          "type": "integer"
        },
        "worker": {
          "type": "string"
        },
        "status": {
          "type": "string",
          "enum": [
            "read",
            "error"
          ]
        },
        "note": {
          "type": "string"
        },
        "rows": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "scope_id": {
                "type": "integer"
              },
              "doc_id": {
                "type": "integer"
              },
              "worker": {
                "type": "string"
              },
              "status": {
                "type": "string",
                "enum": [
                  "read",
                  "error"
                ]
              },
              "note": {
                "type": "string"
              }
            },
            "required": [
              "scope_id",
              "doc_id",
              "worker",
              "status"
            ],
            "additionalProperties": false
          }
        }
      },
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    "annotations": {
      "title": "Marking documents as read"
    },
    "execution": {
      "taskSupport": "forbidden"
    }
  },
  {
    "name": "cite",
    "title": "Verifying a quote",
    "description": "Mint standalone citations (brief_id, created_by, verbatim quotes). Same verification rules as find. **Batch with `rows`** \u2014 citations mint in clusters during composition, so pass them all in ONE call: good rows return in `minted`, bad rows in `rejected` with {index, error, hint}; resend only those. Single form: doc_id/quote at top level. Then attach via *_citations joins (write rows).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "brief_id": {
          "type": "integer"
        },
        "by": {
          "type": "string"
        },
        "doc_id": {
          "type": "integer"
        },
        "quote": {
          "type": "string",
          "minLength": 1
        },
        "near": {
          "type": "integer"
        },
        "span": {
          "type": "array",
          "items": {
            "type": "integer"
          },
          "minItems": 2,
          "maxItems": 2
        },
        "audit": {
          "type": "integer"
        },
        "rows": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "doc_id": {
                "type": "integer"
              },
              "quote": {
                "type": "string",
                "minLength": 1
              },
              "near": {
                "type": "integer"
              },
              "span": {
                "type": "array",
                "items": {
                  "type": "integer"
                },
                "minItems": 2,
                "maxItems": 2
              },
              "audit": {
                "type": "integer"
              }
            },
            "required": [
              "doc_id",
              "quote"
            ],
            "additionalProperties": false
          },
          "minItems": 1,
          "maxItems": 50,
          "description": "many citations in one call \u2014 returns {minted, rejected} with per-row errors"
        }
      },
      "required": [
        "brief_id",
        "by"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    "annotations": {
      "title": "Verifying a quote"
    },
    "execution": {
      "taskSupport": "forbidden"
    }
  },
  {
    "name": "write",
    "title": "Saving progress",
    "description": "Insert validated rows. Tables: runs, briefs, scopes, shard_coverage, scope_documents, findings, finding_citations, queue_items, queue_citations, reports, report_claims, claim_citations, knowledge, knowledge_citations, audits. Pass ONE of: row (returns the inserted row) or rows (an array \u2014 inserted in a single transaction, returns their ids). **Always batch with rows when you have more than one** \u2014 each tool call costs a full turn, so writing 40 rows one at a time wastes minutes. Never give to sweep workers.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "enum": [
            "runs",
            "briefs",
            "scopes",
            "shard_coverage",
            "scope_documents",
            "findings",
            "finding_citations",
            "queue_items",
            "queue_citations",
            "reports",
            "report_claims",
            "claim_citations",
            "knowledge",
            "knowledge_citations",
            "audits"
          ]
        },
        "row": {
          "type": "object",
          "additionalProperties": {}
        },
        "rows": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": {}
          }
        }
      },
      "required": [
        "table"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    "annotations": {
      "title": "Saving progress"
    },
    "execution": {
      "taskSupport": "forbidden"
    }
  },
  {
    "name": "set",
    "title": "Updating progress",
    "description": "Update allowlisted columns: runs.{status,round,session_id}, briefs.status, queue_items.{status,answer,answered_by,answered_at}, knowledge.{status,ratified_by}. **Batch with `updates`** \u2014 a transition usually sets several (run status + round, a queue item's answer/answered_by/status): pass them all in ONE call, applied in one transaction. Single form: table/id/col/value at top level. Never give to sweep workers.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "enum": [
            "runs",
            "briefs",
            "queue_items",
            "knowledge"
          ]
        },
        "id": {
          "type": "string",
          "description": "primary key value (run_id for runs, numeric id otherwise)"
        },
        "col": {
          "type": "string"
        },
        "value": {
          "type": "string"
        },
        "updates": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "table": {
                "type": "string",
                "enum": [
                  "runs",
                  "briefs",
                  "queue_items",
                  "knowledge"
                ]
              },
              "id": {
                "type": "string"
              },
              "col": {
                "type": "string"
              },
              "value": {
                "type": "string"
              }
            },
            "required": [
              "table",
              "id",
              "col",
              "value"
            ],
            "additionalProperties": false
          },
          "minItems": 1,
          "maxItems": 100,
          "description": "many updates in one transaction \u2014 all land or none do"
        }
      },
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    "annotations": {
      "title": "Updating progress"
    },
    "execution": {
      "taskSupport": "forbidden"
    }
  },
  {
    "name": "sql",
    "title": "Checking the records",
    "description": "Run SQL against the documents database (SELECT returns rows; writes return {changes}). `query` takes an ARRAY \u2014 independent queries (prescan probes, status checks, triage pulls) go in ONE call, results keyed per query with per-query errors; a lone string works too. Never SELECT the content column of documents \u2014 full text overflows tool results; use dump instead. The schema's triggers still enforce citation verification and immutability. Conductor only \u2014 never expose to workers processing document content.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "anyOf": [
            {
              "type": "string",
              "minLength": 1
            },
            {
              "type": "array",
              "items": {
                "type": "string",
                "minLength": 1
              },
              "minItems": 1,
              "maxItems": 20
            }
          ]
        }
      },
      "required": [
        "query"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    "annotations": {
      "title": "Checking the records"
    },
    "execution": {
      "taskSupport": "forbidden"
    }
  },
  {
    "name": "db_schema",
    "title": "Checking the filing system",
    "description": "List the database schema (tables, views, triggers).",
    "inputSchema": {
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "properties": {}
    },
    "annotations": {
      "title": "Checking the filing system",
      "readOnlyHint": true
    },
    "execution": {
      "taskSupport": "forbidden"
    }
  },
  {
    "name": "doc_search",
    "title": "Searching your documents",
    "description": "LITERAL substring search across a corpus's documents \u2014 no regex, no wildcards, no | alternation (a pipe is searched as a pipe character and will match nothing). `pattern` takes an ARRAY: pass each phrasing as its OWN entry ('service credit', 'indemnif', 'hold harmless') in ONE call; results come back keyed per pattern. A lone string works too. Case-insensitive by default, so prefer short stems ('indemnif' catches indemnify/indemnification). Use this BEFORE doc_text when you can't grep the dumped shard files, so you page in only the documents that hit. Case-insensitive by default.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "corpus": {
          "type": "string"
        },
        "pattern": {
          "anyOf": [
            {
              "type": "string",
              "minLength": 1
            },
            {
              "type": "array",
              "items": {
                "type": "string",
                "minLength": 1
              },
              "minItems": 1,
              "maxItems": 10
            }
          ]
        },
        "ignore_case": {
          "type": "boolean"
        },
        "max_docs": {
          "type": "integer"
        },
        "max_per_doc": {
          "type": "integer",
          "description": "match snippets per document; capped at 20"
        }
      },
      "required": [
        "corpus",
        "pattern"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    "annotations": {
      "title": "Searching your documents",
      "readOnlyHint": true
    },
    "execution": {
      "taskSupport": "forbidden"
    }
  },
  {
    "name": "doc_text",
    "title": "Reading a contract",
    "description": "Read document text straight from the database, paginated (follow each next_offset until null). **Batch with `docs`** \u2014 page every document you're reading in ONE call: `docs: [{doc_id, offset?}, \u2026]`, sharing one char budget (`limit`, same cap as a single call), consumed in array order; a doc the budget didn't reach returns chars:0 with next_offset unchanged \u2014 page it next call. Use ONLY when the dumped shard files aren't readable from where you run \u2014 otherwise Read the shard file, which is cheaper. Returns per doc {doc_id, uri, family, offset, chars, total_chars, next_offset, text}.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "doc_id": {
          "type": "integer"
        },
        "offset": {
          "type": "integer",
          "minimum": 0
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "description": "char budget for the call (shared across docs in batch form); capped at 60000"
        },
        "docs": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "doc_id": {
                "type": "integer"
              },
              "offset": {
                "type": "integer",
                "minimum": 0
              }
            },
            "required": [
              "doc_id"
            ],
            "additionalProperties": false
          },
          "minItems": 1,
          "maxItems": 20,
          "description": "many documents in one call under one shared char budget"
        }
      },
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    "annotations": {
      "title": "Reading a contract",
      "readOnlyHint": true
    },
    "execution": {
      "taskSupport": "forbidden"
    }
  },
  {
    "name": "dump",
    "title": "Preparing the reading batches",
    "description": "Write shard text to files for sweep workers, and (when given the rubric) each shard's ready-made worker prompt. Pass every shard in one call. Returns each shard's files and prompt_path. Give it the rubric: otherwise you retype the whole rubric into every reader's prompt, which costs more wall-clock than the reading does. Never give to sweep workers.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "run_id": {
          "type": "string"
        },
        "shards": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "label": {
                "type": "string"
              },
              "doc_ids": {
                "type": "array",
                "items": {
                  "type": "integer"
                },
                "minItems": 1
              },
              "hunter": {
                "type": "boolean"
              }
            },
            "required": [
              "label",
              "doc_ids"
            ],
            "additionalProperties": false
          },
          "minItems": 1
        },
        "rubric": {
          "type": "string",
          "description": "the brief's rubric, verbatim \u2014 written into each shard's prompt file"
        },
        "brief_id": {
          "type": "integer"
        },
        "round": {
          "type": "integer"
        },
        "scope_id": {
          "type": "integer"
        }
      },
      "required": [
        "run_id",
        "shards"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    "annotations": {
      "title": "Preparing the reading batches"
    },
    "execution": {
      "taskSupport": "forbidden"
    }
  },
  {
    "name": "shard_prompt",
    "title": "Fetching reading instructions",
    "description": "Fetch a shard's worker prompt as text (rubric + your documents). Use it when you can't open the prompt file dump wrote \u2014 i.e. the engine is on another machine. Never sweep without your rubric.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "run_id": {
          "type": "string"
        },
        "label": {
          "type": "string"
        }
      },
      "required": [
        "run_id",
        "label"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    "annotations": {
      "title": "Fetching reading instructions",
      "readOnlyHint": true
    },
    "execution": {
      "taskSupport": "forbidden"
    }
  },
  {
    "name": "drop",
    "title": "Removing old runs",
    "description": "Delete runs (and sweep orphaned citations/documents). Pass run_ids, or prefix to glob-match. Citations backing ratified knowledge survive. Never give to sweep workers.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "run_ids": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "prefix": {
          "type": "string"
        }
      },
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    "annotations": {
      "title": "Removing old runs",
      "destructiveHint": true
    },
    "execution": {
      "taskSupport": "forbidden"
    }
  },
  {
    "name": "export_report",
    "title": "Assembling the report",
    "description": "LEGACY \u2014 only runs from before answers moved to chat have report rows; new runs have none and this errors. Compose the run's self-contained markdown report (question + brief + report body) and write it to <data>/reports/<run_id>.md server-side \u2014 no filesystem permissions needed on the caller. Returns {path, body} (body so the caller can summarize without a second query).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "run_id": {
          "type": "string"
        }
      },
      "required": [
        "run_id"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    "annotations": {
      "title": "Assembling the report"
    },
    "execution": {
      "taskSupport": "forbidden"
    }
  },
  {
    "name": "log_observation",
    "title": "Logging run notes",
    "description": "Append one de-identified entry to the observations log (<data>/observations.md), creating it with its header on first use. The entry must contain no contract text, file names, or question text. Returns the file path.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "entry": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "entry"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    "annotations": {
      "title": "Logging run notes"
    },
    "execution": {
      "taskSupport": "forbidden"
    }
  }
];
