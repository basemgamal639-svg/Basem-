// account — onboarding, consent, resume processing and PIPEDA access/deletion requests.
// deno-lint-ignore-file no-explicit-any
import { createClientFromRequest } from "npm:@base44/sdk@0.8.59";
import { cleanText, getProfile, HttpError, nowIso, oneOf, randomToken, requireUser, serveActions } from "./_shared.ts";

function referralCode(name: string) {
  const base = (name || "staff").replace(/[^a-z]/gi, "").slice(0, 5).toUpperCase() || "STAFF";
  return `${base}${randomToken(3).toUpperCase()}`;
}

const actions: Record<string, (ctx: any) => Promise<any>> = {
  // Creates the UserProfile with server-generated tokens and records consent timestamps.
  async bootstrap({ sr, user, body }) {
    requireUser(user);
    const existing = await getProfile(sr, user.id);
    if (existing) return { profile: existing, created: false };
    const account_type = oneOf(body.account_type, ["seeker", "employer"] as const, "Account type")!;
    if (!body.accept_terms) throw new HttpError(400, "Please accept the Terms and Privacy Policy to continue.");
    const full_name = cleanText(body.full_name, 120) || user.full_name || "";
    const now = nowIso();
    const ref = cleanText(body.referred_by, 40).toUpperCase();
    const profile = await sr.entities.UserProfile.create({
      user_id: user.id, email: user.email, full_name, account_type, phone: cleanText(body.phone, 40),
      marketing_consent: !!body.marketing_consent, marketing_consent_at: body.marketing_consent ? now : "",
      notify_email: true, unsubscribe_token: randomToken(20), referral_code: referralCode(full_name),
      referred_by: ref, ai_processing_consent: false, terms_accepted_at: now, onboarding_complete: false, suspended: false,
    });
    await sr.entities.Referral.create({ owner_id: user.id, code: profile.referral_code, visits: 0, signups: 0, applications: 0 });
    if (ref) {
      const r = (await sr.entities.Referral.filter({ code: ref }, "-created_date", 1))[0];
      if (r && r.owner_id !== user.id) await sr.entities.Referral.update(r.id, { signups: (r.signups || 0) + 1 });
    }
    await sr.entities.AnalyticsEvent.create({ type: account_type === "employer" ? "employer_signup" : "signup", user_id: user.id, ref, utm_source: cleanText(body.utm_source, 60), utm_campaign: cleanText(body.utm_campaign, 80) });
    return { profile, created: true };
  },

  async updateConsents({ sr, user, body }) {
    requireUser(user);
    const profile = await getProfile(sr, user.id);
    if (!profile) throw new HttpError(404, "Profile not found.");
    const patch: any = {};
    if (body.marketing_consent !== undefined) {
      patch.marketing_consent = !!body.marketing_consent;
      patch.marketing_consent_at = body.marketing_consent ? nowIso() : "";
    }
    if (body.notify_email !== undefined) patch.notify_email = !!body.notify_email;
    if (body.ai_processing_consent !== undefined) patch.ai_processing_consent = !!body.ai_processing_consent;
    if (body.ai_processing_consent === false) {
      // Withdrawing consent removes AI-derived text we stored for this user.
      for (const r of await sr.entities.Resume.filter({ user_id: user.id }, "-created_date", 50)) {
        if (r.extracted_text) await sr.entities.Resume.update(r.id, { extracted_text: "" });
      }
    }
    return { profile: await sr.entities.UserProfile.update(profile.id, patch) };
  },

  // Extract plain text from a private resume so AI-assisted review can read it. Consent required.
  async processResume({ sr, user, body }) {
    requireUser(user);
    const profile = await getProfile(sr, user.id);
    if (!profile?.ai_processing_consent) return { processed: false, reason: "no_consent" };
    const resume = await sr.entities.Resume.get(String(body.resume_id || "")).catch(() => null);
    if (!resume || resume.user_id !== user.id) throw new HttpError(404, "Resume not found.");
    try {
      const signed = await sr.integrations.Core.CreateFileSignedUrl({ file_uri: resume.file_uri, expires_in: 600 });
      const data: any = await sr.integrations.Core.ExtractDataFromUploadedFile({
        file_url: signed.signed_url,
        json_schema: { type: "object", properties: { text: { type: "string", description: "Full plain text of the resume" }, skills: { type: "array", items: { type: "string" } } } },
      });
      const out = data?.output || data || {};
      const text = cleanText(`${out.text || ""}\nSkills: ${(out.skills || []).join(", ")}`, 30000);
      await sr.entities.Resume.update(resume.id, { extracted_text: text });
      return { processed: true, characters: text.length };
    } catch (_e) {
      return { processed: false, reason: "extraction_unavailable" };
    }
  },

  async exportData({ sr, user }) {
    requireUser(user);
    const by = (entity: string, field: string) => sr.entities[entity].filter({ [field]: user.id }, "-created_date", 5000);
    const [profile, candidate, resumes, saved, applications, notifications, sent, received, employer, payments, listings, reports, referrals] = await Promise.all([
      by("UserProfile", "user_id"), by("CandidateProfile", "user_id"), by("Resume", "user_id"), by("SavedJob", "user_id"),
      by("JobApplication", "applicant_id"), by("Notification", "user_id"), by("Message", "sender_id"), by("Message", "recipient_id"),
      by("Employer", "owner_id"), by("Payment", "owner_id"), by("ClassifiedListing", "owner_id"), by("Report", "reporter_id"), by("Referral", "owner_id"),
    ]);
    const data = {
      generated_at: nowIso(), account: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
      profile, candidate_profile: candidate, resumes: resumes.map((r: any) => ({ ...r, file_uri: "(private file — download from your dashboard)" })),
      saved_jobs: saved, applications, notifications, messages_sent: sent, messages_received: received,
      employer_profiles: employer, payments, classified_listings: listings, reports, referrals,
    };
    await sr.entities.DataRequest.create({ user_id: user.id, email: user.email, type: "export", status: "completed", completed_at: nowIso(), summary: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.length : 1])) });
    return { data };
  },

  // Deletes personal data. Payment records are retained (anonymised) because CRA requires business records for 6 years.
  async deleteAccount({ sr, user, body }) {
    requireUser(user);
    if (String(body.confirm || "").toUpperCase() !== "DELETE") throw new HttpError(400, 'Type DELETE to confirm.');
    const summary: Record<string, number> = {};
    const wipe = async (entity: string, field: string) => {
      const rows = await sr.entities[entity].filter({ [field]: user.id }, "-created_date", 5000);
      for (const r of rows) await sr.entities[entity].delete(r.id);
      summary[entity] = (summary[entity] || 0) + rows.length;
    };
    const request = await sr.entities.DataRequest.create({ user_id: user.id, email: user.email, type: "deletion", status: "received" });
    await wipe("CandidateProfile", "user_id");
    await wipe("Resume", "user_id");
    await wipe("SavedJob", "user_id");
    await wipe("Notification", "user_id");
    await wipe("Referral", "owner_id");
    await wipe("ClassifiedListing", "owner_id");
    for (const app of await sr.entities.JobApplication.filter({ applicant_id: user.id }, "-created_date", 5000)) {
      await sr.entities.JobApplication.update(app.id, {
        applicant_name: "Deleted user", applicant_email: "", applicant_phone: "", cover_letter: "", availability_note: "",
        resume_id: "", resume_name: "", ai_summary: "", ai_matched: [], ai_missing: [], ai_breakdown: {}, employer_notes: "",
        status: app.status === "hired" ? "hired" : "withdrawn", candidate_profile_id: "",
      });
      summary.JobApplication = (summary.JobApplication || 0) + 1;
    }
    for (const m of await sr.entities.Message.filter({ sender_id: user.id }, "-created_date", 5000)) {
      await sr.entities.Message.update(m.id, { body: "[message deleted]", sender_name: "Deleted user" });
    }
    for (const emp of await sr.entities.Employer.filter({ owner_id: user.id }, "-created_date", 10)) {
      for (const job of await sr.entities.Job.filter({ employer_id: emp.id }, "-created_date", 5000)) {
        if (job.status === "active" || job.status === "draft") await sr.entities.Job.update(job.id, { status: "closed", closed_at: nowIso() });
      }
      await sr.entities.Employer.update(emp.id, { status: "suspended", contact_email: "", phone: "", contact_name: "" });
    }
    for (const p of await sr.entities.Payment.filter({ owner_id: user.id }, "-created_date", 5000)) {
      await sr.entities.Payment.update(p.id, { owner_id: `deleted:${user.id.slice(0, 6)}` });
    }
    await wipe("UserProfile", "user_id");
    let accountRemoved = false;
    try {
      await sr.entities.User.delete(user.id);
      accountRemoved = true;
    } catch (_e) {
      // Some plans don't allow deleting the auth user from a function; an admin completes it from the dashboard.
    }
    await sr.entities.DataRequest.update(request.id, { status: accountRemoved ? "completed" : "received", completed_at: accountRemoved ? nowIso() : "", summary: { ...summary, login_removed: accountRemoved } });
    return { ok: true, summary, login_removed: accountRemoved };
  },
};

export const handler = serveActions(actions, createClientFromRequest);
Deno.serve(handler);
