import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Bot, Download, ArrowLeft, Columns3, Info } from 'lucide-react';
import { Badge, Button, Checkbox, cx, Empty, ErrorNote, Field, Loading, Modal, Notice, PageHead, Select, Tabs, Textarea, useToast } from '@/staffto/components/ui';
import { Thread } from '@/staffto/pages/Messages';
import { call, errCode, errMsg } from '@/staffto/lib/api';
import { useSession } from '@/staffto/lib/session';
import { APP_STATUS, label } from '@/staffto/lib/constants';
import { ago, initials, jobPath } from '@/staffto/lib/format';
import { useEmployerApplications } from '@/staffto/pages/employer/Employer';

const PIPELINE = ['submitted', 'viewed', 'shortlisted', 'interview', 'offered', 'hired', 'rejected', 'withdrawn'];

function ScoreBar({ score }) {
  if (score === undefined || score === null) return null;
  return (
    <span className="inline-flex items-center gap-2" title="Advisory relevance score — not a hiring decision">
      <span className="h-1.5 w-16 bg-paper-3"><span className="block h-full bg-lake" style={{ width: `${score}%` }} /></span>
      <span className="font-mono text-xs tabular-nums">{score}</span>
    </span>
  );
}

function AiPanel({ app, onAnalyzed, canAi }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { const r = await call('ai', 'analyze', { application_id: app.id }); onAnalyzed(r); toast('Analysis ready.'); }
    catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  if (!app.ai_consent) return <Notice tone="brass">This candidate didn’t opt in to AI-assisted review. Review their application yourself.</Notice>;
  if (!canAi && app.ai_score === undefined) return <Notice>AI-assisted organisation is included in Premium. <Link to="/employer/billing" className="underline">See plans</Link></Notice>;
  return (
    <div className="border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="inline-flex items-center gap-2 text-sm font-semibold"><Bot className="h-4 w-4 text-lake" />AI-assisted summary</p>
        <Button size="sm" variant="outline" onClick={run} loading={busy} disabled={!canAi}>{app.ai_score !== undefined ? 'Re-run' : 'Analyse'}</Button>
      </div>
      {app.ai_score !== undefined ? (
        <div className="space-y-4 p-4 text-sm">
          <div className="flex items-center gap-3"><span className="font-display text-4xl tabular-nums">{app.ai_score}</span><span className="text-muted">/100 job-relevance (advisory)</span></div>
          {app.ai_summary && <p className="leading-relaxed">{app.ai_summary}</p>}
          <table className="w-full text-left text-[13px]">
            <tbody>{(app.ai_breakdown?.criteria || []).map((c) => (
              <tr key={c.criterion} className="border-t border-line align-top"><td className="py-2 pr-3 font-medium">{c.criterion}</td><td className="py-2 pr-3 font-mono tabular-nums">{c.points}/{c.max}</td><td className="py-2 text-muted">{c.explanation}</td></tr>
            ))}</tbody>
          </table>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="mb-1 font-mono text-2xs uppercase tracking-wider text-ok">Matches</p><ul className="list-inside list-disc space-y-0.5">{(app.ai_matched || []).map((m) => <li key={m}>{m}</li>)}</ul></div>
            <div><p className="mb-1 font-mono text-2xs uppercase tracking-wider text-signal">Not shown</p><ul className="list-inside list-disc space-y-0.5">{(app.ai_missing || []).map((m) => <li key={m}>{m}</li>)}</ul></div>
          </div>
          <p className="flex gap-2 text-xs text-muted"><Info className="h-3.5 w-3.5 shrink-0" />Method: {app.ai_method === 'rules+llm' ? 'transparent rubric + AI summary' : 'transparent rubric'} · {ago(app.ai_generated_at)}. Advisory only — StaffTO never rejects candidates automatically. Missing items may simply not be on the profile; ask the candidate.</p>
        </div>
      ) : <p className="p-4 text-sm text-muted">Scores skills, experience, role fit, certifications, availability and location against this job, with a reason for every point.</p>}
    </div>
  );
}

