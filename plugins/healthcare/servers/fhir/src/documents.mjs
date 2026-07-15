import { lstatSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// single shared copy of the format decoders — imported directly from the
// doc-extract skill, which ships in this same plugin
import {
  decodeRtf,
  decodeXml,
  stripMarkup,
} from "../../../skills/doc-extract/scripts/decoders.mjs";
import { assertOwned, ensureOwnedDir, perUidTmpDir } from "./auth/session-file.mjs";
import { fhirGet, fhirGetBytes, fhirGetRaw, validateFhirId } from "./fhir-client.mjs";

/** @typedef {import("./fhir-client.mjs").FhirSession} FhirSession */

/**
 * @typedef {object} DocumentEnvelope
 * @property {string} id
 * @property {string | null} content_type
 * @property {string | null} text
 * @property {string} [reason]
 * @property {true} untrusted
 */

// One registry decides how every attachment content type is handled:
// `inline` decodes to text in-process (no disk, no extractor deps) — returning
// null means "text-typed but not actually inlineable" (e.g. CDA wrapping a
// base64 PDF) and falls through to the binary path; `ext` names the temp file
// for save_document_for_extraction. Types with no entry still save (sniffed or
// subtype-derived extension, worst case .bin) — the doc-extract skill, not this
// server, is the authority on what it can parse, so save never refuses on type.
// Extensions here must stay recognizable by doc-extract's EXT_TO_KIND table
// (skills/doc-extract/scripts/extract.ts).
/**
 * @typedef {object} TypeHandling
 * @property {string} ext
 * @property {(body: string) => string | null} [inline]
 */

/** @type {Record<string, TypeHandling>} */
const CONTENT_TYPES = {
  "text/plain": { ext: ".txt", inline: (b) => b },
  "text/markdown": { ext: ".md", inline: (b) => b },
  "text/html": { ext: ".html", inline: stripMarkup },
  "application/xhtml+xml": { ext: ".html", inline: stripMarkup },
  "text/rtf": { ext: ".rtf", inline: decodeRtf },
  "application/rtf": { ext: ".rtf", inline: decodeRtf },
  "text/richtext": { ext: ".rtf", inline: decodeRtf }, // Oracle Health serves this alias
  "text/xml": { ext: ".xml", inline: decodeXml },
  "application/xml": { ext: ".xml", inline: decodeXml },
  "application/hl7-cda+xml": { ext: ".xml", inline: decodeXml },
  "application/pdf": { ext: ".pdf" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: ".docx" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: ".xlsx" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { ext: ".pptx" },
  "application/msword": { ext: ".doc" },
  "image/tiff": { ext: ".tif" },
  "image/jpeg": { ext: ".jpg" },
  "image/png": { ext: ".png" },
};

// An inline decode longer than this floods the model context (CDA/HTML with
// embedded base64 blobs) — route to the file path instead.
const MAX_INLINE_CHARS = 1_000_000;
// Refuse to buffer arbitrarily large binaries in the MCP server process.
const MAX_SAVE_BYTES = 100 * 1024 * 1024;

/** @param {string | undefined} contentType @returns {string} */
function normalizeType(contentType) {
  return (contentType ?? "").split(";")[0].trim().toLowerCase();
}

/** @param {fhir4.DocumentReference} docRef @returns {fhir4.Attachment[]} */
function attachmentList(docRef) {
  return (docRef.content ?? [])
    .map((c) => c.attachment)
    .filter(/** @returns {a is fhir4.Attachment} */ (a) => !!a);
}

// a metadata-only stub (hash/title, no data or url) can't be fetched
/** @param {fhir4.Attachment} a @returns {boolean} */
function retrievable(a) {
  return !!(a.data || a.url);
}

/** @param {fhir4.Attachment} a */
function inlineFor(a) {
  return CONTENT_TYPES[normalizeType(a.contentType)]?.inline;
}

// Multi-rendition DocumentReferences (Epic notes ship HTML + RTF [+ scan]):
// save_document_for_extraction exists to recover what inline decoding can't
// handle, so it prefers the retrievable binary rendition.
/** @param {fhir4.DocumentReference} docRef @returns {fhir4.Attachment | undefined} */
function pickBinaryAttachment(docRef) {
  const atts = attachmentList(docRef);
  const fetchable = atts.filter(retrievable);
  // the atts[0] tail can be an unretrievable stub — callers still want its
  // content_type for the no_attachment envelope
  return fetchable.find((a) => !inlineFor(a)) ?? fetchable[0] ?? atts[0];
}

/**
 * @param {FhirSession} session
 * @param {string} docRefId
 * @returns {Promise<DocumentEnvelope>}
 */
export async function getDocumentContent(session, docRefId) {
  validateFhirId(docRefId, "DocumentReference");
  const docRef = /** @type {fhir4.DocumentReference} */ (
    await fhirGet(session, `DocumentReference/${docRefId}`)
  );
  const atts = attachmentList(docRef);

  // try every retrievable inline-decodable rendition in order — a CDA that
  // wraps a base64 blob, or a rendition whose Binary URL is broken, shouldn't
  // mask a decodable sibling
  for (const att of atts) {
    const decode = inlineFor(att);
    if (!decode || !retrievable(att)) continue;
    const contentType = normalizeType(att.contentType);
    try {
      // attachment.url may be rewritten off-origin by the EHR (Medplum signed
      // storage URLs) — recoverBinaryRef re-fetches same-origin Binary/{id}
      // retrievable(att) above guarantees data or url
      const raw = att.data
        ? Buffer.from(att.data, "base64").toString("utf-8")
        : (
            await fhirGetRaw(session, /** @type {string} */ (att.url), contentType, {
              recoverBinaryRef: true,
            })
          ).body;
      const text = decode(raw);
      if (text !== null && text.length <= MAX_INLINE_CHARS) {
        return { id: docRefId, content_type: contentType, text, untrusted: true };
      }
    } catch (e) {
      // an off-origin refusal is a security signal (possibly tampered
      // attachment.url) — surface it rather than degrade to a binary envelope
      if (e instanceof Error && e.message.includes("off-origin")) throw e;
      // broken Binary URL etc. — fall through to the next rendition; the
      // binary_not_extracted fallback routes recovery through save, which
      // surfaces the fetch error if it recurs there
    }
  }

  // nothing decoded inline; report the rendition save_document_for_extraction would fetch
  const fallback = pickBinaryAttachment(docRef);
  return {
    id: docRefId,
    content_type: fallback ? normalizeType(fallback.contentType) : null,
    text: null,
    // binary_not_extracted is recoverable: save_document_for_extraction + doc-extract
    reason: fallback && retrievable(fallback) ? "binary_not_extracted" : "no_attachment",
    untrusted: true,
  };
}

/**
 * @typedef {object} SavedDocument
 * @property {string} id
 * @property {string | null} content_type
 * @property {string | null} path
 * @property {number} bytes
 * @property {string} [reason]
 */

// One owned 0700 parent per uid, unpredictable mkdtemp dirs inside it: the
// parent is ownership-asserted (pre-creation by another user is refused),
// and the sweep's blast radius is this dir only — never the whole tmpdir.
const docsBase = perUidTmpDir("mcp-fhir-docs");

// Crash backstop: callers delete each save right after extraction, so a dir
// older than this was stranded; the age gate keeps a starting sibling
// instance (same uid, e.g. two CLI sessions) from sweeping a live save.
const STALE_AFTER_MS = 15 * 60 * 1000;

/** @returns {void} */
export function sweepStaleDocuments() {
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

// Extraction tooling keys off the extension, so the temp file must carry one.
// Unknown/mislabeled types (application/octet-stream, vendor types) get a
// magic-byte sniff, then a sanitized subtype-derived extension, worst case .bin.
/** @param {Buffer} buf @returns {string | undefined} */
function sniffExtension(buf) {
  const head = buf.subarray(0, 8).toString("latin1");
  if (head.startsWith("%PDF")) return ".pdf";
  if (head.startsWith("{\\rtf")) return ".rtf";
  if (head.startsWith("\x89PNG")) return ".png";
  if (head.startsWith("\xff\xd8")) return ".jpg";
  if (head.startsWith("II*\x00") || head.startsWith("MM\x00*")) return ".tif";
  // zip container: docx is by far the likeliest Office payload in a
  // DocumentReference; a wrong guess (xlsx/pptx) fails downstream with a
  // clear extractor error rather than silently here
  if (head.startsWith("PK\x03\x04")) return ".docx";
  if (/^\s*<(\?xml|ClinicalDocument)/.test(buf.subarray(0, 256).toString("utf-8"))) return ".xml";
  return undefined;
}

/** @param {string} contentType @param {Buffer} [buf] @returns {string} */
function extensionFor(contentType, buf) {
  const known = CONTENT_TYPES[contentType]?.ext;
  if (known) return known;
  const sniffed = buf && sniffExtension(buf);
  if (sniffed) return sniffed;
  const subtype = contentType
    .split("/")[1]
    ?.replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
  return subtype ? `.${subtype}` : ".bin";
}

// Writes the attachment to a server-chosen tmpdir path (0600) so an external
// extractor can read it. The caller deletes the file's parent dir when done;
// the startup sweep only backstops crashes.
/**
 * @param {FhirSession} session
 * @param {string} docRefId
 * @returns {Promise<SavedDocument>}
 */
export async function saveDocumentForExtraction(session, docRefId) {
  validateFhirId(docRefId, "DocumentReference");
  const docRef = /** @type {fhir4.DocumentReference} */ (
    await fhirGet(session, `DocumentReference/${docRefId}`)
  );
  const att = pickBinaryAttachment(docRef);
  if (!att)
    return { id: docRefId, content_type: null, path: null, bytes: 0, reason: "no_attachment" };

  const contentType = normalizeType(att.contentType);
  /** @param {string} reason @param {number} [bytes] @returns {SavedDocument} */
  const fail = (reason, bytes = 0) => ({
    id: docRefId,
    content_type: contentType,
    path: null,
    bytes,
    reason,
  });

  const declared = att.size ?? 0;
  if (declared > MAX_SAVE_BYTES) return fail("attachment_too_large", declared);

  /** @type {Buffer} */
  let buf;
  if (att.data) {
    buf = Buffer.from(att.data, "base64");
  } else if (att.url) {
    // attachment.url may be rewritten off-origin by the EHR (Medplum signed
    // storage URLs) — recoverBinaryRef re-fetches same-origin Binary/{id}
    buf = await fhirGetBytes(session, att.url, contentType, { recoverBinaryRef: true });
  } else {
    return fail("no_attachment");
  }
  if (buf.length > MAX_SAVE_BYTES) return fail("attachment_too_large", buf.length);

  ensureOwnedDir(docsBase);
  const dir = mkdtempSync(join(docsBase, "doc-"));
  const path = join(dir, `doc-${docRefId}${extensionFor(contentType, buf)}`);
  writeFileSync(path, buf, { mode: 0o600, flag: "wx" });
  return { id: docRefId, content_type: contentType, path, bytes: buf.length };
}

// exported for tests only
export const _internal = {
  decodeRtf,
  decodeXml,
  extensionFor,
  normalizeType,
  pickBinaryAttachment,
  stripMarkup,
};
