import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative, sep, extname } from "node:path";

import { z } from "zod";

import {
  db,
  DB_PATH,
  PARSED,
  ROOT,
  RUN_ID_RE,
  setSchemas,
  writeSchemas,
  type WritableTable,
} from "./db";

const PORT = 6226;
const SERVE_URL = `http://127.0.0.1:${PORT}`;

type Bind = Record<string, string | number | bigint | null>;
type Minted = { id: number; kind: "exact" | "judged"; start_off: number; end_off: number };

export function die(msg: string): never {
  throw new Error(msg);
}

function locate(content: string, quote: string, near?: number): number {
  if (near === undefined) return content.indexOf(quote);
  let best = -1;
  let bestD = Infinity;
  for (let i = content.indexOf(quote); i >= 0; i = content.indexOf(quote, i + 1)) {
    const d = Math.abs(i - near);
    if (d < bestD) {
      best = i;
      bestD = d;
    } else if (best >= 0) break;
  }
  return best;
}

function mintCitation(
  docId: number,
  briefId: number,
  by: string,
  quote: string,
  opts: { near?: number; span?: [number, number]; audit?: number },
): Minted {
  const doc = db
    .query<{ content: string; sha256: string }, [number]>(
      `SELECT content, sha256 FROM documents WHERE id = ?`,
    )
    .get(docId);
  if (!doc) die(`cite: unknown doc_id ${docId}`);
  const ins = (kind: "exact" | "judged", s: number, e: number, j: number | null) =>
    db
      .query(
        `INSERT INTO citations (doc_id,brief_id,kind,quote,start_off,end_off,doc_sha256,judgement_audit_id,created_by)
         VALUES ($d,$b,$k,$q,$s,$e,$h,$j,$by) RETURNING id, kind, start_off, end_off`,
      )
      .get({
        d: docId,
        b: briefId,
        k: kind,
        q: quote,
        s,
        e,
        h: doc.sha256,
        j,
        by,
      } as Bind) as Minted;
  const at = locate(doc.content, quote, opts.near ?? opts.span?.[0]);
  if (at >= 0) return ins("exact", at, at + quote.length, null);
  if (opts.span && opts.audit) {
    const [s, e] = opts.span;
    if (e - s > 4000) die(`cite: span is ${e - s} chars; cap is 4000. Narrow to the passage.`);
    const a = db
      .query<{ id: number }, [number]>(`SELECT id FROM audits WHERE id=? AND kind='citation_judge'`)
      .get(opts.audit);
    if (!a) die(`cite: --audit ${opts.audit} not found or not kind=citation_judge`);
    return ins("judged", s, e, a.id);
  }
  die(
    "cite: quote not a verbatim substring. For non-contiguous content (tables, reflow, smart-quotes): write an audits row (kind='citation_judge') attesting the values are present, then retry with the span and `--audit <id>`.",
  );
}

type Handler = (a: string[], stdin?: string) => unknown | Promise<unknown>;

function schema(): unknown {
  return db
    .query(`SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name`)
    .all();
}

function sql(a: string[]): unknown {
  return db.query((a[0] ?? "").trim()).all();
}

function write(a: string[]): unknown {
  const table = a[0] as WritableTable;
  const ws = writeSchemas[table];
  if (!ws) die(`write: unknown table '${table}' (allow: ${Object.keys(writeSchemas).join(", ")})`);
  const row = ws.parse(JSON.parse(a[1] ?? "{}"));
  const cols = Object.keys(row).filter((k) => row[k as keyof typeof row] !== undefined);
  return db
    .query(
      `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map((c) => `$${c}`).join(",")}) RETURNING rowid AS id, *`,
    )
    .get(row as Bind);
}

