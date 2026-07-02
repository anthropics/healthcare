import { getDocumentContent } from "./src/documents.js";
import { validateBaseUrl, fhirGet } from "./src/fhir-client.js";

const session = {
  baseUrl: validateBaseUrl("https://launch.smarthealthit.org/v/r4/fhir"),
  token: null,
};

const cap = await fhirGet<fhir4.CapabilityStatement>(session, "metadata");
console.log("capability:", cap.software?.name, cap.fhirVersion);

const bundle = await fhirGet<fhir4.Bundle>(session, "DocumentReference", { _count: "3" });
console.log("search:", bundle.total, "entries");
for (const e of bundle.entry ?? []) {
  const r = e.resource as fhir4.DocumentReference;
  console.log("  doc", r.id, r.content?.[0]?.attachment?.contentType);
  const env = await getDocumentContent(session, r.id!);
  console.log("  envelope:", {
    id: env.id,
    content_type: env.content_type,
    text_len: env.text?.length ?? null,
    text_head: env.text?.slice(0, 80),
    untrusted: env.untrusted,
    reason: env.reason,
  });
}
console.log("\nOK");
