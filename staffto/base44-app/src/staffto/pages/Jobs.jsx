import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, X } from 'lucide-react';
import { Button, ChipSelect, Empty, Eyebrow, Field, Input, Loading, Select, useToast } from '@/staffto/components/ui';
import { JobCard } from '@/staffto/components/jobs';
import { db, errMsg } from '@/staffto/lib/api';
import { useAsync, useDebounced } from '@/staffto/lib/hooks';
import { useSeo } from '@/staffto/lib/seo';
import { useSession } from '@/staffto/lib/session';
import { CATEGORIES, EMPLOYMENT_TYPES, LOCATIONS, label } from '@/staffto/lib/constants';
import { SEO_PAGES } from '@/staffto/pages/seoPages';

const LANGUAGES = ['English', 'French', 'Spanish', 'Portuguese', 'Tagalog', 'Punjabi', 'Mandarin', 'Cantonese', 'Tamil', 'Italian', 'Korean', 'Arabic'];
const hourly = (j) => (j.salary_period === 'year' ? (j.salary_max || j.salary_min) / 2080 : (j.salary_max || j.salary_min));

export function filterJobs(jobs, f) {
  const q = (f.q || '').toLowerCase().trim();
  let out = jobs.filter((j) => {
    if (f.categories?.length && !f.categories.includes(j.category)) return false;
    if (f.locations?.length && !f.locations.includes(j.location)) return false;
    if (f.types?.length && !f.types.includes(j.employment_type)) return false;
    if (f.min_pay && hourly(j) < Number(f.min_pay)) return false;
    if (f.language && !(j.languages || []).some((l) => l.toLowerCase() === f.language.toLowerCase())) return false;
    if (q && !`${j.title} ${j.employer_name} ${label(j.category)} ${(j.skills || []).join(' ')} ${j.description || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const sort = f.sort || 'recent';
  out = [...out].sort((a, b) => {
    if (sort === 'pay') return hourly(b) - hourly(a);
    const feat = Number(!!b.is_featured) - Number(!!a.is_featured);
    return feat || String(b.published_at || b.created_date).localeCompare(String(a.published_at || a.created_date));
  });
  return out;
}

function useSavedJobs() {
  const { user } = useSession();
  const toast = useToast();
  const { data: saved, setData } = useAsync(() => (user ? db.SavedJob.filter({ user_id: user.id }, '-created_date', 500) : Promise.resolve([])), [user?.id]);
  const ids = new Set((saved || []).map((s) => s.job_id));
  const toggle = async (job) => {
    if (!user) { toast('Sign in to save jobs.', 'error'); return; }
    try {
      const existing = (saved || []).find((s) => s.job_id === job.id);
      if (existing) { await db.SavedJob.delete(existing.id); setData((x) => x.filter((s) => s.id !== existing.id)); toast('Removed from saved jobs.'); }
      else { const row = await db.SavedJob.create({ user_id: user.id, job_id: job.id, job_title: job.title, employer_name: job.employer_name }); setData((x) => [row, ...(x || [])]); toast('Saved. Find it in your dashboard.'); }
    } catch (e) { toast(errMsg(e), 'error'); }
  };
  return { ids, toggle };
}

export function JobBoard({ preset = {}, heading, intro, seo }) {
  const [params, setParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const list = (k) => (params.get(k) ? params.get(k).split(',') : []);
  const f = {
    q: params.get('q') || '',
    categories: list('category').length ? list('category') : preset.categories || [],
    locations: list('location').length ? list('location') : preset.locations || [],
    types: list('type'),
    min_pay: params.get('min_pay') || '',
    language: params.get('language') || '',
    sort: params.get('sort') || 'recent',
  };
  const [q, setQ] = useState(f.q);
  const dq = useDebounced(q, 250);
  const set = (k, v) => {
    const next = new URLSearchParams(params);
    const val = Array.isArray(v) ? v.join(',') : v;
    if (val) next.set(k, val); else next.delete(k);
    setParams(next, { replace: true });
  };
  useEffect(() => { if (dq !== f.q) set('q', dq); }, [dq]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: jobs, loading, error } = useAsync(() => db.Job.filter({ status: 'active' }, '-published_at', 1000), []);
  const results = useMemo(() => filterJobs(jobs || [], { ...f, q: dq }), [jobs, params.toString(), dq]);
  const { ids, toggle } = useSavedJobs();
  const active = f.categories.length + f.locations.length + f.types.length + (f.min_pay ? 1 : 0) + (f.language ? 1 : 0);

  useSeo(seo || {
    title: f.categories.length === 1 ? `${label(f.categories[0])} Jobs in ${f.locations.length === 1 ? label(f.locations[0]) : 'Toronto'}` : f.locations.length === 1 ? `Hospitality Jobs in ${label(f.locations[0])}` : 'Hospitality Jobs in Toronto & the GTA',
    description: 'Search restaurant, bar, café, hotel and catering jobs across Toronto and the GTA. Filter by role, area, pay and schedule. Pay shown on every listing.',
    path: '/jobs',
  });

  const filters = (
    <div className="space-y-6">
      <Field label="Role"><ChipSelect name="Role" options={CATEGORIES} value={f.categories} onChange={(v) => set('category', v)} /></Field>
      <Field label="Area"><ChipSelect name="Area" options={LOCATIONS} value={f.locations} onChange={(v) => set('location', v)} /></Field>
      <Field label="Employment type"><ChipSelect name="Employment type" options={EMPLOYMENT_TYPES} value={f.types} onChange={(v) => set('type', v)} /></Field>
      <Field label="Minimum pay (hourly equivalent)">
        <Select value={f.min_pay} onChange={(e) => set('min_pay', e.target.value)} placeholder="Any pay" options={[18, 20, 22, 25, 30, 35].map((v) => ({ value: String(v), label: `$${v}+/hr` }))} />
      </Field>
      <Field label="Working language">
        <Select value={f.language} onChange={(e) => set('language', e.target.value)} placeholder="Any language" options={LANGUAGES.map((l) => ({ value: l, label: l }))} />
      </Field>
      {active > 0 && <Button variant="link" onClick={() => setParams(new URLSearchParams(f.q ? { q: f.q } : {}))}>Clear filters</Button>}
    </div>
  );

  return (
    <div className="mx-auto max-w-page px-4 py-10 sm:px-6 lg:py-14">
      <div className="mb-8 border-b border-line pb-8">
        <Eyebrow className="mb-2">{results.length} open {results.length === 1 ? 'role' : 'roles'}</Eyebrow>
        <h1 className="font-display text-5xl leading-none tracking-tight sm:text-6xl">{heading || 'Find hospitality jobs in Toronto'}</h1>
        {intro && <div className="mt-4 max-w-3xl text-[16px] leading-relaxed text-muted">{intro}</div>}
        <div className="mt-6 flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, employer or skill" className="h-12 max-w-xl text-[16px]" aria-label="Search jobs" />
          <Button variant="outline" size="lg" className="lg:hidden" onClick={() => setShowFilters(true)}><SlidersHorizontal className="h-4 w-4" />Filters{active ? ` (${active})` : ''}</Button>
        </div>
      </div>
      <div className="grid gap-10 lg:grid-cols-[280px_1fr]">
        <aside className="hidden lg:block">{filters}</aside>
        {showFilters && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-paper p-5 lg:hidden">
            <div className="mb-5 flex items-center justify-between"><p className="font-semibold">Filters</p><button onClick={() => setShowFilters(false)} aria-label="Close filters"><X className="h-5 w-5" /></button></div>
            {filters}
            <Button className="mt-8 w-full" onClick={() => setShowFilters(false)}>Show {results.length} jobs</Button>
          </div>
        )}
        <div>
          <div className="mb-3 flex items-center justify-end gap-2 text-sm">
            <span className="text-muted">Sort</span>
            <Select value={f.sort} onChange={(e) => set('sort', e.target.value)} className="h-8 w-auto text-[13px]" options={[{ value: 'recent', label: 'Most recent' }, { value: 'pay', label: 'Highest pay' }]} />
          </div>
          {loading ? <Loading label="Loading jobs…" /> : error ? <Empty title="Couldn't load jobs">{error}</Empty> : results.length ? (
            results.map((j) => <JobCard key={j.id} job={j} saved={ids.has(j.id)} onSave={toggle} />)
          ) : (
            <Empty title="No matching jobs right now" action={<Button to="/signup" variant="outline">Get notified about new roles</Button>}>
              Try widening the area or role. New Toronto listings are added every day.
            </Empty>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Jobs() {
  return <JobBoard />;
}

export function SeoLanding() {
  const { slug } = useParams();
  const page = SEO_PAGES[slug];
  if (!page) return <NotFoundInline />;
  return (
    <>
      <JobBoard preset={page.preset} heading={page.h1} intro={<p>{page.intro}</p>} seo={{ title: page.title, description: page.description, path: `/${slug}`, jsonLd: page.faq ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: page.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) } : undefined }} />
      <section className="border-t border-line bg-paper-2/50">
        <div className="mx-auto grid max-w-page gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl">{page.sectionTitle}</h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-ink/80">{page.body.map((p) => <p key={p.slice(0, 20)}>{p}</p>)}</div>
          </div>
          {page.faq && (
            <div>
              <h2 className="font-display text-3xl">Common questions</h2>
              <dl className="mt-4 divide-y divide-line border-y border-line">{page.faq.map(([q, a]) => <div key={q} className="py-4"><dt className="font-semibold">{q}</dt><dd className="mt-1 text-[15px] text-muted">{a}</dd></div>)}</dl>
            </div>
          )}
        </div>
        <div className="mx-auto max-w-page px-4 pb-16 sm:px-6">
          <p className="font-mono text-2xs uppercase tracking-[0.18em] text-muted">Related searches</p>
          <div className="mt-3 flex flex-wrap gap-2">{Object.entries(SEO_PAGES).filter(([s]) => s !== slug).map(([s, p]) => <Link key={s} to={`/${s}`} className="rounded-sm border border-line px-3 py-1.5 text-sm hover:border-ink">{p.h1}</Link>)}</div>
        </div>
      </section>
    </>
  );
}

function NotFoundInline() {
  return <div className="mx-auto max-w-xl px-6 py-24 text-center"><h1 className="font-display text-5xl">Page not found</h1><Button to="/jobs" className="mt-6">Browse jobs</Button></div>;
}
