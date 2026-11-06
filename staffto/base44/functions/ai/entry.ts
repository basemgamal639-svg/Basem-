// ai — advisory, explainable candidate analysis for employers.
//
// Design rules (see docs/ai-recruitment.md):
//  * The score is computed by a transparent rubric below — not by a language model — so every point is explainable.
//  * An LLM (Base44 InvokeLLM) is used only to summarise and to extract skills from the resume text, and only when
//    the applicant gave AI-processing consent on that application.
//  * Names, contact details, age, photos and other personal characteristics are never sent to the model, and the model is
//    instructed not to infer protected grounds under the Ontario Human Rights Code.
//  * Nothing here changes an application's status. Employers make every decision.
// deno-lint-ignore-file no-explicit-any
import { createClientFromRequest } from "npm:@base44/sdk@0.8.59";
import { getOwnedEmployer, getPricing, HttpError, isAdmin, label, nowIso, requireUser, serveActions } from "./_shared.ts";

const EXP_YEARS: Record<string, number> = { none: 0, under_1: 0.5, "1_2": 1, "3_5": 3, "5_plus": 5 };
const RELATED: Record<string, string[]> = {
  chef: ["sous_chef", "kitchen_manager", "line_cook"],
  sous_chef: ["chef", "line_cook", "kitchen_manager"],
  line_cook: ["prep_cook", "sous_chef", "catering_staff"],
  prep_cook: ["line_cook", "dishwasher", "catering_staff"],
  dishwasher: ["prep_cook", "busser"],
  kitchen_manager: ["chef", "sous_chef", "restaurant_manager"],
  restaurant_manager: ["kitchen_manager", "server", "bartender", "host"],
  server: ["bartender", "host", "busser", "event_staff"],
  bartender: ["server", "barista", "event_staff"],
  barista: ["bartender", "server", "host"],
  host: ["server", "busser", "event_staff"],
  busser: ["server", "host", "dishwasher"],
  catering_staff: ["event_staff", "server", "line_cook"],
  event_staff: ["catering_staff", "server", "bartender"],
};

const norm = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9+#]+/g, " ").trim();
function textHas(haystack: string, needle: string) {
  const n = norm(needle);
  if (!n) return false;
  return ` ${norm(haystack)} `.includes(` ${n} `) || norm(haystack).includes(n);
}