function Candidate({ app, job, onChange, canAi }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState(app.employer_notes || '');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    setData(null); setNotes(app.employer_notes || '');
    call('jobs', 'candidate', { application_id: app.id }).then((d) => { setData(d); if (app.status === 'submitted') onChange({ ...app, status: 'viewed' }); }).catch((e) => setError(errMsg(e)));
  }, [app.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = async (patch, msg) => {
    setBusy(patch.status || 'save');
    try { const r = await call('jobs', 'updateApplication', { application_id: app.id, ...patch }); onChange(r.application); toast(msg); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(''); }
  };
  const p = data?.profile;
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-ink font-mono text-paper">{initials(app.applicant_name)}</div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold">{app.applicant_name}</p>
          <p className="text-sm text-muted">{p?.headline || '—'}</p>
          <p className="mt-1 text-sm">{app.applicant_email}{app.applicant_phone && ` · ${app.applicant_phone}`}</p>
        </div>
        <Badge tone={APP_STATUS[app.status]?.tone}>{APP_STATUS[app.status]?.label}</Badge>
      </div>
      {app.status !== 'withdrawn' && (
        <div className="flex flex-wrap gap-1.5">
          {['shortlisted', 'interview', 'offered', 'hired'].map((st) => <Button key={st} size="sm" variant={app.status === st ? 'primary' : 'outline'} loading={busy === st} onClick={() => update({ status: st }, `Moved to ${APP_STATUS[st].label}.`)}>{APP_STATUS[st].label}</Button>)}
          <Button size="sm" variant="danger" loading={busy === 'rejected'} onClick={() => window.confirm(`Mark ${app.applicant_name} as not selected? They’ll get a polite notification.`) && update({ status: 'rejected' }, 'Candidate notified.')}>Not selected</Button>
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>
      {!data && !error && <Loading label="Loading profile…" />}
      {data && (
        <>
          {data.resume_url && <Button href={data.resume_url} target="_blank" rel="noopener noreferrer" variant="outline" size="sm"><Download className="h-4 w-4" />Download resume ({app.resume_name})</Button>}
          {data.resume_url && <p className="-mt-4 text-xs text-muted">Secure link expires in 5 minutes. Use resumes only for this hiring process.</p>}
          {app.cover_letter && <section><p className="mb-1 font-mono text-2xs uppercase tracking-wider text-muted">Note from candidate</p><p className="whitespace-pre-line text-sm">{app.cover_letter}</p></section>}
          {app.availability_note && <section><p className="mb-1 font-mono text-2xs uppercase tracking-wider text-muted">Availability</p><p className="text-sm">{app.availability_note}</p></section>}
          {p && (
            <section className="grid gap-4 text-sm sm:grid-cols-2">
              <div><p className="font-mono text-2xs uppercase tracking-wider text-muted">Experience</p><p>{p.years_experience ?? '—'} years · {label(p.location)}</p></div>
              <div><p className="font-mono text-2xs uppercase tracking-wider text-muted">Wants</p><p>{(p.availability || []).map(label).join(', ') || '—'} · {(p.shifts || []).map(label).join(', ')}</p></div>
              <div className="sm:col-span-2"><p className="font-mono text-2xs uppercase tracking-wider text-muted">Skills & certifications</p><p>{[...(p.skills || []), ...(p.certifications || [])].join(' · ') || '—'}</p></div>
              {p.bio && <div className="sm:col-span-2"><p className="font-mono text-2xs uppercase tracking-wider text-muted">About</p><p className="whitespace-pre-line">{p.bio}</p></div>}
              {(p.work_history || []).length > 0 && (
                <div className="sm:col-span-2"><p className="mb-1 font-mono text-2xs uppercase tracking-wider text-muted">Work history</p>
                  <ul className="space-y-2">{p.work_history.map((w, i) => <li key={i}><strong>{w.role}</strong>{w.employer && ` · ${w.employer}`} <span className="text-muted">({w.start || '?'} – {w.current ? 'present' : w.end || '?'})</span>{w.description && <p className="text-muted">{w.description}</p>}</li>)}</ul>
                </div>
              )}
            </section>
          )}
        </>
      )}
      <AiPanel app={app} canAi={canAi} onAnalyzed={(r) => onChange({ ...app, ...r })} />
      <section className="space-y-2">
        <Field label="Private notes" hint="Only your team sees these. Keep notes job-related.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </Field>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" loading={busy === 'save'} onClick={() => update({ employer_notes: notes }, 'Notes saved.')}>Save notes</Button>
          <Select value={String(app.employer_rating || '')} onChange={(e) => update({ employer_rating: Number(e.target.value) }, 'Rating saved.')} className="h-8 w-auto text-[13px]" placeholder="Rate" options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: '★'.repeat(n) }))} />
        </div>
      </section>
      {app.status !== 'withdrawn' && (
        <section><p className="mb-2 text-sm font-semibold">Message {app.applicant_name.split(' ')[0]}</p><Thread threadKey={`app:${app.id}`} compact /></section>
      )}
      <p className="text-xs text-muted">Job: <Link to={jobPath(job)} className="underline">{job.title}</Link></p>
    </div>
  );
}

