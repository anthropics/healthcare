import { clearSession, persistSession, restoreSession } from "./auth/session-file.mjs";
import { isHeadless, smartBegin, smartLaunch } from "./auth/smart.mjs";
import { pickTokenStore, tokenKey } from "./auth/token-store.mjs";
import { getDocumentContent, saveDocumentForExtraction } from "./documents.mjs";
import {
  fhirGet,
  fhirSearch,
  fhirWrite,
  validateBaseUrl,
  validateFhirId,
  validateResourceType,
} from "./fhir-client.mjs";

/** @typedef {import("../../shared/rpc.mjs").Args} Args */
/** @typedef {import("./auth/smart.mjs").PendingAuth} PendingAuth */
/** @typedef {import("./auth/smart.mjs").SmartTokens} SmartTokens */
/** @typedef {import("./fhir-client.mjs").FhirSession} FhirSession */

const DEFAULT_SCOPE = "user/*.rs offline_access openid fhirUser";

// The FHIR_BEARER_TOKEN env fallback is deployment configuration: the token
// belongs to the server the deployment names in FHIR_BASE_URL, so it is
// attached only when the connect target is that same origin. Without the
// binding, any connect({base_url}) — including one injected into the
// conversation — would receive the configured credential on its very first
// request (the capability probe). An explicitly passed bearer_token argument
// is the caller's own decision and carries no origin restriction.
//
// When the token is withheld, `withheld` says why — for LOCAL surfaces only
// (tool result text, stderr); it must never be sent to the target server.
// Exported for tests.
/**
 * @param {URL} target
 * @param {{ FHIR_BASE_URL?: string, FHIR_BEARER_TOKEN?: string }} [env]
 * @returns {{ token: string | null, withheld?: string }}
 */
export function resolveEnvBearerToken(target, env = process.env) {
  const token = env.FHIR_BEARER_TOKEN;
  if (!token) return { token: null };
  if (!env.FHIR_BASE_URL) {
    return {
      token: null,
      withheld:
        "FHIR_BEARER_TOKEN is set but FHIR_BASE_URL is not, so the token is bound to no server and was not sent; set FHIR_BASE_URL to the server the token belongs to, or pass bearer_token explicitly",
    };
  }
  /** @type {URL} */
  let configured;
  try {
    configured = new URL(env.FHIR_BASE_URL);
  } catch {
    return {
      token: null,
      withheld: "FHIR_BEARER_TOKEN was not sent: FHIR_BASE_URL is not a valid URL",
    };
  }
  // URL.origin is the entire comparison: scheme, host, and port, after the
  // parser's normalization (hostname case, default-port elision, punycode) —
  // userinfo, path, and query never participate. Equality on the parsed
  // origin is what makes crafted targets (victim.example.attacker.com,
  // victim.example@attacker.com, a path embedding the victim URL, a
  // trailing-dot host) compare as the foreign origins they are; any
  // prefix/substring comparison here would be bypassable.
  if (configured.origin !== target.origin) {
    return {
      token: null,
      withheld: `FHIR_BEARER_TOKEN is bound to ${configured.origin} and was not sent to ${target.origin}; pass bearer_token explicitly to use a credential with a different server`,
    };
  }
  return { token };
}

/** @type {FhirSession | null} */
let session = restoreSession();
/** @type {{ baseUrl: URL, cid: string, auth: PendingAuth } | null} */
let pending = null;

/** @returns {FhirSession} */
function requireSession() {
  if (!session) throw new Error("Not connected. Call `connect` first.");
  return session;
}

/**
 * @param {URL} baseUrl
 * @param {string | undefined} cid
 * @param {SmartTokens | null} t
 * @param {string | null} [staticToken]
 * @param {string} [authWarning] why a configured env credential was deliberately
 *   not attached — shown to the local caller so an auth downgrade is visible,
 *   never sent upstream
 */
async function finishConnect(baseUrl, cid, t, staticToken, authWarning) {
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
  /** @type {FhirSession} */
  const candidate = { baseUrl, token };
  const cap = /** @type {fhir4.CapabilityStatement} */ (await fhirGet(candidate, "metadata"));
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
      (authWarning ? `\nNOTE: ${authWarning}` : "") +
      persistNote,
  );
}

/** @param {string} s */
function text(s) {
  return { content: [{ type: /** @type {const} */ ("text"), text: s }] };
}
/** @param {unknown} v */
function json(v) {
  return text(JSON.stringify(v, null, 2));
}
/** @param {fhir4.CodeableConcept} [c] */
function coding(c) {
  return c?.text ?? c?.coding?.[0]?.display ?? c?.coding?.[0]?.code;
}

/**
 * @template {fhir4.Resource} T
 * @param {string} type
 * @param {Record<string, string | string[] | undefined>} params
 * @param {(r: T) => object} summarize
 * @param {boolean} [post] POST _search keeps search parameters out of request
 *   URLs, which proxy/server access logs record — required when the parameters
 *   are direct patient identifiers (name, birthdate, MRN)
 */
