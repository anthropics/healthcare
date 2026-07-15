import { createHash } from "node:crypto";

/**
 * @typedef {object} StoredTokens
 * @property {string} iss
 * @property {string} client_id
 * @property {string} scope
 * @property {string} refresh_token
 */

/**
 * @typedef {object} TokenStore
 * @property {string} kind
 * @property {(key: string) => Promise<StoredTokens | null>} get
 * @property {(key: string, t: StoredTokens) => Promise<void>} set
 * @property {(key: string) => Promise<void>} delete
 */

/** @param {string} iss @param {string} [fhirUser] @returns {string} */
export function tokenKey(iss, fhirUser) {
  return createHash("sha256")
    .update(`${iss}|${fhirUser ?? ""}|${process.getuid?.() ?? ""}`)
    .digest("hex")
    .slice(0, 32);
}

/** @implements {TokenStore} */
class MemoryTokenStore {
  kind = "memory";
  // #private: this map holds refresh tokens, and get/set/delete are the only
  // way in — TS's `private` was compile-time only and did not survive the port
  /** @type {Map<string, StoredTokens>} */
  #m = new Map();
  /** @param {string} k */
  async get(k) {
    return this.#m.get(k) ?? null;
  }
  /** @param {string} k @param {StoredTokens} t */
  async set(k, t) {
    this.#m.set(k, t);
  }
  /** @param {string} k */
  async delete(k) {
    this.#m.delete(k);
  }
}

// v1: memory only — re-auth each session. A host-provided credential store
// (where the host runs OAuth and the server requests tokens per-call) and OS
// keyring are follow-ups; the access token survives subprocess restarts via
// session-file.mjs in the meantime.
/** @returns {Promise<TokenStore>} */
export async function pickTokenStore() {
  return new MemoryTokenStore();
}
