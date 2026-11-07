import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, Facebook, Megaphone, ShieldCheck, Users } from 'lucide-react';
import { Button, Empty, ErrorNote, Eyebrow, Field, Input, Loading, Notice, PageHead, Select, Textarea } from '@/staffto/components/ui';
import { JobCard } from '@/staffto/components/jobs';
import { PlanGrid } from '@/staffto/components/PlanGrid';
import { call, db, errMsg } from '@/staffto/lib/api';
import { useAsync } from '@/staffto/lib/hooks';
import { useSeo } from '@/staffto/lib/seo';
import { useSession } from '@/staffto/lib/session';
import { date } from '@/staffto/lib/format';

export function Employers() {
  useSeo({ title: 'Hire Restaurant & Hospitality Staff in Toronto', description: 'Post restaurant and hospitality jobs in Toronto. Reach GTA cooks, servers and bartenders, share to Facebook in one click and manage applicants in one place.', path: '/employers' });
  const s = useSession();
  const cta = s.user ? (s.isEmployer ? '/employer/jobs/new' : '/onboarding?type=employer') : '/signup?type=employer';
  return (
    <>
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-page gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.3fr_1fr] lg:py-24">
          <div className="animate-rise">
            <Eyebrow className="mb-5 text-signal">For restaurants, bars, cafés, hotels & caterers</Eyebrow>
            <h1 className="font-display text-6xl leading-[0.95] tracking-tight sm:text-7xl">Find the people who keep your business running.</h1>
            <p className="mt-6 max-w-xl text-lg text-ink/75">Post a job in five minutes, share it to Toronto’s hospitality community in one click, and hire from a single inbox.</p>
            <div className="mt-8 flex flex-wrap gap-3"><Button to={cta} variant="signal" size="lg">Post a job <ArrowRight className="h-4 w-4" /></Button><Button to="/pricing" variant="outline" size="lg">See pricing</Button></div>
          </div>
          <ul className="space-y-0 self-end border-y border-line">
            {[[Megaphone, 'Built-in Facebook share kit', 'Every job gets a ready-to-post announcement and a 1080×1080 image, with tracked links.'], [Users, 'Local, hospitality-only talent', 'Cooks, servers, bartenders and managers who live and work in the GTA.'], [ShieldCheck, 'Ontario-ready postings', 'Pay ranges, vacancy status and AI disclosure fields that match Ontario’s 2026 posting rules.']].map(([Icon, t, d]) => (
              <li key={t} className="flex gap-4 border-b border-line py-5 last:border-0"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-signal" /><div><p className="font-semibold">{t}</p><p className="text-[15px] text-muted">{d}</p></div></li>
            ))}
          </ul>
        </div>
      </section>
      <PricingSection />
      <section className="bg-ink text-paper">
        <div className="mx-auto grid max-w-page gap-10 px-4 py-20 sm:px-6 lg:grid-cols-3">
          {[['01', 'Create your business profile', 'Free. Add your logo, neighbourhood and what makes your team good to work with.'], ['02', 'Publish and share', 'Choose a single post or a plan. Share to Facebook groups, Instagram and WhatsApp straight from your dashboard.'], ['03', 'Review, shortlist, hire', 'Message candidates, keep notes, move them through your pipeline. Premium adds AI-assisted organisation.']].map(([n, t, d]) => (
            <div key={n} className="border-t border-line-dark pt-6"><p className="font-mono text-sm text-signal">{n}</p><p className="mt-3 font-display text-3xl">{t}</p><p className="mt-2 text-paper/70">{d}</p></div>
          ))}
        </div>
      </section>
    </>
  );
}

function PricingSection() {
  const { settings } = useSession();
  return (
    <section className="mx-auto max-w-page px-4 py-20 sm:px-6" id="pricing">
      <Eyebrow className="mb-2">Pricing</Eyebrow>
      <h2 className="font-display text-5xl">Simple pricing. No fees for workers.</h2>
      <p className="mb-10 mt-3 max-w-2xl text-muted">All prices in CAD, before 13% HST. Job seekers never pay. Cancel subscriptions any time.</p>
      <PlanGrid pricing={settings.pricing} />
      <p className="mt-6 text-sm text-muted">Need several locations or a hiring blitz before patio season? <Link to="/contact" className="text-ink underline">Talk to us</Link>.</p>
    </section>
  );
}

