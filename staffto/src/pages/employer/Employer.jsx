import { useEffect, useState } from 'react';
import { Link, Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BadgeCheck, Plus, Eye, Users, Share2, Star, Upload } from 'lucide-react';
import { DashboardShell } from '@/components/Layout';
import { Badge, Button, Checkbox, ChipSelect, Empty, ErrorNote, Field, Input, Loading, Modal, Notice, PageHead, Select, Stat, Table, TagInput, Textarea, useToast } from '@/components/ui';
import { ShareKit } from '@/components/jobs';
import { call, db, errCode, errMsg, uploadPublic } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useSeo } from '@/lib/seo';
import { useSession } from '@/lib/session';
import { BUSINESS_TYPES, CATEGORIES, EMPLOYEE_BANDS, EMPLOYMENT_TYPES, EXPERIENCE, JOB_STATUS, LOCATIONS, SHIFTS, TIPS, label } from '@/lib/constants';
import { ago, date, jobPath, number, pay, pct } from '@/lib/format';

export function EmployerLayout() {
  useSeo({ title: 'Employer dashboard', noindex: true });
  return (
    <DashboardShell title="Employer" nav={[
      ['/employer', 'Overview', true], ['/employer/jobs', 'Jobs'], ['/employer/jobs/new', 'Post a job'], ['/employer/messages', 'Messages'],
      ['/employer/profile', 'Business profile'], ['/employer/billing', 'Plan & billing'], ['/account/settings', 'Settings'],
    ]}><Outlet /></DashboardShell>
  );
}

function NeedsProfile() {
  return <Empty title="Set up your business profile first" action={<Button to="/employer/profile">Create business profile</Button>}>Candidates see your business name, logo and description on every job.</Empty>;
}

export function EmployerOverview() {
  const s = useSession();
  const { data, loading } = useAsync(async () => {
    if (!s.employer) return null;
    const [jobs, apps, allowance] = await Promise.all([
      db.Job.filter({ employer_id: s.employer.id }, '-created_date', 500),
      db.JobApplication.filter({ employer_owner_id: s.user.id }, '-created_date', 2000),
      call('jobs', 'allowance').catch(() => null),
    ]);
    return { jobs, apps, allowance };
  }, [s.employer?.id]);
  if (!s.employer) return <NeedsProfile />;
  if (loading) return <Loading />;
  const { jobs, apps, allowance } = data;
  const active = jobs.filter((j) => j.status === 'active');
  const views = jobs.reduce((n, j) => n + (j.views || 0), 0);
  const fresh = apps.filter((a) => a.status === 'submitted');
  const hired = apps.filter((a) => a.status === 'hired').length;
  return (
    <>
      <PageHead eyebrow={s.employer.business_name} title="Recruitment overview" actions={<Button to="/employer/jobs/new"><Plus className="h-4 w-4" />Post a job</Button>}>
        {allowance && <>Plan: <strong className="text-ink">{label(allowance.plan) || allowance.plan}</strong> · {allowance.plan_slots_left} plan slot(s) left · {allowance.credits} job credit(s) · {allowance.featured_credits} featured credit(s)</>}
      </PageHead>
      {!s.employer.verified && <Notice className="mb-6">Verified employers get a badge on every listing. <Link to="/employer/profile" className="underline">Request verification</Link></Notice>}
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-5">
        <Stat label="Live jobs" value={active.length} />
        <Stat label="Job views" value={number(views)} />
        <Stat label="Applications" value={number(apps.length)} />
        <Stat label="View → apply" value={views ? pct(apps.length / views) : '—'} />
        <Stat label="Hires" value={hired} />
      </div>
      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-semibold">New applicants ({fresh.length})</h2>
          {fresh.length ? (
            <ul className="divide-y divide-line border-y border-line">{fresh.slice(0, 8).map((a) => (
              <li key={a.id} className="flex items-center justify-between py-3 text-sm"><span><strong>{a.applicant_name}</strong> · {a.job_title}</span><Link to={`/employer/jobs/${a.job_id}/applicants?open=${a.id}`} className="underline">Review</Link></li>
            ))}</ul>
          ) : <p className="text-sm text-muted">No unreviewed applications.</p>}
        </section>
        <section>
          <h2 className="mb-3 font-semibold">Job performance</h2>
          <Table rows={jobs.slice(0, 8)} empty="No jobs yet." columns={[
            { key: 'title', label: 'Job', render: (j) => <Link to={`/employer/jobs/${j.id}/applicants`} className="font-medium hover:underline">{j.title}</Link> },
            { key: 'status', label: 'Status', render: (j) => <Badge tone={JOB_STATUS[j.status]?.tone}>{JOB_STATUS[j.status]?.label}</Badge> },
            { key: 'views', label: 'Views', className: 'tabular-nums', render: (j) => j.views || 0 },
            { key: 'apps', label: 'Apps', className: 'tabular-nums', render: (j) => j.applications_count || 0 },
            { key: 'shares', label: 'Shares', className: 'tabular-nums', render: (j) => j.share_count || 0 },
          ]} />
        </section>
      </div>
    </>
  );
}

