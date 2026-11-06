import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BadgeCheck, MapPin, Clock, Briefcase, Bot, ArrowLeft, Share2 } from 'lucide-react';
import { Badge, Button, Checkbox, ErrorNote, Eyebrow, Field, Loading, Modal, Notice, Select, Textarea, useToast } from '@/components/ui';
import { JobCard, ReportButton, ShareKit } from '@/components/jobs';
import { call, db, errMsg, errCode } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { jobPostingLd, useSeo } from '@/lib/seo';
import { useSession } from '@/lib/session';
import { label } from '@/lib/constants';
import { ago, date, pay } from '@/lib/format';
import { attribution, sessionId, track } from '@/lib/analytics';

function ApplyModal({ job, open, onClose, onApplied }) {
  const s = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: resumes } = useAsync(() => (s.user ? db.Resume.filter({ user_id: s.user.id }, '-created_date', 20) : Promise.resolve([])), [s.user?.id, open]);
  const [form, setForm] = useState({ resume_id: '', cover_letter: '', availability_note: '', ai_consent: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const primary = (resumes || []).find((r) => r.is_primary) || resumes?.[0];
    if (primary && !form.resume_id) setForm((f) => ({ ...f, resume_id: primary.id }));
  }, [resumes]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const a = attribution();
      await call('jobs', 'apply', { job_id: job.id, ...form, source: a.utm_source || '', ref: a.ref || '', session_id: sessionId() });
      toast('Application sent. Track it in your dashboard.');
      onApplied();
      onClose();
    } catch (e) {
      if (errCode(e) === 'no_profile') navigate(`/account/profile?next=/jobs/${job.id}`);
      setError(errMsg(e));
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Apply — ${job.title}`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Send application</Button></>}>
      <div className="space-y-5">
        <p className="text-sm text-muted">Your StaffTO profile ({s.candidate?.full_name || 'incomplete'}) is shared with {job.employer_name}. <Link to="/account/profile" className="text-ink underline">Review profile</Link></p>
        <Field label="Resume" hint={resumes?.length ? 'Employers can download it only for this application.' : undefined}>
          {resumes?.length ? (
            <Select value={form.resume_id} onChange={(e) => setForm({ ...form, resume_id: e.target.value })} placeholder="Apply without a resume" options={resumes.map((r) => ({ value: r.id, label: r.file_name }))} />
          ) : (
            <p className="text-sm">No resume uploaded. <Link to="/account/resumes" className="underline">Upload one</Link> or apply with your profile only.</p>
          )}
        </Field>
        <Field label="Short note to the employer (optional)"><Textarea value={form.cover_letter} onChange={(e) => setForm({ ...form, cover_letter: e.target.value })} rows={4} placeholder="Why you're a good fit, when you can start…" maxLength={5000} /></Field>
        <Field label="Availability (optional)"><Textarea value={form.availability_note} onChange={(e) => setForm({ ...form, availability_note: e.target.value })} rows={2} placeholder="e.g. Evenings and weekends, can start next week" maxLength={500} /></Field>
        <div className="border border-line bg-paper-2/60 p-4">
          <Checkbox checked={form.ai_consent} onChange={(v) => setForm({ ...form, ai_consent: v })}
            label="Allow AI-assisted review of this application (optional)"
            hint="The employer may use StaffTO's AI tools to summarise how your experience matches this job. It never rejects anyone automatically — a person reviews every application. You can say no and still apply." />
          <Link to="/legal/ai" className="mt-2 inline-block text-xs underline">How StaffTO uses AI</Link>
        </div>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

export default function JobDetail() {
  const { id } = useParams();
  const s = useSession();
  const navigate = useNavigate();
  const [applyOpen, setApplyOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const { data, loading, error, reload } = useAsync(async () => {
    const job = await db.Job.get(id);
    const [employer, mine, similar] = await Promise.all([
      db.Employer.get(job.employer_id).catch(() => null),
      s.user ? db.JobApplication.filter({ job_id: id, applicant_id: s.user.id }, '-created_date', 5) : Promise.resolve([]),
      db.Job.filter({ status: 'active', category: job.category }, '-published_at', 6),
    ]);
    return { job, employer, applied: mine.find((a) => a.status !== 'withdrawn'), similar: similar.filter((j) => j.id !== job.id).slice(0, 4) };
  }, [id, s.user?.id]);
  const job = data?.job;
  useEffect(() => { if (job?.id && job.status === 'active') track('job_view', { job_id: job.id }); }, [job?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useSeo({
    title: job ? `${job.title} at ${job.employer_name} — ${label(job.location)}` : 'Job',
    description: job ? `${job.title} (${label(job.employment_type)}) at ${job.employer_name} in ${label(job.location)}. ${pay(job)}. Apply on StaffTO.` : undefined,
    path: job ? `/jobs/${job.id}/${job.slug || ''}` : undefined,
    jsonLd: job ? jobPostingLd(job, data?.employer) : null,
    noindex: job && job.status !== 'active',
  });

  if (loading) return <div className="mx-auto max-w-page px-6"><Loading /></div>;
  if (error || !job) return <div className="mx-auto max-w-xl px-6 py-24 text-center"><h1 className="font-display text-4xl">This job isn't available</h1><Button to="/jobs" className="mt-6">Browse open jobs</Button></div>;

  const isOwner = s.user?.id === job.owner_id;
  const canApply = job.status === 'active' && !isOwner;
  const startApply = () => {
    track('apply_click', { job_id: job.id });
    if (!s.user) return navigate(`/signup?next=/jobs/${job.id}`);
    if (!s.profile) return navigate(`/onboarding?next=/jobs/${job.id}`);
    if (s.isEmployer) return navigate('/employers');
    if (!s.candidate) return navigate(`/account/profile?next=/jobs/${job.id}`);
    setApplyOpen(true);
  };
  const section = (title, text) => text ? <section className="border-t border-line pt-6"><h2 className="mb-3 font-mono text-2xs uppercase tracking-[0.18em] text-muted">{title}</h2><div className="whitespace-pre-line text-[16px] leading-relaxed text-ink/85">{text}</div></section> : null;

  return (
    <div className="mx-auto max-w-page px-4 py-8 sm:px-6 lg:py-12">
      <Link to="/jobs" className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />All jobs</Link>
      {job.status !== 'active' && <Notice tone="brass" className="mb-6">This listing is {job.status} and no longer accepting applications.</Notice>}
      <div className="grid gap-12 lg:grid-cols-[1fr_340px]">
        <article>
          <div className="flex flex-wrap items-center gap-2">
            {job.is_featured && <Badge tone="signal">Featured</Badge>}
            <Badge>{label(job.category)}</Badge>
            {job.vacancy_status === 'future' && <Badge tone="brass">Future vacancy</Badge>}
          </div>
          <h1 className="mt-4 font-display text-5xl leading-[1] tracking-tight sm:text-6xl">{job.title}</h1>
          <p className="mt-3 flex items-center gap-1.5 text-lg">{job.employer_name}{job.employer_verified && <BadgeCheck className="h-5 w-5 text-lake" aria-label="Verified employer" />}</p>
          <dl className="mt-8 grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
            {[['Pay', pay(job)], ['Where', label(job.location)], ['Type', label(job.employment_type)], ['Experience', label(job.experience_level)]].map(([k, v]) => (
              <div key={k} className="bg-paper p-4"><dt className="font-mono text-2xs uppercase tracking-wider text-muted">{k}</dt><dd className="mt-1 font-medium">{v}</dd></div>
            ))}
          </dl>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
            {job.address && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{job.address}</span>}
            {job.tips !== 'none' && <span>Tips: {label(job.tips)}</span>}
            {job.shifts?.length > 0 && <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" />{job.shifts.map(label).join(', ')}</span>}
            {job.start_date && <span className="inline-flex items-center gap-1"><Briefcase className="h-4 w-4" />Starts {date(job.start_date)}</span>}
            <span>Posted {ago(job.published_at || job.created_date)}</span>
          </div>
          <div className="mt-10 space-y-8">
            {section('About the role', job.description)}
            {section('What you’ll do', job.responsibilities)}
            {section('What we’re looking for', job.requirements)}
            {(job.skills?.length > 0 || job.certifications?.length > 0) && (
              <section className="border-t border-line pt-6">
                <h2 className="mb-3 font-mono text-2xs uppercase tracking-[0.18em] text-muted">Skills & certifications</h2>
                <div className="flex flex-wrap gap-1.5">{[...(job.skills || []), ...(job.certifications || [])].map((t) => <span key={t} className="rounded-sm border border-line bg-white px-2 py-1 text-sm">{t}</span>)}</div>
              </section>
            )}
            {section('Benefits & perks', job.benefits)}
            {job.uses_ai_screening && (
              <section className="flex gap-3 border border-line bg-paper-2/60 p-4 text-sm">
                <Bot className="h-5 w-5 shrink-0 text-lake" aria-hidden />
                <p>This employer may use AI-assisted tools to organise applications for this posting. AI only assists — a person makes every hiring decision, and AI review happens only if you opt in when applying. <Link to="/legal/ai" className="underline">Learn more</Link></p>
              </section>
            )}
          </div>
        </article>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="border border-ink bg-white p-5">
            <p className="font-mono text-[22px] font-medium tabular-nums">{pay(job)}</p>
            <p className="text-sm text-muted">{label(job.employment_type)} · {label(job.location)}</p>
            {data.applied ? (
              <div className="mt-5"><Notice>You applied {ago(data.applied.created_date)}. Status: <strong>{data.applied.status}</strong>.</Notice><Button to="/account/applications" variant="outline" className="mt-3 w-full">Track application</Button></div>
            ) : isOwner ? (
              <div className="mt-5 space-y-2"><Button to={`/employer/jobs/${job.id}/applicants`} className="w-full">View applicants ({job.applications_count || 0})</Button><Button onClick={() => setShareOpen(true)} variant="outline" className="w-full"><Share2 className="h-4 w-4" />Share kit</Button></div>
            ) : (
              <Button onClick={startApply} disabled={!canApply} variant="signal" size="lg" className="mt-5 w-full">{canApply ? 'Apply now' : 'Applications closed'}</Button>
            )}
            <p className="mt-4 text-xs text-muted">StaffTO never charges job seekers. Never pay anyone to apply for a job.</p>
          </div>
          {data.employer && (
            <div className="mt-6 border-t border-line pt-5">
              <Eyebrow className="mb-2">About the employer</Eyebrow>
              <p className="font-semibold">{data.employer.business_name}</p>
              <p className="text-sm text-muted">{label(data.employer.business_type)} · {label(data.employer.location)}</p>
              {data.employer.description && <p className="mt-3 line-clamp-5 text-sm text-ink/80">{data.employer.description}</p>}
              {data.employer.website && <a href={data.employer.website} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-block text-sm underline">Website</a>}
            </div>
          )}
          <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
            <button onClick={() => setShareOpen(true)} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"><Share2 className="h-3.5 w-3.5" />Share this job</button>
            <ReportButton targetType="job" targetId={job.id} />
          </div>
        </aside>
      </div>
      {data.similar.length > 0 && (
        <section className="mt-20">
          <h2 className="mb-4 font-display text-3xl">Similar {label(job.category).toLowerCase()} jobs</h2>
          {data.similar.map((j) => <JobCard key={j.id} job={j} compact />)}
        </section>
      )}
      <ApplyModal job={job} open={applyOpen} onClose={() => setApplyOpen(false)} onApplied={reload} />
      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Share this job" wide><ShareKit job={job} /></Modal>
    </div>
  );
}