function Compare({ apps, onClose }) {
  const crit = ['Skills', 'Experience', 'Role fit', 'Certifications', 'Availability', 'Location'];
  return (
    <Modal open onClose={onClose} title="Compare candidates" wide>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead><tr className="border-b border-line"><th className="py-2 pr-3" />{apps.map((a) => <th key={a.id} className="py-2 pr-3 font-semibold">{a.applicant_name}</th>)}</tr></thead>
          <tbody>
            <tr className="border-b border-line"><td className="py-2 pr-3 text-muted">Status</td>{apps.map((a) => <td key={a.id} className="py-2 pr-3"><Badge tone={APP_STATUS[a.status]?.tone}>{APP_STATUS[a.status]?.label}</Badge></td>)}</tr>
            <tr className="border-b border-line"><td className="py-2 pr-3 text-muted">Advisory score</td>{apps.map((a) => <td key={a.id} className="py-2 pr-3 font-mono">{a.ai_score ?? (a.ai_consent ? 'not run' : 'no consent')}</td>)}</tr>
            {crit.map((c) => <tr key={c} className="border-b border-line"><td className="py-2 pr-3 text-muted">{c}</td>{apps.map((a) => { const x = (a.ai_breakdown?.criteria || []).find((k) => k.criterion === c); return <td key={a.id} className="py-2 pr-3 align-top">{x ? <><span className="font-mono">{x.points}/{x.max}</span><p className="text-xs text-muted">{x.explanation}</p></> : '—'}</td>; })}</tr>)}
            <tr className="border-b border-line"><td className="py-2 pr-3 text-muted">Your rating</td>{apps.map((a) => <td key={a.id} className="py-2 pr-3">{a.employer_rating ? '★'.repeat(a.employer_rating) : '—'}</td>)}</tr>
            <tr><td className="py-2 pr-3 text-muted">Applied</td>{apps.map((a) => <td key={a.id} className="py-2 pr-3">{ago(a.created_date)}</td>)}</tr>
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-muted">Scores are advisory and only exist for candidates who opted in. Use them to organise, not to decide.</p>
    </Modal>
  );
}

