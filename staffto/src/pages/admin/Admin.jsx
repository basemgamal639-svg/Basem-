import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { DashboardShell } from '@/components/Layout';
import { Badge, Button, Checkbox, Empty, ErrorNote, Field, Input, Loading, Modal, Notice, PageHead, Select, Stat, Table, Tabs, Textarea, useToast } from '@/components/ui';
import { call, db, errMsg } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useSeo } from '@/lib/seo';
import { useSession } from '@/lib/session';
import { JOB_STATUS, label } from '@/lib/constants';
import { ago, date, jobPath, money, number, pct } from '@/lib/format';
import { announcement } from '@/components/jobs';

export function AdminLayout() {
  useSeo({ title: 'Admin', noindex: true });
  return (
    <DashboardShell title="Administration" nav={[
      ['/admin', 'Overview', true], ['/admin/users', 'Users'], ['/admin/employers', 'Employers'], ['/admin/jobs', 'Jobs'], ['/admin/classifieds', 'Classifieds'],
      ['/admin/reports', 'Reports'], ['/admin/testimonials', 'Testimonials'], ['/admin/campaigns', 'Community campaigns'], ['/admin/content', 'Content'],
      ['/admin/promos', 'Promo codes'], ['/admin/payments', 'Payments'], ['/admin/inbox', 'Contact inbox'], ['/admin/settings', 'Settings'], ['/admin/audit', 'Audit log'],
    ]}><Outlet /></DashboardShell>
  );
}

function useAction() {
  const toast = useToast();
  return async (fnAction, payload, okMsg, after) => {
    try { await call('admin', fnAction, payload); toast(okMsg); after?.(); } catch (e) { toast(errMsg(e), 'error'); }
  };
}

function Bars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return <ul className="space-y-1.5">{rows.map((r) => <li key={r.key} className="grid grid-cols-[140px_1fr_40px] items-center gap-2 text-sm"><span className="truncate">{r.label}</span><span className="h-2 bg-paper-3"><span className="block h-full bg-ink" style={{ width: `${(r.count / max) * 100}%` }} /></span><span className="text-right font-mono text-xs tabular-nums">{r.count}</span></li>)}{!rows.length && <li className="text-sm text-muted">No data yet.</li>}</ul>;
}

export function AdminOverview() {
  const [days, setDays] = useState('30');
  const { data: d, loading, error } = useAsync(() => call('admin', 'overview', { days: Number(days) }), [days]);
  if (loading) return <Loading />;
  if (error) return <ErrorNote>{error}</ErrorNote>;
  const t = d.totals;
  return (
    <>
      <PageHead eyebrow="Admin" title="Platform overview" actions={<Select value={days} onChange={(e) => setDays(e.target.value)} className="w-auto" options={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }]} />}>All numbers are live counts from the database.</PageHead>
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        <Stat label="Total users" value={number(t.users)} sub={`${t.seekers} seekers · ${t.admins} admins`} />
        <Stat label="Employers" value={number(t.employers)} sub={`${t.verified_employers} verified · ${t.pending_verifications} pending`} />
        <Stat label="Active jobs" value={number(t.active_jobs)} sub={`${t.total_jobs} all-time`} />
        <Stat label="Applications" value={number(t.applications)} sub={`${t.hires} hires`} />
        <Stat label="Revenue (ex. HST)" value={money(t.revenue_cents)} sub={`${money(t.revenue_window_cents)} in window`} />
        <Stat label="Open reports" value={t.open_reports} sub={<Link to="/admin/reports" className="underline">Review</Link>} />
        <Stat label="Classifieds in review" value={t.pending_classifieds} sub={<Link to="/admin/classifieds" className="underline">Moderate</Link>} />
        <Stat label="Marketing opt-ins" value={number(t.marketing_opt_ins)} sub="CASL express consent" />
      </div>
      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        <section><h2 className="mb-4 font-semibold">Traffic & conversion ({d.window_days}d)</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {[['Sessions (consented)', d.traffic.sessions], ['Page views', d.traffic.page_views], ['Job views', d.traffic.job_views], ['Apply clicks', d.traffic.apply_clicks], ['Applications', d.traffic.applications], ['View → application', pct(d.traffic.view_to_application_rate)], ['Seeker sign-ups', d.traffic.signups], ['Employer sign-ups', d.traffic.employer_signups], ['Jobs published', d.traffic.jobs_published], ['Employer conversion', pct(d.traffic.employer_conversion_rate)], ['Shares', d.traffic.shares], ['Checkouts started', d.traffic.checkouts]].map(([k, v]) => <div key={k} className="flex justify-between border-b border-line pb-2"><dt className="text-muted">{k}</dt><dd className="font-mono tabular-nums">{typeof v === 'number' ? number(v) : v}</dd></div>)}
          </dl>
        </section>
        <section><h2 className="mb-4 font-semibold">Facebook referral traffic</h2>
          <div className="grid grid-cols-2 gap-6"><Stat label="Visits" value={d.facebook.visits} /><Stat label="Job views" value={d.facebook.job_views} /><Stat label="Applications" value={d.facebook.applications} /><Stat label="Sign-ups" value={d.facebook.signups} /></div>
          <h3 className="mb-2 mt-8 text-sm font-semibold">Top sources</h3><Bars rows={d.top_sources} />
        </section>
        <section><h2 className="mb-4 font-semibold">Popular categories (all jobs)</h2><Bars rows={d.popular_categories} /></section>
        <section><h2 className="mb-4 font-semibold">Popular locations</h2><Bars rows={d.popular_locations} /></section>
        <section><h2 className="mb-4 font-semibold">Subscriptions</h2><Bars rows={d.subscriptions} /><h3 className="mb-2 mt-6 text-sm font-semibold">Employer plans</h3><Bars rows={d.plans} /></section>
        <section><h2 className="mb-4 font-semibold">Most viewed jobs</h2>
          <Table rows={d.top_jobs} columns={[{ key: 'title', label: 'Job', render: (j) => <Link to={jobPath(j)} className="hover:underline">{j.title}</Link> }, { key: 'v', label: 'Views', render: (j) => j.views || 0 }, { key: 'a', label: 'Apps', render: (j) => j.applications_count || 0 }]} />
        </section>
      </div>
    </>
  );
}