function set(a: string[]): unknown {
  const [table, id, col, val] = a;
  const t = setSchemas[table as keyof typeof setSchemas];
  if (!(t?.cols as readonly string[] | undefined)?.includes(col))
    die(`set: ${table}.${col} not in allowlist`);
  const r = db
    .query(`UPDATE ${table} SET ${col} = $v WHERE ${t.pk} = $id RETURNING *`)
    .get({ v: val, id: t.pk === "id" ? Number(id) : id });
  if (!r) die(`set: no ${table} row ${id}`);
  return r;
}

function cite(a: string[], stdin?: string): unknown {
  const args = [...a];
  const flag = (n: string) => {
    const i = args.indexOf(n);
    return i >= 0 ? Number(args.splice(i, 2)[1]) : undefined;
  };
  const near = flag("--near");
  const audit = flag("--audit");
  const [docIdS, briefIdS, by, quoteArg, startS, endS] = args;
  const quote = quoteArg === "-" ? (stdin ?? "").replace(/\n$/, "") : quoteArg;
  if (!quote)
    die(
      "cite: usage: cite <doc_id> <brief_id> <by> <quote|-> [start end] [--near off] [--audit id]",
    );
  return mintCitation(Number(docIdS), Number(briefIdS), by, quote, {
    near,
    audit,
    span: startS !== undefined ? [Number(startS), Number(endS)] : undefined,
  });
}

function find(a: string[], stdin?: string): unknown {
  const m = writeSchemas.findings
    .extend({
      doc_id: z.number().int(),
      near: z.number().int().optional(),
      span: z.tuple([z.number().int(), z.number().int()]).optional(),
      audit: z.number().int().optional(),
    })
    .parse(JSON.parse(a[0] ?? "{}"));
  const quote = (stdin ?? "").replace(/\n$/, "");
  if (!quote) die("find: quote required on stdin");
  const c = mintCitation(m.doc_id, m.brief_id, m.worker, quote, {
    near: m.near,
    span: m.span,
    audit: m.audit,
  });
  const fid = db.transaction(() => {
    const f = db
      .query(
        `INSERT INTO findings (run_id,brief_id,round,worker,kind,claim) VALUES (?,?,?,?,?,?) RETURNING id`,
      )
      .get(m.run_id, m.brief_id, m.round, m.worker, m.kind, m.claim) as { id: number };
    db.query(`INSERT INTO finding_citations (finding_id,citation_id) VALUES (?,?)`).run(f.id, c.id);
    return f.id;
  })();
  return { citation_id: c.id, finding_id: fid, kind: c.kind, start_off: c.start_off };
}

function drop(a: string[]): unknown {
  const ids =
    a[0] === "--prefix"
      ? db
          .query<{ run_id: string }, [string]>(`SELECT run_id FROM runs WHERE run_id GLOB ? || '*'`)
          .all(a[1] || die("drop: --prefix needs a non-empty value"))
          .map((r) => r.run_id)
      : a.length
        ? a
        : die("drop: usage: drop <run_id...> | drop --prefix <P>");
  for (const id of ids) if (!RUN_ID_RE.test(id)) die(`drop: invalid run_id '${id}'`);
  const del = db.query(`DELETE FROM runs WHERE run_id = ?`);
  db.transaction(() => ids.forEach((id) => del.run(id)))();
  return { dropped: ids };
}

const PREPROCESS_EXT = /\.(pdf|docx|xlsx|pptx)$/i;
const DIRECT_TEXT_EXT = /\.(txt|md|html?)$/i;

function sha256(data: string | NodeJS.ArrayBufferView): string {
  return createHash("sha256").update(data).digest("hex");
}

function parsedPath(srcSha: string): string {
  return join(PARSED, srcSha.slice(0, 2), `${srcSha}.txt`);
}

type CorpusFile = {
  path: string;
  rel: string;
  kind: "source" | "text";
  srcSha: string | null;
  override?: boolean;
};

