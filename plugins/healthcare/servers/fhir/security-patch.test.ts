/**
 * Behavioral pins for the security hardening in this server. These drive the
 * REAL exported functions and tool handlers against local HTTP doubles.
 *
 * The tool-level tests register the real tools against a minimal capturing
 * stand-in for McpServer and invoke the captured handlers directly. tools.ts
 * imports McpServer as a type only, so this file's only runtime dependency
 * is zod — which is what lets the repo-root `bun test` run (root lockfile)
 * cover a standalone package that keeps its own lockfile. At the repo root,
 * zod resolves from the root lockfile's hoisted copy; if root CI ever fails
 * here with "Cannot find module 'zod'", add zod to the root devDependencies
 * — the tests themselves are not broken.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { OwnershipError, persistSession } from "./src/auth/session-file.js";
import { discover, smartRefresh } from "./src/auth/smart.js";
import {
  getDocumentContent,
  saveDocumentForExtraction,
  sweepStaleDocuments,
} from "./src/documents.js";
import {
  fhirGetRaw,
  fhirSearch,
  resolveAttachmentRef,
  type FhirSession,
} from "./src/fhir-client.js";
import { HANDLERS } from "./src/tools.js";

const uid = process.getuid?.() ?? -1;
// mirrors perUidTmpDir on purpose: a layout change that moves saves out of
// the owner-only per-uid base should fail here, not silently pass
const docsBase = join(tmpdir(), `mcp-fhir-docs-${uid >= 0 ? uid : "u"}`);
const sessionFile = join(tmpdir(), `mcp-server-fhir-${uid >= 0 ? uid : "u"}`, "session.json");

let evil: Server;
let evilUrl = "";
// counts every request that LANDS on the evil origin — the S1/S1b pins
// assert this stays flat: "the fetch rejected" alone is vacuous (old code
// following the redirect also rejects later, on the non-JSON body, AFTER
// the credential has already landed)
let evilHits = 0;
let redirecting: Server;
let redirectingUrl = "";
let redirecting307: Server;
let redirecting307Url = "";
let docServer: Server;
let docUrl = "";

beforeAll(async () => {
  evil = createServer((_req, res) => {
    evilHits++;
    res.setHeader("content-type", "text/plain");
    res.end("EVIL-ORIGIN-BODY");
  });
  await new Promise<void>((ok) => evil.listen(0, "127.0.0.1", ok));
  const ea = evil.address();
  evilUrl = `http://localhost:${typeof ea === "object" && ea ? ea.port : 0}`;

  redirecting = createServer((_req, res) => {
    res.statusCode = 302;
    res.setHeader("location", `${evilUrl}/loot`);
    res.end();
  });
  await new Promise<void>((ok) => redirecting.listen(0, "127.0.0.1", ok));
  const ra = redirecting.address();
  redirectingUrl = `http://localhost:${typeof ra === "object" && ra ? ra.port : 0}`;

  // 307 preserves method AND body on follow — the variant that re-POSTs
  // credentials, per the smart.ts tokenRequest comment
  redirecting307 = createServer((_req, res) => {
    res.statusCode = 307;
    res.setHeader("location", `${evilUrl}/token`);
    res.end();
  });
  await new Promise<void>((ok) => redirecting307.listen(0, "127.0.0.1", ok));
  const r7 = redirecting307.address();
  redirecting307Url = `http://localhost:${typeof r7 === "object" && r7 ? r7.port : 0}`;

  docServer = createServer((req, res) => {
    res.setHeader("content-type", "application/fhir+json");
    if ((req.url ?? "").startsWith("/DocumentReference/d1"))
      return res.end(
        JSON.stringify({
          resourceType: "DocumentReference",
          id: "d1",
          content: [
            {
              attachment: {
                contentType: "application/pdf",
                data: Buffer.from("%PDF-legit").toString("base64"),
              },
            },
          ],
        }),
      );
    res.end(JSON.stringify({ resourceType: "OperationOutcome" }));
  });
  await new Promise<void>((ok) => docServer.listen(0, "127.0.0.1", ok));
  const da = docServer.address();
  docUrl = `http://localhost:${typeof da === "object" && da ? da.port : 0}`;
});

afterAll(async () => {
  for (const s of [evil, redirecting, redirecting307, docServer])
    await new Promise<void>((ok) => s.close(() => ok()));
});

describe("S1 — the document-text path never follows redirects", () => {
  it("a 302 on fhirGetRaw rejects instead of following to another origin", async () => {
    const session: FhirSession = {
      baseUrl: new URL(`${redirectingUrl}/`),
      token: "secret-token",
    };
    let leaked = "";
    try {
      const { body } = await fhirGetRaw(session, "/Note/n1", "text/plain");
      leaked = String(body);
    } catch {
      // rejecting is the required behavior
    }
    expect(leaked).not.toContain("EVIL-ORIGIN-BODY");
  });
});

describe("S2 — extraction writes land in a fresh owner-only dir per save", () => {
  it("saved.path sits in a new doc-* dir under the owner-only per-uid base, never a reusable path", async () => {
    const session: FhirSession = {
      baseUrl: new URL(`${docUrl}/`),
      token: null,
    };
    const a = await saveDocumentForExtraction(session, "d1");
    const b = await saveDocumentForExtraction(session, "d1");
    try {
      expect(a.path).not.toBeNull();
      expect(b.path).not.toBeNull();
      const dirA = dirname(a.path!);
      const dirB = dirname(b.path!);
      for (const d of [dirA, dirB]) {
        expect(dirname(d)).toBe(docsBase);
        expect(basename(d).startsWith("doc-")).toBe(true);
        expect(statSync(d).mode & 0o777).toBe(0o700);
      }
      expect(statSync(docsBase).mode & 0o777).toBe(0o700);
      expect(statSync(a.path!).mode & 0o777).toBe(0o600);
      // same doc saved twice lands in two distinct dirs: no component of
      // the path is predictable, so there is no target to pre-create or
      // symlink-swap
      expect(dirA).not.toBe(dirB);
    } finally {
      for (const p of [a.path, b.path]) if (p) rmSync(dirname(p), { recursive: true, force: true });
    }
  });

  it("a path-shaped docRefId is rejected before any fetch or write", async () => {
    const session: FhirSession = {
      baseUrl: new URL(`${docUrl}/`),
      token: null,
    };
    await expect(saveDocumentForExtraction(session, "../escape")).rejects.toThrow(
      /Invalid DocumentReference id/,
    );
  });
});

describe("S2c — sweep only removes doc dirs this user owns, never through symlinks", () => {
  it("sweeps a genuine stale legacy dir; skips a planted symlink with the same prefix", async () => {
    const stale = mkdtempSync(join(tmpdir(), "mcp-fhir-doc-"));
    writeFileSync(join(stale, "doc-old.pdf"), "stale");
    const lootDir = join(tmpdir(), `loot-${Date.now()}`);
    mkdirSync(lootDir, { recursive: true });
    writeFileSync(join(lootDir, "keep.txt"), "KEEP");
    const planted = join(tmpdir(), "mcp-fhir-doc-planted");
    rmSync(planted, { recursive: true, force: true });
    symlinkSync(lootDir, planted);
    try {
      sweepStaleDocuments();
      expect(existsSync(stale)).toBe(false);
      expect(readFileSync(join(lootDir, "keep.txt"), "utf8")).toBe("KEEP");
      // skip means UNTOUCHED: without the ownership guard the sweep
      // unlinks the planted symlink itself (rmSync removes the link) —
      // its survival is what proves the guard ran
      expect(lstatSync(planted).isSymbolicLink()).toBe(true);
    } finally {
      rmSync(planted, { force: true });
      rmSync(lootDir, { recursive: true, force: true });
      rmSync(stale, { recursive: true, force: true });
    }
  });

  it("the per-uid base sweep is age-gated: a live sibling's fresh save survives, a stranded one is reclaimed", async () => {
    mkdirSync(docsBase, { recursive: true, mode: 0o700 });
    const fresh = mkdtempSync(join(docsBase, "doc-"));
    const stranded = mkdtempSync(join(docsBase, "doc-"));
    const past = new Date(Date.now() - 20 * 60 * 1000); // beyond STALE_AFTER_MS
    utimesSync(stranded, past, past);
    try {
      sweepStaleDocuments();
      expect(existsSync(fresh)).toBe(true);
      expect(existsSync(stranded)).toBe(false);
    } finally {
      for (const d of [fresh, stranded]) rmSync(d, { recursive: true, force: true });
    }
  });
});

describe("carry-item — OwnershipError surfaces from persistSession, never swallowed", () => {
  it("persistSession THROWS when the session-file path is not ours", async () => {
    mkdirSync(dirname(sessionFile), { recursive: true, mode: 0o700 });
    rmSync(sessionFile, { force: true });
    // a SYMLINK at the session-file path drives assertOwned's
    // not-a-regular-path branch (lstat sees the link, not the target) —
    // constructible without a foreign uid; a directory plant would stop
    // earlier at writeFileSync's EISDIR, which is ordinary I/O and
    // correctly stays swallowed
    const decoy = join(tmpdir(), `decoy-${Date.now()}.json`);
    writeFileSync(decoy, "{}");
    symlinkSync(decoy, sessionFile);
    try {
      expect(() =>
        persistSession({ baseUrl: new URL("http://localhost:9/"), token: null }),
      ).toThrow(OwnershipError);
    } finally {
      rmSync(sessionFile, { force: true });
      rmSync(decoy, { force: true });
    }
  });
});

describe("S1b — auth-path fetches never follow redirects (parity with the S1 data-path pin)", () => {
  it("SMART discovery against a redirecting origin rejects AND nothing lands off-origin", async () => {
    const before = evilHits;
    await expect(discover(new URL(`${redirectingUrl}/`))).rejects.toThrow();
    // the real invariant: the evil origin never saw a request — a bare
    // rejects-check is vacuous (following code also rejects, on the
    // non-JSON body, after the request has already landed)
    expect(evilHits).toBe(before);
  });

  it("the token exchange against a 307 token_endpoint rejects without re-POSTing the credential", async () => {
    // 307 preserves method and body on follow — the grant that would be
    // re-sent here is the refresh token (on other grant paths: the
    // authorization code / PKCE verifier / signed client assertion)
    const before = evilHits;
    await expect(
      smartRefresh(
        {
          authorization_endpoint: `${redirecting307Url}/authorize`,
          token_endpoint: `${redirecting307Url}/token`,
        } as never,
        "client-1",
        "refresh-tok-1",
      ),
    ).rejects.toThrow();
    expect(evilHits).toBe(before);
  });
});

// The handlers are a direct export now (the SDK and its registration
// indirection are gone), so the old fake-McpServer capture reduces to a map.
type ToolResult = { content: { type: string; text: string }[] };
function loadToolHandlers(): Map<string, (args: unknown) => Promise<ToolResult>> {
  return new Map(
    Object.entries(HANDLERS).map(([name, fn]) => [
      name,
      (args: unknown) => fn((args ?? {}) as Record<string, unknown>) as Promise<ToolResult>,
    ]),
  );
}

describe("S3 — patient identifiers never enter request URLs (POST _search)", () => {
  let fhirServer: Server;
  let fhirUrl = "";
  const hits: { method: string; url: string; body: string }[] = [];

  beforeAll(async () => {
    fhirServer = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        hits.push({ method: req.method ?? "", url: req.url ?? "", body });
        res.setHeader("content-type", "application/fhir+json");
        if ((req.url ?? "").startsWith("/metadata"))
          return res.end(
            JSON.stringify({
              resourceType: "CapabilityStatement",
              fhirVersion: "4.0.1",
              status: "active",
              date: "2026-01-01",
              kind: "instance",
              format: ["json"],
            }),
          );
        return res.end(
          JSON.stringify({
            resourceType: "Bundle",
            type: "searchset",
            total: 1,
            entry: [
              {
                resource: {
                  resourceType: "Patient",
                  id: "p9",
                  name: [{ family: "Lindqvist", given: ["Maja"] }],
                  birthDate: "1971-02-03",
                  identifier: [{ type: { coding: [{ code: "MR" }] }, value: "MRN-99001" }],
                },
              },
            ],
          }),
        );
      });
    });
    await new Promise<void>((ok) => fhirServer.listen(0, "127.0.0.1", ok));
    const a = fhirServer.address();
    fhirUrl = `http://localhost:${typeof a === "object" && a ? a.port : 0}`;
  });
  afterAll(() => {
    fhirServer.close();
    // the connect calls below persist a real (throwaway) session for this
    // uid — don't leave it behind for a later real server start to restore
    rmSync(sessionFile, { force: true });
  });

  // the three direct-identifier values the pin tracks across every request
  const IDENTIFIERS = ["Lindqvist", "1971-02-03", "MRN-99001"];

  it("fhirSearch sends parameters in the form body, never the URL", async () => {
    hits.length = 0;
    const session: FhirSession = { baseUrl: new URL(fhirUrl), token: null };
    const bundle = await fhirSearch<{ total?: number }>(session, "Patient", {
      name: "Lindqvist",
      birthdate: "1971-02-03",
      identifier: "MRN-99001",
      _count: "20",
    });
    expect(bundle.total).toBe(1);
    expect(hits).toHaveLength(1);
    const h = hits[0]!;
    expect(h.method).toBe("POST");
    expect(h.url).toBe("/Patient/_search"); // no query string at all
    for (const v of IDENTIFIERS) expect(h.body).toContain(v);
  });

  it("the REAL search_patients tool routes identifiers through POST _search end-to-end", async () => {
    hits.length = 0;
    const tools = loadToolHandlers();
    const conn = await tools.get("connect")!({ base_url: fhirUrl, bearer_token: "test-token" });
    expect(conn.content[0]!.text).toContain("Connected");
    const res = await tools.get("search_patients")!({
      name: "Lindqvist",
      birthdate: "1971-02-03",
      identifier: "MRN-99001",
    });
    expect(res.content[0]!.text).toContain("Lindqvist");
    // every request's access-loggable line (method + URL) is identifier-free
    expect(hits.length).toBeGreaterThanOrEqual(2); // metadata + search
    for (const h of hits) for (const v of IDENTIFIERS) expect(h.url).not.toContain(v);
    const search = hits.find((h) => h.url.startsWith("/Patient"));
    expect(search?.method).toBe("POST");
    expect(search?.url).toBe("/Patient/_search");
    for (const v of IDENTIFIERS) expect(search?.body).toContain(v);
  });

  it("search_resource (the generic escape hatch) also routes identifier-class params through POST _search", async () => {
    hits.length = 0;
    const tools = loadToolHandlers();
    const conn = await tools.get("connect")!({ base_url: fhirUrl, bearer_token: "test-token" });
    expect(conn.content[0]!.text).toContain("Connected");
    // the bypass shape: Patient search with direct identifiers through the
    // generic tool instead of search_patients
    const res = await tools.get("search_resource")!({
      resource_type: "Patient",
      params: {
        name: "Lindqvist",
        birthdate: "1971-02-03",
        identifier: "MRN-99001",
      },
    });
    expect(res.content[0]!.text).toContain("Lindqvist");
    expect(hits.length).toBeGreaterThanOrEqual(2); // metadata + search
    for (const h of hits) for (const v of IDENTIFIERS) expect(h.url).not.toContain(v);
    const search = hits.find((h) => h.url.startsWith("/Patient"));
    expect(search?.method).toBe("POST");
    expect(search?.url).toBe("/Patient/_search");
    for (const v of IDENTIFIERS) expect(search?.body).toContain(v);
  });

  it("connect survives session-persistence tampering: stays connected, surfaces the warning", async () => {
    // the refined semantic: an OwnershipError during persistSession must not
    // fail connect (that would hand the tmpdir-tamperer a connect DoS, and
    // in the headless path the one-time auth code is already spent) — the
    // session stays live in memory and the warning reaches the user
    mkdirSync(dirname(sessionFile), { recursive: true, mode: 0o700 });
    rmSync(sessionFile, { force: true });
    const decoy = join(tmpdir(), `decoy-connect-${Date.now()}.json`);
    writeFileSync(decoy, "{}");
    symlinkSync(decoy, sessionFile);
    try {
      const tools = loadToolHandlers();
      const conn = await tools.get("connect")!({ base_url: fhirUrl, bearer_token: "test-token" });
      const msg = conn.content[0]!.text;
      expect(msg).toContain("Connected");
      expect(msg).toContain("WARNING: session not persisted");
      // still usable: the in-memory session serves requests
      hits.length = 0;
      const res = await tools.get("search_patients")!({ name: "Lindqvist" });
      expect(res.content[0]!.text).toContain("Lindqvist");
      expect(hits.length).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(sessionFile, { force: true });
      rmSync(decoy, { force: true });
    }
  });
});

describe("S1c — off-origin attachment.url is never fetched; a recoverable Binary/{id} re-fetches same-origin", () => {
  // FHIR base double for an EHR that rewrites attachment.url to a signed
  // off-origin storage URL (the hosted-Medplum shape: lowercase "binary"
  // path segment, version suffix, signature query)
  let medplumLike: Server;
  let medplumUrl = "";

  beforeAll(async () => {
    medplumLike = createServer((req, res) => {
      const url = req.url ?? "";
      if (url.startsWith("/DocumentReference/m1")) {
        res.setHeader("content-type", "application/fhir+json");
        return res.end(
          JSON.stringify({
            resourceType: "DocumentReference",
            id: "m1",
            content: [
              {
                attachment: {
                  contentType: "text/plain",
                  url: `${evilUrl}/binary/bin-7/v2?Signature=sig&Expires=1`,
                },
              },
            ],
          }),
        );
      }
      if (url.startsWith("/DocumentReference/m2")) {
        res.setHeader("content-type", "application/fhir+json");
        return res.end(
          JSON.stringify({
            resourceType: "DocumentReference",
            id: "m2",
            content: [
              {
                attachment: {
                  contentType: "text/plain",
                  url: `${evilUrl}/storage/blob-9?Signature=sig`,
                },
              },
            ],
          }),
        );
      }
      if (url.startsWith("/Binary/bin-7")) {
        res.setHeader("content-type", "text/plain");
        return res.end("SAME-ORIGIN-RECOVERED");
      }
      res.setHeader("content-type", "application/fhir+json");
      res.end(JSON.stringify({ resourceType: "OperationOutcome" }));
    });
    await new Promise<void>((ok) => medplumLike.listen(0, "127.0.0.1", ok));
    const ma = medplumLike.address();
    medplumUrl = `http://localhost:${typeof ma === "object" && ma ? ma.port : 0}`;
  });

  afterAll(async () => {
    await new Promise<void>((ok) => medplumLike.close(() => ok()));
  });

  it("recovers the document via {base}/Binary/{id} with zero requests landing off-origin", async () => {
    const session: FhirSession = { baseUrl: new URL(`${medplumUrl}/`), token: "secret-token" };
    const before = evilHits;
    const doc = await getDocumentContent(session, "m1");
    expect(doc.text).toBe("SAME-ORIGIN-RECOVERED");
    // the real invariant: the storage origin never saw a request — neither
    // the signed URL itself nor anything else leaked there
    expect(evilHits).toBe(before);
  });

  it("an off-origin attachment.url with no recoverable Binary id still dead-ends, zero off-origin requests", async () => {
    const session: FhirSession = { baseUrl: new URL(`${medplumUrl}/`), token: "secret-token" };
    const before = evilHits;
    await expect(getDocumentContent(session, "m2")).rejects.toThrow(/off-origin/);
    expect(evilHits).toBe(before);
  });

  it("recovery cannot be steered to another resource type, a traversal, or an oversize id", () => {
    const session: FhirSession = { baseUrl: new URL(`${medplumUrl}/`), token: null };
    // URL pathname normalization collapses ".." before the regex ever runs,
    // and the id charset excludes "/" — so the recovered ref is always a
    // single same-origin Binary/{id} path segment
    expect(() => resolveAttachmentRef(session, `${evilUrl}/Binary/../Patient/p1`)).toThrow(
      /off-origin/,
    );
    expect(() => resolveAttachmentRef(session, `${evilUrl}/Binary/${"a".repeat(65)}`)).toThrow(
      /off-origin/,
    );
    const recovered = resolveAttachmentRef(session, `${evilUrl}/binary/bin-7/v2?Signature=s`);
    expect(recovered.origin).toBe(new URL(medplumUrl).origin);
    expect(recovered.pathname.endsWith("/Binary/bin-7")).toBe(true);
  });
});