export function AdminUsers() {
  const { user } = useSession();
  const act = useAction();
  const [q, setQ] = useState('');
  const { data, loading, reload } = useAsync(() => call('admin', 'listUsers', { q }), [q]);
  return (
    <>
      <PageHead eyebrow="Admin" title="Users" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email or name" className="mb-4 max-w-sm" />
      {loading ? <Loading /> : (
        <Table rows={data.users} columns={[
          { key: 'email', label: 'User', render: (u) => <div><p className="font-medium">{u.full_name || '—'}</p><p className="text-xs text-muted">{u.email}</p></div> },
          { key: 'type', label: 'Type', render: (u) => u.account_type || <span className="text-muted">no profile</span> },
          { key: 'role', label: 'Role', render: (u) => <Badge tone={u.role === 'admin' ? 'dark' : 'neutral'}>{u.role}</Badge> },
          { key: 'joined', label: 'Joined', render: (u) => date(u.created_date) },
          { key: 'state', label: 'State', render: (u) => (u.suspended ? <Badge tone="signal">Suspended</Badge> : <Badge tone="ok">Active</Badge>) },
          { key: 'x', label: '', className: 'text-right', render: (u) => u.id === user.id ? <span className="text-xs text-muted">You</span> : (
            <div className="flex justify-end gap-1">
              {u.profile_id && <Button size="sm" variant={u.suspended ? 'outline' : 'danger'} onClick={() => { const reason = u.suspended ? '' : window.prompt('Reason for suspension (logged):'); if (u.suspended || reason !== null) act('setUserSuspended', { user_id: u.id, suspended: !u.suspended, reason }, u.suspended ? 'Reinstated.' : 'Suspended.', reload); }}>{u.suspended ? 'Reinstate' : 'Suspend'}</Button>}
              <Button size="sm" variant="ghost" onClick={() => window.confirm(`${u.role === 'admin' ? 'Remove admin from' : 'Make admin:'} ${u.email}?`) && act('setUserRole', { user_id: u.id, role: u.role === 'admin' ? 'user' : 'admin' }, 'Role updated.', reload)}>{u.role === 'admin' ? 'Remove admin' : 'Make admin'}</Button>
            </div>
          ) },
        ]} />
      )}
    </>
  );
}

function GrantModal({ employer, onClose, onDone }) {
  const act = useAction();
  const [f, setF] = useState({ plan: '', months: '1', job_credits: '0', featured_credits: '0', note: '' });
  return (
    <Modal open onClose={onClose} title={`Grant plan / credits — ${employer.business_name}`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => act('grantPlan', { employer_id: employer.id, ...f }, 'Granted.', () => { onDone(); onClose(); })}>Grant</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Plan"><Select value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })} placeholder="Keep current" options={['free', 'single', 'pro', 'premium'].map((v) => ({ value: v, label: v }))} /></Field>
        <Field label="Months (Pro/Premium)"><Input type="number" min="1" max="24" value={f.months} onChange={(e) => setF({ ...f, months: e.target.value })} /></Field>
        <Field label="+ Job credits"><Input type="number" min="0" value={f.job_credits} onChange={(e) => setF({ ...f, job_credits: e.target.value })} /></Field>
        <Field label="+ Featured credits"><Input type="number" min="0" value={f.featured_credits} onChange={(e) => setF({ ...f, featured_credits: e.target.value })} /></Field>
        <Field label="Internal note (audit log)" className="sm:col-span-2"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Paid by e-transfer INV-…" /></Field>
      </div>
    </Modal>
  );
}

