// jobs — server-enforced job listing, application and pipeline logic.
// deno-lint-ignore-file no-explicit-any
import { createClientFromRequest } from "npm:@base44/sdk@0.8.59";
import {
  addDays, CATEGORIES, cleanList, cleanText, EMPLOYMENT_TYPES, getOwnedEmployer, getPricing, HttpError, label, LOCATIONS,
  notify, nowIso, oneOf, requireActiveProfile, requireUser, serveActions, slugify, isAdmin,
} from "./_shared.ts";

const APPLICATION_STATUSES = ["submitted", "viewed", "shortlisted", "interview", "offered", "hired", "rejected", "withdrawn"];
const EMPLOYER_SETTABLE = ["viewed", "shortlisted", "interview", "offered", "hired", "rejected"];
const NOTIFY_ON = new Set(["shortlisted", "interview", "offered", "hired", "rejected"]);
const STATUS_COPY: Record<string, string> = {
  shortlisted: "You've been shortlisted",
  interview: "Interview requested",
  offered: "You've received an offer",
  hired: "Congratulations — you're hired",
  rejected: "Update on your application",
};

// Ontario ESA s.8.2 / O. Reg. 476/24 (in force Jan 1 2026): a pay range may not exceed $50,000/yr
// unless the top of the range is above $200,000. We apply it to every posting as platform policy.
export function validatePay(min: number, max: number, period: string) {
  if (!(min > 0)) throw new HttpError(400, "Enter the pay for this role. StaffTO requires pay on every posting.");
  if (max && max < min) throw new HttpError(400, "Maximum pay must be at least the minimum.");
  // Floor = lowest Ontario statutory rate (student rate, $16.60/hr as of Oct 1 2025). Review each October.
  if (period === "hour" && min < 16.6) {
    throw new HttpError(400, "Hourly pay is below Ontario's minimum wage. Check the amount.");
  }
  const annual = (v: number) => (period === "hour" ? v * 2080 : v);
  if (max && annual(max) <= 200000 && annual(max) - annual(min) > 50000) {
    throw new HttpError(400, "Ontario rules limit a posted pay range to $50,000 per year. Narrow the range.");
  }
}

function jobPayload(data: any) {
  const salary_period = oneOf(data.salary_period || "hour", ["hour", "year"] as const, "Pay period")!;
  const salary_min = Number(data.salary_min);
  const salary_max = data.salary_max === "" || data.salary_max === undefined || data.salary_max === null ? 0 : Number(data.salary_max);
  validatePay(salary_min, salary_max, salary_period);
  const title = cleanText(data.title, 120);
  if (title.length < 3) throw new HttpError(400, "Add a job title.");
  if (/canadian experience/i.test(`${data.title} ${data.requirements} ${data.description}`)) {
    throw new HttpError(400, "Ontario prohibits requiring \"Canadian experience\" in job postings. Remove that requirement.");
  }
  return {
    title,
    category: oneOf(data.category, CATEGORIES, "Category"),
    location: oneOf(data.location, LOCATIONS, "Location"),
    employment_type: oneOf(data.employment_type, EMPLOYMENT_TYPES, "Employment type"),
    address: cleanText(data.address, 200),
    salary_min,
    salary_max: salary_max || salary_min,
    salary_period,
    tips: oneOf(data.tips || "none", ["none", "pooled", "individual", "service_charge"] as const, "Tips")!,
    experience_level: oneOf(data.experience_level || "none", ["none", "under_1", "1_2", "3_5", "5_plus"] as const, "Experience")!,
    description: cleanText(data.description, 8000),
    responsibilities: cleanText(data.responsibilities, 6000),
    requirements: cleanText(data.requirements, 6000),
    benefits: cleanText(data.benefits, 3000),
    skills: cleanList(data.skills, 25),
    certifications: cleanList(data.certifications, 10),
    languages: cleanList(data.languages, 8),
    shifts: cleanList(data.shifts, 6),
    start_date: cleanText(data.start_date, 10),
    vacancy_status: oneOf(data.vacancy_status || "existing", ["existing", "future"] as const, "Vacancy status")!,
    uses_ai_screening: !!data.uses_ai_screening,
  };
}

// How many more jobs can this employer publish right now, and what would it consume?
export async function publishAllowance(sr: any, employer: any) {
  const pricing = await getPricing(sr);
  const plan = pricing.plans?.[employer.plan || "free"] || pricing.plans.free;
  const active = await sr.entities.Job.filter({ employer_id: employer.id, status: "active" }, "-created_date", 500);
  const planSlots = Math.max(0, (plan.active_jobs || 0) - active.length);
  const credits = employer.job_credits || 0;
  return {
    plan_key: employer.plan || "free",
    plan,
    active_count: active.length,
    plan_slots_left: planSlots,
    credits,
    can_publish: planSlots > 0 || credits > 0,
    pricing,
  };
}

