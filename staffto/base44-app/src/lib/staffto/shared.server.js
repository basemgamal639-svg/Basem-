import { secrets } from "base44:runtime";
export const env = (name) => secrets.get(name);
class HttpError extends Error {
  status;
  code;
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
const addDays = (days, from = /* @__PURE__ */ new Date()) => new Date(from.getTime() + days * 864e5).toISOString();
function randomToken(bytes = 18) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}
function slugify(text) {
  return String(text || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
}
function cleanText(value, max = 5e3) {
  if (value === void 0 || value === null) return "";
  return String(value).replace(/\u0000/g, "").trim().slice(0, max);
}
function cleanList(value, maxItems = 30, maxLen = 80) {
  if (!Array.isArray(value)) return [];
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const v of value) {
    const s = cleanText(v, maxLen);
    if (s && !seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      out.push(s);
    }
    if (out.length >= maxItems) break;
  }
  return out;
}
function oneOf(value, allowed, field, required = true) {
  if (value === void 0 || value === null || value === "") {
    if (required) throw new HttpError(400, `${field} is required`);
    return void 0;
  }
  if (!allowed.includes(value)) throw new HttpError(400, `${field} has an invalid value`);
  return value;
}
const CATEGORIES = ["chef", "sous_chef", "line_cook", "prep_cook", "dishwasher", "kitchen_manager", "restaurant_manager", "server", "bartender", "barista", "host", "busser", "catering_staff", "event_staff", "other"];
const LOCATIONS = ["downtown_toronto", "north_york", "scarborough", "etobicoke", "east_york", "york", "mississauga", "brampton", "markham", "vaughan", "richmond_hill", "oakville", "pickering", "ajax", "other_gta"];
const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "seasonal", "temporary"];
const LABELS = {
  chef: "Chef",
  sous_chef: "Sous Chef",
  line_cook: "Line Cook",
  prep_cook: "Prep Cook",
  dishwasher: "Dishwasher",
  kitchen_manager: "Kitchen Manager",
  restaurant_manager: "Restaurant Manager",
  server: "Server",
  bartender: "Bartender",
  barista: "Barista",
  host: "Host",
  busser: "Busser",
  catering_staff: "Catering Staff",
  event_staff: "Event Staff",
  other: "Hospitality",
  downtown_toronto: "Downtown Toronto",
  north_york: "North York",
  scarborough: "Scarborough",
  etobicoke: "Etobicoke",
  east_york: "East York",
  york: "York",
  mississauga: "Mississauga",
  brampton: "Brampton",
  markham: "Markham",
  vaughan: "Vaughan",
  richmond_hill: "Richmond Hill",
  oakville: "Oakville",
  pickering: "Pickering",
  ajax: "Ajax",
  other_gta: "Greater Toronto Area",
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  seasonal: "Seasonal",
  temporary: "Temporary"
};
const label = (k) => LABELS[k] || k;
const DEFAULT_PRICING = {
  currency: "CAD",
  tax_rate: 0.13,
  tax_label: "HST (ON 13%)",
  products: {
    single_job: { name: "Single job post", price_cents: 1999, duration_days: 30, kind: "one_time" },
    featured_upgrade: { name: "Featured upgrade (14 days)", price_cents: 999, duration_days: 14, kind: "one_time" },
    pro_monthly: { name: "Pro \u2014 monthly", price_cents: 7900, plan: "pro", kind: "subscription" },
    premium_monthly: { name: "Premium \u2014 monthly", price_cents: 14900, plan: "premium", kind: "subscription" }
  },
  plans: {
    free: { name: "Free", active_jobs: 0, featured_per_month: 0, job_duration_days: 30, ai_screening: false, analytics: false, multi_location: false, priority: 0 },
    single: { name: "Single Job", active_jobs: 0, featured_per_month: 0, job_duration_days: 30, ai_screening: false, analytics: false, multi_location: false, priority: 0 },
    pro: { name: "Pro", active_jobs: 5, featured_per_month: 2, job_duration_days: 45, ai_screening: false, analytics: true, multi_location: false, priority: 1 },
    premium: { name: "Premium", active_jobs: 25, featured_per_month: 6, job_duration_days: 60, ai_screening: true, analytics: true, multi_location: true, priority: 2 }
  }
};
function deepMerge(base, over) {
  if (!over || typeof over !== "object" || Array.isArray(over)) return over === void 0 ? base : over;
  const out = Array.isArray(base) ? [...base] : { ...base || {} };
  for (const [k, v] of Object.entries(over)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) ? deepMerge(base?.[k], v) : v;
  }
  return out;
}
async function getSetting(sr, key, fallback = {}) {
  const rows = await sr.entities.PlatformSetting.filter({ key }, "-updated_date", 1);
  return rows?.[0]?.value ? deepMerge(fallback, rows[0].value) : fallback;
}
const getPricing = (sr) => getSetting(sr, "pricing", DEFAULT_PRICING);
async function currentUser(base44) {
  try {
    const user = await base44.auth.me();
    return user?.id ? user : null;
  } catch {
    return null;
  }
}
function requireUser(user) {
  if (!user) throw new HttpError(401, "Please sign in to continue.", "auth_required");
  return user;
}
const isAdmin = (user) => user?.role === "admin";
function requireAdmin(user) {
  requireUser(user);
  if (!isAdmin(user)) throw new HttpError(403, "Administrator access required.", "forbidden");
  return user;
}
async function getProfile(sr, userId) {
  const rows = await sr.entities.UserProfile.filter({ user_id: userId }, "-created_date", 1);
  return rows?.[0] || null;
}
async function requireActiveProfile(sr, user) {
  const profile = await getProfile(sr, user.id);
  if (profile?.suspended) throw new HttpError(403, "This account is suspended. Contact support@staffto.ca.", "suspended");
  return profile;
}
async function getOwnedEmployer(sr, user) {
  const rows = await sr.entities.Employer.filter({ owner_id: user.id }, "-created_date", 1);
  const employer = rows?.[0];
  if (!employer) throw new HttpError(400, "Create your business profile first.", "no_employer");
  if (employer.status === "suspended") throw new HttpError(403, "This business account is suspended.", "suspended");
  return employer;
}
async function audit(sr, actor, action, target_type, target_id, details = {}) {
  await sr.entities.AuditLog.create({ actor_id: actor.id, actor_email: actor.email, action, target_type, target_id, details });
}
function siteOrigin(req) {
  const origin = req.headers.get("origin") || req.headers.get("referer") || "";
  try {
    return origin ? new URL(origin).origin : "";
  } catch {
    return "";
  }
}
async function notify(sr, userId, n, origin = "") {
  await sr.entities.Notification.create({ user_id: userId, type: n.type, title: n.title, body: n.body, link: n.link || "", read: false });
  try {
    const profile = await getProfile(sr, userId);
    if (!profile || profile.notify_email === false || !profile.email) return;
    const link = n.link && origin ? `${origin}${n.link}` : "";
    const footer = [
      "",
      "\u2014",
      "StaffTO \xB7 Toronto hospitality jobs",
      origin ? `Notification settings: ${origin}/account/settings` : "",
      origin && profile.unsubscribe_token ? `Unsubscribe from emails: ${origin}/unsubscribe?token=${profile.unsubscribe_token}` : ""
    ].filter(Boolean).join("\n");
    await sr.integrations.Core.SendEmail({ to: profile.email, subject: n.title, body: `${n.body}${link ? `

${link}` : ""}
${footer}`, from_name: "StaffTO" });
  } catch (_e) {
  }
}
async function adminUserIds(sr) {
  try {
    const admins = await sr.entities.User.filter({ role: "admin" }, "-created_date", 20);
    return (admins || []).map((u) => u.id);
  } catch {
    return [];
  }
}
async function readBody(req) {
  if (req.method === "GET") return Object.fromEntries(new URL(req.url).searchParams.entries());
  try {
    return await req.json();
  } catch {
    return {};
  }
}
function serveActions(actions, createClient) {
  return async (req) => {
    try {
      const body = await readBody(req);
      const action = String(body.action || "");
      const fn = actions[action];
      if (!fn) throw new HttpError(400, `Unknown action "${action}"`);
      const base44 = createClient(req);
      const user = req.headers.get("Authorization") ? await currentUser(base44) : null;
      const result = await fn({ req, body, base44, sr: base44.asServiceRole, user, origin: siteOrigin(req) });
      if (result instanceof Response) return result;
      return Response.json(result ?? { ok: true });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : err?.response?.status || err?.status || 500;
      const message = err instanceof HttpError ? err.message : err?.response?.data?.message || err?.message || "Unexpected error";
      if (status >= 500) console.error("[function error]", err);
      return Response.json({ error: message, message, code: err?.code || null }, { status });
    }
  };
}
export {
  CATEGORIES,
  DEFAULT_PRICING,
  EMPLOYMENT_TYPES,
  HttpError,
  LABELS,
  LOCATIONS,
  addDays,
  adminUserIds,
  audit,
  cleanList,
  cleanText,
  currentUser,
  deepMerge,
  getOwnedEmployer,
  getPricing,
  getProfile,
  getSetting,
  isAdmin,
  label,
  notify,
  nowIso,
  oneOf,
  randomToken,
  readBody,
  requireActiveProfile,
  requireAdmin,
  requireUser,
  serveActions,
  siteOrigin,
  slugify
};
