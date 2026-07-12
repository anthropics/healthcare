import type { Args } from "../../shared/rpc.mjs";

import { clearSession, persistSession, restoreSession } from "./auth/session-file.js";
import {
  isHeadless,
  smartBegin,
  smartLaunch,
  type PendingAuth,
  type SmartTokens,
} from "./auth/smart.js";
import { pickTokenStore, tokenKey } from "./auth/token-store.js";
import { getDocumentContent, saveDocumentForExtraction } from "./documents.js";
import {
  fhirGet,
  fhirSearch,
  fhirWrite,
  validateBaseUrl,
  validateFhirId,
  validateResourceType,
  type FhirSession,
} from "./fhir-client.js";

const DEFAULT_SCOPE = "user/*.rs offline_access openid fhirUser";

let session: FhirSession | null = restoreSession();
let pending: { baseUrl: URL; cid: string; auth: PendingAuth } | null = null;

function requireSession(): FhirSession {
  if (!session) throw new Error("Not connected. Call `connect` first.");
  return session;
}

async function finishConnect(
  baseUrl: URL,
  cid: string | undefined,
  t: SmartTokens | null,
  staticToken?: string | null,
) {
  let token = staticToken ?? null;
  let authNote = token ? "bearer" : "none";
  if (t) {
    token = t.access_token;
    const store = await pickTokenStore();
    if (t.refresh_token && cid) {
      await store.set(tokenKey(baseUrl.href, t.fhirUser), {
        iss: baseUrl.href,
        client_id: cid,
        scope: t.scope ?? DEFAULT_SCOPE,
        refresh_token: t.refresh_token,
      });
    }
    authNote = `smart (${store.kind}${t.patient ? `, patient ${t.patient}` : ""})`;
  }
  // validate before committing — a failed metadata fetch must not leave a
  // broken session live in memory or restored from disk next start
  const candidate: FhirSession = { baseUrl, token };
  const cap = await fhirGet<fhir4.CapabilityStatement>(candidate, "metadata");
  session = candidate;
  // an OwnershipError here is an attack signal, but failing connect would
  // hand whoever planted the tmpdir entry a connect DoS (and in the headless
  // path the one-time auth code is already spent) — stay connected
  // memory-only and put the warning where the user will see it
  let persistNote = "";
  try {
    persistSession(session, t?.expires_in);
  } catch (e) {
    persistNote = `\nWARNING: session not persisted (${e instanceof Error ? e.message : e}) — someone may be tampering with your temp directory; this session works but won't survive a restart.`;
  }
  return text(
    `Connected to ${baseUrl.href}\n` +
      `Software: ${cap.software?.name ?? "?"} ${cap.software?.version ?? ""}\n` +
      `FHIR: ${cap.fhirVersion}\n` +
      `Auth: ${authNote}` +
      persistNote,
  );
}

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}
function json(v: unknown) {
  return text(JSON.stringify(v, null, 2));
}
function coding(c?: fhir4.CodeableConcept) {
  return c?.text ?? c?.coding?.[0]?.display ?? c?.coding?.[0]?.code;
}

async function searchBundle<T extends fhir4.Resource>(
  type: string,
  params: Record<string, string | string[] | undefined>,
  summarize: (r: T) => object,
  // POST _search keeps search parameters out of request URLs, which
  // proxy/server access logs record — required when the parameters are
  // direct patient identifiers (name, birthdate, MRN)
  post = false,
) {
  const bundle = post
    ? await fhirSearch<fhir4.Bundle>(requireSession(), type, params)
    : await fhirGet<fhir4.Bundle>(requireSession(), type, params);
  const entries = (bundle.entry ?? []).map((e) => summarize(e.resource as T));
  return json({ total: bundle.total ?? entries.length, entries });
}