export function scoreCandidate(job: any, profile: any, resumeText = "", extraSkills: string[] = []) {
  const corpus = [
    profile?.headline, profile?.bio, (profile?.skills || []).join(" "), (profile?.certifications || []).join(" "),
    (profile?.work_history || []).map((w: any) => `${w.role} ${w.employer} ${w.description}`).join(" "), resumeText, extraSkills.join(" "),
  ].join(" \n ");
  const breakdown: any[] = [];
  const matched: string[] = [];
  const missing: string[] = [];

  // 1. Skills (35)
  const skills: string[] = job.skills || [];
  if (skills.length) {
    const hits = skills.filter((s) => textHas(corpus, s));
    const miss = skills.filter((s) => !hits.includes(s));
    hits.forEach((s) => matched.push(`Skill: ${s}`));
    miss.forEach((s) => missing.push(`Skill not evidenced: ${s}`));
    const pts = Math.round((hits.length / skills.length) * 35);
    breakdown.push({ criterion: "Skills", points: pts, max: 35, explanation: `${hits.length} of ${skills.length} listed skills appear in the profile or resume${hits.length ? ` (${hits.join(", ")})` : ""}.` });
  } else {
    breakdown.push({ criterion: "Skills", points: 20, max: 35, explanation: "The job lists no specific skills, so a neutral 20/35 is applied." });
  }

  // 2. Experience (25)
  const need = EXP_YEARS[job.experience_level || "none"] ?? 0;
  const years = Number(profile?.years_experience || 0);
  let expPts: number;
  let expWhy: string;
  if (need === 0) {
    expPts = 25;
    expWhy = "No minimum experience required.";
  } else if (years >= need) {
    expPts = 25;
    expWhy = `${years} year(s) of hospitality experience meets the ${need}+ year requirement.`;
    matched.push(`Experience: ${years} yrs (needs ${need}+)`);
  } else {
    expPts = Math.round((years / need) * 25);
    expWhy = `${years} year(s) reported against ${need}+ requested.`;
    missing.push(`Experience below request (${years} of ${need}+ yrs)`);
  }
  breakdown.push({ criterion: "Experience", points: expPts, max: 25, explanation: expWhy });

  // 3. Role fit (15)
  const cat = job.category;
  const roles = (profile?.work_history || []).map((w: any) => norm(w.role));
  const prefs: string[] = profile?.preferred_categories || [];
  const catLabel = norm(label(cat));
  let rolePts = 0;
  let roleWhy = "No previous role or preference matches this position.";
  if (roles.some((r: string) => r.includes(catLabel)) || prefs.includes(cat)) {
    rolePts = 15;
    roleWhy = `Has worked as or is looking for ${label(cat)} roles.`;
    matched.push(`Role fit: ${label(cat)}`);
  } else if ((RELATED[cat] || []).some((rc) => prefs.includes(rc) || roles.some((r: string) => r.includes(norm(label(rc)))))) {
    rolePts = 8;
    roleWhy = `Experience or preference in a closely related role (${(RELATED[cat] || []).map(label).join(", ")}).`;
  } else {
    missing.push(`No ${label(cat)} history shown`);
  }
  breakdown.push({ criterion: "Role fit", points: rolePts, max: 15, explanation: roleWhy });

  // 4. Certifications (10)
  const certs: string[] = job.certifications || [];
  if (certs.length) {
    const have = certs.filter((c) => textHas(corpus, c));
    certs.filter((c) => !have.includes(c)).forEach((c) => missing.push(`Certification not shown: ${c}`));
    have.forEach((c) => matched.push(`Certification: ${c}`));
    breakdown.push({ criterion: "Certifications", points: Math.round((have.length / certs.length) * 10), max: 10, explanation: `${have.length} of ${certs.length} requested certifications shown.` });
  } else {
    breakdown.push({ criterion: "Certifications", points: 10, max: 10, explanation: "No certifications requested." });
  }

  // 5. Availability (10)
  const avail: string[] = profile?.availability || [];
  const shifts: string[] = profile?.shifts || [];
  let availPts = 0;
  const why: string[] = [];
  if (!avail.length || avail.includes(job.employment_type)) {
    availPts += 6;
    why.push(avail.length ? `wants ${label(job.employment_type)} work` : "employment type not specified by candidate");
  } else {
    missing.push(`Prefers ${avail.map(label).join("/")} (job is ${label(job.employment_type)})`);
  }
  const jobShifts: string[] = job.shifts || [];
  if (!jobShifts.length || !shifts.length || jobShifts.some((s) => shifts.includes(s))) {
    availPts += 4;
    why.push(jobShifts.length && shifts.length ? "shift overlap" : "shifts not restrictive");
  } else {
    missing.push(`Shift mismatch (job: ${jobShifts.join(", ")})`);
  }
  breakdown.push({ criterion: "Availability", points: availPts, max: 10, explanation: why.join("; ") || "Availability doesn't match." });

  // 6. Location (5)
  const locs: string[] = profile?.preferred_locations || [];
  const locOk = !locs.length || locs.includes(job.location) || profile?.location === job.location;
  breakdown.push({ criterion: "Location", points: locOk ? 5 : 2, max: 5, explanation: locOk ? `Open to working in ${label(job.location)}.` : `Prefers ${locs.map(label).join(", ")}; job is in ${label(job.location)}. Commute is the candidate's call.` });

  const score = Math.max(0, Math.min(100, breakdown.reduce((s, b) => s + b.points, 0)));
  return { score, breakdown, matched, missing };
}

async function llmAssist(sr: any, job: any, profile: any, resumeText: string) {
  const prompt = [
    "You help a Toronto hospitality employer read a job application. You are advisory only.",
    "Rules: Do not infer or mention age, gender, race, ethnicity, religion, disability, family status, citizenship or any other protected ground under the Ontario Human Rights Code.",
    "Do not recommend hiring or rejecting. Only describe job-relevant skills and experience that are evidenced in the text.",
    "",
    `JOB: ${job.title} (${label(job.category)}, ${label(job.employment_type)}, ${label(job.location)})`,
    `Requirements: ${job.requirements || "-"}`,
    `Skills wanted: ${(job.skills || []).join(", ") || "-"}`,
    "",
    "CANDIDATE (identity removed):",
    `Headline: ${profile?.headline || "-"}`,
    `Years in hospitality: ${profile?.years_experience ?? "-"}`,
    `Skills: ${(profile?.skills || []).join(", ") || "-"}`,
    `Certifications: ${(profile?.certifications || []).join(", ") || "-"}`,
    `Work history: ${(profile?.work_history || []).map((w: any) => `${w.role} (${w.start || "?"}-${w.current ? "present" : w.end || "?"}): ${w.description || ""}`).join(" | ") || "-"}`,
    `Resume text: ${resumeText.slice(0, 8000) || "-"}`,
  ].join("\n");
  const res: any = await sr.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "3-4 neutral sentences on job-relevant experience" },
        extracted_skills: { type: "array", items: { type: "string" } },
        strengths: { type: "array", items: { type: "string" } },
        gaps: { type: "array", items: { type: "string" } },
      },
      required: ["summary"],
    },
  });
  return typeof res === "string" ? { summary: res } : res;
}

