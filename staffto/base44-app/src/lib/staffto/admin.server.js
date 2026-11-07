// Ported from base44/functions/admin/entry.ts (StaffTO repo).
import { addDays, audit, cleanText, getPricing, HttpError, label, notify, nowIso, oneOf, requireAdmin } from "./shared.server.js";
const SETTING_KEYS = ["pricing", "branding", "community", "seo", "payments", "classifieds"];
function countBy(rows, key) {
  const m = {};
  for (const r of rows) {
    const k = r[key] || "unknown";
    m[k] = (m[k] || 0) + 1;
  }
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: label(k), count: v }));
}
const actions = {
  async overview({ sr, user, body }) {
    requireAdmin(user);
    const days = Math.min(365, Math.max(1, Number(body.days) || 30));
    const since = new Date(Date.now() - days * 864e5).toISOString();
    const [users, profiles, employers, jobs, apps, payments, subs, events, reports, listings] = await Promise.all([
      sr.entities.User.list("-created_date", 2e4, 0, ["id", "role", "created_date"]),
      sr.entities.UserProfile.list("-created_date", 2e4, 0, ["account_type", "marketing_consent", "created_date"]),
      sr.entities.Employer.list("-created_date", 5e3, 0, ["id", "verified", "plan", "status", "verification_requested"]),
      sr.entities.Job.list("-created_date", 1e4, 0, ["id", "status", "category", "location", "views", "applications_count", "share_count", "title", "employer_name", "created_date"]),
      sr.entities.JobApplication.list("-created_date", 5e4, 0, ["id", "status", "created_date", "source"]),
      sr.entities.Payment.filter({ status: "paid" }, "-paid_at", 1e4),
      sr.entities.Subscription.list("-created_date", 5e3),
      sr.entities.AnalyticsEvent.list("-created_date", 5e4, 0, ["type", "utm_source", "utm_campaign", "referrer_host", "created_date", "session_id"]),
      sr.entities.Report.filter({ status: "open" }, "-created_date", 500),
      sr.entities.ClassifiedListing.filter({ status: "pending" }, "-created_date", 500)
    ]);
    const recent = events.filter((e) => (e.created_date || "") >= since);
    const evCount = (t) => recent.filter((e) => e.type === t).length;
    const fb = recent.filter((e) => (e.utm_source || "").includes("facebook") || (e.referrer_host || "").includes("facebook"));
    const sessions = new Set(recent.filter((e) => e.type === "page_view").map((e) => e.session_id)).size;
    const jobViews = evCount("job_view");
    const applications = apps.filter((a) => (a.created_date || "") >= since).length;
    const revenue = payments.reduce((s, p) => s + (p.total_cents || 0) - (p.tax_cents || 0), 0);
    const revenue30 = payments.filter((p) => (p.paid_at || "") >= since).reduce((s, p) => s + (p.total_cents || 0) - (p.tax_cents || 0), 0);
    const byCampaign = {};
    for (const e of recent) {
      if (!e.utm_campaign) continue;
      byCampaign[e.utm_campaign] ??= { campaign: e.utm_campaign, page_views: 0, job_views: 0, applications: 0, signups: 0 };
      if (e.type === "page_view") byCampaign[e.utm_campaign].page_views++;
      if (e.type === "job_view") byCampaign[e.utm_campaign].job_views++;
      if (e.type === "application") byCampaign[e.utm_campaign].applications++;
      if (e.type === "signup" || e.type === "employer_signup") byCampaign[e.utm_campaign].signups++;
    }
    return {
      window_days: days,
      totals: {
        users: users.length,
        admins: users.filter((u) => u.role === "admin").length,
        seekers: profiles.filter((p) => p.account_type === "seeker").length,
        employers: employers.length,
        verified_employers: employers.filter((e) => e.verified).length,
        pending_verifications: employers.filter((e) => e.verification_requested && !e.verified).length,
        active_jobs: jobs.filter((j) => j.status === "active").length,
        total_jobs: jobs.length,
        applications: apps.length,
        hires: apps.filter((a) => a.status === "hired").length,
        revenue_cents: revenue,
        revenue_window_cents: revenue30,
        open_reports: reports.length,
        pending_classifieds: listings.length,
        marketing_opt_ins: profiles.filter((p) => p.marketing_consent).length
      },
      subscriptions: countBy(subs.filter((s) => s.status === "active"), "plan"),
      subscription_status: countBy(subs, "status"),
      plans: countBy(employers, "plan"),
      popular_categories: countBy(jobs, "category").slice(0, 10),
      popular_locations: countBy(jobs, "location").slice(0, 10),
      traffic: {
        sessions,
        page_views: evCount("page_view"),
        job_views: jobViews,
        apply_clicks: evCount("apply_click"),
        applications,
        signups: evCount("signup"),
        employer_signups: evCount("employer_signup"),
        shares: evCount("share"),
        jobs_published: evCount("job_published"),
        checkouts: evCount("checkout"),
        view_to_application_rate: jobViews ? applications / jobViews : 0,
        employer_conversion_rate: evCount("employer_signup") ? evCount("job_published") / evCount("employer_signup") : 0
      },
      facebook: {
        visits: fb.filter((e) => e.type === "page_view").length,
        job_views: fb.filter((e) => e.type === "job_view").length,
        applications: fb.filter((e) => e.type === "application").length,
        signups: fb.filter((e) => e.type === "signup" || e.type === "employer_signup").length
      },
      top_sources: countBy(recent.filter((e) => e.type === "page_view").map((e) => ({ s: e.utm_source || e.referrer_host || "direct" })), "s").slice(0, 8),
      campaigns: Object.values(byCampaign),
      top_jobs: [...jobs].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 8)
    };
  },
  async listUsers({ sr, user, body }) {
    requireAdmin(user);
    const q = cleanText(body.q, 80).toLowerCase();
    const [users, profiles] = await Promise.all([sr.entities.User.list("-created_date", 2e3), sr.entities.UserProfile.list("-created_date", 2e4)]);
    const byUser = new Map(profiles.map((p) => [p.user_id, p]));
    const rows = users.map((u) => {
      const p = byUser.get(u.id) || {};
      return { id: u.id, email: u.email, full_name: u.full_name || p.full_name, role: u.role, created_date: u.created_date, account_type: p.account_type || "", suspended: !!p.suspended, marketing_consent: !!p.marketing_consent, profile_id: p.id || "" };
    }).filter((r) => !q || `${r.email} ${r.full_name}`.toLowerCase().includes(q));
    return { users: rows.slice(0, 500) };
  },
  async setUserRole({ sr, user, body }) {
    requireAdmin(user);
    const role = oneOf(body.role, ["admin", "user"], "Role");
    if (body.user_id === user.id && role !== "admin") throw new HttpError(400, "You can't remove your own administrator access.");
    const target = await sr.entities.User.get(String(body.user_id)).catch(() => null);
    if (!target) throw new HttpError(404, "User not found.");
    await sr.entities.User.update(target.id, { role });
    await audit(sr, user, "user.set_role", "User", target.id, { email: target.email, from: target.role, to: role });
    return { ok: true };
  },
  async setUserSuspended({ sr, user, body, origin }) {
    requireAdmin(user);
    if (body.user_id === user.id) throw new HttpError(400, "You can't suspend yourself.");
    const profile = (await sr.entities.UserProfile.filter({ user_id: String(body.user_id) }, "-created_date", 1))[0];
    if (!profile) throw new HttpError(404, "Profile not found.");
    const suspended = !!body.suspended;
    await sr.entities.UserProfile.update(profile.id, { suspended });
    for (const emp of await sr.entities.Employer.filter({ owner_id: profile.user_id }, "-created_date", 10)) {
      await sr.entities.Employer.update(emp.id, { status: suspended ? "suspended" : "active" });
      if (suspended) {
        for (const job of await sr.entities.Job.filter({ employer_id: emp.id, status: "active" }, "-created_date", 1e3)) {
          await sr.entities.Job.update(job.id, { status: "removed", moderation_note: "Account suspended" });
        }
      }
    }
    await audit(sr, user, suspended ? "user.suspend" : "user.unsuspend", "User", profile.user_id, { reason: cleanText(body.reason, 500) });
    if (!suspended) await notify(sr, profile.user_id, { type: "account", title: "Your StaffTO account is active again", body: "Your account has been reinstated." }, origin);
    return { ok: true };
  },
  async verifyEmployer({ sr, user, body, origin }) {
    requireAdmin(user);
    const employer = await sr.entities.Employer.get(String(body.employer_id)).catch(() => null);
    if (!employer) throw new HttpError(404, "Employer not found.");
    const verified = !!body.verified;
    await sr.entities.Employer.update(employer.id, { verified, verification_requested: false });
    for (const job of await sr.entities.Job.filter({ employer_id: employer.id }, "-created_date", 1e3)) await sr.entities.Job.update(job.id, { employer_verified: verified });
    await audit(sr, user, verified ? "employer.verify" : "employer.unverify", "Employer", employer.id, { business_name: employer.business_name, note: cleanText(body.note, 500) });
    await notify(sr, employer.owner_id, verified ? { type: "verification", title: "Your business is verified", body: `${employer.business_name} now shows the verified badge on every listing.`, link: "/employer/profile" } : { type: "verification", title: "Verification update", body: cleanText(body.note, 500) || "We couldn't verify your business yet. Reply to this message with more details.", link: "/employer/profile" }, origin);
    return { ok: true };
  },
  async setEmployerStatus({ sr, user, body }) {
    requireAdmin(user);
    const status = oneOf(body.status, ["active", "suspended"], "Status");
    const employer = await sr.entities.Employer.get(String(body.employer_id)).catch(() => null);
    if (!employer) throw new HttpError(404, "Employer not found.");
    await sr.entities.Employer.update(employer.id, { status });
    if (status === "suspended") {
      for (const job of await sr.entities.Job.filter({ employer_id: employer.id, status: "active" }, "-created_date", 1e3)) await sr.entities.Job.update(job.id, { status: "removed", moderation_note: "Employer suspended" });
    }
    await audit(sr, user, `employer.${status}`, "Employer", employer.id, { business_name: employer.business_name, note: cleanText(body.note, 500) });
    return { ok: true };
  },
  async moderateJob({ sr, user, body, origin }) {
    requireAdmin(user);
    const job = await sr.entities.Job.get(String(body.job_id)).catch(() => null);
    if (!job) throw new HttpError(404, "Job not found.");
    const action = oneOf(body.op, ["remove", "restore", "feature", "unfeature"], "Operation");
    const note = cleanText(body.note, 500);
    const patch = action === "remove" ? { status: "removed", moderation_note: note || "Removed by moderation" } : action === "restore" ? { status: "active", moderation_note: "" } : action === "feature" ? { is_featured: true, featured_until: addDays(14) } : { is_featured: false };
    await sr.entities.Job.update(job.id, patch);
    await audit(sr, user, `job.${action}`, "Job", job.id, { title: job.title, note });
    if (action === "remove") await notify(sr, job.owner_id, { type: "moderation", title: `Your listing "${job.title}" was removed`, body: note || "It didn't meet our posting guidelines.", link: "/employer/jobs" }, origin);
    return { ok: true };
  },
  async moderateListing({ sr, user, body, origin }) {
    requireAdmin(user);
    const listing = await sr.entities.ClassifiedListing.get(String(body.listing_id)).catch(() => null);
    if (!listing) throw new HttpError(404, "Listing not found.");
    const action = oneOf(body.op, ["approve", "remove", "restore"], "Operation");
    const note = cleanText(body.note, 500);
    const patch = action === "remove" ? { status: "removed", moderation_note: note || "Removed by moderation" } : { status: "active", moderation_note: "", approved_at: listing.approved_at || nowIso(), report_count: 0 };
    await sr.entities.ClassifiedListing.update(listing.id, patch);
    await audit(sr, user, `classified.${action}`, "ClassifiedListing", listing.id, { title: listing.title, note });
    await notify(sr, listing.owner_id, action === "remove" ? { type: "moderation", title: `Your listing "${listing.title}" was removed`, body: note || "It didn't meet our marketplace guidelines.", link: "/classifieds/mine" } : { type: "moderation", title: `Your listing "${listing.title}" is live`, body: "Buyers can now see and contact you about it.", link: `/classifieds/${listing.id}` }, origin);
    return { ok: true };
  },
  async resolveReport({ sr, user, body }) {
    requireAdmin(user);
    const report = await sr.entities.Report.get(String(body.report_id)).catch(() => null);
    if (!report) throw new HttpError(404, "Report not found.");
    const status = oneOf(body.status, ["resolved", "dismissed", "open"], "Status");
    await sr.entities.Report.update(report.id, { status, resolution_note: cleanText(body.note, 1e3) });
    await audit(sr, user, `report.${status}`, "Report", report.id, { target_type: report.target_type, target_id: report.target_id });
    return { ok: true };
  },
  async moderateReview({ sr, user, body }) {
    requireAdmin(user);
    const review = await sr.entities.Review.get(String(body.review_id)).catch(() => null);
    if (!review) throw new HttpError(404, "Testimonial not found.");
    const patch = {};
    if (body.status) patch.status = oneOf(body.status, ["pending", "approved", "rejected"], "Status");
    if (body.featured !== void 0) patch.featured = !!body.featured;
    await sr.entities.Review.update(review.id, patch);
    await audit(sr, user, "review.moderate", "Review", review.id, patch);
    return { ok: true };
  },
  // Manual plan/credit grant (e.g. invoiced offline, launch partners, support credit).
  async grantPlan({ sr, user, body, origin }) {
    requireAdmin(user);
    const employer = await sr.entities.Employer.get(String(body.employer_id)).catch(() => null);
    if (!employer) throw new HttpError(404, "Employer not found.");
    const plan = oneOf(body.plan || "", ["", "free", "single", "pro", "premium"], "Plan", false);
    const months = Math.min(24, Math.max(0, Number(body.months) || 0));
    const jobCredits = Math.min(100, Math.max(0, Number(body.job_credits) || 0));
    const featuredCredits = Math.min(100, Math.max(0, Number(body.featured_credits) || 0));
    const patch = {};
    if (jobCredits) patch.job_credits = (employer.job_credits || 0) + jobCredits;
    if (featuredCredits) patch.featured_credits = (employer.featured_credits || 0) + featuredCredits;
    if (plan) patch.plan = plan;
    await sr.entities.Employer.update(employer.id, patch);
    if (plan === "pro" || plan === "premium") {
      const existing = (await sr.entities.Subscription.filter({ employer_id: employer.id }, "-created_date", 1))[0];
      const sub = { employer_id: employer.id, owner_id: employer.owner_id, plan, status: "active", provider: "manual", current_period_end: addDays(30 * (months || 1)), cancel_at_period_end: false };
      if (existing) await sr.entities.Subscription.update(existing.id, sub);
      else await sr.entities.Subscription.create(sub);
    }
    await audit(sr, user, "billing.grant", "Employer", employer.id, { plan, months, job_credits: jobCredits, featured_credits: featuredCredits, note: cleanText(body.note, 500) });
    await notify(sr, employer.owner_id, { type: "billing", title: "Your StaffTO plan was updated", body: [plan && `Plan: ${plan}`, jobCredits && `+${jobCredits} job post credit(s)`, featuredCredits && `+${featuredCredits} featured credit(s)`].filter(Boolean).join(" \xB7 ") || "Plan updated.", link: "/employer/billing" }, origin);
    return { ok: true };
  },
  async saveSetting({ sr, user, body }) {
    requireAdmin(user);
    const key = oneOf(body.key, SETTING_KEYS, "Setting");
    const value = body.value;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Setting value must be an object.");
    if (key === "pricing") {
      for (const [k, p] of Object.entries(value.products || {})) {
        if (p.price_cents !== void 0 && !(Number(p.price_cents) >= 0)) throw new HttpError(400, `Invalid price for ${k}.`);
      }
    }
    const existing = (await sr.entities.PlatformSetting.filter({ key }, "-updated_date", 1))[0];
    const before = existing?.value || null;
    const saved = existing ? await sr.entities.PlatformSetting.update(existing.id, { value }) : await sr.entities.PlatformSetting.create({ key, value });
    await audit(sr, user, "setting.save", "PlatformSetting", key, { before, after: value });
    return { setting: saved };
  },
  async effectivePricing({ sr, user }) {
    requireAdmin(user);
    return { pricing: await getPricing(sr) };
  }
};
export {
  actions,
  nowIso
};
