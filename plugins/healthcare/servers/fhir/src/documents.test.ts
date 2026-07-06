import { describe, expect, test } from "bun:test";

import { _internal } from "./documents.js";

const { decodeRtf, decodeXml, extensionFor, normalizeType, pickBinaryAttachment, stripMarkup } =
  _internal;

describe("decodeRtf", () => {
  test("drops font/color tables and decodes escapes", () => {
    const rtf =
      "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}{\\colortbl;\\red0\\green0\\blue0;}" +
      "{\\*\\generator Epic}" +
      "\\f0\\fs20 Patient seen today.\\par Plan: continue \\'93aspirin\\'94 81mg.\\par}";
    const out = decodeRtf(rtf);
    expect(out).toContain("Patient seen today.");
    expect(out).toContain("Plan: continue “aspirin” 81mg.");
    expect(out).not.toContain("Arial");
    expect(out).not.toContain("Epic");
  });

  test("\\uN unicode with fallback char", () => {
    expect(decodeRtf("{\\rtf1 temp 98.6\\u176?F\\par}")).toBe("temp 98.6°F");
    expect(decodeRtf("{\\rtf1 a\\u8211\\'96b}")).toBe("a–b");
  });

  test("tabs, rows and nested groups", () => {
    const out = decodeRtf("{\\rtf1 BP\\tab 120/80\\row HR\\tab 72\\row {\\b bold} text}");
    expect(out).toBe("BP\t120/80\nHR\t72\nbold text");
  });

  test("\\binN raw bytes with braces don't corrupt group tracking", () => {
    const out = decodeRtf("{\\rtf1 before {\\pict\\bin5 }}{\\x} after\\par}");
    expect(out).toContain("before");
    expect(out).toContain("after");
  });

  test("malformed \\' escape doesn't swallow following text", () => {
    expect(decodeRtf("{\\rtf1 dose\\'zzgiven}")).toContain("zzgiven");
  });

  test("\\ucN controls fallback swallowing after \\uN", () => {
    // default uc1: the char after the delimiter space is the fallback — swallowed
    expect(decodeRtf("{\\rtf1 a\\u8211 b}")).toBe("a–");
    // uc0: nothing swallowed
    expect(decodeRtf("{\\rtf1\\uc0 a\\u8211 b}")).toBe("a–b");
  });
});

describe("decodeXml", () => {
  const cda =
    '<?xml version="1.0"?><ClinicalDocument xmlns="urn:hl7-org:v3">' +
    '<title>Admission Note</title><recordTarget><patientRole><id root="x"/></patientRole></recordTarget>' +
    "<component><structuredBody><component>" +
    "<section><code code='10164-2'/><title>History of Present Illness</title>" +
    "<text><paragraph>Pt presents with chest pain &amp; dyspnea.</paragraph></text>" +
    '<entry><observation classCode="OBS"><value code="12345"/></observation></entry></section>' +
    "</component><component>" +
    "<section><title>Medications</title><text><list><item>aspirin 81mg</item><item>metformin 500mg</item></list></text></section>" +
    "</component></structuredBody></component></ClinicalDocument>";

  test("CDA: keeps title + narrative, drops machine entries", () => {
    const out = decodeXml(cda);
    expect(out).toContain("Admission Note");
    expect(out).toContain("## History of Present Illness");
    expect(out).toContain("Pt presents with chest pain & dyspnea.");
    expect(out).toContain("aspirin 81mg");
    expect(out).not.toContain("10164-2");
    expect(out).not.toContain("12345");
  });

  test("non-CDA XML falls back to tag strip", () => {
    expect(decodeXml("<note><body>plain content</body></note>")).toContain("plain content");
  });

  test("nested sections keep all narrative", () => {
    const nested =
      "<ClinicalDocument><component><section><title>Hospital Course</title>" +
      "<text>Course part one.</text>" +
      "<component><section><title>Procedures</title><text>Appendectomy.</text></section></component>" +
      "</section></component></ClinicalDocument>";
    const out = decodeXml(nested)!;
    expect(out).toContain("Course part one.");
    expect(out).toContain("Appendectomy.");
  });

  test("XML embedding a huge base64 payload is not inlineable", () => {
    const cernerish = `<report><document>${"JVBERi0xLjQK".repeat(1000)}</document></report>`;
    expect(decodeXml(cernerish)).toBeNull();
  });

  test("CDA wrapping a base64 blob is not inlineable", () => {
    expect(
      decodeXml(
        '<ClinicalDocument><component><nonXMLBody><text mediaType="application/pdf" representation="B64">JVBERi0xLjc=</text></nonXMLBody></component></ClinicalDocument>',
      ),
    ).toBeNull();
  });
});