// Walk a corpus dir once and classify every file. User-supplied text (.txt/.md/.html)
// for a basename overrides any sibling source file of the same stem — the user's
// extraction is preferred over ours.
function scanCorpus(dir: string): CorpusFile[] {
  const all: { path: string; rel: string; name: string }[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name !== "MANIFEST.jsonl")
        all.push({ path: p, rel: relative(dir, p), name: e.name });
    }
  };
  walk(dir);
  const textStems = new Set(
    all.filter((f) => DIRECT_TEXT_EXT.test(f.name)).map((f) => f.rel.replace(DIRECT_TEXT_EXT, "")),
  );
  const out: CorpusFile[] = [];
  for (const f of all) {
    if (PREPROCESS_EXT.test(f.name)) {
      const override = textStems.has(f.rel.replace(PREPROCESS_EXT, ""));
      out.push({
        path: f.path,
        rel: f.rel,
        kind: "source",
        srcSha: sha256(readFileSync(f.path)),
        override,
      });
    } else if (DIRECT_TEXT_EXT.test(f.name)) {
      out.push({ path: f.path, rel: f.rel, kind: "text", srcSha: null });
    }
  }
  return out;
}

function resolveLit(): string | undefined {
  // Prefer the liteparse `lit` bin that `bun install` drops in node_modules, then PATH.
  const candidates = [join(ROOT, "node_modules", ".bin", "lit"), "lit"];
  return candidates.find((p) => spawnSync(p, ["--version"], { stdio: "ignore" }).status === 0);
}

function extract(lit: string | undefined, src: string): string | null {
  if (lit) {
    // OCR on by default; retry --no-ocr so text-layer extraction still lands if the OCR path fails.
    for (const extra of [[], ["--no-ocr"]]) {
      const r = spawnSync(
        lit,
        ["parse", src, "--format", "text", "--max-pages", "2000", ...extra],
        {
          encoding: "utf8",
          maxBuffer: 256 * 1024 * 1024,
        },
      );
      if (r.status === 0 && r.stdout.trim())
        return r.stdout.replace(/^--- (?:Page|Slide|Sheet) (\d+) ---$/gm, "\n=== [page $1] ===\n");
    }
  }
  // Only PDFs have a no-liteparse fallback.
  if (!/\.pdf$/i.test(src)) return null;
  // Fallback: pdftotext -layout, page-anchored via form-feed splits.
  const r = spawnSync("pdftotext", ["-layout", src, "-"], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.status !== 0) return null;
  return r.stdout
    .split("\f")
    .map((page, i) => `\n\n=== [page ${i + 1}] ===\n\n${page}`)
    .join("");
}

type ParseStatus = "ok" | "empty" | "failed";
type PreprocessResult = {
  extractor: string;
  parsed_dir: string;
  extracted: number;
  skipped: number;
  empty: number;
  failed: number;
  elapsed_ms: number;
  status: Map<string, ParseStatus>; // srcSha → outcome (not in JSON output)
};