type DateRange = { date_ge?: string; date_le?: string; count?: number };
const pickRange = (a: Args): DateRange => ({
  date_ge: a.date_ge as string | undefined,
  date_le: a.date_le as string | undefined,
  count: a.count as number | undefined,
});
// param name differs per resource: Condition has no `date` (recorded-date),
// MedicationRequest's `date` matches dosage timing, not order date (authoredon).
function rangeParams(p: { date_ge?: string; date_le?: string; count?: number }, param = "date") {
  const range = [p.date_ge && `ge${p.date_ge}`, p.date_le && `le${p.date_le}`].filter(
    Boolean,
  ) as string[];
  return { _count: String(p.count ?? 50), ...(range.length ? { [param]: range } : {}) };
}

// Handlers, keyed by tool name. Schemas live frozen in src/schemas.ts (the
// annotations — readOnlyHint on the read tools, destructiveHint on writes —
// ride there too); validation happens in the shared transport before these
// run, so each handler receives exactly the declared properties.
export const HANDLERS: Record<string, (a: Args) => Promise<{ content: { type: "text"; text: string }[] }>> = {

  connect: async (a) => {
    const { base_url, bearer_token, client_id, scope } = a as {
      base_url?: string; bearer_token?: string; client_id?: string; scope?: string;
    };
    {
      const url = base_url ?? process.env.FHIR_BASE_URL;
      if (!url) throw new Error("base_url not provided and FHIR_BASE_URL is not set");
      const baseUrl = validateBaseUrl(url);
      const cid = client_id ?? process.env.FHIR_CLIENT_ID;
      // an explicit client_id arg means the caller wants SMART login — don't
      // let a stale FHIR_BEARER_TOKEN env silently win over it
      const token = bearer_token ?? (client_id ? null : (process.env.FHIR_BEARER_TOKEN ?? null));
      const sc = scope ?? DEFAULT_SCOPE;

      if (!token && cid) {
        if (isHeadless()) {
          pending = {
            baseUrl,
            cid,
            auth: await smartBegin({
              iss: baseUrl,
              client_id: cid,
              scope: sc,
              redirect_uri: `http://localhost:${53682}/callback`,
            }),
          };
          return text(
            `SMART login required. Open this URL in your browser, sign in, then copy the FULL address-bar URL after redirect (it will start with http://localhost:53682/callback?...) and pass it to connect_complete:\n\n${pending.auth.authorize_url}`,
          );
        }
        return finishConnect(
          baseUrl,
          cid,
          await smartLaunch({ iss: baseUrl, client_id: cid, scope: sc }),
        );
      }

      return finishConnect(baseUrl, cid, null, token);
    }
  },

  connect_complete: async (a) => {
    const callback_url = a.callback_url as string;
    {
      if (!pending) throw new Error("No pending login. Call connect() first.");
      const t = await pending.auth.complete(callback_url);
      const { baseUrl, cid } = pending;
      pending = null;
      return finishConnect(baseUrl, cid, t);
    }
  },

  status: async () =>
      json({
        connected: session
          ? { base_url: session.baseUrl.href, auth: session.token ? "bearer" : "none" }
          : null,
        configured: {
          FHIR_BASE_URL: process.env.FHIR_BASE_URL ?? null,
          FHIR_CLIENT_ID: process.env.FHIR_CLIENT_ID ? "(set)" : null,
          FHIR_BEARER_TOKEN: process.env.FHIR_BEARER_TOKEN ? "(set)" : null,
        },
      }),

  disconnect: async () => {
      session = null;
      pending = null;
      clearSession();
      return text("Disconnected.");
  },

  capability: async () => {
    const cap = await fhirGet<fhir4.CapabilityStatement>(requireSession(), "metadata");
    return json({
      fhirVersion: cap.fhirVersion,
      software: cap.software,
      resources: cap.rest?.[0]?.resource?.map((r) => r.type),
    });
  },

  search_patients: async (a) => {
    const p = a as { name?: string; family?: string; given?: string; birthdate?: string; identifier?: string; count?: number };
    return searchBundle<fhir4.Patient>(
        "Patient",
        {
          name: p.name,
          family: p.family,
          given: p.given,
          birthdate: p.birthdate,
          identifier: p.identifier,
          _count: String(p.count ?? 20),
        },
        (r) => ({
          id: r.id,
          name:
            r.name?.[0]?.text ??
            [r.name?.[0]?.given?.join(" "), r.name?.[0]?.family].filter(Boolean).join(" "),
          birthDate: r.birthDate,
          gender: r.gender,
          mrn: r.identifier?.find((i) => i.type?.coding?.some((c) => c.code === "MR"))?.value,
        }),
        // name/birthdate/MRN are direct identifiers — POST _search keeps
        // them out of access-logged URLs
        true,
      );
  },

  get_patient: async (a) => {
    const patient_id = a.patient_id as string;
    return json(
        await fhirGet<fhir4.Patient>(
          requireSession(),
          `Patient/${validateFhirId(patient_id, "Patient")}`,
        ),
      );
  },

  search_conditions: async (a) => {
    const patient_id = a.patient_id as string;
    const clinical_status = a.clinical_status as string | undefined;
    const r = pickRange(a);
    return searchBundle<fhir4.Condition>(
        "Condition",
        {
          patient: validateFhirId(patient_id, "Patient"),
          "clinical-status": clinical_status,
          ...rangeParams(r, "recorded-date"),
        },
        (c) => ({
          id: c.id,
          code: coding(c.code),
          clinicalStatus: coding(c.clinicalStatus),
          // surfaces entered-in-error (retracted) records
          verificationStatus: coding(c.verificationStatus),
          onset: c.onsetDateTime ?? c.onsetPeriod?.start,
          recordedDate: c.recordedDate,
        }),
      );
  },

  search_observations: async (a) => {
    const patient_id = a.patient_id as string;
    const code = a.code as string | undefined;
    const category = a.category as string | undefined;
    const r = pickRange(a);
    return searchBundle<fhir4.Observation>(
        "Observation",
        { patient: validateFhirId(patient_id, "Patient"), code, category, ...rangeParams(r) },
        (o) => ({
          id: o.id,
          code: coding(o.code),
          value: o.valueQuantity
            ? `${o.valueQuantity.value} ${o.valueQuantity.unit ?? ""}`.trim()
            : (o.valueString ?? coding(o.valueCodeableConcept)),
          effective: o.effectiveDateTime ?? o.effectivePeriod?.start,
          status: o.status,
        }),
      );
  },

  search_medication_requests: async (a) => {
    const patient_id = a.patient_id as string;
    const status = a.status as string | undefined;
    const r = pickRange(a);
    {
      const pid = validateFhirId(patient_id, "Patient");
      const session = requireSession();
      // both legs fetched; a failed leg is REPORTED, never silently empty —
      // a med list missing its self-reported half reads as "no metformin on
      // file" and downstream clinical reasoning trusts that absence
      const [orders, statements] = await Promise.allSettled([
        fhirGet<fhir4.Bundle>(session, "MedicationRequest", {
          patient: pid,
          status,
          ...rangeParams(r, "authoredon"),
        }),
        fhirGet<fhir4.Bundle>(session, "MedicationStatement", {
          patient: pid,
          status,
          ...rangeParams(r, "effective"),
        }),
      ]);
      const entries: object[] = [];
      if (orders.status === "fulfilled")
        for (const e of orders.value.entry ?? []) {
          const m = e.resource as fhir4.MedicationRequest;
          entries.push({
            id: m.id,
            source: "order",
            medication: coding(m.medicationCodeableConcept) ?? m.medicationReference?.display,
            status: m.status,
            authoredOn: m.authoredOn,
            dosage: m.dosageInstruction?.[0]?.text,
          });
        }
      if (statements.status === "fulfilled")
        for (const e of statements.value.entry ?? []) {
          const m = e.resource as fhir4.MedicationStatement;
          entries.push({
            id: m.id,
            source: "statement",
            medication: coding(m.medicationCodeableConcept) ?? m.medicationReference?.display,
            status: m.status,
            effective: m.effectiveDateTime ?? m.effectivePeriod?.start,
            dosage: m.dosage?.[0]?.text,
          });
        }
      if (orders.status === "rejected" && statements.status === "rejected") throw orders.reason;
      return json({
        total: entries.length,
        entries,
        ...(orders.status === "rejected"
          ? {
              ordersError:
                "MedicationRequest search failed — order list unavailable, do not treat as empty",
            }
          : {}),
        ...(statements.status === "rejected"
          ? {
              statementsError:
                "MedicationStatement search failed — self-reported/home meds unavailable, do not treat as empty",
            }
          : {}),
      });
    }
  },

  search_allergies: async (a) => {
    const patient_id = a.patient_id as string;
    return searchBundle<fhir4.AllergyIntolerance>(
        "AllergyIntolerance",
        { patient: validateFhirId(patient_id, "Patient"), _count: "100" },
        (al) => ({
          id: al.id,
          substance: coding(al.code),
          criticality: al.criticality,
          clinicalStatus: coding(al.clinicalStatus),
          verificationStatus: coding(al.verificationStatus),
          reactions: al.reaction?.flatMap((rx) => rx.manifestation?.map(coding)),
        }),
      );
  },

  search_document_references: async (a) => {
    const patient_id = a.patient_id as string;
    const type = a.type as string | undefined;
    const r = pickRange(a);
    return searchBundle<fhir4.DocumentReference>(
        "DocumentReference",
        { patient: validateFhirId(patient_id, "Patient"), type, ...rangeParams(r) },
        (d) => ({
          id: d.id,
          status: d.status,
          type: coding(d.type),
          date: d.date,
          description: d.description,
          content_type: d.content?.[0]?.attachment?.contentType,
        }),
      );
  },

  search_resource: async (a) => {
    const resource_type = a.resource_type as string;
    const params = a.params as Record<string, string> | undefined;
    {
      // always POST _search: params here are caller-arbitrary, so any
      // search can carry direct identifiers (Patient by name/telecom/
      // address, RelatedPerson, ...) — same access-log rationale as
      // search_patients, with no type dispatch to get wrong
      const bundle = await fhirSearch<fhir4.Bundle>(
        requireSession(),
        validateResourceType(resource_type),
        params,
      );
      const entries = (bundle.entry ?? []).map((e) => e.resource);
      return json({ total: bundle.total ?? entries.length, entries });
    }
  },

  lookup_code: async (a) => {
    const system = a.system as string;
    const code = a.code as string;
    return json(
        await fhirGet<fhir4.Parameters>(requireSession(), "CodeSystem/$lookup", {
          system,
          code,
        }),
      );
  },

  read_resource: async (a) => {
    const resource_type = a.resource_type as string;
    const id = a.id as string;
    return json(
        await fhirGet<fhir4.Resource>(
          requireSession(),
          `${validateResourceType(resource_type)}/${validateFhirId(id, resource_type)}`,
        ),
      );
  },

  get_document_content: async (a) => json(await getDocumentContent(requireSession(), a.doc_ref_id as string)),

  // writes a local temp file, so its frozen schema carries no readOnlyHint — it should prompt
  save_document_for_extraction: async (a) =>
    json(await saveDocumentForExtraction(requireSession(), a.doc_ref_id as string)),

  // Writes — registered without readOnlyHint so they always prompt. They will
  // 403 unless the user passed a write scope (e.g. user/*.cruds) to connect();
  // the default scope is read+search only.
  create_resource: async (a) => {
    const resource_type = a.resource_type as string;
    const resource = a.resource as Record<string, unknown>;
    return json(
        await fhirWrite<fhir4.Resource>(
          requireSession(),
          "POST",
          validateResourceType(resource_type),
          // validated values win — body cannot override the path
          { ...resource, resourceType: resource_type },
        ),
      );
  },

  update_resource: async (a) => {
    const resource_type = a.resource_type as string;
    const id = a.id as string;
    const resource = a.resource as Record<string, unknown>;
    return json(
        await fhirWrite<fhir4.Resource>(
          requireSession(),
          "PUT",
          `${validateResourceType(resource_type)}/${validateFhirId(id, resource_type)}`,
          { ...resource, resourceType: resource_type, id },
        ),
      );
  },
};