describe("stripMarkup", () => {
  test("out-of-range numeric entities don't throw", () => {
    expect(stripMarkup("bad &#x110000; ref &#4294967295; ok")).toContain("ok");
  });

  test("strips tags, decodes entities, drops scripts", () => {
    const out = stripMarkup(
      "<html><script>alert(1)</script><p>Temp &#x2265; 38&deg;C &amp; rising</p><br><div>next</div></html>",
    );
    expect(out).toContain("Temp ≥ 38");
    expect(out).toContain("& rising");
    expect(out).toContain("next");
    expect(out).not.toContain("alert");
  });
});

describe("extensionFor / normalizeType", () => {
  test("known types map to their extension", () => {
    expect(extensionFor("application/pdf")).toBe(".pdf");
    expect(extensionFor("image/tiff")).toBe(".tif");
    expect(extensionFor("text/xml")).toBe(".xml");
  });

  test("unknown types never refuse — sanitized subtype or .bin", () => {
    expect(extensionFor("application/dicom")).toBe(".dicom");
    expect(extensionFor("application/x-weird.vendor+thing")).toBe(".xweirdve");
    expect(extensionFor("garbage")).toBe(".bin");
  });

  test("octet-stream sniffs magic bytes", () => {
    expect(extensionFor("application/octet-stream", Buffer.from("%PDF-1.7 ..."))).toBe(".pdf");
    expect(extensionFor("application/octet-stream", Buffer.from("{\\rtf1\\ansi hi}"))).toBe(".rtf");
    expect(extensionFor("application/octet-stream", Buffer.from('<?xml version="1.0"?><a/>'))).toBe(
      ".xml",
    );
    expect(extensionFor("application/octet-stream", Buffer.from("II*\x00abc", "latin1"))).toBe(
      ".tif",
    );
    expect(extensionFor("application/octet-stream", Buffer.from("unknowable"))).toBe(".octetstr");
  });

  test("normalizeType strips parameters and case", () => {
    expect(normalizeType("Text/HTML; charset=utf-8")).toBe("text/html");
    expect(normalizeType(undefined)).toBe("");
  });
});

describe("pickBinaryAttachment", () => {
  const docRef = (atts: object[]) =>
    ({
      resourceType: "DocumentReference",
      status: "current",
      content: atts.map((attachment) => ({ attachment })),
    }) as fhir4.DocumentReference;

  test("prefers the binary rendition over the text one", () => {
    const multi = docRef([
      { contentType: "text/html", url: "u-html" },
      { contentType: "application/pdf", url: "u-pdf" },
    ]);
    expect(pickBinaryAttachment(multi)?.contentType).toBe("application/pdf");
  });

  test("skips metadata-only stubs in favor of a retrievable rendition", () => {
    const stubFirst = docRef([
      { contentType: "application/pdf", title: "stub, no url or data" },
      { contentType: "text/plain", data: "aGk=" },
    ]);
    expect(pickBinaryAttachment(stubFirst)?.contentType).toBe("text/plain");
  });

  test("single text-only rendition still saves", () => {
    expect(
      pickBinaryAttachment(docRef([{ contentType: "text/plain", url: "u" }]))?.contentType,
    ).toBe("text/plain");
  });
});