export function Pricing() {
  useSeo({ title: 'Pricing for Employers', description: 'Job posting prices for Toronto restaurants and hospitality businesses: free profile, single job posts, Pro and Premium plans.', path: '/pricing' });
  return <PricingSection />;
}

export function HowItWorks() {
  useSeo({ title: 'How StaffTO Works', description: 'How StaffTO connects Toronto hospitality workers with restaurants, bars, cafés and hotels — for job seekers and employers.', path: '/how-it-works' });
  const block = (title, steps) => (
    <div>
      <h2 className="font-display text-4xl">{title}</h2>
      <ol className="mt-6 divide-y divide-line border-y border-line">{steps.map(([t, d], i) => <li key={t} className="grid grid-cols-[48px_1fr] gap-3 py-5"><span className="font-mono text-signal">0{i + 1}</span><div><p className="font-semibold">{t}</p><p className="mt-1 text-[15px] text-muted">{d}</p></div></li>)}</ol>
    </div>
  );
  return (
    <div className="mx-auto max-w-page px-4 py-14 sm:px-6">
      <PageHead eyebrow="How it works" title="One community, two journeys" />
      <div className="grid gap-14 lg:grid-cols-2">
        {block('Job seekers', [['Sign up free', 'Email and password, or Google. No fees, ever.'], ['Build your profile', 'Experience, skills, certifications, preferred roles, areas and shifts. Upload a resume (stored privately).'], ['Search and save', 'Filter by role, area, pay and employment type. Save jobs for later.'], ['Apply', 'One tap with your profile and resume, plus an optional note. You choose whether AI-assisted review is allowed.'], ['Track and talk', 'See status changes, message employers and withdraw any time.']])}
        {block('Employers', [['Create a business account', 'Free business profile. Request a verified badge.'], ['Post a job', 'Pay is required on every listing. Ontario disclosure fields are built in.'], ['Share it', 'Copy a Facebook-ready announcement, download a branded image, share with tracked links.'], ['Manage applicants', 'Pipeline, notes, ratings, messaging and secure resume downloads.'], ['Grow with a plan', 'Pro for multiple jobs and analytics; Premium for multiple locations, priority and AI-assisted organisation.']])}
      </div>
      <div className="mt-14 flex flex-wrap gap-3"><Button to="/signup" size="lg">Create a free profile</Button><Button to="/employers" variant="outline" size="lg">Hire staff</Button></div>
    </div>
  );
}