async function consumeForPublish(sr: any, employer: any) {
  const allowance = await publishAllowance(sr, employer);
  if (allowance.plan_slots_left > 0) return { duration: allowance.plan.job_duration_days || 30, used: "plan" };
  if (allowance.credits > 0) {
    await sr.entities.Employer.update(employer.id, { job_credits: allowance.credits - 1 });
    const days = allowance.pricing.products?.single_job?.duration_days || 30;
    return { duration: days, used: "credit" };
  }
  throw new HttpError(402, "You have no job posts left. Buy a single job post or upgrade your plan to publish.", "payment_required");
}

async function loadOwnJob(sr: any, user: any, jobId: string) {
  const job = await sr.entities.Job.get(String(jobId || "")).catch(() => null);
  if (!job) throw new HttpError(404, "Job not found.");
  if (job.owner_id !== user.id && !isAdmin(user)) throw new HttpError(403, "You can only manage your own jobs.");
  return job;
}

async function loadApplicationForEmployer(sr: any, user: any, id: string) {
  const app = await sr.entities.JobApplication.get(String(id || "")).catch(() => null);
  if (!app) throw new HttpError(404, "Application not found.");
  if (app.employer_owner_id !== user.id && !isAdmin(user)) throw new HttpError(403, "Not your applicant.");
  return app;
}

