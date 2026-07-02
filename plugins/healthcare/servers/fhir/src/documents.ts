import { lstatSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertOwned, ensureOwnedDir, perUidTmpDir } from "./auth/session-file.js";
import type { FhirSession } from "./fhir-client.js";
import { fhirGet, fhirGetBytes, fhirGetRaw, validateFhirId } from "./fhir-client.js";

export interface DocumentEnvelope {
  id: string;
  content_type: string | null;
  text: string | null;
  reason?: string;
  untrusted: true;
}

const TEXT_TYPES = [
  "text/plain",
  "text/html",
  "application/xhtml+xml",
  "text/rtf",
  "application/rtf",
];

function decodeBody(contentType: string, body: string): string {
  if (contentType.startsWith("text/html") || contentType.startsWith("application/xhtml")) {
    return body
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }
  if (contentType.includes("rtf")) {
    // TODO real RTF decode; fixture-tested separately.
    return body.replace(/\\par[d]?/g, "\n").replace(/\{\\\*?\\[^{}]+\}|[{}]|\\[a-z]+\d* ?/g, "");
  }
  return body;
}

export async function getDocumentContent(
  session: FhirSession,
  docRefId: string,
): Promise<DocumentEnvelope> {
  validateFhirId(docRefId, "DocumentReference");
  const docRef = await fhirGet<fhir4.DocumentReference>(session, `DocumentReference/${docRefId}`);
  // some EHRs list several renditions (e.g. PDF first, text/html second) —
  // prefer the first text-decodable one over blindly taking content[0]
  const atts = (docRef.content ?? []).map((c) => c.attachment).filter(Boolean);
  const att =
    atts.find((a) => a?.contentType && TEXT_TYPES.some((t) => a.contentType!.startsWith(t))) ??
    atts[0];
  if (!att)
    return {
      id: docRefId,
      content_type: null,
      text: null,
      reason: "no_attachment",
      untrusted: true,
    };

  const contentType = att.contentType ?? "";
  const isText = TEXT_TYPES.some((t) => contentType.startsWith(t));
  if (!isText) {
    return {
      id: docRefId,
      content_type: contentType,
      text: null,
      reason: "binary_not_extracted",
      untrusted: true,
    };
  }

  let raw: string;
  if (att.data) {
    raw = Buffer.from(att.data, "base64").toString("utf-8");
  } else if (att.url) {
    // attachment.url may be rewritten off-origin by the EHR (Medplum signed
    // storage URLs) — recoverBinaryRef re-fetches same-origin Binary/{id}
    const { body } = await fhirGetRaw(session, att.url, contentType, { recoverBinaryRef: true });
    raw = body;
  } else {
    return {
      id: docRefId,
      content_type: contentType,
      text: null,
      reason: "no_attachment",
      untrusted: true,
    };
  }

  return {
    id: docRefId,
    content_type: contentType,
    text: decodeBody(contentType, raw),
    untrusted: true,
  };
}

// extraction tooling keys off the extension, so the temp file must carry one
const EXT_BY_TYPE: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "application/msword": ".doc",
  "text/rtf": ".rtf",
  "application/rtf": ".rtf",
  "text/plain": ".txt",
  "text/html": ".html",
  "application/xhtml+xml": ".html",
};

export interface SavedDocument {
  id: string;
  content_type: string | null;
  path: string | null;
  bytes: number;
  reason?: string;
}

// One owned 0700 parent per uid, unpredictable mkdtemp dirs inside it: the
// parent is ownership-asserted (pre-creation by another user is refused),
// and the sweep's blast radius is this dir only — never the whole tmpdir.
const docsBase = perUidTmpDir("mcp-fhir-docs");

// Crash backstop: callers delete each save right after extraction, so a dir
// older than this was stranded; the age gate keeps a starting sibling
// instance (same uid, e.g. two CLI sessions) from sweeping a live save.
const STALE_AFTER_MS = 15 * 60 * 1000;

export function sweepStaleDocuments(): void {
  // earlier layouts: mcp-server-fhir/ (docs + old session file) and
  // mcp-fhir-doc-* mkdtemp dirs directly under tmpdir (never released)
  try {
    const legacy = join(tmpdir(), "mcp-server-fhir");
    assertOwned(legacy, true);
    rmSync(legacy, { recursive: true, force: true });
  } catch {}
  try {
    for (const f of readdirSync(tmpdir())) {
      if (!f.startsWith("mcp-fhir-doc-") || f.startsWith("mcp-fhir-docs-")) continue;
      const p = join(tmpdir(), f);
      try {
        assertOwned(p, true);
        rmSync(p, { recursive: true, force: true });
      } catch {}
    }
  } catch {}
  try {
    assertOwned(docsBase, true);
    const cutoff = Date.now() - STALE_AFTER_MS;
    for (const f of readdirSync(docsBase)) {
      const p = join(docsBase, f);
      try {
        if (lstatSync(p).mtimeMs < cutoff) rmSync(p, { recursive: true, force: true });
      } catch {}
    }
  } catch {}
}

// Writes the attachment to a server-chosen tmpdir path (0600) so an external
// extractor can read it. The caller deletes the file's parent dir when done;
// the startup sweep only backstops crashes.
export async function saveDocumentForExtraction(
  session: FhirSession,
  docRefId: string,
): Promise<SavedDocument> {
  validateFhirId(docRefId, "DocumentReference");
  const docRef = await fhirGet<fhir4.DocumentReference>(session, `DocumentReference/${docRefId}`);
  const att = (docRef.content ?? []).map((c) => c.attachment).filter(Boolean)[0];
  if (!att)
    return { id: docRefId, content_type: null, path: null, bytes: 0, reason: "no_attachment" };

  const contentType = (att.contentType ?? "").split(";")[0]!.trim();
  const ext = EXT_BY_TYPE[contentType];
  if (!ext)
    return {
      id: docRefId,
      content_type: contentType,
      path: null,
      bytes: 0,
      reason: `unsupported_content_type`,
    };

  let buf: Buffer;
  if (att.data) {
    buf = Buffer.from(att.data, "base64");
  } else if (att.url) {
    // attachment.url may be rewritten off-origin by the EHR (Medplum signed
    // storage URLs) — recoverBinaryRef re-fetches same-origin Binary/{id}
    buf = await fhirGetBytes(session, att.url, contentType, { recoverBinaryRef: true });
  } else {
    return {
      id: docRefId,
      content_type: contentType,
      path: null,
      bytes: 0,
      reason: "no_attachment",
    };
  }

  ensureOwnedDir(docsBase);
  const dir = mkdtempSync(join(docsBase, "doc-"));
  const path = join(dir, `doc-${docRefId}${ext}`);
  writeFileSync(path, buf, { mode: 0o600, flag: "wx" });
  return { id: docRefId, content_type: contentType, path, bytes: buf.length };
}