async function searchBundle(type, params, summarize, post = false) {
  const bundle = /** @type {fhir4.Bundle} */ (
    post
      ? await fhirSearch(requireSession(), type, params)
      : await fhirGet(requireSession(), type, params)
  );
  const entries = (bundle.entry ?? []).map((e) => summarize(/** @type {T} */ (e.resource)));
  return json({ total: bundle.total ?? entries.length, entries });
}

/** @typedef {{ date_ge?: string, date_le?: string, count?: number }} DateRange */
/** @param {Args} a @returns {DateRange} */
const pickRange = (a) => ({
  date_ge: /** @type {string | undefined} */ (a.date_ge),
  date_le: /** @type {string | undefined} */ (a.date_le),
  count: /** @type {number | undefined} */ (a.count),
});
// param name differs per resource: Condition has no `date` (recorded-date),
// MedicationRequest's `date` matches dosage timing, not order date (authoredon).
/** @param {DateRange} p @param {string} [param] */
function rangeParams(p, param = "date") {
  const range = /** @type {string[]} */ (
    [p.date_ge && `ge${p.date_ge}`, p.date_le && `le${p.date_le}`].filter(Boolean)
  );
  return { _count: String(p.count ?? 50), ...(range.length ? { [param]: range } : {}) };
}

// Handlers, keyed by tool name. Schemas live frozen in src/schemas.mjs (the
// annotations — readOnlyHint on the read tools, destructiveHint on writes —
// ride there too); validation happens in the shared transport before these
// run, so each handler receives exactly the declared properties.
/** @type {Record<string, (a: Args) => Promise<{ content: { type: "text", text: string }[] }>>} */
export const HANDLERS = {
  connect: async (a) => {
    const { base_url, bearer_token, client_id, scope } = /** @type {{
      base_url?: string, bearer_token?: string, client_id?: string, scope?: string,
    }} */ (a);
    {
      const url = base_url ?? process.env.FHIR_BASE_URL;
      if (!url) throw new Error("base_url not provided and FHIR_BASE_URL is not set");
      const baseUrl = validateBaseUrl(url);
      const cid = client_id ?? process.env.FHIR_CLIENT_ID;
      // an explicit client_id arg means the caller wants SMART login — don't
      // let a stale FHIR_BEARER_TOKEN env silently win over it. The env
      // fallback itself is origin-bound to FHIR_BASE_URL (see
      // resolveEnvBearerToken above).
      /** @type {string | null} */
      let token = bearer_token ?? null;
      /** @type {string | undefined} */
      let withheld;
      if (!token && !client_id) ({ token, withheld } = resolveEnvBearerToken(baseUrl));
      if (withheld) process.stderr.write(`mcp-server-fhir: ${withheld}\n`);
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
            `SMART login required. Open this URL in your browser, sign in, then copy the FULL address-bar URL after redirect (it will start with http://localhost:53682/callback?...) and pass it to connect_complete:\n\n${pending.auth.authorize_url}` +
              (withheld ? `\n\nNOTE: ${withheld}` : ""),
          );
        }
        return finishConnect(
          baseUrl,
          cid,
          await smartLaunch({ iss: baseUrl, client_id: cid, scope: sc }),
          null,
          withheld,
        );
      }

      return finishConnect(baseUrl, cid, null, token, withheld);
    }
  },

  connect_complete: async (a) => {
    const callback_url = /** @type {string} */ (a.callback_url);
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
    const cap = /** @type {fhir4.CapabilityStatement} */ (
      await fhirGet(requireSession(), "metadata")
    );
    return json({
      fhirVersion: cap.fhirVersion,
      software: cap.software,
      resources: cap.rest?.[0]?.resource?.map((r) => r.type),
    });
  },

  search_patients: async (a) => {
    const p = /** @type {{
      name?: string, family?: string, given?: string, birthdate?: string,
      identifier?: string, count?: number,
    }} */ (a);
    return searchBundle(
      "Patient",
      {
        name: p.name,
        family: p.family,
        given: p.given,
        birthdate: p.birthdate,
        identifier: p.identifier,
        _count: String(p.count ?? 20),
      },
      /** @param {fhir4.Patient} r */
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
    const patient_id = /** @type {string} */ (a.patient_id);
    return json(await fhirGet(requireSession(), `Patient/${validateFhirId(patient_id, "Patient")}`));
  },

  search_conditions: async (a) => {
    const patient_id = /** @type {string} */ (a.patient_id);
    const clinical_status = /** @type {string | undefined} */ (a.clinical_status);
    const r = pickRange(a);
    return searchBundle(
      "Condition",
      {
        patient: validateFhirId(patient_id, "Patient"),
        "clinical-status": clinical_status,
        ...rangeParams(r, "recorded-date"),
      },
      /** @param {fhir4.Condition} c */
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
    const patient_id = /** @type {string} */ (a.patient_id);
    const code = /** @type {string | undefined} */ (a.code);
    const category = /** @type {string | undefined} */ (a.category);
    const r = pickRange(a);
    return searchBundle(
      "Observation",
      { patient: validateFhirId(patient_id, "Patient"), code, category, ...rangeParams(r) },
      /** @param {fhir4.Observation} o */
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
    const patient_id = /** @type {string} */ (a.patient_id);
    const status = /** @type {string | undefined} */ (a.status);
    const r = pickRange(a);
    {
      const pid = validateFhirId(patient_id, "Patient");
      const session = requireSession();
      // both legs fetched; a failed leg is REPORTED, never silently empty —
      // a med list missing its self-reported half reads as "no metformin on
      // file" and downstream clinical reasoning trusts that absence
      const [orders, statements] = await Promise.allSettled([
        /** @type {Promise<fhir4.Bundle>} */ (
          fhirGet(session, "MedicationRequest", {
            patient: pid,
            status,
            ...rangeParams(r, "authoredon"),
          })
        ),
        /** @type {Promise<fhir4.Bundle>} */ (
          fhirGet(session, "MedicationStatement", {
            patient: pid,
            status,
            ...rangeParams(r, "effective"),
          })
        ),
      ]);
      /** @type {object[]} */
      const entries = [];
      if (orders.status === "fulfilled")
        for (const e of orders.value.entry ?? []) {
          const m = /** @type {fhir4.MedicationRequest} */ (e.resource);
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
          const m = /** @type {fhir4.MedicationStatement} */ (e.resource);
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
    const patient_id = /** @type {string} */ (a.patient_id);
    return searchBundle(
      "AllergyIntolerance",
      { patient: validateFhirId(patient_id, "Patient"), _count: "100" },
      /** @param {fhir4.AllergyIntolerance} al */
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
    const patient_id = /** @type {string} */ (a.patient_id);
    const type = /** @type {string | undefined} */ (a.type);
    const r = pickRange(a);
    return searchBundle(
      "DocumentReference",
      { patient: validateFhirId(patient_id, "Patient"), type, ...rangeParams(r) },
      /** @param {fhir4.DocumentReference} d */
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
    const resource_type = /** @type {string} */ (a.resource_type);
    const params = /** @type {Record<string, string> | undefined} */ (a.params);
    {
      // always POST _search: params here are caller-arbitrary, so any
      // search can carry direct identifiers (Patient by name/telecom/
      // address, RelatedPerson, ...) — same access-log rationale as
      // search_patients, with no type dispatch to get wrong
      const bundle = /** @type {fhir4.Bundle} */ (
        await fhirSearch(requireSession(), validateResourceType(resource_type), params)
      );
      const entries = (bundle.entry ?? []).map((e) => e.resource);
      return json({ total: bundle.total ?? entries.length, entries });
    }
  },

  lookup_code: async (a) => {
    const system = /** @type {string} */ (a.system);
    const code = /** @type {string} */ (a.code);
    return json(await fhirGet(requireSession(), "CodeSystem/$lookup", { system, code }));
  },

  read_resource: async (a) => {
    const resource_type = /** @type {string} */ (a.resource_type);
    const id = /** @type {string} */ (a.id);
    return json(
      await fhirGet(
        requireSession(),
        `${validateResourceType(resource_type)}/${validateFhirId(id, resource_type)}`,
      ),
    );
  },

  get_document_content: async (a) =>
    json(await getDocumentContent(requireSession(), /** @type {string} */ (a.doc_ref_id))),

  // writes a local temp file, so its frozen schema carries no readOnlyHint — it should prompt
  save_document_for_extraction: async (a) =>
    json(await saveDocumentForExtraction(requireSession(), /** @type {string} */ (a.doc_ref_id))),

  // Writes — registered without readOnlyHint so they always prompt. They will
  // 403 unless the user passed a write scope (e.g. user/*.cruds) to connect();
  // the default scope is read+search only.
  create_resource: async (a) => {
    const resource_type = /** @type {string} */ (a.resource_type);
    const resource = /** @type {Record<string, unknown>} */ (a.resource);
    return json(
      await fhirWrite(
        requireSession(),
        "POST",
        validateResourceType(resource_type),
        // validated values win — body cannot override the path
        { ...resource, resourceType: resource_type },
      ),
    );
  },

  update_resource: async (a) => {
    const resource_type = /** @type {string} */ (a.resource_type);
    const id = /** @type {string} */ (a.id);
    const resource = /** @type {Record<string, unknown>} */ (a.resource);
    return json(
      await fhirWrite(
        requireSession(),
        "PUT",
        `${validateResourceType(resource_type)}/${validateFhirId(id, resource_type)}`,
        { ...resource, resourceType: resource_type, id },
      ),
    );
  },
};
