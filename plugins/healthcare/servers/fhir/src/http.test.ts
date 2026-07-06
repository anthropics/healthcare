import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";

import {
  getStatus,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
} from "@medplum/core";
import { readJson } from "@medplum/definitions";
import { FhirRouter, MemoryRepository, makeSimpleRequest } from "@medplum/fhir-router";
import type { HttpMethod } from "@medplum/fhir-router";

import { getDocumentContent, saveDocumentForExtraction } from "./documents.js";
import type { FhirSession } from "./fhir-client.js";
import { fhirGet, validateBaseUrl } from "./fhir-client.js";

// Offline FHIR R4 server: FhirRouter + MemoryRepository behind Bun.serve, so
// the client/document layer is exercised over real HTTP without a live
// sandbox. Raw Binary bytes are served by the wrapper — MemoryRepository
// stores resources, not binary payloads.

const router = new FhirRouter();
const repo = new MemoryRepository();
const binaries = new Map<string, { contentType: string; bytes: Uint8Array }>();

let server: ReturnType<typeof Bun.serve>;
let session: FhirSession;

const CDA_XML =
  '<?xml version="1.0"?><ClinicalDocument xmlns="urn:hl7-org:v3">' +
  "<title>Admission Note</title><component><structuredBody><component>" +
  "<section><title>History of Present Illness</title>" +
  "<text><paragraph>Presenting with chest pain and dyspnea.</paragraph></text></section>" +
  "</component></structuredBody></component></ClinicalDocument>";

const PDF_BYTES = new TextEncoder().encode("%PDF-1.4 fake-but-sniffable pdf body");

beforeAll(async () => {
  // search-param matching needs the R4 schema indexed into @medplum/core
  indexStructureDefinitionBundle(readJson("fhir/r4/profiles-types.json") as never);
  indexStructureDefinitionBundle(readJson("fhir/r4/profiles-resources.json") as never);
  indexSearchParameterBundle(readJson("fhir/r4/search-parameters.json") as never);

  server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      const url = new URL(req.url);
      const bin = url.pathname.match(/^\/Binary\/([A-Za-z0-9\-.]+)$/);
      if (bin && binaries.has(bin[1]!)) {
        const b = binaries.get(bin[1]!)!;
        return new Response(b.bytes, { headers: { "content-type": b.contentType } });
      }
      // read-only harness: seeding goes through repo.createResource directly
      const fhirReq = makeSimpleRequest(req.method as HttpMethod, url.pathname + url.search);
      const [outcome, resource] = await router.handleRequest(fhirReq, repo);
      return Response.json(resource ?? outcome, { status: getStatus(outcome) });
    },
  });
  session = { baseUrl: validateBaseUrl(`http://localhost:${server.port}`), token: null };

  await repo.createResource({
    resourceType: "Patient",
    id: "pat1",
    name: [{ family: "Smart", given: ["Sandy"] }],
  } as never);
  // decoy — proves name= filtering actually filters (schema indexing worked)
  await repo.createResource({
    resourceType: "Patient",
    id: "pat2",
    name: [{ family: "Other", given: ["Pat"] }],
  } as never);
  // inline CDA xml attachment — should decode to narrative in-process
  await repo.createResource({
    resourceType: "DocumentReference",
    id: "doc-xml",
    status: "current",
    content: [
      { attachment: { contentType: "text/xml", data: Buffer.from(CDA_XML).toString("base64") } },
    ],
  } as never);
  // multi-rendition: html stub + pdf Binary — get wants the text, save the pdf
  binaries.set("pdf1", { contentType: "application/pdf", bytes: PDF_BYTES });
  await repo.createResource({
    resourceType: "DocumentReference",
    id: "doc-multi",
    status: "current",
    content: [
      {
        attachment: {
          contentType: "text/html",
          data: Buffer.from("<p>Brief summary; see attached PDF.</p>").toString("base64"),
        },
      },
      { attachment: { contentType: "application/pdf", url: "Binary/pdf1" } },
    ],
  } as never);
  // mislabeled octet-stream whose body is XML — save should sniff .xml
  binaries.set("blob1", {
    contentType: "application/octet-stream",
    bytes: new TextEncoder().encode('<?xml version="1.0"?><note>mislabeled</note>'),
  });
  await repo.createResource({
    resourceType: "DocumentReference",
    id: "doc-blob",
    status: "current",
    content: [{ attachment: { contentType: "application/octet-stream", url: "Binary/blob1" } }],
  } as never);
});

afterAll(() => server?.stop(true));

describe("client over HTTP against the in-memory FHIR server", () => {
  test("search filters by name, not match-everything", async () => {
    const bundle = await fhirGet<fhir4.Bundle>(session, "Patient", { name: "Smart" });
    const ids = (bundle.entry ?? []).map((e) => (e.resource as fhir4.Patient).id);
    expect(ids).toContain("pat1");
    expect(ids).not.toContain("pat2");
    const none = await fhirGet<fhir4.Bundle>(session, "Patient", { name: "Zzz" });
    expect(none.entry ?? []).toHaveLength(0);
  });

  test("CDA xml attachment decodes inline to narrative", async () => {
    const env = await getDocumentContent(session, "doc-xml");
    expect(env.content_type).toBe("text/xml");
    expect(env.text).toContain("## History of Present Illness");
    expect(env.text).toContain("chest pain and dyspnea");
  });

  test("multi-rendition: get returns the text rendition, save fetches the pdf", async () => {
    const env = await getDocumentContent(session, "doc-multi");
    expect(env.content_type).toBe("text/html");
    expect(env.text).toContain("Brief summary");

    const saved = await saveDocumentForExtraction(session, "doc-multi");
    try {
      expect(saved.path).toEndWith(".pdf");
      expect(saved.bytes).toBe(PDF_BYTES.length);
      expect(readFileSync(saved.path!, "latin1").startsWith("%PDF")).toBe(true);
    } finally {
      // saves land in per-save mkdtemp dirs — remove the dir, not just the file
      if (saved.path) rmSync(dirname(saved.path), { recursive: true, force: true });
    }
  });

  test("mislabeled octet-stream is sniffed to .xml on save", async () => {
    const saved = await saveDocumentForExtraction(session, "doc-blob");
    try {
      expect(saved.path).toEndWith(".xml");
    } finally {
      // saves land in per-save mkdtemp dirs — remove the dir, not just the file
      if (saved.path) rmSync(dirname(saved.path), { recursive: true, force: true });
    }
  });

  test("missing document surfaces the FHIR 404, not a crash", async () => {
    await expect(getDocumentContent(session, "nope")).rejects.toThrow(/404|not.?found/i);
  });
});