export function Community() {
  useSeo({ title: 'Toronto Hospitality Community', description: 'Join the StaffTO community for Toronto hospitality workers and restaurant owners: daily job posts, industry news and a referral program.', path: '/community' });
  const s = useSession();
  const c = s.settings.community || {};
  const { data: jobs } = useAsync(() => db.Job.filter({ status: 'active' }, '-published_at', 5), []);
  const refLink = s.profile?.referral_code ? `${window.location.origin}/?ref=${s.profile.referral_code}` : '';
  const { data: ref } = useAsync(() => (s.user ? db.Referral.filter({ owner_id: s.user.id }, '-created_date', 1) : Promise.resolve([])), [s.user?.id]);
  return (
    <>
      <section className="bg-ink text-paper">
        <div className="mx-auto max-w-page px-4 py-20 sm:px-6 lg:py-28">
          <Eyebrow className="mb-5 text-signal">The StaffTO community</Eyebrow>
          <h1 className="max-w-4xl font-display text-6xl leading-[0.95] sm:text-8xl">Where Toronto hospitality finds each other.</h1>
          <p className="mt-6 max-w-2xl text-lg text-paper/75">Daily job drops, shift coverage, industry news and introductions — for the cooks, servers, bartenders, baristas and owners who make this city eat.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            {c.facebook_group_url ? <Button href={c.facebook_group_url} target="_blank" rel="noopener noreferrer" variant="signal" size="lg"><Facebook className="h-4 w-4" />Join our Facebook community</Button> : <Button to={s.user ? '/account/settings' : '/signup?community=1'} variant="signal" size="lg">{s.user ? 'Turn on community emails' : 'Join the community'}</Button>}
            {c.instagram_url && <Button href={c.instagram_url} target="_blank" rel="noopener noreferrer" variant="outline" size="lg" className="border-paper/40 text-paper hover:bg-paper hover:text-ink">Instagram</Button>}
          </div>
          {!c.facebook_group_url && <p className="mt-4 text-sm text-paper/50">Our Facebook group is opening soon — join now and we’ll invite you first.</p>}
        </div>
      </section>
      <section className="mx-auto grid max-w-page gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
        <div><h2 className="font-display text-4xl">For hospitality workers</h2><ul className="mt-6 space-y-3">{['New GTA jobs every day, always with pay listed', 'Last-minute shifts and event gigs', 'Advice on Smart Serve, food handler certs and workers’ rights', 'A place to ask “is this offer fair?”'].map((x) => <li key={x} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-signal" />{x}</li>)}</ul></div>
        <div><h2 className="font-display text-4xl">For restaurant owners</h2><ul className="mt-6 space-y-3">{['Share openings with thousands of local workers', 'Introduce your spot and your team culture', 'Find staff for openings, patios and events fast', 'Swap equipment and supplies via classifieds'].map((x) => <li key={x} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-signal" />{x}</li>)}</ul></div>
      </section>
      <section className="border-y border-line bg-paper-2/60">
        <div className="mx-auto grid max-w-page gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.2fr_1fr]">
          <div><div className="mb-6 flex items-end justify-between"><h2 className="font-display text-4xl">Latest jobs</h2><Button to="/jobs" variant="link">All jobs →</Button></div>{jobs?.length ? jobs.map((j) => <JobCard key={j.id} job={j} compact />) : <p className="text-muted">New listings appear here as soon as they’re published.</p>}</div>
          <div>
            <h2 className="font-display text-4xl">Community guidelines</h2>
            <ol className="mt-6 list-decimal space-y-3 pl-5 text-[15px]">
              <li>Every job post includes pay. No “DM for details”.</li>
              <li>No fees for workers — nobody pays to apply or to get a shift.</li>
              <li>No discrimination. Posts must follow the Ontario Human Rights Code.</li>
              <li>Be respectful. No harassment, no doxxing, no naming-and-shaming individuals.</li>
              <li>No spam, MLM or off-topic selling. Equipment goes in Classifieds.</li>
              <li>Report scams or suspicious posts — moderators review every report.</li>
            </ol>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-page px-4 py-20 sm:px-6">
        <Eyebrow className="mb-2">Referral program</Eyebrow>
        <h2 className="font-display text-4xl sm:text-5xl">Bring your crew.</h2>
        <p className="mt-3 max-w-2xl text-muted">Share your personal link. We count every visit, sign-up and application that comes through it — top referrers get featured job credits for their workplace and StaffTO merch. Referral rewards are never cash for job placements.</p>
        {s.profile ? (
          <div className="mt-6 max-w-xl space-y-3">
            <div className="flex gap-2"><Input readOnly value={refLink} aria-label="Your referral link" /><Button onClick={() => navigator.clipboard.writeText(refLink)}>Copy</Button></div>
            {ref?.[0] && <p className="font-mono text-sm">{ref[0].visits || 0} visits · {ref[0].signups || 0} sign-ups · {ref[0].applications || 0} applications</p>}
          </div>
        ) : <Button to="/signup" className="mt-6">Get your referral link</Button>}
      </section>
    </>
  );
}

function Markdown({ text }) {
  const inline = (s) => s.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((part, i) => {
    if (/^\*\*/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (m) return /^https?:/.test(m[2]) ? <a key={i} href={m[2]} target="_blank" rel="noopener noreferrer" className="underline">{m[1]}</a> : <Link key={i} to={m[2]} className="underline">{m[1]}</Link>;
    return part;
  });
  const blocks = String(text || '').split(/\n{2,}/);
  return <div className="space-y-5 text-[17px] leading-relaxed text-ink/85">{blocks.map((b, i) => {
    if (b.startsWith('## ')) return <h2 key={i} className="pt-4 font-display text-3xl text-ink">{b.slice(3)}</h2>;
    if (b.startsWith('### ')) return <h3 key={i} className="pt-2 text-lg font-semibold text-ink">{b.slice(4)}</h3>;
    if (/^- /m.test(b)) return <ul key={i} className="list-disc space-y-1 pl-5">{b.split('\n').filter(Boolean).map((l, j) => <li key={j}>{inline(l.replace(/^- /, ''))}</li>)}</ul>;
    return <p key={i}>{inline(b)}</p>;
  })}</div>;
}

const ARTICLE_CATS = { hiring_guide: 'Restaurant hiring guides', job_search: 'Job search advice', salary_guide: 'Salary guides', industry: 'Industry', employer_tips: 'Employer recruitment tips' };
export function Resources() {
  useSeo({ title: 'Hospitality Hiring & Career Resources', description: 'Guides for Toronto restaurant owners and hospitality workers: hiring, job search, pay and industry news.', path: '/resources' });
  const [cat, setCat] = useState('');
  const { data, loading } = useAsync(() => db.Article.filter({ status: 'published' }, '-published_at', 200), []);
  const rows = (data || []).filter((a) => !cat || a.category === cat);
  return (
    <div className="mx-auto max-w-page px-4 py-14 sm:px-6">
      <PageHead eyebrow="Resources" title="Guides for Toronto hospitality" actions={<Select value={cat} onChange={(e) => setCat(e.target.value)} placeholder="All topics" options={Object.entries(ARTICLE_CATS).map(([value, label]) => ({ value, label }))} />} />
      {loading ? <Loading /> : rows.length === 0 ? <Empty title="Articles are on the way">Our first hiring and career guides are being written by people who’ve worked Toronto kitchens and floors.</Empty> : (
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">{rows.map((a) => (
          <Link key={a.id} to={`/resources/${a.slug}`} className="group border-t-2 border-ink pt-4">
            {a.cover_url && <img src={a.cover_url} alt="" className="mb-4 aspect-[16/9] w-full object-cover" loading="lazy" />}
            <p className="font-mono text-2xs uppercase tracking-wider text-muted">{ARTICLE_CATS[a.category]}</p>
            <p className="mt-1 font-display text-2xl leading-tight group-hover:underline">{a.title}</p>
            <p className="mt-2 text-sm text-muted">{a.excerpt}</p>
          </Link>
        ))}</div>
      )}
    </div>
  );
}

export function Article() {
  const { slug } = useParams();
  const { data, loading } = useAsync(() => db.Article.filter({ slug, status: 'published' }, '-published_at', 1), [slug]);
  const a = data?.[0];
  useSeo({ title: a?.seo_title || a?.title || 'Article', description: a?.seo_description || a?.excerpt, path: `/resources/${slug}`, image: a?.cover_url, jsonLd: a ? { '@context': 'https://schema.org', '@type': 'Article', headline: a.title, datePublished: a.published_at, author: { '@type': 'Organization', name: a.author_name || 'StaffTO' } } : null });
  if (loading) return <div className="mx-auto max-w-page px-6"><Loading /></div>;
  if (!a) return <div className="mx-auto max-w-xl px-6 py-24 text-center"><h1 className="font-display text-4xl">Article not found</h1><Button to="/resources" className="mt-6">All resources</Button></div>;
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <Link to="/resources" className="text-sm text-muted hover:text-ink">← Resources</Link>
      <p className="mt-8 font-mono text-2xs uppercase tracking-wider text-muted">{ARTICLE_CATS[a.category]} · {date(a.published_at)}</p>
      <h1 className="mt-3 font-display text-5xl leading-[1.02] sm:text-6xl">{a.title}</h1>
      {a.excerpt && <p className="mt-5 text-xl text-muted">{a.excerpt}</p>}
      {a.cover_url && <img src={a.cover_url} alt="" className="mt-8 w-full" />}
      <div className="mt-10"><Markdown text={a.body} /></div>
    </article>
  );
}

export function Contact() {
  useSeo({ title: 'Contact', description: 'Contact StaffTO — employer sales, support, privacy requests and press.', path: '/contact' });
  const { settings } = useSession();
  const [f, setF] = useState({ name: '', email: '', topic: 'general', message: '', website: '' });
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => { e.preventDefault(); setBusy(true); setError(''); try { await call('site', 'contact', f); setSent(true); } catch (e2) { setError(errMsg(e2)); } finally { setBusy(false); } };
  return (
    <div className="mx-auto grid max-w-page gap-12 px-4 py-14 sm:px-6 lg:grid-cols-2">
      <div><PageHead eyebrow="Contact" title="Talk to a human" /><p className="text-muted">Email <a href={`mailto:${settings.branding.support_email}`} className="text-ink underline">{settings.branding.support_email}</a>. Privacy requests: <a href={`mailto:${settings.branding.privacy_email}`} className="text-ink underline">{settings.branding.privacy_email}</a>.</p></div>
      {sent ? <Notice>Thanks — we’ll reply within one business day.</Notice> : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
          <Field label="Email" required><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
          <Field label="Topic"><Select value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} options={[{ value: 'general', label: 'General' }, { value: 'employer_sales', label: 'Employer plans' }, { value: 'support', label: 'Support' }, { value: 'privacy', label: 'Privacy request' }, { value: 'press', label: 'Press' }]} /></Field>
          <Field label="Message" required><Textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} rows={5} required minLength={10} /></Field>
          <input type="text" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} className="hidden" aria-hidden="true" />
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" loading={busy}>Send</Button>
        </form>
      )}
    </div>
  );
}