export default function Applicants() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const s = useSession();
  const toast = useToast();
  const { data, loading, error, setData } = useEmployerApplications(id);
  const [tab, setTab] = useState('all');
  const [sort, setSort] = useState('recent');
  const [selected, setSelected] = useState([]);
  const [comparing, setComparing] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const canAi = ['premium'].includes(s.employer?.plan) || s.isAdmin;
  const openId = params.get('open');
  const apps = data?.apps || [];
  const shown = useMemo(() => {
    let rows = tab === 'all' ? apps.filter((a) => a.status !== 'withdrawn') : apps.filter((a) => a.status === tab);
    if (sort === 'score') rows = [...rows].sort((a, b) => (b.ai_score ?? -1) - (a.ai_score ?? -1));
    if (sort === 'rating') rows = [...rows].sort((a, b) => (b.employer_rating || 0) - (a.employer_rating || 0));
    return rows;
  }, [apps, tab, sort]);
  if (loading) return <Loading />;
  if (error) return <Empty title="Couldn't load applicants">{error}</Empty>;
  const replace = (next) => setData((d) => ({ ...d, apps: d.apps.map((a) => (a.id === next.id ? { ...a, ...next } : a)) }));
  const open = apps.find((a) => a.id === openId);
  const analyseAll = async () => {
    setBulkBusy(true);
    try {
      const r = await call('ai', 'analyzeJob', { job_id: id });
      r.results.forEach((x) => replace({ id: x.application_id, ...x }));
      toast(`Analysed ${r.analysed}. ${r.skipped_without_consent} skipped (no consent or withdrawn).`);
    } catch (e) { toast(errCode(e) === 'upgrade_required' ? 'AI-assisted organisation is a Premium feature.' : errMsg(e), 'error'); } finally { setBulkBusy(false); }
  };
  const counts = Object.fromEntries(PIPELINE.map((st) => [st, apps.filter((a) => a.status === st).length]));
  return (
    <>
      <Link to="/employer/jobs" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Jobs</Link>
      <PageHead eyebrow={`${apps.length} applicants`} title={data.job.title} actions={<>
        <Button variant="outline" onClick={analyseAll} loading={bulkBusy} disabled={!canAi}><Bot className="h-4 w-4" />Analyse all (opted-in)</Button>
        <Button variant="outline" disabled={selected.length < 2} onClick={() => setComparing(true)}><Columns3 className="h-4 w-4" />Compare ({selected.length})</Button>
      </>} />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All active', count: apps.filter((a) => a.status !== 'withdrawn').length }, ...PIPELINE.map((st) => ({ value: st, label: APP_STATUS[st].label, count: counts[st] }))]} />
      <div className="mb-3 flex items-center justify-end gap-2 text-sm"><span className="text-muted">Sort</span><Select value={sort} onChange={(e) => setSort(e.target.value)} className="h-8 w-auto text-[13px]" options={[{ value: 'recent', label: 'Most recent' }, { value: 'score', label: 'Advisory score' }, { value: 'rating', label: 'Your rating' }]} /></div>
      {shown.length === 0 ? <Empty title="No applicants here yet">Share your job to reach more people. <Link to={`/employer/jobs/${id}/share`} className="underline">Open share kit</Link></Empty> : (
        <ul className="divide-y divide-line border-y border-line">
          {shown.map((a) => (
            <li key={a.id} className={cx('flex items-center gap-3 px-2 py-3', openId === a.id && 'bg-white')}>
              <Checkbox checked={selected.includes(a.id)} onChange={(v) => setSelected((x) => (v ? [...x, a.id].slice(-4) : x.filter((i) => i !== a.id)))} label={<span className="sr-only">Select {a.applicant_name}</span>} />
              <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setParams({ open: a.id })}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-paper-3 font-mono text-xs">{initials(a.applicant_name)}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{a.applicant_name}</span><span className="block text-xs text-muted">Applied {ago(a.created_date)}{a.source ? ` · via ${a.source}` : ''}{a.employer_rating ? ` · ${'★'.repeat(a.employer_rating)}` : ''}</span></span>
              </button>
              <ScoreBar score={a.ai_score} />
              <Badge tone={APP_STATUS[a.status]?.tone}>{APP_STATUS[a.status]?.label}</Badge>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!open} onClose={() => setParams({})} title="Candidate" wide>{open && <Candidate app={open} job={data.job} canAi={canAi} onChange={replace} />}</Modal>
      {comparing && <Compare apps={apps.filter((a) => selected.includes(a.id))} onClose={() => setComparing(false)} />}
    </>
  );
}
