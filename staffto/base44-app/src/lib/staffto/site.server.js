// Ported from base44/functions/site/entry.ts (StaffTO repo).
import { cleanText, getSetting, HttpError, isAdmin, nowIso, oneOf } from "./shared.server.js";
const PUBLIC_EVENTS = ["page_view", "job_view", "apply_click", "share", "referral_visit", "signup"];
const STATIC_PATHS = [
  "/",
  "/jobs",
  "/employers",
  "/pricing",
  "/how-it-works",
  "/community",
  "/classifieds",
  "/resources",
  "/contact",
  "/restaurant-jobs-toronto",
  "/cook-jobs-toronto",
  "/chef-jobs-toronto",
  "/server-jobs-toronto",
  "/bartender-jobs-toronto",
  "/dishwasher-jobs-toronto",
  "/restaurant-hiring-toronto",
  "/hospitality-staffing-toronto",
  "/legal/privacy",
  "/legal/terms",
  "/legal/cookies",
  "/legal/ai",
  "/legal/employers"
];
const xmlEscape = (s) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);
function buildSitemap(origin, jobs, articles, listings) {
  const url = (path, lastmod, freq = "weekly") => `  <url><loc>${xmlEscape(origin + path)}</loc>${lastmod ? `<lastmod>${lastmod.slice(0, 10)}</lastmod>` : ""}<changefreq>${freq}</changefreq></url>`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...STATIC_PATHS.map((p) => url(p, void 0, p === "/" || p === "/jobs" ? "daily" : "weekly")),
    ...jobs.map((j) => url(`/jobs/${j.id}/${j.slug || ""}`, j.updated_date, "daily")),
    ...articles.map((a) => url(`/resources/${a.slug}`, a.updated_date, "monthly")),
    ...listings.map((l) => url(`/classifieds/${l.id}`, l.updated_date, "weekly")),
    "</urlset>"
  ].join("\n");
}
const actions = {
  // Real counts only — computed server-side because seekers' records are private under RLS.
  async stats({ sr }) {
    const [jobs, employers, seekers, applications] = await Promise.all([
      sr.entities.Job.filter({ status: "active" }, "-created_date", 5e3),
      sr.entities.Employer.filter({ status: "active" }, "-created_date", 5e3),
      sr.entities.UserProfile.filter({ account_type: "seeker" }, "-created_date", 2e4, 0, ["id"]),
      sr.entities.JobApplication.list("-created_date", 5e4, 0, ["id"])
    ]);
    return { active_jobs: jobs.length, employers: employers.length, job_seekers: seekers.length, applications: applications.length, as_of: nowIso() };
  },
  async track({ sr, user, body }) {
    const type = oneOf(body.type, PUBLIC_EVENTS, "type");
    const session_id = cleanText(body.session_id, 64);
    const job_id = cleanText(body.job_id, 60);
    const event = {
      type,
      session_id,
      job_id,
      path: cleanText(body.path, 300),
      user_id: user?.id || "",
      utm_source: cleanText(body.utm_source, 60).toLowerCase(),
      utm_medium: cleanText(body.utm_medium, 60).toLowerCase(),
      utm_campaign: cleanText(body.utm_campaign, 80).toLowerCase(),
      ref: cleanText(body.ref, 40),
      channel: cleanText(body.channel, 40),
      referrer_host: cleanText(body.referrer_host, 120).toLowerCase()
    };
    if (type === "job_view" && job_id) {
      const seen = session_id ? await sr.entities.AnalyticsEvent.filter({ type, job_id, session_id }, "-created_date", 1) : [];
      if (seen.length) return { ok: true, deduped: true };
      const job = await sr.entities.Job.get(job_id).catch(() => null);
      if (job) await sr.entities.Job.update(job.id, { views: (job.views || 0) + 1 });
    }
    if (type === "share" && job_id) {
      const job = await sr.entities.Job.get(job_id).catch(() => null);
      if (job) await sr.entities.Job.update(job.id, { share_count: (job.share_count || 0) + 1 });
    }
    if (type === "referral_visit" && event.ref) {
      const seen = session_id ? await sr.entities.AnalyticsEvent.filter({ type, ref: event.ref, session_id }, "-created_date", 1) : [];
      if (seen.length) return { ok: true, deduped: true };
      const ref = (await sr.entities.Referral.filter({ code: event.ref }, "-created_date", 1))[0];
      if (ref) await sr.entities.Referral.update(ref.id, { visits: (ref.visits || 0) + 1 });
    }
    if (type === "page_view" && body.listing_id) {
      const listing = await sr.entities.ClassifiedListing.get(cleanText(body.listing_id, 60)).catch(() => null);
      if (listing) await sr.entities.ClassifiedListing.update(listing.id, { views: (listing.views || 0) + 1 });
    }
    await sr.entities.AnalyticsEvent.create(event);
    return { ok: true };
  },
  async contact({ sr, body }) {
    if (body.website) return { ok: true };
    const name = cleanText(body.name, 120);
    const email = cleanText(body.email, 200);
    const message = cleanText(body.message, 4e3);
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || message.length < 10) throw new HttpError(400, "Please add your name, a valid email and a message.");
    await sr.entities.ContactMessage.create({ name, email, message, topic: oneOf(body.topic || "general", ["general", "employer_sales", "support", "privacy", "press"], "Topic"), status: "new" });
    return { ok: true };
  },
  async unsubscribe({ sr, body }) {
    const token = cleanText(body.token, 80);
    if (token.length < 16) throw new HttpError(400, "Invalid unsubscribe link.");
    const profile = (await sr.entities.UserProfile.filter({ unsubscribe_token: token }, "-created_date", 1))[0];
    if (!profile) throw new HttpError(404, "This unsubscribe link is no longer valid.");
    const scope = body.scope === "all" ? "all" : "marketing";
    await sr.entities.UserProfile.update(profile.id, { marketing_consent: false, ...scope === "all" ? { notify_email: false } : {} });
    return { ok: true, scope };
  },
  async sitemap({ sr, req }) {
    const branding = await getSetting(sr, "branding", {});
    const origin = (branding.site_url || new URL(req.url).searchParams.get("origin") || "https://staffto.ca").replace(/\/$/, "");
    const [jobs, articles, listings] = await Promise.all([
      sr.entities.Job.filter({ status: "active" }, "-updated_date", 5e3, 0, ["id", "slug", "updated_date"]),
      sr.entities.Article.filter({ status: "published" }, "-updated_date", 1e3, 0, ["slug", "updated_date"]),
      sr.entities.ClassifiedListing.filter({ status: "active" }, "-updated_date", 2e3, 0, ["id", "updated_date"])
    ]);
    return new Response(buildSitemap(origin, jobs, articles, listings), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  },
  // Daily automation (see function.jsonc): expire listings, end featured periods, lapse unpaid subscriptions.
  async maintenance({ sr, user }) {
    if (!isAdmin(user)) throw new HttpError(403, "Administrator access required.");
    const now = nowIso();
    let expired = 0, unfeatured = 0, lapsed = 0;
    for (const job of await sr.entities.Job.filter({ status: "active" }, "-created_date", 5e3)) {
      if (job.expires_at && job.expires_at < now) {
        await sr.entities.Job.update(job.id, { status: "expired", is_featured: false });
        expired++;
      } else if (job.is_featured && job.featured_until && job.featured_until < now) {
        await sr.entities.Job.update(job.id, { is_featured: false });
        unfeatured++;
      }
    }
    for (const sub of await sr.entities.Subscription.filter({ status: "active" }, "-created_date", 5e3)) {
      const grace = new Date(Date.now() - 3 * 864e5).toISOString();
      if (sub.current_period_end && sub.current_period_end < (sub.provider === "stripe" ? grace : now)) {
        await sr.entities.Subscription.update(sub.id, { status: "cancelled" });
        await sr.entities.Employer.update(sub.employer_id, { plan: "free" });
        lapsed++;
      }
    }
    return { expired, unfeatured, lapsed, ran_at: now };
  }
};
export {
  actions,
  buildSitemap
};
