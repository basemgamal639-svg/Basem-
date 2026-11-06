// Shared helpers for StaffTO backend functions.
// SOURCE OF TRUTH: base44/shared/shared.ts. `npm run sync:shared` copies it into every
// function directory as _shared.ts (Base44 deploys each function directory on its own).
// Do not edit the _shared.ts copies directly — `npm test` fails if they drift.

// deno-lint-ignore-file no-explicit-any
export class HttpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const nowIso = () => new Date().toISOString();
export const addDays = (days: number, from = new Date()) => new Date(from.getTime() + days * 86400000).toISOString();

export function randomToken(bytes = 18): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function slugify(text: string): string {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

export function cleanText(value: unknown, max = 5000): string {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\u0000/g, "").trim().slice(0, max);
}

export function cleanList(value: unknown, maxItems = 30, maxLen = 80): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
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

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string, required = true): T | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) throw new HttpError(400, `${field} is required`);
    return undefined;
  }
  if (!allowed.includes(value as T)) throw new HttpError(400, `${field} has an invalid value`);
  return value as T;
}

export const CATEGORIES = ["chef", "sous_chef", "line_cook", "prep_cook", "dishwasher", "kitchen_manager", "restaurant_manager", "server", "bartender", "barista", "host", "busser", "catering_staff", "event_staff", "other"] as const;
export const LOCATIONS = ["downtown_toronto", "north_york", "scarborough", "etobicoke", "east_york", "york", "mississauga", "brampton", "markham", "vaughan", "richmond_hill", "oakville", "pickering", "ajax", "other_gta"] as const;
export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "seasonal", "temporary"] as const;

export const LABELS: Record<string, string> = {
  chef: "Chef", sous_chef: "Sous Chef", line_cook: "Line Cook", prep_cook: "Prep Cook", dishwasher: "Dishwasher",
  kitchen_manager: "Kitchen Manager", restaurant_manager: "Restaurant Manager", server: "Server", bartender: "Bartender",
  barista: "Barista", host: "Host", busser: "Busser", catering_staff: "Catering Staff", event_staff: "Event Staff", other: "Hospitality",
  downtown_toronto: "Downtown Toronto", north_york: "North York", scarborough: "Scarborough", etobicoke: "Etobicoke",
  east_york: "East York", york: "York", mississauga: "Mississauga", brampton: "Brampton", markham: "Markham", vaughan: "Vaughan",
  richmond_hill: "Richmond Hill", oakville: "Oakville", pickering: "Pickering", ajax: "Ajax", other_gta: "Greater Toronto Area",
  full_time: "Full-time", part_time: "Part-time", contract: "Contract", seasonal: "Seasonal", temporary: "Temporary",
};
export const label = (k: string) => LABELS[k] || k;

// Default commercial configuration. Admins override any part of it via PlatformSetting key "pricing".
// Prices are suggestions to test, in CAD cents, before 13% Ontario HST.
export const DEFAULT_PRICING = {
  currency: "CAD",
  tax_rate: 0.13,
  tax_label: "HST (ON 13%)",
  products: {
    single_job: { name: "Single job post", price_cents: 7900, duration_days: 30, kind: "one_time" },
    featured_upgrade: { name: "Featured upgrade (14 days)", price_cents: 2900, duration_days: 14, kind: "one_time" },
    pro_monthly: { name: "Pro — monthly", price_cents: 19900, plan: "pro", kind: "subscription" },
    premium_monthly: { name: "Premium — monthly", price_cents: 39900, plan: "premium", kind: "subscription" },
  },
  plans: {
    free: { name: "Free", active_jobs: 0, featured_per_month: 0, job_duration_days: 30, ai_screening: false, analytics: false, multi_location: false, priority: 0 },
    single: { name: "Single Job", active_jobs: 0, featured_per_month: 0, job_duration_days: 30, ai_screening: false, analytics: false, multi_location: false, priority: 0 },
    pro: { name: "Pro", active_jobs: 5, featured_per_month: 2, job_duration_days: 45, ai_screening: false, analytics: true, multi_location: false, priority: 1 },
    premium: { name: "Premium", active_jobs: 25, featured_per_month: 6, job_duration_days: 60, ai_screening: true, analytics: true, multi_location: true, priority: 2 },
  },
};

export function deepMerge(base: any, over: any): any {
  if (!over || typeof over !== "object" || Array.isArray(over)) return over === undefined ? base : over;
  const out: any = Array.isArray(base) ? [...base] : { ...(base || {}) };
  for (const [k, v] of Object.entries(over)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) ? deepMerge(base?.[k], v) : v;
  }
  return out;
}

