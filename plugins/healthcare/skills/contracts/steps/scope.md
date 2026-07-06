# Scope

Turn the brief's scope intent into a concrete read set.

Filter on `documents` provenance columns (publisher/category/dated/family — hard facts), and grep `documents.content` for the brief's vocabulary plus knowledge-index synonyms — match with LIKE/instr but **SELECT only id/uri, never the content column**, and put every vocabulary query in ONE `sql` call (the array form). Rank candidates by match count from the grep; nothing else exists to rank by.

Write a `scopes` row, then **all** the `scope_documents` rows in one `write` call (`rows: [...]`) — one row per call costs a model turn each and burns minutes before a single document gets read.

`predicate` is what you actually applied; `terms` is the vocabulary you learned for this question — entity aliases, d/b/a names, acronyms, domain phrases — recorded so a reviewer can see what you knew even when the predicate only needed one headword.

Aggregates, negatives, and "which contracts lack X" → no cap, full sweep. When in doubt, scope broad: an over-read document costs seconds; a missed document costs the answer.
