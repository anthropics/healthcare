import { isIP } from "node:net";

export interface FhirSession {
  baseUrl: URL;
  token: string | null;
}

const FHIR_ID_RE = /^[A-Za-z0-9\-.]{1,64}$/;
export function validateFhirId(id: string, kind: string): string {
  if (!FHIR_ID_RE.test(id)) throw new Error(`Invalid ${kind} id`);
  return id;
}

const FHIR_TYPE_RE = /^[A-Z][A-Za-z]{1,63}$/;
export function validateResourceType(t: string): string {
  if (!FHIR_TYPE_RE.test(t)) throw new Error(`Invalid FHIR resource type: ${t}`);
  return t;
}

function scrub(e: unknown): Error {
  // undici buries the useful detail ("unexpected redirect", DNS failure) in
  // cause; without it the user sees a bare "fetch failed"
  const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : "";
  const msg = (e instanceof Error ? e.message : String(e)) + (cause ? `: ${cause}` : "");
  return new Error(msg.replace(/Bearer\s+\S+/gi, "Bearer [redacted]"));
}

// Literal private/link-local IPs and well-known metadata hostnames only —
// hospital-internal DNS names pass through. Full DNS pre-resolution is a PSR
// item; this guard catches the obvious probes, not DNS-rebinding.
const PRIVATE_IP_RE =
  /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1$|f[cd][0-9a-f]{2}:|fe80:)/i;
const METADATA_HOST_RE =
  /^(metadata\.google\.internal|metadata\.goog|instance-data|.*\.(nip\.io|sslip\.io|xip\.io))$/i;

// TODO(PSR): full SSRF defense belongs at the socket — a custom `lookup` on the
// HTTP agent that rejects private IPs at connect time. A pre-flight dns.resolve
// is TOCTOU-vulnerable to the rebinding it's meant to stop.
export function validateBaseUrl(raw: string): URL {
  const u = new URL(raw.replace(/\/+$/, ""));
  const host = u.hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "")
    .toLowerCase();
  const localhost = host === "localhost" || host === "127.0.0.1";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && localhost)) {
    throw new Error(`FHIR base URL must be https (or http://localhost): ${u.origin}`);
  }
  if (!localhost && (METADATA_HOST_RE.test(host) || (isIP(host) && PRIVATE_IP_RE.test(host)))) {
    throw new Error(
      `FHIR base URL must not target a private/link-local or metadata address: ${host}`,
    );
  }
  return u;
}

// Any URL pulled from a FHIR resource (attachment.url, Bundle link) must stay on
// the connected server's origin — blocks SSRF via attacker-controlled references.
export function resolveSameOrigin(session: FhirSession, ref: string): URL {
  const resolved = new URL(ref, baseHref(session) + "/");
  if (resolved.origin !== session.baseUrl.origin) {
    throw new Error(`refusing to follow off-origin reference (${resolved.origin})`);
  }
  return resolved;
}

// FHIR logical id, first char restricted to alnum so "." / ".." path
// segments can never match. Case-insensitive: Medplum's storage paths spell
// the segment "binary".
const RECOVERABLE_BINARY_RE = /\/Binary\/([A-Za-z0-9][A-Za-z0-9.-]{0,63})(?:[/?#]|$)/i;

// Some EHRs (Medplum) rewrite attachment.url to a signed absolute URL on an
// off-origin storage host. Those refs must stay refused — but when the
// off-origin path still carries the Binary's logical id, the same bytes are
// reachable same-origin at {base}/Binary/{id}. Recovery never contacts the
// off-origin host and never widens the allowed origin: the re-fetch URL is
// built only from the connected base plus the id validated above, and goes
// back through resolveSameOrigin.
export function resolveAttachmentRef(session: FhirSession, ref: string): URL {
  try {
    return resolveSameOrigin(session, ref);
  } catch (refusal) {
    let pathname: string;
    try {
      pathname = new URL(ref, baseHref(session) + "/").pathname;
    } catch {
      throw refusal;
    }
    const m = RECOVERABLE_BINARY_RE.exec(pathname);
    if (!m) throw refusal;
    return resolveSameOrigin(session, `Binary/${m[1]}`);
  }
}

// Every FHIR request goes through here so the transport invariants live in
// one place: the bearer header, error scrubbing, and redirect: "error" —
// resource-derived URLs (fhirGetRaw/fhirGetBytes) are same-origin-pinned by
// resolveSameOrigin, and following any redirect (or replaying a write at a
// Location) would bypass that pin.
async function fhirFetch(
  session: FhirSession,
  url: URL,
  accept: string,
  // body is JSON.stringify'd under the default application/fhir+json; a
  // caller-provided contentType sends body verbatim (the form encoding
  // POST _search requires)
  write?: { method: "POST" | "PUT"; body: unknown; contentType?: string },
): Promise<Response> {
  const method = write?.method ?? "GET";
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      redirect: "error",
      headers: {
        Accept: accept,
        ...(write ? { "Content-Type": write.contentType ?? "application/fhir+json" } : {}),
        ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      body: write ? (write.contentType ? String(write.body) : JSON.stringify(write.body)) : undefined,
    });
  } catch (e) {
    throw scrub(e);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw scrub(
      new Error(
        `FHIR ${method} ${res.status} ${res.statusText} at ${url.pathname}: ${detail.slice(0, 500)}`,
      ),
    );
  }
  return res;
}