export function BusinessProfile() {
  const s = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const e = s.employer || {};
  const [f, setF] = useState({
    business_name: e.business_name || '', business_type: e.business_type || 'restaurant', description: e.description || '', website: e.website || '', phone: e.phone || '',
    contact_email: e.contact_email || s.user?.email || '', contact_name: e.contact_name || s.profile?.full_name || '', address: e.address || '', location: e.location || 'downtown_toronto',
    additional_locations: e.additional_locations || [], employee_count_band: e.employee_count_band || '', instagram: e.instagram || '', logo_url: e.logo_url || '', cover_url: e.cover_url || '',
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (ev) => setF({ ...f, [k]: ev?.target ? ev.target.value : ev });
  const onLogo = async (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type) || file.size > 3 * 1024 * 1024) return setError('Logo must be an image under 3 MB.');
    setUploading(true);
    try { setF((x) => ({ ...x, logo_url: '' })); const url = await uploadPublic(file); setF((x) => ({ ...x, logo_url: url })); } catch (err) { setError(errMsg(err)); } finally { setUploading(false); }
  };
  const save = async (ev) => {
    ev.preventDefault();
    setBusy(true); setError('');
    try {
      if (s.employer) await db.Employer.update(s.employer.id, f);
      else await db.Employer.create({ ...f, owner_id: s.user.id, slug: f.business_name.toLowerCase().replace(/[^a-z0-9]+/g, '-') });
      await s.reload();
      toast('Business profile saved.');
      if (!s.employer) navigate('/employer/jobs/new');
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };
  const requestVerification = async () => {
    try { await db.Employer.update(s.employer.id, { verification_requested: true }); await s.reload(); toast('Verification requested. We’ll review your business within 2 business days.'); } catch (err) { toast(errMsg(err), 'error'); }
  };
  const multi = ['pro', 'premium'].includes(e.plan) && e.plan === 'premium';
  return (
    <>
      <PageHead eyebrow="Employer" title="Business profile">{params.get('welcome') ? 'Welcome! Tell candidates about your business — then post your first job.' : 'Shown on your job listings.'}</PageHead>
      {s.employer && (
        <div className="mb-8 flex flex-wrap items-center gap-3">
          {s.employer.verified ? <Badge tone="lake"><BadgeCheck className="h-3 w-3" />Verified business</Badge> : s.employer.verification_requested ? <Badge tone="brass">Verification pending</Badge> : <Button size="sm" variant="outline" onClick={requestVerification}>Request verification</Button>}
          <span className="text-sm text-muted">Plan: {label(s.employer.plan) || s.employer.plan}</span>
        </div>
      )}
      <form onSubmit={save} className="grid max-w-3xl gap-5 sm:grid-cols-2">
        <Field label="Business name" required className="sm:col-span-2"><Input value={f.business_name} onChange={set('business_name')} required minLength={2} maxLength={120} /></Field>
        <Field label="Type of business" required><Select value={f.business_type} onChange={set('business_type')} options={BUSINESS_TYPES} /></Field>
        <Field label="Primary area" required><Select value={f.location} onChange={set('location')} options={LOCATIONS} /></Field>
        <Field label="Street address" className="sm:col-span-2"><Input value={f.address} onChange={set('address')} placeholder="123 Queen St W, Toronto" /></Field>
        <Field label="Employees in Ontario" hint="Ontario job-posting rules (pay ranges, AI disclosure) apply to employers with 25+ employees."><Select value={f.employee_count_band} onChange={set('employee_count_band')} placeholder="Select" options={EMPLOYEE_BANDS} /></Field>
        <Field label="Website"><Input type="url" value={f.website} onChange={set('website')} placeholder="https://" /></Field>
        <Field label="About your business" className="sm:col-span-2"><Textarea value={f.description} onChange={set('description')} rows={5} maxLength={4000} placeholder="Your food, your team, what it's like to work a shift with you." /></Field>
        <Field label="Hiring contact name"><Input value={f.contact_name} onChange={set('contact_name')} /></Field>
        <Field label="Hiring contact email" hint="Never shown publicly."><Input type="email" value={f.contact_email} onChange={set('contact_email')} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Instagram"><Input value={f.instagram} onChange={set('instagram')} placeholder="@yourspot" /></Field>
        <Field label="Logo" className="sm:col-span-2">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden border border-line bg-white">{f.logo_url ? <img src={f.logo_url} alt="Logo preview" className="h-full w-full object-cover" /> : <span className="text-xs text-muted">None</span>}</div>
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded border border-ink/80 px-4 text-sm hover:bg-ink hover:text-paper"><Upload className="h-4 w-4" />{uploading ? 'Uploading…' : 'Upload logo'}<input type="file" accept="image/*" className="sr-only" onChange={(ev) => onLogo(ev.target.files?.[0])} /></label>
          </div>
        </Field>
        <Field label="Other GTA locations" className="sm:col-span-2" hint={multi ? 'Shown on your profile.' : 'Multiple locations is a Premium feature.'}>
          <ChipSelect name="Other locations" options={LOCATIONS} value={f.additional_locations} onChange={(v) => (multi ? setF({ ...f, additional_locations: v }) : null)} />
        </Field>
        <ErrorNote className="sm:col-span-2">{error}</ErrorNote>
        <div className="sm:col-span-2"><Button type="submit" loading={busy} size="lg">{s.employer ? 'Save profile' : 'Create business profile'}</Button></div>
      </form>
    </>
  );
}

export function EmployerJobs() {
  const s = useSession();
  const toast = useToast();
  const [tab, setTab] = useState('active');
  const { data: jobs, loading, reload } = useAsync(() => (s.employer ? db.Job.filter({ employer_id: s.employer.id }, '-created_date', 500) : Promise.resolve([])), [s.employer?.id]);
  if (!s.employer) return <NeedsProfile />;
  const act = async (job, status) => {
    try { const r = await call('jobs', 'setStatus', { job_id: job.id, status }); toast(r.note || (status === 'delete' ? 'Job deleted.' : `Job ${status === 'active' ? 'published' : status}.`)); reload(); } catch (e) { toast(errMsg(e), 'error'); }
  };
  const feature = async (job) => { try { await call('jobs', 'feature', { job_id: job.id }); toast('Job featured for 14 days.'); reload(); } catch (e) { toast(errMsg(e), 'error'); } };
  const rows = (jobs || []).filter((j) => (tab === 'active' ? j.status === 'active' : tab === 'draft' ? j.status === 'draft' : !['active', 'draft'].includes(j.status)));
  return (
    <>
      <PageHead eyebrow="Employer" title="Your jobs" actions={<Button to="/employer/jobs/new"><Plus className="h-4 w-4" />Post a job</Button>} />
      <div className="mb-4 flex gap-1">{[['active', 'Live'], ['draft', 'Drafts'], ['closed', 'Closed & expired']].map(([v, l]) => <Button key={v} size="sm" variant={tab === v ? 'primary' : 'ghost'} onClick={() => setTab(v)}>{l}</Button>)}</div>
      {loading ? <Loading /> : (
        <Table rows={rows} empty="No jobs in this list." columns={[
          { key: 'title', label: 'Job', render: (j) => <div><Link to={jobPath(j)} className="font-medium hover:underline">{j.title}</Link><p className="text-xs text-muted">{label(j.location)} · {pay(j)}</p>{j.moderation_note && <p className="text-xs text-signal">{j.moderation_note}</p>}</div> },
          { key: 'status', label: 'Status', render: (j) => <div className="space-y-1"><Badge tone={JOB_STATUS[j.status]?.tone}>{JOB_STATUS[j.status]?.label}</Badge>{j.is_featured && <Badge tone="signal">Featured</Badge>}</div> },
          { key: 'stats', label: 'Views / Apps', render: (j) => <span className="tabular-nums">{j.views || 0} / {j.applications_count || 0}</span> },
          { key: 'exp', label: 'Expires', render: (j) => (j.expires_at ? date(j.expires_at) : '—') },
          { key: 'actions', label: '', className: 'text-right', render: (j) => (
            <div className="flex flex-wrap justify-end gap-1">
              <Button size="sm" variant="ghost" to={`/employer/jobs/${j.id}/applicants`}><Users className="h-3.5 w-3.5" />Applicants</Button>
              {j.status !== 'removed' && <Button size="sm" variant="ghost" to={`/employer/jobs/${j.id}/edit`}>Edit</Button>}
              {j.status === 'active' && <Button size="sm" variant="ghost" to={`/employer/jobs/${j.id}/share`}><Share2 className="h-3.5 w-3.5" />Share</Button>}
              {j.status === 'active' && !j.is_featured && <Button size="sm" variant="ghost" onClick={() => feature(j)}><Star className="h-3.5 w-3.5" />Feature</Button>}
              {j.status === 'active' && <Button size="sm" variant="ghost" onClick={() => act(j, 'closed')}>Close</Button>}
              {['draft', 'closed', 'expired'].includes(j.status) && <Button size="sm" variant="outline" onClick={() => act(j, 'active')}>Publish</Button>}
              {['draft', 'closed', 'expired'].includes(j.status) && <Button size="sm" variant="danger" onClick={() => window.confirm('Delete this job?') && act(j, 'delete')}>Delete</Button>}
            </div>
          ) },
        ]} />
      )}
    </>
  );
}

const SKILL_SUGGESTIONS = {
  line_cook: ['Grill', 'Sauté', 'Fry station', 'Expo', 'Knife skills', 'High volume', 'Food Handler'],
  prep_cook: ['Knife skills', 'Batch prep', 'Sauces', 'Inventory rotation', 'Food Handler'],
  chef: ['Menu development', 'Food costing', 'Team leadership', 'Ordering', 'Scheduling'],
  sous_chef: ['Line leadership', 'Ordering', 'Food costing', 'Training', 'Expo'],
  server: ['POS', 'Wine knowledge', 'Upselling', 'Fine dining', 'High volume', 'Smart Serve'],
  bartender: ['Classic cocktails', 'High volume', 'POS', 'Inventory', 'Smart Serve'],
  barista: ['Espresso', 'Latte art', 'Customer service', 'Cash handling'],
  dishwasher: ['Dish machine', 'Cleaning', 'Fast-paced', 'Reliability'],
};

export function JobEditor() {
  const { id } = useParams();
  const s = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: existing, loading } = useAsync(() => (id ? db.Job.get(id) : Promise.resolve(null)), [id]);
  const { data: allowance } = useAsync(() => (s.employer ? call('jobs', 'allowance') : Promise.resolve(null)), [s.employer?.id]);
  const blank = { title: '', category: 'line_cook', location: s.employer?.location || 'downtown_toronto', address: s.employer?.address || '', employment_type: 'full_time', salary_min: '', salary_max: '', salary_period: 'hour', tips: 'none', experience_level: 'none', description: '', responsibilities: '', requirements: '', benefits: '', skills: [], certifications: [], languages: ['English'], shifts: [], start_date: '', vacancy_status: 'existing', uses_ai_screening: false };
  const [f, setF] = useState(blank);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [paywall, setPaywall] = useState(false);
  useEffect(() => { if (existing) setF({ ...blank, ...Object.fromEntries(Object.keys(blank).map((k) => [k, existing[k] ?? blank[k]])) }); }, [existing]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s.employer) return <NeedsProfile />;
  if (id && loading) return <Loading />;
  const set = (k) => (ev) => setF({ ...f, [k]: ev?.target ? ev.target.value : ev });
  const save = async (publish) => {
    setBusy(publish ? 'publish' : 'draft'); setError('');
    try {
      const { job } = await call('jobs', 'save', { job_id: id, data: f, publish });
      toast(publish ? 'Job is live. Share it to reach more people.' : 'Draft saved.');
      navigate(publish ? `/employer/jobs/${job.id}/share?new=1` : '/employer/jobs');
    } catch (e) {
      if (errCode(e) === 'payment_required') setPaywall(true);
      setError(errMsg(e));
    } finally { setBusy(''); }
  };
  const isLive = existing?.status === 'active';
  const big = ['25-49', '50-99', '100+'].includes(s.employer.employee_count_band);
  return (
    <>
      <PageHead eyebrow="Employer" title={id ? 'Edit job' : 'Post a job'}>
        {allowance && !isLive && <>Publishing uses {allowance.plan_slots_left > 0 ? 'one of your plan’s active slots' : allowance.credits > 0 ? `one job credit (${allowance.credits} left)` : 'a job post credit — you have none yet'}.</>}
      </PageHead>
      <form onSubmit={(e) => { e.preventDefault(); save(true); }} className="grid max-w-3xl gap-5 sm:grid-cols-2">
        <Field label="Job title" required className="sm:col-span-2"><Input value={f.title} onChange={set('title')} required maxLength={120} placeholder="e.g. Line Cook — Brunch" /></Field>
        <Field label="Category" required><Select value={f.category} onChange={set('category')} options={CATEGORIES} /></Field>
        <Field label="Employment type" required><Select value={f.employment_type} onChange={set('employment_type')} options={EMPLOYMENT_TYPES} /></Field>
        <Field label="Area" required><Select value={f.location} onChange={set('location')} options={LOCATIONS} /></Field>
        <Field label="Address or nearest intersection"><Input value={f.address} onChange={set('address')} placeholder="Queen & Ossington" /></Field>
        <fieldset className="grid gap-3 border border-line p-4 sm:col-span-2 sm:grid-cols-4">
          <legend className="px-1 text-[13px] font-medium">Pay <span className="text-signal">*</span></legend>
          <Field label="Minimum"><Input type="number" step="0.01" min="0" required value={f.salary_min} onChange={set('salary_min')} /></Field>
          <Field label="Maximum"><Input type="number" step="0.01" min="0" value={f.salary_max} onChange={set('salary_max')} /></Field>
          <Field label="Per"><Select value={f.salary_period} onChange={set('salary_period')} options={[{ value: 'hour', label: 'Hour' }, { value: 'year', label: 'Year' }]} /></Field>
          <Field label="Tips"><Select value={f.tips} onChange={set('tips')} options={TIPS} /></Field>
          <p className="text-xs text-muted sm:col-span-4">Pay is required on every StaffTO listing. Under Ontario rules, a posted range can’t span more than $50,000 a year.</p>
        </fieldset>
        <Field label="Experience required"><Select value={f.experience_level} onChange={set('experience_level')} options={EXPERIENCE} /></Field>
        <Field label="Start date"><Input type="date" value={f.start_date} onChange={set('start_date')} /></Field>
        <Field label="Shifts" className="sm:col-span-2"><ChipSelect name="Shifts" options={SHIFTS} value={f.shifts} onChange={set('shifts')} /></Field>
        <Field label="About the role" className="sm:col-span-2"><Textarea value={f.description} onChange={set('description')} rows={5} maxLength={8000} /></Field>
        <Field label="Responsibilities" className="sm:col-span-2"><Textarea value={f.responsibilities} onChange={set('responsibilities')} rows={4} maxLength={6000} /></Field>
        <Field label="Requirements" className="sm:col-span-2" hint="Focus on skills needed for the job. Ontario law prohibits requiring “Canadian experience”."><Textarea value={f.requirements} onChange={set('requirements')} rows={4} maxLength={6000} /></Field>
        <Field label="Key skills" hint="Used for matching and AI-assisted review." className="sm:col-span-2"><TagInput value={f.skills} onChange={set('skills')} suggestions={SKILL_SUGGESTIONS[f.category] || []} /></Field>
        <Field label="Certifications" className="sm:col-span-2"><TagInput value={f.certifications} onChange={set('certifications')} suggestions={['Smart Serve', 'Food Handler Certificate', 'First Aid / CPR', 'WHMIS']} /></Field>
        <Field label="Benefits & perks" className="sm:col-span-2"><Textarea value={f.benefits} onChange={set('benefits')} rows={3} maxLength={3000} placeholder="Staff meals, transit subsidy, health benefits after 3 months…" /></Field>
        <fieldset className="space-y-3 border border-line p-4 sm:col-span-2">
          <legend className="px-1 text-[13px] font-medium">Ontario posting disclosures {big && <Badge tone="brass" className="ml-1">Required for 25+ employees</Badge>}</legend>
          <Field label="Is this for an existing vacancy?"><Select value={f.vacancy_status} onChange={set('vacancy_status')} options={[{ value: 'existing', label: 'Yes — an existing vacancy' }, { value: 'future', label: 'No — building a pool for future openings' }]} /></Field>
          <Checkbox checked={f.uses_ai_screening} onChange={set('uses_ai_screening')} label="I may use AI-assisted tools to screen, assess or select applicants for this job" hint="Shown on the listing as required by Ontario’s ESA. StaffTO’s AI tools only work on applicants who opt in." />
        </fieldset>
        <ErrorNote className="sm:col-span-2">{error}</ErrorNote>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" size="lg" variant="signal" loading={busy === 'publish'}>{isLive ? 'Save changes' : 'Publish job'}</Button>
          {!isLive && <Button size="lg" variant="outline" loading={busy === 'draft'} onClick={() => save(false)}>Save draft</Button>}
        </div>
      </form>
      <Modal open={paywall} onClose={() => setPaywall(false)} title="Publish with a job post or plan" footer={<><Button variant="ghost" onClick={() => setPaywall(false)}>Not now</Button><Button onClick={() => navigate('/employer/billing')}>See options</Button></>}>
        <p className="text-sm">Your draft is saved. To publish, buy a single job post or choose a plan with active job slots. Have a promo code? Apply it at checkout.</p>
      </Modal>
    </>
  );
}

export function JobShare() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { data: job, loading } = useAsync(() => db.Job.get(id), [id]);
  if (loading) return <Loading />;
  if (!job) return <Empty title="Job not found" />;
  return (
    <>
      <PageHead eyebrow={params.get('new') ? 'Your job is live 🎉' : 'Share kit'} title={`Share “${job.title}”`} actions={<Button to={jobPath(job)} variant="outline"><Eye className="h-4 w-4" />View listing</Button>}>
        Post it to Toronto hospitality Facebook groups, your Instagram and WhatsApp. Every link is tracked so you can see which channel brings applicants.
      </PageHead>
      <ShareKit job={job} />
    </>
  );
}

export function useEmployerApplications(jobId) {
  return useAsync(async () => {
    const [job, apps] = await Promise.all([db.Job.get(jobId), db.JobApplication.filter({ job_id: jobId }, '-created_date', 500)]);
    return { job, apps };
  }, [jobId]);
}