export function Unsubscribe() {
  useSeo({ title: 'Unsubscribe', noindex: true });
  const [params] = useSearchParams();
  const [state, setState] = useState({ status: 'idle', error: '' });
  const run = async (scope) => { setState({ status: 'busy', error: '' }); try { await call('site', 'unsubscribe', { token: params.get('token'), scope }); setState({ status: scope, error: '' }); } catch (e) { setState({ status: 'idle', error: errMsg(e) }); } };
  useEffect(() => { if (params.get('token')) run('marketing'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mx-auto max-w-xl px-6 py-24">
      <h1 className="font-display text-5xl">Email preferences</h1>
      {!params.get('token') ? <p className="mt-4 text-muted">This link is missing its token. Manage email in <Link to="/account/settings" className="underline">your settings</Link>.</p> : state.status === 'marketing' ? (
        <div className="mt-4 space-y-4"><Notice>You’re unsubscribed from marketing emails. You’ll still get account notifications (applications, messages, receipts).</Notice><Button variant="outline" onClick={() => run('all')}>Also stop account notification emails</Button></div>
      ) : state.status === 'all' ? <Notice className="mt-4">You won’t receive any more emails from StaffTO. In-app notifications continue.</Notice> : <Loading label="Updating preferences…" />}
      <ErrorNote className="mt-4">{state.error}</ErrorNote>
    </div>
  );
}

export function NotFound() {
  useSeo({ title: 'Page not found', noindex: true });
  return <div className="mx-auto max-w-xl px-6 py-28 text-center"><p className="font-mono text-2xs uppercase tracking-[0.18em] text-signal">404</p><h1 className="mt-3 font-display text-6xl">86’d.</h1><p className="mt-3 text-muted">That page isn’t on the menu.</p><div className="mt-6 flex justify-center gap-2"><Button to="/jobs">Browse jobs</Button><Button to="/" variant="outline">Home</Button></div></div>;
}