// corpora/<name>/ is read-only input. Parsed text lands in <DATA>/parsed/<sha[:2]>/<sha>.txt,
// keyed by the SOURCE file's sha256 so identical files anywhere share one cache entry.
function preprocessFiles(files: CorpusFile[], force: boolean): PreprocessResult {
  const lit = resolveLit();
  const extractor = lit
    ? `liteparse (${lit})`
    : "pdftotext -layout (liteparse not found — PDF only; .docx/.xlsx/.pptx require liteparse)";
  const sources = files.filter((f) => f.kind === "source" && !f.override && f.srcSha);
  const total = sources.length;
  const status = new Map<string, ParseStatus>();
  const t0 = performance.now();
  let done = 0,
    skipped = 0,
    failed = 0,
    empty = 0,
    lastReport = t0;
  const progress = (flush?: boolean) => {
    const now = performance.now();
    if (!flush && now - lastReport < 2000) return;
    lastReport = now;
    const n = done + skipped + failed + empty;
    const rate = done / Math.max(1, (now - t0) / 1000);
    const eta = done > 0 && n < total ? ` · ~${Math.ceil((total - n) / rate)}s remaining` : "";
    console.error(
      `preprocess: ${n}/${total} (${done} extracted, ${skipped} cached, ${empty} empty, ${failed} failed) · ${rate.toFixed(1)} docs/s${eta}`,
    );
  };
  if (total > 0) console.error(`preprocess: ${total} source files · ${extractor}`);
  for (const f of sources) {
    if (!f.srcSha) continue;
    const out = parsedPath(f.srcSha);
    if (!force && existsSync(out)) {
      // Retry empty/failed placeholders when liteparse is available.
      const head = readFileSync(out, "utf8").slice(0, 60);
      // Recognize the legacy "[image-only" prefix too — parsed/ survives schema upgrades.
      const cached: ParseStatus =
        head.startsWith("[no text extracted") || head.startsWith("[image-only")
          ? "empty"
          : head.startsWith("[extraction failed")
            ? "failed"
            : "ok";
      if (!(lit && cached !== "ok")) {
        skipped++;
        status.set(f.srcSha, cached);
        progress();
        continue;
      }
    }
    mkdirSync(join(PARSED, f.srcSha.slice(0, 2)), { recursive: true });
    if (!lit && !/\.pdf$/i.test(f.rel)) {
      failed++;
      status.set(f.srcSha, "failed");
      writeFileSync(
        out,
        `[extraction failed — liteparse required for ${extname(f.rel)}; run \`bun install\` in the skill dir, or supply ${f.rel.replace(PREPROCESS_EXT, ".txt")}]`,
      );
      console.error(
        `preprocess: SKIP  ${f.rel} — liteparse required for .docx/.xlsx/.pptx (run \`bun install\` in the skill dir)`,
      );
      continue;
    }
    const text = extract(lit, f.path);
    if (text == null) {
      failed++;
      status.set(f.srcSha, "failed");
      writeFileSync(out, `[extraction failed — parse error on ${f.rel}]`);
      console.error(`preprocess: FAIL  ${f.rel}`);
      continue;
    }
    if (text.replace(/\s|\[page \d+\]|=/g, "").length < 200) {
      empty++;
      status.set(f.srcSha, "empty");
      writeFileSync(
        out,
        `[no text extracted — page may be blank or unreadable after OCR]\n${text}`,
      );
      console.error(`preprocess: EMPTY ${f.rel} (liteparse/OCR returned no text)`);
      continue;
    }
    writeFileSync(out, text);
    status.set(f.srcSha, "ok");
    done++;
    progress();
  }
  const elapsed_ms = Math.round(performance.now() - t0);
  if (total > 0) progress(true);
  return {
    extractor,
    parsed_dir: PARSED,
    extracted: done,
    skipped,
    empty,
    failed,
    elapsed_ms,
    status,
  };
}

function preprocess(a: string[]): unknown {
  const [dir, ...flags] = a;
  if (!dir) die("preprocess: usage: preprocess <corpus-dir> [--force]");
  if (!existsSync(dir)) die(`preprocess: ${dir} not found`);
  const { status: _status, ...r } = preprocessFiles(scanCorpus(dir), flags.includes("--force"));
  return r;
}

// Read-only: compare what's on disk under <dir> to what the DB holds for <corpus>.
function sync(a: string[]): unknown {
  const [dir, corpus] = a;
  if (!dir || !corpus) die("sync: usage: sync <corpus-dir> <corpus>");
  if (!existsSync(dir)) die(`sync: ${dir} not found`);
  const files = scanCorpus(dir);
  const dbDocs = new Map(
    db
      .query<{ uri: string; sha256: string; source_sha256: string | null }, [string]>(
        `SELECT uri, sha256, source_sha256 FROM v_corpus_documents WHERE corpus = ?`,
      )
      .all(corpus)
      .map((r) => [r.uri, r]),
  );
  const fresh: string[] = [];
  const changed: string[] = [];
  const unparsed: string[] = [];
  const seen = new Set<string>();
  let current = 0;
  for (const f of files) {
    if (f.kind === "source" && f.override) continue;
    seen.add(f.rel);
    const row = dbDocs.get(f.rel);
    if (f.kind === "source" && f.srcSha && !existsSync(parsedPath(f.srcSha))) unparsed.push(f.rel);
    if (!row) {
      fresh.push(f.rel);
    } else if (f.kind === "source") {
      if (row.source_sha256 === f.srcSha) current++;
      else changed.push(f.rel);
    } else {
      if (row.sha256 === sha256(readFileSync(f.path, "utf8"))) current++;
      else changed.push(f.rel);
    }
  }
  const missing = [...dbDocs.keys()].filter((u) => !seen.has(u));
  return { corpus, root: dir, current, new: fresh, changed, missing, unparsed };
}

