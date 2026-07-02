import { createHash } from "node:crypto";

export interface StoredTokens {
  iss: string;
  client_id: string;
  scope: string;
  refresh_token: string;
}

export interface TokenStore {
  readonly kind: string;
  get(key: string): Promise<StoredTokens | null>;
  set(key: string, t: StoredTokens): Promise<void>;
  delete(key: string): Promise<void>;
}

export function tokenKey(iss: string, fhirUser?: string): string {
  return createHash("sha256")
    .update(`${iss}|${fhirUser ?? ""}|${process.getuid?.() ?? ""}`)
    .digest("hex")
    .slice(0, 32);
}

class MemoryTokenStore implements TokenStore {
  readonly kind = "memory";
  private m = new Map<string, StoredTokens>();
  async get(k: string) {
    return this.m.get(k) ?? null;
  }
  async set(k: string, t: StoredTokens) {
    this.m.set(k, t);
  }
  async delete(k: string) {
    this.m.delete(k);
  }
}

// v1: memory only — re-auth each session. A host-provided credential store
// (where the host runs OAuth and the server requests tokens per-call) and OS
// keyring are follow-ups; the access token survives subprocess restarts via
// session-file.ts in the meantime.
export async function pickTokenStore(): Promise<TokenStore> {
  return new MemoryTokenStore();
}
