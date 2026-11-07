// Routes a validated { fn, action, payload } call to the StaffTO action handlers.
// Every handler resolves the caller itself and checks ownership/roles before any service-role access.
import { actions as jobs } from "./jobs.server.js";
import { actions as ai } from "./ai.server.js";
import { actions as billing } from "./billing.server.js";
import { actions as marketplace } from "./marketplace.server.js";
import { actions as site } from "./site.server.js";
import { actions as account } from "./account.server.js";
import { actions as admin } from "./admin.server.js";
import { HttpError } from "./shared.server.js";

const MODULES = { jobs, ai, billing, marketplace, site, account, admin };
export const FUNCTION_NAMES = Object.keys(MODULES);

export async function dispatch(data, context) {
  const handler = MODULES[data.fn]?.[data.action];
  if (!handler) return { ok: false, error: { status: 400, message: `Unknown action "${data.fn}.${data.action}"`, code: null } };
  const base44 = context.getBase44();
  let user = null;
  try {
    user = await base44.auth.me();
    if (!user?.id) user = null;
  } catch (err) {
    if (err?.status && err.status !== 401 && err.status !== 403) throw err;
  }
  let origin = "";
  try { origin = data.origin ? new URL(data.origin).origin : ""; } catch { origin = ""; }
  const req = new Request(`${origin || "https://staffto.ca"}/`);
  try {
    const result = await handler({ req, body: { ...(data.payload || {}), action: data.action }, base44, sr: base44.asServiceRole, user, origin });
    if (result instanceof Response) return { ok: true, raw: await result.text() };
    return { ok: true, result: result ?? { ok: true } };
  } catch (err) {
    const status = err instanceof HttpError ? err.status : err?.status || 500;
    const message = err instanceof HttpError ? err.message : status >= 500 ? "Unexpected error. Please try again." : err?.data?.message || err?.message || "Request failed";
    return { ok: false, error: { status, message, code: err?.code || null } };
  }
}