async function request<T>(
  session: FhirSession,
  url: URL,
  accept: string,
): Promise<{ body: T; contentType: string }> {
  const res = await fhirFetch(session, url, accept);
  const contentType = res.headers.get("content-type") ?? "";
  const body = (accept.includes("json") ? await res.json() : await res.text()) as T;
  return { body, contentType };
}

export async function fhirGetBytes(
  session: FhirSession,
  ref: string,
  accept: string,
  opts?: RefOpts,
): Promise<Buffer> {
  const res = await fhirFetch(session, resolveRef(session, ref, opts), accept);
  return Buffer.from(await res.arrayBuffer());
}

export async function fhirGet<T>(
  session: FhirSession,
  path: string,
  params?: Record<string, string | string[] | undefined>,
): Promise<T> {
  const url = new URL(`${baseHref(session)}/${path}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    for (const x of Array.isArray(v) ? v : v ? [v] : []) url.searchParams.append(k, x);
  }
  const { body } = await request<T>(session, url, "application/fhir+json");
  return body;
}

/** Search via POST {type}/_search with a form-encoded body (FHIR R4
 *  §3.1.0.10). Search parameters never enter the request URL, which proxy
 *  and server access logs record — required for searches whose parameters
 *  are direct patient identifiers (name, birthdate, MRN), and the safe
 *  default for any search whose parameters are caller-arbitrary. */
export async function fhirSearch<T>(
  session: FhirSession,
  type: string,
  params?: Record<string, string | string[] | undefined>,
): Promise<T> {
  const url = new URL(`${baseHref(session)}/${type}/_search`);
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    for (const x of Array.isArray(v) ? v : v ? [v] : []) form.append(k, x);
  }
  const res = await fhirFetch(session, url, "application/fhir+json", {
    method: "POST",
    body: form.toString(),
    contentType: "application/x-www-form-urlencoded",
  });
  return (await res.json()) as T;
}

// URL.href re-adds a trailing slash for path-less origins; joining with "/"
// would yield "//metadata", which most servers 404.
export function baseHref(session: FhirSession): string {
  return session.baseUrl.href.replace(/\/+$/, "");
}

export async function fhirWrite<T>(
  session: FhirSession,
  method: "POST" | "PUT",
  path: string,
  body: unknown,
): Promise<T> {
  const url = new URL(`${baseHref(session)}/${path}`);
  const res = await fhirFetch(session, url, "application/fhir+json", { method, body });
  return (await res.json()) as T;
}

// recoverBinaryRef is for attachment.url specifically — other resource-derived
// refs (Bundle links) have no Binary-id fallback semantics and stay strict.
type RefOpts = { recoverBinaryRef?: boolean };

function resolveRef(session: FhirSession, ref: string, opts?: RefOpts): URL {
  return opts?.recoverBinaryRef
    ? resolveAttachmentRef(session, ref)
    : resolveSameOrigin(session, ref);
}

export async function fhirGetRaw(
  session: FhirSession,
  ref: string,
  accept: string,
  opts?: RefOpts,
) {
  return request<string>(session, resolveRef(session, ref, opts), accept);
}
