import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

import { validateBaseUrl } from "../fhir-client.mjs";

/**
 * @typedef {object} SmartConfig
 * @property {string} authorization_endpoint
 * @property {string} token_endpoint
 * @property {string[]} [scopes_supported]
 * @property {string[]} [capabilities]
 */

/**
 * @typedef {object} SmartTokens
 * @property {string} access_token
 * @property {string} [refresh_token]
 * @property {number} [expires_in]
 * @property {string} [scope]
 * @property {string} [patient]
 * @property {string} [fhirUser]
 * @property {string} [id_token]
 */

const REDIRECT_PORTS = [53682, 53683];

/** @param {Buffer} buf @returns {string} */
function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function makePkce() {
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/** @param {URL} iss @returns {Promise<SmartConfig>} */
export async function discover(iss) {
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
  const cfg = /** @type {SmartConfig} */ (await res.json());
  validateBaseUrl(cfg.authorization_endpoint);
  validateBaseUrl(cfg.token_endpoint);
  return cfg;
}

// SMART scope v2 (`.rs`/`.cruds`) falls back to v1 (`.read`/`.write`) when the
// server doesn't advertise permission-v2 — keeps one default scope string
// portable across Epic (v1+v2) and Cerner/athenahealth (historically v1).
/** @param {SmartConfig} cfg @param {string} scope @returns {string} */
export function negotiateScope(cfg, scope) {
  if (cfg.capabilities?.includes("permission-v2")) return scope;
  return scope.replace(
    /([A-Za-z*]+\/[A-Za-z*]+)\.([cruds]+)\b/g,
    (_, /** @type {string} */ res, /** @type {string} */ ops) => {
      /** @type {string[]} */
      const out = [];
      if (/[rs]/.test(ops)) out.push(`${res}.read`);
      if (/[cud]/.test(ops)) out.push(`${res}.write`);
      return out.join(" ");
    },
  );
}

/**
 * @param {SmartConfig} cfg
 * @param {{ iss: URL, client_id: string, scope: string, redirect_uri: string, state: string, challenge: string }} p
 * @returns {URL}
 */
export function buildAuthorizeUrl(cfg, p) {
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

/** @param {string} url */
function openBrowser(url) {
  const cmd =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["rundll32", "url.dll,FileProtocolHandler", url]
        : ["xdg-open", url];
  try {
    const child = spawn(cmd[0], cmd.slice(1), { stdio: "ignore", detached: true });
    child.on("error", () => {}); // ENOENT arrives async; unhandled it kills the process
    child.unref();
  } catch {}
}

/**
 * @typedef {object} CallbackServer
 * @property {string} redirect_uri
 * @property {() => Promise<string>} waitForUrl
 * @property {() => void} close
 */

/** @returns {Promise<CallbackServer>} */
async function bindCallback() {
  /** @type {unknown} */
  let lastErr;
  for (const port of REDIRECT_PORTS) {
    const redirect_uri = `http://localhost:${port}/callback`;
    try {
      return await new Promise((resolveBind, rejectBind) => {
        /** @type {(u: string) => void} */
        let resolveUrl;
        /** @type {Promise<string>} */
        const urlP = new Promise((res) => (resolveUrl = res));
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

/** @param {SmartConfig} cfg @param {Record<string, string>} body @returns {Promise<SmartTokens>} */
async function tokenRequest(cfg, body) {
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
  return /** @type {SmartTokens} */ (await res.json());
}

/**
 * @typedef {object} PendingAuth
 * @property {string} authorize_url
 * @property {(callbackUrl: string) => Promise<SmartTokens>} complete
 */

/**
 * @param {{ iss: URL, client_id: string, scope: string, redirect_uri: string }} opts
 * @returns {Promise<PendingAuth>}
 */
export async function smartBegin(opts) {
  const cfg = await discover(opts.iss);
  const scope = negotiateScope(cfg, opts.scope);
  const { verifier, challenge } = makePkce();
  const state = b64url(randomBytes(16));
  const authUrl = buildAuthorizeUrl(cfg, { ...opts, scope, state, challenge });
  return {
    authorize_url: authUrl.href,
    complete: async (callbackUrl) => {
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

/** @returns {boolean} */
export function isHeadless() {
  if (process.env.FHIR_AUTH_MODE === "manual") return true;
  if (process.env.COWORK_VSOCK_ADDR) return true;
  if (process.platform === "darwin" || process.platform === "win32") return false;
  return !process.env.DISPLAY;
}

/**
 * @param {{ iss: URL, client_id: string, scope: string }} opts
 * @returns {Promise<SmartTokens>}
 */
export async function smartLaunch(opts) {
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

/**
 * @param {SmartConfig} cfg
 * @param {string} client_id
 * @param {string} refresh_token
 * @returns {Promise<SmartTokens>}
 */
export async function smartRefresh(cfg, client_id, refresh_token) {
  return tokenRequest(cfg, { grant_type: "refresh_token", refresh_token, client_id });
}