const actions: Record<string, (ctx: any) => Promise<any>> = {
  async allowance({ sr, user }) {
    requireUser(user);
    const employer = await getOwnedEmployer(sr, user);
    const a = await publishAllowance(sr, employer);
    return { plan: a.plan_key, plan_details: a.plan, active_count: a.active_count, plan_slots_left: a.plan_slots_left, credits: a.credits, featured_credits: employer.featured_credits || 0, can_publish: a.can_publish };
  },

  async save({ sr, user, body }) {
    requireUser(user);
    await requireActiveProfile(sr, user);
    const employer = await getOwnedEmployer(sr, user);
    const fields: any = jobPayload(body.data || {});
    const publish = !!body.publish;
    let job = body.job_id ? await loadOwnJob(sr, user, body.job_id) : null;
    if (job && ["removed"].includes(job.status)) throw new HttpError(403, "This job was removed by moderation and can't be edited.");

    const denorm = { employer_id: employer.id, owner_id: user.id, employer_name: employer.business_name, employer_logo: employer.logo_url || "", employer_verified: !!employer.verified };
    if (!job) {
      job = await sr.entities.Job.create({ ...fields, ...denorm, status: "draft", slug: slugify(`${fields.title}-${employer.business_name}`), views: 0, applications_count: 0, share_count: 0 });
    } else {
      job = await sr.entities.Job.update(job.id, { ...fields, ...denorm });
    }
    if (publish && job.status !== "active") {
      const { duration } = await consumeForPublish(sr, employer);
      const now = nowIso();
      job = await sr.entities.Job.update(job.id, { status: "active", published_at: job.published_at || now, expires_at: addDays(duration), closed_at: "" });
      await sr.entities.AnalyticsEvent.create({ type: "job_published", job_id: job.id, user_id: user.id });
    }
    return { job };
  },

  async setStatus({ sr, user, body }) {
    requireUser(user);
    const job = await loadOwnJob(sr, user, body.job_id);
    const status = oneOf(body.status, ["active", "closed", "draft", "delete"] as const, "Status")!;
    if (job.status === "removed" && !isAdmin(user)) throw new HttpError(403, "This job was removed by moderation.");
    if (status === "delete") {
      if ((job.applications_count || 0) > 0) {
        await sr.entities.Job.update(job.id, { status: "closed", closed_at: nowIso() });
        return { job: { ...job, status: "closed" }, note: "Jobs with applicants are closed rather than deleted so candidates keep their history." };
      }
      await sr.entities.Job.delete(job.id);
      return { deleted: true };
    }
    if (status === "active" && job.status !== "active") {
      const employer = await getOwnedEmployer(sr, user);
      const { duration } = await consumeForPublish(sr, employer);
      return { job: await sr.entities.Job.update(job.id, { status: "active", published_at: job.published_at || nowIso(), expires_at: addDays(duration), closed_at: "" }) };
    }
    if (status === "closed") return { job: await sr.entities.Job.update(job.id, { status: "closed", closed_at: nowIso() }) };
    return { job: await sr.entities.Job.update(job.id, { status }) };
  },

  async feature({ sr, user, body }) {
    requireUser(user);
    const job = await loadOwnJob(sr, user, body.job_id);
    if (job.status !== "active") throw new HttpError(400, "Only active jobs can be featured.");
    const employer = await getOwnedEmployer(sr, user);
    const pricing = await getPricing(sr);
    const plan = pricing.plans?.[employer.plan || "free"] || pricing.plans.free;
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const featuredRecently = (await sr.entities.Job.filter({ employer_id: employer.id, is_featured: true }, "-featured_until", 100))
      .filter((j: any) => (j.featured_until || "") > since).length;
    if (featuredRecently < (plan.featured_per_month || 0)) {
      // included in plan
    } else if ((employer.featured_credits || 0) > 0) {
      await sr.entities.Employer.update(employer.id, { featured_credits: employer.featured_credits - 1 });
    } else {
      throw new HttpError(402, "No featured upgrades left. Buy a featured upgrade to highlight this job.", "payment_required");
    }
    const days = pricing.products?.featured_upgrade?.duration_days || 14;
    return { job: await sr.entities.Job.update(job.id, { is_featured: true, featured_until: addDays(days) }) };
  },

  async apply({ sr, user, body, origin }) {
    requireUser(user);
    const profile = await requireActiveProfile(sr, user);
    if (profile?.account_type === "employer") throw new HttpError(400, "Employer accounts can't apply to jobs. Create a job seeker account.");
    const job = await sr.entities.Job.get(String(body.job_id || "")).catch(() => null);
    if (!job || job.status !== "active") throw new HttpError(400, "This job is no longer accepting applications.");
    if (job.owner_id === user.id) throw new HttpError(400, "You can't apply to your own job.");
    const candidate = (await sr.entities.CandidateProfile.filter({ user_id: user.id }, "-created_date", 1))[0];
    if (!candidate) throw new HttpError(400, "Complete your job seeker profile before applying.", "no_profile");
    const existing = await sr.entities.JobApplication.filter({ job_id: job.id, applicant_id: user.id }, "-created_date", 5);
    if (existing.some((a: any) => a.status !== "withdrawn")) throw new HttpError(409, "You've already applied to this job.");

    let resume: any = null;
    if (body.resume_id) {
      resume = await sr.entities.Resume.get(String(body.resume_id)).catch(() => null);
      if (!resume || resume.user_id !== user.id) throw new HttpError(400, "Resume not found.");
    }
    const now = nowIso();
    const application = await sr.entities.JobApplication.create({
      job_id: job.id, job_title: job.title, employer_id: job.employer_id, employer_name: job.employer_name, employer_owner_id: job.owner_id,
      applicant_id: user.id, applicant_name: candidate.full_name || user.full_name || "", applicant_email: candidate.email || user.email,
      applicant_phone: candidate.phone || "", candidate_profile_id: candidate.id,
      resume_id: resume?.id || "", resume_name: resume?.file_name || "",
      cover_letter: cleanText(body.cover_letter, 5000), availability_note: cleanText(body.availability_note, 500),
      ai_consent: !!body.ai_consent, status: "submitted", status_history: [{ status: "submitted", at: now, by: "applicant" }],
      source: cleanText(body.source, 80),
    });
    await sr.entities.Job.update(job.id, { applications_count: (job.applications_count || 0) + 1 });
    await sr.entities.AnalyticsEvent.create({ type: "application", job_id: job.id, user_id: user.id, utm_source: cleanText(body.source, 80), session_id: cleanText(body.session_id, 64), ref: cleanText(body.ref, 40) });
    if (body.ref) {
      const ref = (await sr.entities.Referral.filter({ code: cleanText(body.ref, 40) }, "-created_date", 1))[0];
      if (ref && ref.owner_id !== user.id) await sr.entities.Referral.update(ref.id, { applications: (ref.applications || 0) + 1 });
    }
    await notify(sr, job.owner_id, {
      type: "new_application",
      title: `New applicant for ${job.title}`,
      body: `${application.applicant_name || "A candidate"} applied to ${job.title}.`,
      link: `/employer/jobs/${job.id}/applicants`,
    }, origin);
    return { application: { id: application.id, status: application.status } };
  },

  async withdraw({ sr, user, body }) {
    requireUser(user);
    const app = await sr.entities.JobApplication.get(String(body.application_id || "")).catch(() => null);
    if (!app || app.applicant_id !== user.id) throw new HttpError(404, "Application not found.");
    if (["withdrawn", "hired"].includes(app.status)) throw new HttpError(400, `This application is already ${app.status}.`);
    const now = nowIso();
    await sr.entities.JobApplication.update(app.id, { status: "withdrawn", withdrawn_at: now, status_history: [...(app.status_history || []), { status: "withdrawn", at: now, by: "applicant" }] });
    const job = await sr.entities.Job.get(app.job_id).catch(() => null);
    if (job) await sr.entities.Job.update(job.id, { applications_count: Math.max(0, (job.applications_count || 1) - 1) });
    return { ok: true };
  },

  async updateApplication({ sr, user, body, origin }) {
    requireUser(user);
    const app = await loadApplicationForEmployer(sr, user, body.application_id);
    const patch: any = {};
    if (body.employer_notes !== undefined) patch.employer_notes = cleanText(body.employer_notes, 4000);
    if (body.employer_rating !== undefined) {
      const r = Number(body.employer_rating);
      if (!(r >= 0 && r <= 5)) throw new HttpError(400, "Rating must be 0-5.");
      patch.employer_rating = r;
    }
    if (body.status !== undefined) {
      const status = oneOf(body.status, EMPLOYER_SETTABLE as any, "Status") as string;
      if (app.status === "withdrawn") throw new HttpError(400, "The candidate withdrew this application.");
      if (status === "viewed" && app.status !== "submitted") {
        // Don't move a candidate backwards just because the profile was opened again.
      } else if (status !== app.status) {
        patch.status = status;
        patch.status_history = [...(app.status_history || []), { status, at: nowIso(), by: "employer" }];
      }
    }
    const updated = Object.keys(patch).length ? await sr.entities.JobApplication.update(app.id, patch) : app;
    if (patch.status && NOTIFY_ON.has(patch.status)) {
      const msg = patch.status === "rejected"
        ? `${app.employer_name} has decided not to move forward with your application for ${app.job_title}. Thank you for applying — keep an eye on new Toronto openings.`
        : `${app.employer_name} updated your application for ${app.job_title}: ${patch.status}. Check your messages for next steps.`;
      await notify(sr, app.applicant_id, { type: "application_status", title: `${STATUS_COPY[patch.status]} — ${app.job_title}`, body: msg, link: "/account/applications" }, origin);
    }
    return { application: updated };
  },

  // Employer view of an applicant: profile + short-lived resume link. Only for their own applicants.
  async candidate({ sr, user, body }) {
    requireUser(user);
    const app = await loadApplicationForEmployer(sr, user, body.application_id);
    const profile = app.candidate_profile_id ? await sr.entities.CandidateProfile.get(app.candidate_profile_id).catch(() => null) : null;
    let resume_url = "";
    if (app.resume_id && app.status !== "withdrawn") {
      const resume = await sr.entities.Resume.get(app.resume_id).catch(() => null);
      if (resume?.file_uri) {
        const signed = await sr.integrations.Core.CreateFileSignedUrl({ file_uri: resume.file_uri, expires_in: 300 });
        resume_url = signed?.signed_url || "";
      }
    }
    if (app.status === "submitted") {
      await sr.entities.JobApplication.update(app.id, { status: "viewed", status_history: [...(app.status_history || []), { status: "viewed", at: nowIso(), by: "employer" }] });
    }
    const safe = profile ? {
      full_name: profile.full_name, headline: profile.headline, location: profile.location, location_label: label(profile.location || ""),
      bio: profile.bio, years_experience: profile.years_experience, skills: profile.skills, certifications: profile.certifications,
      languages: profile.languages, availability: profile.availability, shifts: profile.shifts, salary_expectation: profile.salary_expectation,
      salary_period: profile.salary_period, work_history: profile.work_history, legally_entitled: profile.legally_entitled,
      email: app.applicant_email, phone: app.applicant_phone,
    } : null;
    return { profile: safe, resume_url, resume_expires_in: resume_url ? 300 : 0 };
  },

  async resumeUrl({ sr, user, body }) {
    requireUser(user);
    const resume = await sr.entities.Resume.get(String(body.resume_id || "")).catch(() => null);
    if (!resume || (resume.user_id !== user.id && !isAdmin(user))) throw new HttpError(404, "Resume not found.");
    const signed = await sr.integrations.Core.CreateFileSignedUrl({ file_uri: resume.file_uri, expires_in: 300 });
    return { url: signed?.signed_url || "" };
  },
};

export const handler = serveActions(actions, createClientFromRequest);
Deno.serve(handler);
export { APPLICATION_STATUSES };