function loadManifest(dir: string): Map<string, Record<string, string>> {
  const manifest = new Map<string, Record<string, string>>();
  for (const mf of [join(dir, "MANIFEST.jsonl"), join(dir, "..", "MANIFEST.jsonl")])
    if (existsSync(mf))
      for (const line of readFileSync(mf, "utf8").split("\n").filter(Boolean)) {
        const m = JSON.parse(line);
        manifest.set(m.file, m);
      }
  return manifest;
}

function ingest(a: string[]): unknown {
  const [dir, corpus] = a;
  if (!dir || !corpus) die("ingest: usage: ingest <dir> <corpus>");
  if (!existsSync(dir)) die(`ingest: ${dir} not found`);
  const files = scanCorpus(dir);
  const { status, ...pre } = preprocessFiles(files, false);
  const now = new Date().toISOString();
  db.query(
    `INSERT INTO audits (run_id, corpus, kind, sample_n, result) VALUES (NULL, ?, 'preprocess', ?, ?)`,
  ).run(corpus, pre.extracted + pre.skipped + pre.empty + pre.failed, JSON.stringify(pre));
  const manifest = loadManifest(dir);
  const insDoc = db.query<{ id: number }, Bind>(
    `INSERT INTO documents (content, sha256, family) VALUES ($content, $sha256, $family)
     ON CONFLICT(sha256) DO UPDATE SET sha256 = sha256 RETURNING id`,
  );
  const insCorpus = db.query<unknown, Bind>(
    `INSERT INTO corpus_documents
       (corpus, uri, doc_id, source_sha256, parse_status, parsed_at, publisher, category, dated, source_url)
     VALUES ($corpus, $uri, $doc_id, $source_sha256, $parse_status, $parsed_at, $publisher, $category, $dated, $source_url)
     ON CONFLICT(corpus, uri) DO UPDATE SET
       doc_id = excluded.doc_id, source_sha256 = excluded.source_sha256,
       parse_status = excluded.parse_status, parsed_at = excluded.parsed_at,
       publisher = excluded.publisher, category = excluded.category,
       dated = excluded.dated, source_url = excluded.source_url`,
  );
  let n = 0;
  const warnings: string[] = [];
  const load = () => {
    for (const f of files) {
      if (f.kind === "source" && f.override) continue;
      let content: string;
      if (f.kind === "text") {
        content = readFileSync(f.path, "utf8");
      } else if (f.srcSha && existsSync(parsedPath(f.srcSha))) {
        content = readFileSync(parsedPath(f.srcSha), "utf8");
      } else {
        warnings.push(`unparsed: ${f.rel} (preprocess failed or liteparse unavailable)`);
        continue;
      }
      const contentSha = sha256(content);
      // Manifest keys: the file's own rel path, or (for user-supplied .txt) the source it stands in for.
      const stem = f.rel.replace(extname(f.rel), "");
      const m =
        manifest.get(f.rel) ??
        manifest.get(`${stem}.pdf`) ??
        manifest.get(`${stem}.docx`) ??
        manifest.get(`${stem}.xlsx`) ??
        manifest.get(`${stem}.pptx`) ??
        {};
      const doc = insDoc.get({
        content,
        sha256: contentSha,
        family: f.rel.split(sep)[0] ?? "",
      });
      if (!doc) die(`ingest: upsert failed for ${f.rel}`);
      insCorpus.run({
        corpus,
        uri: f.rel,
        doc_id: doc.id,
        source_sha256: f.srcSha,
        parse_status: f.srcSha ? (status.get(f.srcSha) ?? null) : null,
        parsed_at: f.srcSha ? now : null,
        publisher: m.publisher ?? null,
        category: m.category ?? null,
        dated: m.dated ?? null,
        source_url: m.url ?? m.source_url ?? null,
      });
      n++;
    }
  };
  db.transaction(load)();
  return { preprocess: pre, ingested: n, corpus, root: dir, warnings };
}

