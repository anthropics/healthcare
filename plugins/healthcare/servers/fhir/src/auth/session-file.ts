import { chmodSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { FhirSession } from "../fhir-client.js";

interface Persisted {
  baseUrl: string;
  token: string | null;
  expiresAt: number | null;
}

/** Thrown when a path under our tmpdir is not the regular, self-owned
 *  entry we created — an active-attack signal, never a persistence
 *  hiccup, so callers must not swallow it with ordinary I/O errors. */
export class OwnershipError extends Error {}

// Refuse a path that exists but isn't a real file/dir owned by us (defeats a
// pre-created symlink in shared tmpdir). uid checks are no-ops on Windows.
const uid = process.getuid?.() ?? -1;

export function assertOwned(p: string, wantDir: boolean): void {
  const st = lstatSync(p);
  if (wantDir ? !st.isDirectory() : !st.isFile())
    throw new OwnershipError(`not a regular path: ${p}`);
  if (uid >= 0 && st.uid !== uid) throw new OwnershipError(`owned by another user: ${p}`);
}

// Per-uid so that on shared /tmp another user owning the fixed name is an
// attack signal, not the normal case.
export function perUidTmpDir(prefix: string): string {
  return join(tmpdir(), `${prefix}-${uid >= 0 ? uid : "u"}`);
}

// Create-or-adopt an owned 0700 dir; mkdir's mode only applies at creation,
// so a pre-existing dir is re-asserted and re-tightened.
export function ensureOwnedDir(p: string): void {
  mkdirSync(p, { recursive: true, mode: 0o700 });
  assertOwned(p, true);
  chmodSync(p, 0o700);
}

// Survives a host restarting the stdio subprocess between turns. Access token
// only (≤1h TTL); refresh_token never written here.
const dir = perUidTmpDir("mcp-server-fhir");
const file = join(dir, "session.json");

export function persistSession(s: FhirSession, expiresIn?: number): void {
  try {
    ensureOwnedDir(dir);
    const p: Persisted = {
      baseUrl: s.baseUrl.href,
      token: s.token,
      expiresAt: expiresIn ? Date.now() + (expiresIn - 60) * 1000 : null,
    };
    writeFileSync(file, JSON.stringify(p), { mode: 0o600, flag: "w" });
    assertOwned(file, false);
    chmodSync(file, 0o600);
  } catch (e) {
    // ownership failures are an attack signal and must surface; ordinary
    // persistence errors (read-only tmp, ENOSPC) stay best-effort
    if (e instanceof OwnershipError) throw e;
  }
}

export function restoreSession(): FhirSession | null {
  try {
    assertOwned(file, false);
    const p = JSON.parse(readFileSync(file, "utf-8")) as Persisted;
    if (p.expiresAt && p.expiresAt < Date.now()) return null;
    const baseUrl = new URL(p.baseUrl);
    let token = p.token;
    // A session persisted before the env token was origin-bound (see
    // resolveEnvBearerToken in tools.ts) may carry the FHIR_BEARER_TOKEN
    // credential against a non-configured origin — and static sessions
    // persist without an expiry. Re-apply the binding on restore: if the
    // persisted token IS the env credential and the persisted origin is not
    // FHIR_BASE_URL's origin, drop the token. The session itself survives,
    // unauthenticated; the file is left as-is and is overwritten by the next
    // successful connect.
    const envToken = process.env.FHIR_BEARER_TOKEN;
    if (token && envToken && token === envToken) {
      let configuredOrigin: string | null = null;
      try {
        configuredOrigin = process.env.FHIR_BASE_URL
          ? new URL(process.env.FHIR_BASE_URL).origin
          : null;
      } catch {
        configuredOrigin = null;
      }
      if (configuredOrigin !== baseUrl.origin) {
        token = null;
        process.stderr.write(
          `mcp-server-fhir: restored session for ${baseUrl.origin} carried the FHIR_BEARER_TOKEN env credential, which is bound to ${configuredOrigin ?? "no configured server (FHIR_BASE_URL unset)"} — token dropped from the restored session\n`,
        );
      }
    }
    return { baseUrl, token };
  } catch (e) {
    // can't rethrow here (module load would crash), but the signal must not
    // vanish — the write path throws, so the read path at least reports
    if (e instanceof OwnershipError)
      process.stderr.write(`mcp-server-fhir: ignoring session file: ${e.message}\n`);
    return null;
  }
}

export function clearSession(): void {
  try {
    rmSync(file);
  } catch {}
}