function templateSummary(job: any, profile: any, result: any) {
  const years = profile?.years_experience ? `${profile.years_experience} year(s) in hospitality` : "experience not stated";
  const recent = (profile?.work_history || [])[0];
  return [
    `${profile?.headline || "Candidate"} — ${years}.`,
    recent ? `Most recent: ${recent.role}${recent.employer ? ` at ${recent.employer}` : ""}.` : "",
    `Rubric score ${result.score}/100 for ${job.title}: ${result.matched.length} matching and ${result.missing.length} missing items.`,
  ].filter(Boolean).join(" ");
}

async function canUseAi(sr: any, user: any) {
  if (isAdmin(user)) return true;
  const employer = await getOwnedEmployer(sr, user);
  const pricing = await getPricing(sr);
  return !!pricing.plans?.[employer.plan || "free"]?.ai_screening;
}

async function analyzeOne(sr: any, user: any, applicationId: string) {
  const app = await sr.entities.JobApplication.get(String(applicationId || "")).catch(() => null);
  if (!app) throw new HttpError(404, "Application not found.");
  if (app.employer_owner_id !== user.id && !isAdmin(user)) throw new HttpError(403, "Not your applicant.");
  if (!app.ai_consent) throw new HttpError(400, "This applicant did not consent to AI-assisted review. Review their application manually.", "no_consent");
  if (app.status === "withdrawn") throw new HttpError(400, "Application withdrawn.");
  const job = await sr.entities.Job.get(app.job_id);
  const profile = app.candidate_profile_id ? await sr.entities.CandidateProfile.get(app.candidate_profile_id).catch(() => null) : null;
  const resume = app.resume_id ? await sr.entities.Resume.get(app.resume_id).catch(() => null) : null;
  const resumeText = String(resume?.extracted_text || "");

  let llm: any = null;
  let method = "rules";
  try {
    llm = await llmAssist(sr, job, profile, resumeText);
    if (llm?.summary) method = "rules+llm";
  } catch (_e) {
    llm = null; // LLM unavailable: the rubric alone still produces a complete, explainable result.
  }
  const result = scoreCandidate(job, profile, resumeText, llm?.extracted_skills || []);
  const update = {
    ai_score: result.score,
    ai_breakdown: { criteria: result.breakdown, strengths: llm?.strengths || [], gaps: llm?.gaps || [], disclaimer: "Advisory only. Not a hiring decision." },
    ai_matched: result.matched,
    ai_missing: result.missing,
    ai_summary: llm?.summary || templateSummary(job, profile, result),
    ai_method: method,
    ai_generated_at: nowIso(),
  };
  await sr.entities.JobApplication.update(app.id, update);
  return { application_id: app.id, ...update };
}

const actions: Record<string, (ctx: any) => Promise<any>> = {
  async analyze({ sr, user, body }) {
    requireUser(user);
    if (!(await canUseAi(sr, user))) throw new HttpError(402, "AI-assisted candidate organisation is part of the Premium plan.", "upgrade_required");
    return await analyzeOne(sr, user, body.application_id);
  },
  async analyzeJob({ sr, user, body }) {
    requireUser(user);
    if (!(await canUseAi(sr, user))) throw new HttpError(402, "AI-assisted candidate organisation is part of the Premium plan.", "upgrade_required");
    const job = await sr.entities.Job.get(String(body.job_id || "")).catch(() => null);
    if (!job || (job.owner_id !== user.id && !isAdmin(user))) throw new HttpError(404, "Job not found.");
    const apps = await sr.entities.JobApplication.filter({ job_id: job.id }, "-created_date", 200);
    const results = [];
    let skipped = 0;
    for (const a of apps) {
      if (!a.ai_consent || a.status === "withdrawn") {
        skipped++;
        continue;
      }
      results.push(await analyzeOne(sr, user, a.id));
    }
    return { analysed: results.length, skipped_without_consent: skipped, results };
  },
};

export const handler = serveActions(actions, createClientFromRequest);
Deno.serve(handler);
