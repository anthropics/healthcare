import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

import { validateBaseUrl } from "../fhir-client.js";

export interface SmartConfig {
  authorization_endpoint: string;
  token_endpoint: string;
  scopes_supported?: string[];
  capabilities?: string[];
}

export interface SmartTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  patient?: string;
  fhirUser?: string;
  id_token?: string;
}

const REDIRECT_PORTS = [53682, 53683] as const;

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function makePkce() {
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export async function discover(iss: URL): Promise<SmartConfig> {
  const res = await fetch(
    new URL(".well-known/smart-configuration", iss.href.replace(/\/+$/, "") + "/"),
    {
      headers: { Accept: "application/json" },
      // same-origin discipline as the data-path fetches (S1): a redirect
      // here could steer discovery to endpoints validateBaseUrl never saw
      redirect: "error",
    },
  );
  if (!res.ok) throw new Error(`SMART discovery failed: ${res.status}`);
  const cfg = (await res.json()) as SmartConfig;
  validateBaseUrl(cfg.authorization_endpoint);
  validateBaseUrl(cfg.token_endpoint);
  return cfg;
}

// SMART scope v2 (`.rs`/`.cruds`) falls back to v1 (`.read`/`.write`) when the
// server doesn't advertise permission-v2 — keeps one default scope string
// portable across Epic (v1+v2) and Cerner/athenahealth (historically v1).
export function negotiateScope(cfg: SmartConfig, scope: string): string {
  if (cfg.capabilities?.includes("permission-v2")) return scope;
  return scope.replace(/([A-Za-z*]+\/[A-Za-z*]+)\.([cruds]+)\b/g, (_, res: string, ops: string) => {
    const out: string[] = [];
    if (/[rs]/.test(ops)) out.push(`${res}.read`);
    if (/[cud]/.test(ops)) out.push(`${res}.write`);
    return out.join(" ");
  });
}

export function buildAuthorizeUrl(
  cfg: SmartConfig,
  p: {
    iss: URL;
    client_id: string;
    scope: string;
    redirect_uri: string;
    state: string;
    challenge: string;
  },
): URL {
  const u = new URL(cfg.authorization_endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", p.client_id);
  u.searchParams.set("redirect_uri", p.redirect_uri);
  u.searchParams.set("scope", p.scope);
  u.searchParams.set("state", p.state);
  u.searchParams.set("aud", p.iss.href);
  u.searchParams.set("code_challenge", p.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u;
}

function openBrowser(url: string) {
  const cmd =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["rundll32", "url.dll,FileProtocolHandler", url]
        : ["xdg-open", url];
  try {
    const child = spawn(cmd[0]!, cmd.slice(1), { stdio: "ignore", detached: true });
    child.on("error", () => {}); // ENOENT arrives async; unhandled it kills the process
    child.unref();
  } catch {}
}

interface CallbackServer {
  redirect_uri: string;
  waitForUrl: () => Promise<string>;
  close: () => void;
}

async function bindCallback(): Promise<CallbackServer> {
  let lastErr: unknown;
  for (const port of REDIRECT_PORTS) {
    const redirect_uri = `http://localhost:${port}/callback`;
    try {
      return await new Promise<CallbackServer>((resolveBind, rejectBind) => {
        let resolveUrl: (u: string) => void;
        const urlP = new Promise<string>((res) => (resolveUrl = res));
        const srv = createServer((req, res) => {
          const u = new URL(req.url ?? "/", redirect_uri);
          if (u.pathname !== "/callback") {
            res.writeHead(404).end();
            return;
          }
          res
            .writeHead(200, { "Content-Type": "text/html" })
            .end("<p>Signed in. You can close this tab.</p>");
          srv.close();
          resolveUrl(u.href);
        });
        srv.on("error", rejectBind);
        srv.listen(port, "127.0.0.1", () =>
          resolveBind({ redirect_uri, waitForUrl: () => urlP, close: () => srv.close() }),
        );
      });
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`could not bind redirect port ${REDIRECT_PORTS.join("/")}: ${lastErr}`);
}

async function tokenRequest(cfg: SmartConfig, body: Record<string, string>): Promise<SmartTokens> {
  const res = await fetch(cfg.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body),
    // a 307/308 would re-POST the authorization code / PKCE verifier /
    // signed client assertion to wherever the redirect points — the
    // credential-bearing sibling of the S1 data-path pin
    redirect: "error",
  });
  if (!res.ok) throw new Error(`token endpoint ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as SmartTokens;
}

export interface PendingAuth {
  authorize_url: string;
  complete: (callbackUrl: string) => Promise<SmartTokens>;
}

export async function smartBegin(opts: {
  iss: URL;
  client_id: string;
  scope: string;
  redirect_uri: string;
}): Promise<PendingAuth> {
  const cfg = await discover(opts.iss);
  const scope = negotiateScope(cfg, opts.scope);
  const { verifier, challenge } = makePkce();
  const state = b64url(randomBytes(16));
  const authUrl = buildAuthorizeUrl(cfg, { ...opts, scope, state, challenge });
  return {
    authorize_url: authUrl.href,
    complete: async (callbackUrl: string) => {
      const u = new URL(callbackUrl, opts.redirect_uri);
      const err = u.searchParams.get("error");
      if (err)
        throw new Error(`authorize error: ${err} ${u.searchParams.get("error_description") ?? ""}`);
      if (u.searchParams.get("state") !== state) throw new Error("state mismatch");
      const code = u.searchParams.get("code");
      if (!code) throw new Error("missing code");
      return tokenRequest(cfg, {
        grant_type: "authorization_code",
        code,
        redirect_uri: opts.redirect_uri,
        client_id: opts.client_id,
        code_verifier: verifier,
      });
    },
  };
}

export function isHeadless(): boolean {
  if (process.env.FHIR_AUTH_MODE === "manual") return true;
  if (process.env.COWORK_VSOCK_ADDR) return true;
  if (process.platform === "darwin" || process.platform === "win32") return false;
  return !process.env.DISPLAY;
}

export async function smartLaunch(opts: {
  iss: URL;
  client_id: string;
  scope: string;
}): Promise<SmartTokens> {
  const cb = await bindCallback();
  try {
    const pending = await smartBegin({ ...opts, redirect_uri: cb.redirect_uri });
    process.stderr.write(`\nSign in: ${pending.authorize_url}\n`);
    openBrowser(pending.authorize_url);
    return await pending.complete(await cb.waitForUrl());
  } finally {
    cb.close();
  }
}

export async function smartRefresh(
  cfg: SmartConfig,
  client_id: string,
  refresh_token: string,
): Promise<SmartTokens> {
  return tokenRequest(cfg, { grant_type: "refresh_token", refresh_token, client_id });
}