export function AdminEmployers() {
  const act = useAction();
  const [tab, setTab] = useState('pending');
  const [grant, setGrant] = useState(null);
  const { data, loading, reload } = useAsync(() => db.Employer.list('-created_date', 1000), []);
  const rows = (data || []).filter((e) => (tab === 'pending' ? e.verification_requested && !e.verified : tab === 'verified' ? e.verified : true));
  return (
    <>
      <PageHead eyebrow="Admin" title="Employers" />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: 'pending', label: 'Verification requests', count: (data || []).filter((e) => e.verification_requested && !e.verified).length }, { value: 'verified', label: 'Verified' }, { value: 'all', label: 'All', count: data?.length }]} />
      {loading ? <Loading /> : (
        <Table rows={rows} columns={[
          { key: 'n', label: 'Business', render: (e) => <div><p className="font-medium">{e.business_name}</p><p className="text-xs text-muted">{label(e.business_type)} · {label(e.location)} · {e.employee_count_band || '?'} staff</p></div> },
          { key: 'c', label: 'Contact', render: (e) => <div className="text-xs"><p>{e.contact_name}</p><p className="text-muted">{e.contact_email} {e.phone}</p>{e.website && <a href={e.website} target="_blank" rel="noopener noreferrer" className="underline">{e.website}</a>}</div> },
          { key: 'p', label: 'Plan', render: (e) => <span className="capitalize">{e.plan}</span> },
          { key: 's', label: 'Status', render: (e) => <div className="space-y-1">{e.verified ? <Badge tone="lake">Verified</Badge> : <Badge>Unverified</Badge>}{e.status === 'suspended' && <Badge tone="signal">Suspended</Badge>}</div> },
          { key: 'x', label: '', className: 'text-right', render: (e) => (
            <div className="flex flex-wrap justify-end gap-1">
              {!e.verified ? <Button size="sm" onClick={() => act('verifyEmployer', { employer_id: e.id, verified: true }, 'Verified.', reload)}>Verify</Button> : <Button size="sm" variant="ghost" onClick={() => act('verifyEmployer', { employer_id: e.id, verified: false, note: window.prompt('Note to employer') || '' }, 'Unverified.', reload)}>Unverify</Button>}
              {e.verification_requested && !e.verified && <Button size="sm" variant="ghost" onClick={() => act('verifyEmployer', { employer_id: e.id, verified: false, note: window.prompt('What do they need to provide?') || '' }, 'Declined with note.', reload)}>Decline</Button>}
              <Button size="sm" variant="ghost" onClick={() => setGrant(e)}>Grant</Button>
              <Button size="sm" variant={e.status === 'suspended' ? 'outline' : 'danger'} onClick={() => window.confirm('Change employer status?') && act('setEmployerStatus', { employer_id: e.id, status: e.status === 'suspended' ? 'active' : 'suspended' }, 'Updated.', reload)}>{e.status === 'suspended' ? 'Reinstate' : 'Suspend'}</Button>
            </div>
          ) },
        ]} />
      )}
      {grant && <GrantModal employer={grant} onClose={() => setGrant(null)} onDone={reload} />}
    </>
  );
}

