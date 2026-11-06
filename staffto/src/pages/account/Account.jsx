import { useState } from 'react';
import { Link, Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, Plus, Trash2, Upload } from 'lucide-react';
import { DashboardShell } from '@/components/Layout';
import { Badge, Button, Checkbox, ChipSelect, Empty, ErrorNote, Field, Input, Loading, Modal, Notice, PageHead, Select, Stat, Table, TagInput, Textarea, useToast } from '@/components/ui';
import { JobCard } from '@/components/jobs';
import { call, db, errMsg, uploadPrivate } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useSeo } from '@/lib/seo';
import { useSession } from '@/lib/session';
import { APP_STATUS, CATEGORIES, EMPLOYMENT_TYPES, LOCATIONS, SHIFTS, label } from '@/lib/constants';
import { ago, date } from '@/lib/format';

export function AccountLayout() {
  useSeo({ title: 'Your dashboard', noindex: true });
  const s = useSession();
  const nav = s.isEmployer
    ? [['/employer', 'Employer dashboard', true], ['/account/settings', 'Settings & privacy'], ['/account/testimonial', 'Share feedback']]
    : [['/account', 'Overview', true], ['/account/profile', 'Profile'], ['/account/resumes', 'Resumes'], ['/account/applications', 'Applications'], ['/account/saved', 'Saved jobs'], ['/messages', 'Messages'], ['/classifieds/mine', 'My classifieds'], ['/account/settings', 'Settings & privacy'], ['/account/testimonial', 'Share feedback']];
  return <DashboardShell title={s.isEmployer ? 'Account' : 'Job seeker'} nav={nav}><Outlet /></DashboardShell>;
}

export function SeekerOverview() {
  const s = useSession();
  const { data, loading } = useAsync(async () => {
    const [apps, saved, jobs] = await Promise.all([
      db.JobApplication.filter({ applicant_id: s.user.id }, '-created_date', 200),
      db.SavedJob.filter({ user_id: s.user.id }, '-created_date', 200),
      db.Job.filter({ status: 'active' }, '-published_at', 300),
    ]);
    const prefs = s.candidate?.preferred_categories || [];
    const locs = s.candidate?.preferred_locations || [];
    const matches = jobs.filter((j) => (!prefs.length || prefs.includes(j.category)) && (!locs.length || locs.includes(j.location))).slice(0, 5);
    return { apps, saved, matches };
  }, [s.user.id]);
  if (loading) return <Loading />;
  const live = data.apps.filter((a) => !['withdrawn', 'rejected', 'hired'].includes(a.status));
  return (
    <>
      <PageHead eyebrow="Job seeker" title={`Hi ${(s.candidate?.full_name || s.profile?.full_name || '').split(' ')[0] || 'there'}`} actions={<Button to="/jobs">Browse jobs</Button>} />
      {!s.candidate && <Notice className="mb-6">Complete your profile to start applying. <Link to="/account/profile" className="underline">Set up profile</Link></Notice>}
      <div className="grid grid-cols-3 gap-6"><Stat label="Active applications" value={live.length} /><Stat label="Shortlisted+" value={data.apps.filter((a) => ['shortlisted', 'interview', 'offered', 'hired'].includes(a.status)).length} /><Stat label="Saved jobs" value={data.saved.length} /></div>
      <section className="mt-12">
        <h2 className="mb-2 font-semibold">Jobs matching your preferences</h2>
        {data.matches.length ? data.matches.map((j) => <JobCard key={j.id} job={j} compact />) : <p className="text-sm text-muted">No matches right now. Widen your preferred roles or areas in your profile.</p>}
      </section>
    </>
  );
}

const emptyWork = { employer: '', role: '', start: '', end: '', current: false, description: '' };