export async function getSetting(sr: any, key: string, fallback: any = {}): Promise<any> {
  const rows = await sr.entities.PlatformSetting.filter({ key }, "-updated_date", 1);
  return rows?.[0]?.value ? deepMerge(fallback, rows[0].value) : fallback;
}

export const getPricing = (sr: any) => getSetting(sr, "pricing", DEFAULT_PRICING);

export async function currentUser(base44: any): Promise<any | null> {
  try {
    const user = await base44.auth.me();
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

export function requireUser(user: any): any {
  if (!user) throw new HttpError(401, "Please sign in to continue.", "auth_required");
  return user;
}

export const isAdmin = (user: any) => user?.role === "admin";

export function requireAdmin(user: any): any {
  requireUser(user);
  if (!isAdmin(user)) throw new HttpError(403, "Administrator access required.", "forbidden");
  return user;
}

export async function getProfile(sr: any, userId: string): Promise<any | null> {
  const rows = await sr.entities.UserProfile.filter({ user_id: userId }, "-created_date", 1);
  return rows?.[0] || null;
}

export async function requireActiveProfile(sr: any, user: any): Promise<any> {
  const profile = await getProfile(sr, user.id);
  if (profile?.suspended) throw new HttpError(403, "This account is suspended. Contact support@staffto.ca.", "suspended");
  return profile;
}

export async function getOwnedEmployer(sr: any, user: any): Promise<any> {
  const rows = await sr.entities.Employer.filter({ owner_id: user.id }, "-created_date", 1);
  const employer = rows?.[0];
  if (!employer) throw new HttpError(400, "Create your business profile first.", "no_employer");
  if (employer.status === "suspended") throw new HttpError(403, "This business account is suspended.", "suspended");
  return employer;
}

export async function audit(sr: any, actor: any, action: string, target_type: string, target_id: string, details: any = {}) {
  await sr.entities.AuditLog.create({ actor_id: actor.id, actor_email: actor.email, action, target_type, target_id, details });
}

export function siteOrigin(req: Request): string {
  const origin = req.headers.get("origin") || req.headers.get("referer") || "";
  try {
    return origin ? new URL(origin).origin : "";
  } catch {
    return "";
  }
}

// In-app notification plus (if the user allows it) a transactional email.
export async function notify(sr: any, userId: string, n: { type: string; title: string; body: string; link?: string }, origin = "") {
  await sr.entities.Notification.create({ user_id: userId, type: n.type, title: n.title, body: n.body, link: n.link || "", read: false });
  try {
    const profile = await getProfile(sr, userId);
    if (!profile || profile.notify_email === false || !profile.email) return;
    const link = n.link && origin ? `${origin}${n.link}` : "";
    const footer = [
      "",
      "—",
      "StaffTO · Toronto hospitality jobs",
      origin ? `Notification settings: ${origin}/account/settings` : "",
      origin && profile.unsubscribe_token ? `Unsubscribe from emails: ${origin}/unsubscribe?token=${profile.unsubscribe_token}` : "",
    ].filter(Boolean).join("\n");
    await sr.integrations.Core.SendEmail({ to: profile.email, subject: n.title, body: `${n.body}${link ? `\n\n${link}` : ""}\n${footer}`, from_name: "StaffTO" });
  } catch (_e) {
    // Email delivery is best-effort; the in-app notification is the record.
  }
}

export async function adminUserIds(sr: any): Promise<string[]> {
  try {
    const admins = await sr.entities.User.filter({ role: "admin" }, "-created_date", 20);
    return (admins || []).map((u: any) => u.id);
  } catch {
    return [];
  }
}

export async function readBody(req: Request): Promise<any> {
  if (req.method === "GET") return Object.fromEntries(new URL(req.url).searchParams.entries());
  try {
    return await req.json();
  } catch {
    return {};
  }
}

// Wrap an action map into a Deno.serve handler with consistent errors.
export function serveActions(actions: Record<string, (ctx: any) => Promise<any>>, createClient: (req: Request) => any) {
  return async (req: Request): Promise<Response> => {
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
    } catch (err: any) {
      const status = err instanceof HttpError ? err.status : (err?.response?.status || err?.status || 500);
      const message = err instanceof HttpError ? err.message : (err?.response?.data?.message || err?.message || "Unexpected error");
      if (status >= 500) console.error("[function error]", err);
      return Response.json({ error: message, message, code: err?.code || null }, { status });
    }
  };
}