const commands: Record<string, Handler> = {
  schema,
  sql,
  write,
  set,
  cite,
  find,
  drop,
  preprocess,
  sync,
  ingest,
};

export async function run(cmd: string, a: string[], stdin?: string): Promise<unknown> {
  const handler = commands[cmd];
  if (!handler) die(`usage: ${Object.keys(commands).join(" | ")}`);
  for (let i = 0; ; i++) {
    try {
      return await handler(a, stdin);
    } catch (e) {
      // busy_timeout=30000 handles most contention; this is the backstop for the burst
      // when many sweep workers commit at once.
      if ((e as { code?: string })?.code !== "SQLITE_BUSY" || i >= 2) throw e;
      await new Promise((r) => setTimeout(r, 100 * 2 ** i));
    }
  }
}

function startServer(port: number) {
  const html = () =>
    new Response(readFileSync(join(ROOT, "ui", "inspector.html"), "utf8"), {
      headers: { "content-type": "text/html", "cache-control": "no-store" },
    });
  const all = (q: string, ...p: (string | number)[]) => db.query(q).all(...p);
  const cites = (jt: string, pk: string, where: string, id: string) =>
    all(
      `SELECT j.${pk} AS pid, c.id, c.kind, c.quote, c.start_off, c.end_off, cd.uri
       FROM ${jt} j
       JOIN citations c ON c.id = j.citation_id
       JOIN runs r ON r.run_id = ?
       JOIN corpus_documents cd ON cd.doc_id = c.doc_id AND cd.corpus = r.corpus
       WHERE j.${pk} IN (${where})`,
      id,
      id,
    );
  Bun.serve({
    port,
    hostname: "127.0.0.1",
    routes: {
      "/": html,
      "/:run_id": html,
      "/runs": () =>
        Response.json(all(`SELECT * FROM v_run_status ORDER BY updated_at DESC, run_id DESC`)),
      "/runs/:id": (req: Bun.BunRequest<"/runs/:id">) => {
        const id = req.params.id;
        if (!RUN_ID_RE.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
        return Response.json({
          status: all(`SELECT * FROM v_run_status WHERE run_id=?`, id)[0],
          briefs: all(`SELECT * FROM briefs WHERE run_id=? ORDER BY version`, id),
          findings: all(`SELECT * FROM findings WHERE run_id=? ORDER BY round, id`, id),
          finding_cites: cites(
            "finding_citations",
            "finding_id",
            "SELECT id FROM findings WHERE run_id=?",
            id,
          ),
          queue: all(`SELECT * FROM queue_items WHERE run_id=? ORDER BY round, id`, id),
          queue_cites: cites(
            "queue_citations",
            "queue_item_id",
            "SELECT id FROM queue_items WHERE run_id=?",
            id,
          ),
          reports: all(`SELECT * FROM reports WHERE run_id=? ORDER BY id`, id),
          claims: all(
            `SELECT rc.* FROM report_claims rc JOIN reports r ON r.id=rc.report_id WHERE r.run_id=? ORDER BY rc.id`,
            id,
          ),
          claim_cites: cites(
            "claim_citations",
            "claim_id",
            "SELECT rc.id FROM report_claims rc JOIN reports r ON r.id=rc.report_id WHERE r.run_id=?",
            id,
          ),
          audits: all(
            `SELECT * FROM audits WHERE run_id=? OR (kind='preprocess' AND corpus=(SELECT corpus FROM runs WHERE run_id=?)) ORDER BY id`,
            id,
            id,
          ),
          corpus_docs: all(
            `SELECT uri, id, substr(sha256,1,12) sha, parse_status, parsed_at, pages, bytes, family
             FROM v_corpus_documents WHERE corpus=(SELECT corpus FROM runs WHERE run_id=?) ORDER BY uri`,
            id,
          ),
          events: all(`SELECT * FROM run_events WHERE run_id=? ORDER BY id`, id),
          feedback: all(`SELECT * FROM feedback WHERE run_id=? ORDER BY id DESC`, id),
          knowledge: all(`SELECT * FROM knowledge WHERE source_run_id=? ORDER BY id`, id),
          knowledge_cites: cites(
            "knowledge_citations",
            "knowledge_id",
            "SELECT id FROM knowledge WHERE source_run_id=?",
            id,
          ),
        });
      },
      "/corpus/:name": (req: Bun.BunRequest<"/corpus/:name">) =>
        Response.json(
          all(
            `SELECT id, uri, family, category, dated, length(content) AS chars, summary
             FROM v_corpus_documents WHERE corpus=? ORDER BY uri`,
            req.params.name,
          ),
        ),
      "/doc/:id": (req: Bun.BunRequest<"/doc/:id">) => {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return Response.json({ error: "bad id" }, { status: 400 });
        const r = all(`SELECT id, content FROM documents WHERE id=?`, id)[0];
        return r ? Response.json(r) : Response.json({ error: "not found" }, { status: 404 });
      },
      "/knowledge/:id": {
        POST: async (req: Bun.BunRequest<"/knowledge/:id">) => {
          const id = Number(req.params.id);
          const b = (await req.json()) as { status: "ratified" | "rejected"; by: string };
          if (
            !Number.isInteger(id) ||
            !["ratified", "rejected"].includes(b.status) ||
            !b.by?.trim()
          )
            return Response.json({ error: "need numeric :id, {status,by}" }, { status: 400 });
          const r = db
            .query(
              `UPDATE knowledge SET ratified_by=?, status=? WHERE id=? AND status='proposed' RETURNING *`,
            )
            .get(b.by.trim(), b.status, id);
          return r
            ? Response.json({ ok: true, ...r })
            : Response.json({ error: "not found or not proposed" }, { status: 404 });
        },
      },
      "/feedback": {
        POST: async (req: Request) => {
          const b = (await req.json()) as {
            run_id: string;
            report_id?: number;
            rating?: string;
            note?: string;
          };
          if (!RUN_ID_RE.test(b.run_id ?? ""))
            return Response.json({ error: "bad run_id" }, { status: 400 });
          db.query(`INSERT INTO feedback(run_id,report_id,rating,note,by) VALUES(?,?,?,?,?)`).run(
            b.run_id,
            b.report_id ?? null,
            b.rating === "up" || b.rating === "down" ? b.rating : null,
            b.note?.trim() || null,
            "local",
          );
          return Response.json({ ok: true });
        },
      },
    },
  });
  console.error(`contracts server → ${SERVE_URL}  (db: ${DB_PATH})`);
  const parent = process.ppid;
  setInterval(() => {
    if (process.ppid !== parent || process.ppid === 1) process.exit(0);
  }, 5000);
}

function serve(): void {
  try {
    startServer(PORT);
  } catch (e) {
    if ((e as { code?: string })?.code === "EADDRINUSE")
      return console.error(`contracts server already running on ${SERVE_URL}`);
    throw e;
  }
}

const [cmd = "", ...a] = process.argv.slice(2);
try {
  if (cmd === "serve") {
    serve();
  } else {
    const stdin = process.stdin.isTTY ? undefined : await Bun.stdin.text();
    console.log(JSON.stringify(await run(cmd, a, stdin)));
  }
} catch (e) {
  console.error(JSON.stringify({ error: String((e as Error)?.message ?? e) }));
  process.exit(1);
}