export function CandidateProfileEditor() {
  const s = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const c = s.candidate || {};
  const [f, setF] = useState({
    full_name: c.full_name || s.profile?.full_name || '', headline: c.headline || '', email: c.email || s.user.email, phone: c.phone || s.profile?.phone || '',
    location: c.location || '', bio: c.bio || '', years_experience: c.years_experience ?? '', skills: c.skills || [], certifications: c.certifications || [], languages: c.languages || ['English'],
    preferred_categories: c.preferred_categories || [], preferred_locations: c.preferred_locations || [], availability: c.availability || [], shifts: c.shifts || [],
    salary_expectation: c.salary_expectation ?? '', salary_period: c.salary_period || 'hour', work_history: c.work_history || [], legally_entitled: c.legally_entitled || '', open_to_work: c.open_to_work ?? true,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (ev) => setF({ ...f, [k]: ev?.target ? ev.target.value : ev });
  const setWork = (i, k, v) => setF({ ...f, work_history: f.work_history.map((w, j) => (j === i ? { ...w, [k]: v } : w)) });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const data = { ...f, years_experience: f.years_experience === '' ? 0 : Number(f.years_experience), salary_expectation: f.salary_expectation === '' ? 0 : Number(f.salary_expectation), work_history: f.work_history.filter((w) => w.role || w.employer) };
    try {
      if (s.candidate) await db.CandidateProfile.update(s.candidate.id, data);
      else await db.CandidateProfile.create({ ...data, user_id: s.user.id });
      await s.reload();
      toast('Profile saved.');
      if (params.get('next')) navigate(params.get('next'));
    } catch (e2) { setError(errMsg(e2)); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHead eyebrow="Job seeker" title="Your profile">Shared only with employers you apply to. {params.get('welcome') && 'Fill this in once and apply to any job in a couple of taps.'}</PageHead>
      <form onSubmit={save} className="grid max-w-3xl gap-5 sm:grid-cols-2">
        <Field label="Full name" required><Input value={f.full_name} onChange={set('full_name')} required maxLength={120} /></Field>
        <Field label="Headline" hint="e.g. Line cook · 4 yrs high-volume brunch"><Input value={f.headline} onChange={set('headline')} maxLength={160} /></Field>
        <Field label="Contact email"><Input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={set('phone')} autoComplete="tel" /></Field>
        <Field label="Where you live"><Select value={f.location} onChange={set('location')} placeholder="Select area" options={LOCATIONS} /></Field>
        <Field label="Years of hospitality experience"><Input type="number" min="0" max="60" value={f.years_experience} onChange={set('years_experience')} /></Field>
        <Field label="About you" className="sm:col-span-2"><Textarea value={f.bio} onChange={set('bio')} rows={4} maxLength={3000} /></Field>
        <Field label="Skills" className="sm:col-span-2"><TagInput value={f.skills} onChange={set('skills')} suggestions={['Grill', 'Sauté', 'Knife skills', 'POS', 'Espresso', 'Classic cocktails', 'Wine knowledge', 'High volume', 'Cash handling', 'Inventory']} /></Field>
        <Field label="Certifications" className="sm:col-span-2"><TagInput value={f.certifications} onChange={set('certifications')} suggestions={['Smart Serve', 'Food Handler Certificate', 'First Aid / CPR', 'WHMIS']} /></Field>
        <Field label="Languages" className="sm:col-span-2"><TagInput value={f.languages} onChange={set('languages')} suggestions={['English', 'French', 'Spanish', 'Portuguese', 'Tagalog', 'Punjabi', 'Mandarin', 'Cantonese', 'Tamil', 'Arabic']} /></Field>
        <Field label="Roles you want" className="sm:col-span-2"><ChipSelect name="Roles" options={CATEGORIES} value={f.preferred_categories} onChange={set('preferred_categories')} /></Field>
        <Field label="Areas you can work" className="sm:col-span-2"><ChipSelect name="Areas" options={LOCATIONS} value={f.preferred_locations} onChange={set('preferred_locations')} /></Field>
        <Field label="Employment type"><ChipSelect name="Employment type" options={EMPLOYMENT_TYPES} value={f.availability} onChange={set('availability')} /></Field>
        <Field label="Shifts"><ChipSelect name="Shifts" options={SHIFTS} value={f.shifts} onChange={set('shifts')} /></Field>
        <Field label="Minimum pay you’re looking for"><Input type="number" min="0" step="0.5" value={f.salary_expectation} onChange={set('salary_expectation')} /></Field>
        <Field label="Per"><Select value={f.salary_period} onChange={set('salary_period')} options={[{ value: 'hour', label: 'Hour' }, { value: 'year', label: 'Year' }]} /></Field>
        <Field label="Are you legally entitled to work in Canada?" className="sm:col-span-2" hint="Employers may ask this. We never ask about citizenship, immigration status, age or other protected grounds.">
          <Select value={f.legally_entitled} onChange={set('legally_entitled')} placeholder="Choose" options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'prefer_not', label: 'Prefer not to say' }]} />
        </Field>
        <div className="sm:col-span-2">
          <div className="mb-2 flex items-center justify-between"><p className="text-[13px] font-medium">Work history</p><Button size="sm" variant="ghost" onClick={() => setF({ ...f, work_history: [...f.work_history, { ...emptyWork }] })}><Plus className="h-4 w-4" />Add role</Button></div>
          {f.work_history.length === 0 && <p className="text-sm text-muted">Add your recent hospitality jobs.</p>}
          <div className="space-y-4">{f.work_history.map((w, i) => (
            <div key={i} className="grid gap-3 border border-line bg-white p-4 sm:grid-cols-2">
              <Field label="Role"><Input value={w.role} onChange={(e) => setWork(i, 'role', e.target.value)} placeholder="Line Cook" /></Field>
              <Field label="Employer"><Input value={w.employer} onChange={(e) => setWork(i, 'employer', e.target.value)} /></Field>
              <Field label="Start (YYYY-MM)"><Input value={w.start} onChange={(e) => setWork(i, 'start', e.target.value)} placeholder="2022-05" /></Field>
              <Field label="End (YYYY-MM)"><Input value={w.end} disabled={w.current} onChange={(e) => setWork(i, 'end', e.target.value)} /></Field>
              <Checkbox checked={w.current} onChange={(v) => setWork(i, 'current', v)} label="I currently work here" />
              <div className="text-right"><Button size="sm" variant="danger" onClick={() => setF({ ...f, work_history: f.work_history.filter((_, j) => j !== i) })}><Trash2 className="h-3.5 w-3.5" />Remove</Button></div>
              <Field label="What you did" className="sm:col-span-2"><Textarea value={w.description} onChange={(e) => setWork(i, 'description', e.target.value)} rows={2} /></Field>
            </div>
          ))}</div>
        </div>
        <ErrorNote className="sm:col-span-2">{error}</ErrorNote>
        <div className="sm:col-span-2"><Button type="submit" size="lg" loading={busy}>Save profile</Button></div>
      </form>
    </>
  );
}