export function AdminJobs() {
  const act = useAction();
  const [tab, setTab] = useState('active');
  const [q, setQ] = useState('');
  const { data, loading, reload } = useAsync(() => db.Job.list('-created_date', 2000), []);
  const rows = (data || []).filter((j) => (tab === 'all' || j.status === tab) && (!q || `${j.title} ${j.employer_name}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <PageHead eyebrow="Admin" title="Job moderation" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><Tabs value={tab} onChange={setTab} tabs={['active', 'draft', 'removed', 'closed', 'expired', 'all'].map((v) => ({ value: v, label: v === 'all' ? 'All' : JOB_STATUS[v].label, count: v === 'all' ? data?.length : (data || []).filter((j) => j.status === v).length }))} /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="max-w-xs" /></div>
      {loading ? <Loading /> : (
        <Table rows={rows} columns={[
          { key: 't', label: 'Job', render: (j) => <div><Link to={jobPath(j)} className="font-medium hover:underline">{j.title}</Link><p className="text-xs text-muted">{j.employer_name} · {label(j.location)} · {ago(j.created_date)}</p>{j.moderation_note && <p className="text-xs text-signal">{j.moderation_note}</p>}</div> },
          { key: 's', label: 'Status', render: (j) => <div className="space-y-1"><Badge tone={JOB_STATUS[j.status]?.tone}>{JOB_STATUS[j.status]?.label}</Badge>{j.is_featured && <Badge tone="signal">Featured</Badge>}</div> },
          { key: 'n', label: 'Views/Apps', render: (j) => `${j.views || 0}/${j.applications_count || 0}` },
          { key: 'x', label: '', className: 'text-right', render: (j) => (
            <div className="flex justify-end gap-1">
              {j.status !== 'removed' ? <Button size="sm" variant="danger" onClick={() => { const note = window.prompt('Reason shown to employer:'); if (note !== null) act('moderateJob', { job_id: j.id, op: 'remove', note }, 'Removed.', reload); }}>Remove</Button> : <Button size="sm" variant="outline" onClick={() => act('moderateJob', { job_id: j.id, op: 'restore' }, 'Restored.', reload)}>Restore</Button>}
              {j.status === 'active' && <Button size="sm" variant="ghost" onClick={() => act('moderateJob', { job_id: j.id, op: j.is_featured ? 'unfeature' : 'feature' }, 'Updated.', reload)}>{j.is_featured ? 'Unfeature' : 'Feature'}</Button>}
            </div>
          ) },
        ]} />
      )}
    </>
  );
}

export function AdminClassifieds() {
  const act = useAction();
  const [tab, setTab] = useState('pending');
  const { data, loading, reload } = useAsync(() => db.ClassifiedListing.list('-created_date', 2000), []);
  const rows = (data || []).filter((l) => tab === 'all' || l.status === tab);
  return (
    <>
      <PageHead eyebrow="Admin" title="Classified moderation" />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={['pending', 'active', 'removed', 'sold', 'all'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1), count: v === 'all' ? data?.length : (data || []).filter((l) => l.status === v).length }))} />
      {loading ? <Loading /> : (
        <Table rows={rows} columns={[
          { key: 'img', label: '', render: (l) => (l.photos?.[0] ? <img src={l.photos[0]} alt="" className="h-12 w-16 object-cover" /> : <span className="text-xs text-muted">no photo</span>) },
          { key: 't', label: 'Listing', render: (l) => <div><Link to={`/classifieds/${l.id}`} className="font-medium hover:underline">{l.title}</Link><p className="text-xs text-muted">{label(l.category)} · {l.seller_name} · {ago(l.created_date)}</p><p className="line-clamp-2 text-xs">{l.description}</p></div> },
          { key: 'r', label: 'Reports', render: (l) => (l.report_count ? <Badge tone="signal">{l.report_count}</Badge> : '0') },
          { key: 'x', label: '', className: 'text-right', render: (l) => (
            <div className="flex justify-end gap-1">
              {l.status !== 'active' && l.status !== 'sold' && <Button size="sm" onClick={() => act('moderateListing', { listing_id: l.id, op: 'approve' }, 'Approved.', reload)}>Approve</Button>}
              {l.status !== 'removed' && <Button size="sm" variant="danger" onClick={() => { const note = window.prompt('Reason shown to seller:'); if (note !== null) act('moderateListing', { listing_id: l.id, op: 'remove', note }, 'Removed.', reload); }}>Remove</Button>}
            </div>
          ) },
        ]} />
      )}
    </>
  );
}

export function AdminReports() {
  const act = useAction();
  const [tab, setTab] = useState('open');
  const { data, loading, reload } = useAsync(() => db.Report.list('-created_date', 1000), []);
  const link = (r) => (r.target_type === 'job' ? `/jobs/${r.target_id}` : r.target_type === 'classified' ? `/classifieds/${r.target_id}` : null);
  return (
    <>
      <PageHead eyebrow="Admin" title="Reported content" />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={['open', 'resolved', 'dismissed'].map((v) => ({ value: v, label: v, count: (data || []).filter((r) => r.status === v).length }))} />
      {loading ? <Loading /> : (
        <Table rows={(data || []).filter((r) => r.status === tab)} columns={[
          { key: 't', label: 'Target', render: (r) => <div><Badge>{r.target_type}</Badge> {link(r) ? <Link to={link(r)} className="underline">{r.target_title || r.target_id}</Link> : r.target_title || r.target_id}</div> },
          { key: 'r', label: 'Reason', render: (r) => <div><p>{label(r.reason) || r.reason}</p>{r.details && <p className="text-xs text-muted">{r.details}</p>}</div> },
          { key: 'd', label: 'Reported', render: (r) => ago(r.created_date) },
          { key: 'x', label: '', className: 'text-right', render: (r) => r.status === 'open' ? (
            <div className="flex justify-end gap-1">
              <Button size="sm" onClick={() => act('resolveReport', { report_id: r.id, status: 'resolved', note: window.prompt('Resolution note') || '' }, 'Resolved.', reload)}>Resolve</Button>
              <Button size="sm" variant="ghost" onClick={() => act('resolveReport', { report_id: r.id, status: 'dismissed' }, 'Dismissed.', reload)}>Dismiss</Button>
            </div>
          ) : <span className="text-xs text-muted">{r.resolution_note}</span> },
        ]} />
      )}
    </>
  );
}

export function AdminTestimonials() {
  const act = useAction();
  const { data, loading, reload } = useAsync(() => db.Review.list('-created_date', 500), []);
  return (
    <>
      <PageHead eyebrow="Admin" title="Testimonials">Only approved testimonials with publication consent appear on the site.</PageHead>
      {loading ? <Loading /> : (
        <Table rows={data || []} columns={[
          { key: 'q', label: 'Testimonial', render: (r) => <div><p>“{r.quote}”</p><p className="text-xs text-muted">{r.author_name} · {r.author_role} {r.business_name && `· ${r.business_name}`} · {'★'.repeat(r.rating || 0)}</p></div> },
          { key: 's', label: 'Status', render: (r) => <div className="space-y-1"><Badge tone={r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'signal' : 'brass'}>{r.status}</Badge>{r.featured && <Badge tone="dark">Featured</Badge>}</div> },
          { key: 'x', label: '', className: 'text-right', render: (r) => (
            <div className="flex justify-end gap-1">
              {r.status !== 'approved' && <Button size="sm" onClick={() => act('moderateReview', { review_id: r.id, status: 'approved' }, 'Approved.', reload)}>Approve</Button>}
              {r.status !== 'rejected' && <Button size="sm" variant="ghost" onClick={() => act('moderateReview', { review_id: r.id, status: 'rejected' }, 'Rejected.', reload)}>Reject</Button>}
              {r.status === 'approved' && <Button size="sm" variant="ghost" onClick={() => act('moderateReview', { review_id: r.id, featured: !r.featured }, 'Updated.', reload)}>{r.featured ? 'Unfeature' : 'Feature'}</Button>}
            </div>
          ) },
        ]} />
      )}
    </>
  );
}

function CrudModal({ title, fields, initial, onSave, onClose }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); setError(''); try { await onSave(f); onClose(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); } };
  return (
    <Modal open onClose={onClose} title={title} wide footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((fd) => (
          <Field key={fd.key} label={fd.label} className={fd.wide ? 'sm:col-span-2' : ''} hint={fd.hint}>
            {fd.type === 'textarea' ? <Textarea rows={fd.rows || 4} value={f[fd.key] ?? ''} onChange={(e) => setF({ ...f, [fd.key]: e.target.value })} />
              : fd.type === 'select' ? <Select value={f[fd.key] ?? ''} onChange={(e) => setF({ ...f, [fd.key]: e.target.value })} options={fd.options} />
                : fd.type === 'checkbox' ? <Checkbox checked={!!f[fd.key]} onChange={(v) => setF({ ...f, [fd.key]: v })} label={fd.label} />
                  : <Input type={fd.type || 'text'} value={f[fd.key] ?? ''} onChange={(e) => setF({ ...f, [fd.key]: fd.type === 'number' ? Number(e.target.value) : e.target.value })} />}
          </Field>
        ))}
      </div>
      <ErrorNote className="mt-4">{error}</ErrorNote>
      {fields.find((x) => x.key === 'post_copy') && f.job_ids && <p className="mt-2 text-xs text-muted">Tip: use “Generate copy” on the campaign list to draft posts for selected jobs.</p>}
    </Modal>
  );
}

export function AdminCampaigns() {
  const toast = useToast();
  const { settings } = useSession();
  const [edit, setEdit] = useState(null);
  const { data, loading, reload } = useAsync(async () => {
    const [campaigns, overview, jobs] = await Promise.all([db.Campaign.list('-created_date', 500), call('admin', 'overview', { days: 365 }), db.Job.filter({ status: 'active' }, '-published_at', 50)]);
    return { campaigns, perf: Object.fromEntries((overview.campaigns || []).map((c) => [c.campaign, c])), jobs };
  }, []);
  const site = settings.branding.site_url || window.location.origin;
  const generate = async (c) => {
    const jobs = data.jobs.slice(0, 5);
    const copy = [`📣 This week's Toronto hospitality jobs (${new Date().toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })})`, '', ...jobs.map((j) => announcement(j, site, 'facebook').split('\n').slice(0, 4).join(' · ') + `\n${site}/jobs/${j.id}?utm_source=facebook&utm_medium=group&utm_campaign=${c.slug}`), '', `More jobs: ${site}/jobs?utm_source=facebook&utm_medium=group&utm_campaign=${c.slug}`].join('\n\n');
    await db.Campaign.update(c.id, { post_copy: copy, job_ids: jobs.map((j) => j.id) });
    await navigator.clipboard.writeText(copy).catch(() => {});
    toast('Post copy generated and copied.');
    reload();
  };
  const fields = [
    { key: 'name', label: 'Name' }, { key: 'slug', label: 'utm_campaign', hint: 'lowercase-with-dashes; use it in every link' },
    { key: 'channel', label: 'Channel', type: 'select', options: ['facebook_group', 'facebook_page', 'instagram', 'email', 'partner', 'other'].map((v) => ({ value: v, label: v.replace('_', ' ') })) },
    { key: 'status', label: 'Status', type: 'select', options: ['planned', 'running', 'paused', 'completed'].map((v) => ({ value: v, label: v })) },
    { key: 'start_date', label: 'Start', type: 'date' }, { key: 'end_date', label: 'End', type: 'date' },
    { key: 'target_url', label: 'Landing URL', wide: true }, { key: 'post_copy', label: 'Post copy', type: 'textarea', rows: 8, wide: true }, { key: 'notes', label: 'Notes (e.g. which groups, admin permission)', type: 'textarea', wide: true },
  ];
  const save = async (f) => { const body = { ...f, slug: (f.slug || f.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-') }; if (f.id) { const { id, created_date, updated_date, created_by_id, created_by, ...rest } = body; await db.Campaign.update(id, rest); } else await db.Campaign.create(body); reload(); };
  return (
    <>
      <PageHead eyebrow="Admin" title="Community campaigns" actions={<Button onClick={() => setEdit({ channel: 'facebook_group', status: 'planned' })}>New campaign</Button>}>
        Plan posts for Facebook groups and pages. Only post in groups you administer or where the admins have agreed — StaffTO does not auto-post. Performance is measured from UTM-tagged visits.
      </PageHead>
      {loading ? <Loading /> : (
        <Table rows={data.campaigns} empty="No campaigns yet." columns={[
          { key: 'n', label: 'Campaign', render: (c) => <div><p className="font-medium">{c.name}</p><p className="font-mono text-xs text-muted">utm_campaign={c.slug}</p></div> },
          { key: 'ch', label: 'Channel', render: (c) => c.channel.replace('_', ' ') },
          { key: 's', label: 'Status', render: (c) => <Badge tone={c.status === 'running' ? 'ok' : 'neutral'}>{c.status}</Badge> },
          { key: 'p', label: 'Visits / views / apps / sign-ups', render: (c) => { const p = data.perf[c.slug] || {}; return <span className="font-mono text-xs tabular-nums">{p.page_views || 0} / {p.job_views || 0} / {p.applications || 0} / {p.signups || 0}</span>; } },
          { key: 'x', label: '', className: 'text-right', render: (c) => <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => generate(c)}>Generate copy</Button><Button size="sm" variant="ghost" onClick={() => setEdit(c)}>Edit</Button>{c.post_copy && <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(c.post_copy).then(() => toast('Copied.'))}>Copy</Button>}</div> },
        ]} />
      )}
      {edit && <CrudModal title={edit.id ? 'Edit campaign' : 'New campaign'} fields={fields} initial={edit} onSave={save} onClose={() => setEdit(null)} />}
    </>
  );
}

export function AdminContent() {
  const [edit, setEdit] = useState(null);
  const { data, loading, reload } = useAsync(() => db.Article.list('-created_date', 500), []);
  const fields = [
    { key: 'title', label: 'Title', wide: true }, { key: 'slug', label: 'URL slug', hint: '/resources/<slug>' },
    { key: 'category', label: 'Category', type: 'select', options: [['hiring_guide', 'Restaurant hiring guide'], ['job_search', 'Job search advice'], ['salary_guide', 'Salary guide'], ['industry', 'Industry article'], ['employer_tips', 'Employer recruitment tips']].map(([value, l]) => ({ value, label: l })) },
    { key: 'status', label: 'Status', type: 'select', options: [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }] }, { key: 'author_name', label: 'Author' },
    { key: 'excerpt', label: 'Excerpt', type: 'textarea', rows: 2, wide: true }, { key: 'body', label: 'Body (Markdown: ## headings, - lists, **bold**, [links](url))', type: 'textarea', rows: 16, wide: true },
    { key: 'cover_url', label: 'Cover image URL', wide: true }, { key: 'seo_title', label: 'SEO title' }, { key: 'seo_description', label: 'SEO description' },
  ];
  const save = async (f) => {
    const slug = (f.slug || f.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const body = { ...f, slug, published_at: f.status === 'published' ? (f.published_at || new Date().toISOString()) : f.published_at || '' };
    if (f.id) { const { id, created_date, updated_date, created_by_id, created_by, ...rest } = body; await db.Article.update(id, rest); } else await db.Article.create(body);
    reload();
  };
  return (
    <>
      <PageHead eyebrow="Admin" title="Content" actions={<Button onClick={() => setEdit({ status: 'draft', category: 'hiring_guide', author_name: 'StaffTO' })}>New article</Button>}>Hiring guides, job search advice, salary guides and industry articles for SEO.</PageHead>
      {loading ? <Loading /> : (
        <Table rows={data || []} empty="No articles yet." columns={[
          { key: 't', label: 'Title', render: (a) => <div><p className="font-medium">{a.title}</p><p className="font-mono text-xs text-muted">/resources/{a.slug}</p></div> },
          { key: 'c', label: 'Category', render: (a) => a.category?.replace('_', ' ') },
          { key: 's', label: 'Status', render: (a) => <Badge tone={a.status === 'published' ? 'ok' : 'neutral'}>{a.status}</Badge> },
          { key: 'x', label: '', className: 'text-right', render: (a) => <div className="flex justify-end gap-1">{a.status === 'published' && <Button size="sm" variant="ghost" to={`/resources/${a.slug}`}>View</Button>}<Button size="sm" variant="ghost" onClick={() => setEdit(a)}>Edit</Button><Button size="sm" variant="danger" onClick={async () => { if (window.confirm('Delete article?')) { await db.Article.delete(a.id); reload(); } }}>Delete</Button></div> },
        ]} />
      )}
      {edit && <CrudModal title={edit.id ? 'Edit article' : 'New article'} fields={fields} initial={edit} onSave={save} onClose={() => setEdit(null)} />}
    </>
  );
}

export function AdminPromos() {
  const [edit, setEdit] = useState(null);
  const { data, loading, reload } = useAsync(() => db.PromoCode.list('-created_date', 500), []);
  const fields = [
    { key: 'code', label: 'Code' }, { key: 'description', label: 'Internal note' },
    { key: 'discount_type', label: 'Type', type: 'select', options: [{ value: 'percent', label: 'Percent off' }, { value: 'fixed', label: 'Fixed amount (cents)' }] },
    { key: 'amount', label: 'Amount (percent, or cents)', type: 'number' }, { key: 'max_redemptions', label: 'Max redemptions (0 = unlimited)', type: 'number' },
    { key: 'valid_until', label: 'Valid until', type: 'date' }, { key: 'applies_to_text', label: 'Applies to (comma list: single_job, featured_upgrade, pro_monthly, premium_monthly — blank = all)', wide: true },
    { key: 'active', label: 'Active', type: 'checkbox' },
  ];
  const save = async (f) => {
    const { applies_to_text, id, created_date, updated_date, created_by_id, created_by, ...rest } = f;
    const body = { ...rest, code: String(f.code || '').toUpperCase().trim(), applies_to: String(applies_to_text || '').split(',').map((x) => x.trim()).filter(Boolean), valid_until: f.valid_until ? new Date(f.valid_until).toISOString() : '' };
    if (id) await db.PromoCode.update(id, body); else await db.PromoCode.create(body);
    reload();
  };
  return (
    <>
      <PageHead eyebrow="Admin" title="Promo codes" actions={<Button onClick={() => setEdit({ discount_type: 'percent', amount: 100, max_redemptions: 0, active: true })}>New code</Button>}>Validated server-side at checkout. A 100% code activates purchases without a payment provider.</PageHead>
      {loading ? <Loading /> : (
        <Table rows={data || []} empty="No promo codes." columns={[
          { key: 'c', label: 'Code', render: (p) => <span className="font-mono">{p.code}</span> },
          { key: 'd', label: 'Discount', render: (p) => (p.discount_type === 'percent' ? `${p.amount}%` : money(p.amount)) },
          { key: 'u', label: 'Used', render: (p) => `${p.redemptions || 0}${p.max_redemptions ? ` / ${p.max_redemptions}` : ''}` },
          { key: 'a', label: 'Applies to', render: (p) => (p.applies_to?.length ? p.applies_to.join(', ') : 'All') },
          { key: 'v', label: 'Valid until', render: (p) => (p.valid_until ? date(p.valid_until) : '—') },
          { key: 's', label: '', render: (p) => <Badge tone={p.active ? 'ok' : 'muted'}>{p.active ? 'Active' : 'Off'}</Badge> },
          { key: 'x', label: '', className: 'text-right', render: (p) => <Button size="sm" variant="ghost" onClick={() => setEdit({ ...p, applies_to_text: (p.applies_to || []).join(', '), valid_until: p.valid_until?.slice(0, 10) })}>Edit</Button> },
        ]} />
      )}
      {edit && <CrudModal title={edit.id ? 'Edit promo code' : 'New promo code'} fields={fields} initial={edit} onSave={save} onClose={() => setEdit(null)} />}
    </>
  );
}

export function AdminPayments() {
  const { data, loading } = useAsync(() => Promise.all([db.Payment.list('-created_date', 2000), db.Subscription.list('-created_date', 2000)]), []);
  if (loading) return <Loading />;
  const [payments, subs] = data;
  return (
    <>
      <PageHead eyebrow="Admin" title="Payments & subscriptions" />
      <h2 className="mb-2 font-semibold">Subscriptions</h2>
      <Table rows={subs} empty="No subscriptions." columns={[{ key: 'p', label: 'Plan', render: (s) => s.plan }, { key: 's', label: 'Status', render: (s) => <Badge tone={s.status === 'active' ? 'ok' : 'muted'}>{s.status}</Badge> }, { key: 'pr', label: 'Provider', render: (s) => s.provider }, { key: 'e', label: 'Period end', render: (s) => date(s.current_period_end) }, { key: 'c', label: 'Cancels', render: (s) => (s.cancel_at_period_end ? 'Yes' : 'No') }]} />
      <h2 className="mb-2 mt-10 font-semibold">Payments</h2>
      <Table rows={payments} empty="No payments." columns={[{ key: 'i', label: 'Invoice', render: (p) => <span className="font-mono text-xs">{p.invoice_number}</span> }, { key: 'e', label: 'Employer', render: (p) => p.employer_name }, { key: 'd', label: 'Item', render: (p) => p.description }, { key: 't', label: 'Total', render: (p) => money(p.total_cents) }, { key: 'pr', label: 'Provider', render: (p) => p.provider }, { key: 's', label: 'Status', render: (p) => <Badge tone={p.status === 'paid' ? 'ok' : 'muted'}>{p.status}</Badge> }, { key: 'dt', label: 'Date', render: (p) => date(p.paid_at || p.created_date) }]} />
    </>
  );
}

export function AdminInbox() {
  const { data, loading, reload } = useAsync(() => db.ContactMessage.list('-created_date', 500), []);
  return (
    <>
      <PageHead eyebrow="Admin" title="Contact inbox" />
      {loading ? <Loading /> : (
        <Table rows={data || []} empty="No messages." columns={[
          { key: 'f', label: 'From', render: (m) => <div><p className="font-medium">{m.name}</p><a href={`mailto:${m.email}`} className="text-xs underline">{m.email}</a></div> },
          { key: 't', label: 'Topic', render: (m) => m.topic },
          { key: 'm', label: 'Message', render: (m) => <p className="max-w-md whitespace-pre-line text-sm">{m.message}</p> },
          { key: 'd', label: 'Received', render: (m) => ago(m.created_date) },
          { key: 's', label: '', className: 'text-right', render: (m) => (m.status === 'new' ? <Button size="sm" variant="ghost" onClick={async () => { await db.ContactMessage.update(m.id, { status: 'handled' }); reload(); }}>Mark handled</Button> : <Badge tone="muted">Handled</Badge>) },
        ]} />
      )}
    </>
  );
}

function JsonSetting({ k, title, help, defaults }) {
  const toast = useToast();
  const { data, loading, reload } = useAsync(() => db.PlatformSetting.filter({ key: k }, '-updated_date', 1), [k]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const { reloadSettings } = useSession();
  useEffect(() => { if (!loading) setText(JSON.stringify(data?.[0]?.value || defaults || {}, null, 2)); }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    setError('');
    let value;
    try { value = JSON.parse(text); } catch { return setError('Invalid JSON.'); }
    try { await call('admin', 'saveSetting', { key: k, value }); toast('Saved and logged.'); reload(); reloadSettings(); } catch (e) { setError(errMsg(e)); }
  };
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">{title}</h2>
      <p className="text-sm text-muted">{help}</p>
      {loading ? <Loading /> : <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(24, Math.max(6, text.split('\n').length + 1))} className="font-mono text-[12.5px]" spellCheck={false} />}
      <ErrorNote>{error}</ErrorNote>
      <Button size="sm" onClick={save}>Save {title.toLowerCase()}</Button>
    </section>
  );
}

export function AdminSettings() {
  const [tab, setTab] = useState('pricing');
  const { data: pricing } = useAsync(() => call('admin', 'effectivePricing'), []);
  return (
    <>
      <PageHead eyebrow="Admin" title="Platform settings">Changes take effect immediately and are recorded in the audit log.</PageHead>
      <Tabs className="mb-6" value={tab} onChange={setTab} tabs={[{ value: 'pricing', label: 'Pricing & plans' }, { value: 'payments', label: 'Payments' }, { value: 'branding', label: 'Branding' }, { value: 'community', label: 'Community' }, { value: 'seo', label: 'SEO' }, { value: 'classifieds', label: 'Classifieds' }]} />
      {tab === 'pricing' && pricing && <JsonSetting k="pricing" title="Pricing" help="Products (price_cents before HST), plan limits (active_jobs, featured_per_month, job_duration_days, ai_screening, analytics, multi_location). Only include what you want to override — anything omitted uses defaults." defaults={pricing.pricing} />}
      {tab === 'payments' && (
        <div className="space-y-6">
          <Notice tone="brass">Live payments stay off until: (1) STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set as Base44 secrets, (2) the Stripe webhook points to the stripeWebhook function, (3) you test in Stripe test mode, then set enabled: true here.</Notice>
          <JsonSetting k="payments" title="Payments" help='{"enabled": false, "provider": "stripe", "mode": "test"}' defaults={{ enabled: false, provider: 'stripe', mode: 'test' }} />
        </div>
      )}
      {tab === 'branding' && <JsonSetting k="branding" title="Branding" help="name, wordmark [two parts], tagline, site_url, support_email, privacy_email, legal_name, address, hst_number." defaults={{ name: 'StaffTO', wordmark: ['Staff', 'TO'], tagline: "The hospitality job community connecting Toronto's restaurants with the people who make them work.", site_url: 'https://staffto.ca', support_email: 'hello@staffto.ca', privacy_email: 'privacy@staffto.ca', legal_name: '', address: 'Toronto, Ontario', hst_number: '' }} />}
      {tab === 'community' && <JsonSetting k="community" title="Community" help="facebook_group_url (your own group), facebook_page_url, instagram_url, guidelines_extra. Leave the group URL empty until your group exists." defaults={{ facebook_group_url: '', facebook_page_url: '', instagram_url: '' }} />}
      {tab === 'seo' && <JsonSetting k="seo" title="SEO" help="Optional overrides per landing page slug: { pages: { 'cook-jobs-toronto': { title, description, intro } } }. Sitemap: /sitemap.xml (static) + site function ?action=sitemap (dynamic jobs)." defaults={{ pages: {} }} />}
      {tab === 'classifieds' && <JsonSetting k="classifieds" title="Classifieds" help='{"require_approval": true} — when true every new or edited listing waits for moderation.' defaults={{ require_approval: true }} />}
    </>
  );
}

export function AdminAudit() {
  const { data, loading } = useAsync(() => db.AuditLog.list('-created_date', 1000), []);
  const [open, setOpen] = useState(null);
  return (
    <>
      <PageHead eyebrow="Admin" title="Audit log">Sensitive administrative actions. Entries are written server-side and can’t be edited from the app.</PageHead>
      {loading ? <Loading /> : (
        <Table rows={data || []} empty="No admin actions yet." columns={[
          { key: 'w', label: 'When', render: (a) => <span className="whitespace-nowrap text-xs">{new Date(a.created_date).toLocaleString('en-CA')}</span> },
          { key: 'a', label: 'Admin', render: (a) => a.actor_email },
          { key: 'x', label: 'Action', render: (a) => <span className="font-mono text-xs">{a.action}</span> },
          { key: 't', label: 'Target', render: (a) => <span className="text-xs">{a.target_type} {a.target_id?.slice(0, 10)}</span> },
          { key: 'd', label: '', className: 'text-right', render: (a) => <Button size="sm" variant="ghost" onClick={() => setOpen(a)}>Details</Button> },
        ]} />
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title="Audit entry" wide><pre className="overflow-x-auto bg-paper-2 p-3 text-xs">{JSON.stringify(open, null, 2)}</pre></Modal>
    </>
  );
}