export function Resumes() {
  const s = useSession();
  const toast = useToast();
  const { data: rows, loading, reload } = useAsync(() => db.Resume.filter({ user_id: s.user.id }, '-created_date', 20), [s.user.id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const upload = async (file) => {
    if (!file) return;
    setError('');
    const okType = /pdf|msword|officedocument|text\/plain/.test(file.type) || /\.(pdf|docx?|txt)$/i.test(file.name);
    if (!okType) return setError('Upload a PDF, Word document or plain-text file.');
    if (file.size > 5 * 1024 * 1024) return setError('Resumes must be under 5 MB.');
    setBusy(true);
    try {
      const file_uri = await uploadPrivate(file);
      const r = await db.Resume.create({ user_id: s.user.id, file_uri, file_name: file.name.slice(0, 120), file_size: file.size, mime_type: file.type || 'application/octet-stream', is_primary: !(rows || []).length });
      if (!s.candidate?.primary_resume_id && s.candidate) await db.CandidateProfile.update(s.candidate.id, { primary_resume_id: r.id });
      const proc = await call('account', 'processResume', { resume_id: r.id }).catch(() => null);
      toast(proc?.processed ? 'Resume uploaded and prepared for AI-assisted review.' : 'Resume uploaded securely.');
      reload();
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  const open = async (r) => { try { const { url } = await call('jobs', 'resumeUrl', { resume_id: r.id }); window.open(url, '_blank', 'noopener'); } catch (e) { toast(errMsg(e), 'error'); } };
  const makePrimary = async (r) => { await Promise.all((rows || []).map((x) => db.Resume.update(x.id, { is_primary: x.id === r.id }))); if (s.candidate) await db.CandidateProfile.update(s.candidate.id, { primary_resume_id: r.id }); reload(); };
  const remove = async (r) => { if (!window.confirm(`Delete ${r.file_name}? Employers you already applied to will lose access to it.`)) return; await db.Resume.delete(r.id); reload(); };
  return (
    <>
      <PageHead eyebrow="Job seeker" title="Resumes" actions={<label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded bg-ink px-4 text-sm font-medium text-paper hover:bg-ink-3"><Upload className="h-4 w-4" />{busy ? 'Uploading…' : 'Upload resume'}<input type="file" accept=".pdf,.doc,.docx,.txt" className="sr-only" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} /></label>}>
        Stored privately. Employers get a 5-minute download link only for jobs you apply to.
      </PageHead>
      <ErrorNote className="mb-4">{error}</ErrorNote>
      {loading ? <Loading /> : !rows?.length ? <Empty icon={FileText} title="No resume yet">A resume is optional on StaffTO, but many kitchens and hotels like to see one.</Empty> : (
        <Table rows={rows} columns={[
          { key: 'file_name', label: 'File', render: (r) => <button onClick={() => open(r)} className="font-medium underline-offset-2 hover:underline">{r.file_name}</button> },
          { key: 'size', label: 'Size', render: (r) => `${Math.round((r.file_size || 0) / 1024)} KB` },
          { key: 'date', label: 'Uploaded', render: (r) => date(r.created_date) },
          { key: 'ai', label: 'AI-ready', render: (r) => (r.extracted_text ? <Badge tone="lake">Yes</Badge> : <span className="text-xs text-muted">—</span>) },
          { key: 'p', label: '', className: 'text-right', render: (r) => <div className="flex justify-end gap-1">{r.is_primary ? <Badge tone="ok">Default</Badge> : <Button size="sm" variant="ghost" onClick={() => makePrimary(r)}>Make default</Button>}<Button size="sm" variant="danger" onClick={() => remove(r)}>Delete</Button></div> },
        ]} />
      )}
    </>
  );
}

export function Applications() {
  const s = useSession();
  const toast = useToast();
  const { data: apps, loading, reload } = useAsync(() => db.JobApplication.filter({ applicant_id: s.user.id }, '-created_date', 300), [s.user.id]);
  const [confirm, setConfirm] = useState(null);
  const withdraw = async () => { try { await call('jobs', 'withdraw', { application_id: confirm.id }); toast('Application withdrawn.'); setConfirm(null); reload(); } catch (e) { toast(errMsg(e), 'error'); } };
  return (
    <>
      <PageHead eyebrow="Job seeker" title="Your applications" />
      {loading ? <Loading /> : !apps?.length ? <Empty title="No applications yet" action={<Button to="/jobs">Find a job</Button>} /> : (
        <Table rows={apps} columns={[
          { key: 'job', label: 'Job', render: (a) => <div><Link to={`/jobs/${a.job_id}`} className="font-medium hover:underline">{a.job_title}</Link><p className="text-xs text-muted">{a.employer_name}</p></div> },
          { key: 'date', label: 'Applied', render: (a) => ago(a.created_date) },
          { key: 'status', label: 'Status', render: (a) => <Badge tone={APP_STATUS[a.status]?.tone}>{APP_STATUS[a.status]?.label}</Badge> },
          { key: 'hist', label: 'Last update', render: (a) => { const h = (a.status_history || []).at(-1); return h ? <span className="text-xs text-muted">{ago(h.at)}</span> : '—'; } },
          { key: 'x', label: '', className: 'text-right', render: (a) => <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" to={`/messages?t=app:${a.id}`}>Messages</Button>{!['withdrawn', 'hired', 'rejected'].includes(a.status) && <Button size="sm" variant="danger" onClick={() => setConfirm(a)}>Withdraw</Button>}</div> },
        ]} />
      )}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Withdraw application?" footer={<><Button variant="ghost" onClick={() => setConfirm(null)}>Keep it</Button><Button variant="danger" onClick={withdraw}>Withdraw</Button></>}>
        <p className="text-sm">The employer will no longer see your resume for {confirm?.job_title}. You can apply again later while the job is open.</p>
      </Modal>
    </>
  );
}

export function SavedJobs() {
  const s = useSession();
  const { data, loading, reload } = useAsync(async () => {
    const saved = await db.SavedJob.filter({ user_id: s.user.id }, '-created_date', 300);
    const jobs = await Promise.all(saved.map((x) => db.Job.get(x.job_id).then((j) => ({ ...j, _saved: x })).catch(() => ({ id: x.job_id, title: x.job_title, employer_name: x.employer_name, status: 'removed', _saved: x }))));
    return jobs;
  }, [s.user.id]);
  return (
    <>
      <PageHead eyebrow="Job seeker" title="Saved jobs" />
      {loading ? <Loading /> : !data?.length ? <Empty title="Nothing saved yet" action={<Button to="/jobs">Browse jobs</Button>}>Tap “Save” on any listing to keep it here.</Empty> : data.map((j) => (
        j.status === 'active' ? <JobCard key={j.id} job={j} saved onSave={async () => { await db.SavedJob.delete(j._saved.id); reload(); }} /> : (
          <div key={j.id} className="flex items-center justify-between border-b border-line py-4 text-sm"><span>{j.title} · {j.employer_name} <Badge tone="muted">No longer available</Badge></span><Button size="sm" variant="ghost" onClick={async () => { await db.SavedJob.delete(j._saved.id); reload(); }}>Remove</Button></div>
        )
      ))}
    </>
  );
}

export function Settings() {
  const s = useSession();
  const toast = useToast();
  const p = s.profile || {};
  const [busy, setBusy] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [delOpen, setDelOpen] = useState(false);
  const [error, setError] = useState('');
  const update = async (patch) => { setBusy(Object.keys(patch)[0]); try { await call('account', 'updateConsents', patch); await s.reload(); toast('Saved.'); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(''); } };
  const exportData = async () => {
    setBusy('export');
    try {
      const { data } = await call('account', 'exportData');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      a.download = `staffto-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(''); }
  };
  const del = async () => {
    setBusy('delete'); setError('');
    try { await call('account', 'deleteAccount', { confirm: confirmText }); s.logout(); } catch (e) { setError(errMsg(e)); setBusy(''); }
  };
  if (!s.profile) return <Notice>Finish onboarding first. <Link to="/onboarding" className="underline">Continue</Link></Notice>;
  return (
    <>
      <PageHead eyebrow="Account" title="Settings & privacy">Signed in as {s.user.email}.</PageHead>
      <div className="max-w-2xl space-y-10">
        <section className="space-y-4">
          <h2 className="font-semibold">Email</h2>
          <Checkbox checked={p.notify_email !== false} disabled={busy === 'notify_email'} onChange={(v) => update({ notify_email: v })} label="Account notifications" hint="Application updates, messages and billing receipts." />
          <Checkbox checked={!!p.marketing_consent} disabled={busy === 'marketing_consent'} onChange={(v) => update({ marketing_consent: v })} label="Job alerts, community news and offers" hint={p.marketing_consent_at ? `Consent recorded ${date(p.marketing_consent_at)}. Withdraw any time.` : 'Optional. We only send marketing email with your express consent (CASL).'} />
        </section>
        {s.isSeeker && (
          <section className="space-y-3">
            <h2 className="font-semibold">AI processing</h2>
            <Checkbox checked={!!p.ai_processing_consent} disabled={busy === 'ai_processing_consent'} onChange={(v) => update({ ai_processing_consent: v })} label="Prepare my resumes for AI-assisted review" hint="Lets StaffTO extract text from resumes you upload so employers you apply to (and opt in for) can get an AI summary. Turning this off deletes the extracted text." />
            <p className="text-xs text-muted">You also choose per application whether AI review is allowed. <Link to="/legal/ai" className="underline">How we use AI</Link></p>
          </section>
        )}
        <section className="space-y-3">
          <h2 className="font-semibold">Your data</h2>
          <p className="text-sm text-muted">Under Canada’s privacy law (PIPEDA) you can access and correct your personal information, or ask us to delete it.</p>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={exportData} loading={busy === 'export'}>Download my data</Button><Button variant="danger" onClick={() => setDelOpen(true)}>Delete my account</Button></div>
          <p className="text-xs text-muted">Referral code: <span className="font-mono">{p.referral_code}</span> — share <span className="font-mono">{window.location.origin}/?ref={p.referral_code}</span></p>
        </section>
      </div>
      <Modal open={delOpen} onClose={() => setDelOpen(false)} title="Delete your account" footer={<><Button variant="ghost" onClick={() => setDelOpen(false)}>Cancel</Button><Button variant="danger" onClick={del} loading={busy === 'delete'} disabled={confirmText !== 'DELETE'}>Delete permanently</Button></>}>
        <div className="space-y-3 text-sm">
          <p>This deletes your profile, resumes, saved jobs, notifications, referral code and classified listings, and anonymises your applications and messages. Employer accounts’ jobs are closed.</p>
          <p className="text-muted">Payment records are kept in anonymised form for 6 years because Canadian tax law requires it.</p>
          <Field label="Type DELETE to confirm"><Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} /></Field>
          <ErrorNote>{error}</ErrorNote>
        </div>
      </Modal>
    </>
  );
}

export function Testimonial() {
  const s = useSession();
  const toast = useToast();
  const [f, setF] = useState({ quote: '', rating: '5', author_name: s.candidate?.full_name || s.profile?.full_name || '', author_role: '', business_name: s.employer?.business_name || '', consent_to_publish: false });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const submit = async (e) => { e.preventDefault(); setError(''); try { await call('marketplace', 'submitTestimonial', f); setDone(true); toast('Thank you! We’ll review it before publishing.'); } catch (e2) { setError(errMsg(e2)); } };
  if (!s.profile) return <Notice>Finish onboarding first.</Notice>;
  return (
    <>
      <PageHead eyebrow="Community" title="Share your experience">Testimonials are reviewed before they appear on StaffTO. We publish only what you approve.</PageHead>
      {done ? <Notice>Received — thanks for helping Toronto hospitality find each other.</Notice> : (
        <form onSubmit={submit} className="max-w-xl space-y-4">
          <Field label="Your testimonial" required><Textarea value={f.quote} onChange={(e) => setF({ ...f, quote: e.target.value })} rows={4} maxLength={800} minLength={20} required /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name to display"><Input value={f.author_name} onChange={(e) => setF({ ...f, author_name: e.target.value })} /></Field>
            <Field label="Your role"><Input value={f.author_role} onChange={(e) => setF({ ...f, author_role: e.target.value })} placeholder="Sous Chef / Owner" /></Field>
            <Field label="Business (optional)"><Input value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} /></Field>
            <Field label="Rating"><Select value={f.rating} onChange={(e) => setF({ ...f, rating: e.target.value })} options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: '★'.repeat(n) }))} /></Field>
          </div>
          <Checkbox checked={f.consent_to_publish} onChange={(v) => setF({ ...f, consent_to_publish: v })} label="StaffTO may publish this testimonial with the name and role above." />
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit">Submit</Button>
        </form>
      )}
    </>
  );
}
