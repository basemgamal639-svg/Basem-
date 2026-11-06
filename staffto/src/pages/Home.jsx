import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Search, MapPin, Users, ChefHat, Wine, Coffee, Hotel, UtensilsCrossed, PartyPopper } from 'lucide-react';
import { Button, Eyebrow, Select, Stat, Loading } from '@/components/ui';
import { JobCard } from '@/components/jobs';
import { db, call } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useSeo } from '@/lib/seo';
import { useSession } from '@/lib/session';
import { CATEGORIES, LOCATIONS, label } from '@/lib/constants';
import { money, number } from '@/lib/format';

function Hero() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [location, setLocation] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (location) p.set('location', location);
    navigate(`/jobs?${p}`);
  };
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div className="mx-auto grid max-w-page gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.25fr_1fr] lg:pb-24 lg:pt-20">
        <div className="animate-rise">
          <Eyebrow className="mb-6 text-signal">Toronto · GTA · Hospitality</Eyebrow>
          <h1 className="font-display text-[56px] leading-[0.95] tracking-[-0.02em] sm:text-[84px] lg:text-[104px]">
            Toronto's Hospitality Jobs. <em className="text-signal">One</em> Community.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink/75">
            Find your next restaurant, bar or hospitality job. Or find the people who keep your business running.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button to="/jobs" size="lg">Find a Job <ArrowRight className="h-4 w-4" /></Button>
            <Button to="/employers" size="lg" variant="outline">Hire Staff</Button>
          </div>
        </div>
        <form onSubmit={submit} className="self-end border border-ink bg-white p-5 shadow-[8px_8px_0_#111417] sm:p-6" role="search" aria-label="Search jobs">
          <p className="font-mono text-2xs uppercase tracking-[0.18em] text-muted">Search open roles</p>
          <label className="mt-4 flex items-center gap-2 border-b border-line pb-2">
            <Search className="h-4 w-4 text-muted" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Line cook, bartender, barista…" className="w-full bg-transparent text-[17px] focus:outline-none" aria-label="Job title or keyword" />
          </label>
          <label className="mt-4 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted" aria-hidden />
            <Select value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Anywhere in the GTA" options={LOCATIONS} className="border-0 px-0 focus:ring-0" aria-label="Location" />
          </label>
          <Button type="submit" variant="signal" size="lg" className="mt-5 w-full">Search jobs</Button>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {['line_cook', 'server', 'bartender', 'barista', 'dishwasher'].map((c) => (
              <Link key={c} to={`/jobs?category=${c}`} className="rounded-sm border border-line px-2 py-1 text-xs text-muted hover:border-ink hover:text-ink">{label(c)}</Link>
            ))}
          </div>
        </form>
      </div>
    </section>
  );
}

function LiveStats() {
  const { data, loading, error } = useAsync(() => call('site', 'stats'), []);
  return (
    <section className="bg-ink text-paper">
      <div className="mx-auto max-w-page px-4 py-12 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <p className="font-mono text-2xs uppercase tracking-[0.18em] text-muted-dark">Live marketplace</p>
          <span className="inline-flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.18em] text-muted-dark"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3BC47F]" />Real-time counts</span>
        </div>
        {loading ? <p className="text-sm text-muted-dark">Loading live numbers…</p> : error ? <p className="text-sm text-muted-dark">Live numbers are unavailable right now.</p> : (
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            <Stat dark label="Active jobs" value={number(data.active_jobs)} />
            <Stat dark label="Registered employers" value={number(data.employers)} />
            <Stat dark label="Registered job seekers" value={number(data.job_seekers)} />
            <Stat dark label="Applications submitted" value={number(data.applications)} />
          </div>
        )}
      </div>
    </section>
  );
}

function FeaturedJobs() {
  const { data: jobs, loading } = useAsync(async () => {
    const rows = await db.Job.filter({ status: 'active' }, '-published_at', 40);
    return [...rows].sort((a, b) => Number(!!b.is_featured) - Number(!!a.is_featured)).slice(0, 6);
  }, []);
  return (
    <section className="mx-auto max-w-page px-4 py-20 sm:px-6">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <Eyebrow className="mb-2">Fresh this week</Eyebrow>
          <h2 className="font-display text-4xl sm:text-5xl">Featured jobs</h2>
        </div>
        <Button to="/jobs" variant="link">All jobs →</Button>
      </div>
      {loading ? <Loading /> : jobs?.length ? (
        <div>{jobs.map((j) => <JobCard key={j.id} job={j} />)}</div>
      ) : (
        <div className="border border-dashed border-line p-10 text-center">
          <p className="font-display text-3xl">The first listings are on their way.</p>
          <p className="mt-2 text-sm text-muted">Toronto employers are setting up now. Create a profile and we'll notify you when roles that fit you go live.</p>
          <div className="mt-5 flex justify-center gap-2"><Button to="/signup">Create a profile</Button><Button to="/employers" variant="outline">Post the first job</Button></div>
        </div>
      )}
    </section>
  );
}

function HowItWorks() {
  const seeker = [['Create your profile', 'Add your experience, certifications like Smart Serve, the shifts you want and where in the GTA you can work.'], ['Apply in one tap', 'Every listing shows real pay. Apply with your saved resume and a short note.'], ['Track every application', 'See when employers view, shortlist or message you — and withdraw any time.']];
  const employer = [['Set up your business', 'Free business profile with your logo, locations and what it is like to work with you.'], ['Post and share', 'Publish a job, then share a ready-made post and image to Facebook groups and Instagram.'], ['Hire from one inbox', 'Review, shortlist and message applicants, with optional AI-assisted organisation on Premium.']];
  const col = (title, items, cta) => (
    <div className="border-t-2 border-ink pt-6">
      <h3 className="font-display text-3xl">{title}</h3>
      <ol className="mt-6 space-y-6">
        {items.map(([t, d], i) => (
          <li key={t} className="grid grid-cols-[40px_1fr] gap-3">
            <span className="font-mono text-sm text-signal">0{i + 1}</span>
            <div><p className="font-semibold">{t}</p><p className="mt-1 text-[15px] text-muted">{d}</p></div>
          </li>
        ))}
      </ol>
      <div className="mt-8">{cta}</div>
    </div>
  );
  return (
    <section className="border-y border-line bg-paper-2/60">
      <div className="mx-auto max-w-page px-4 py-20 sm:px-6">
        <Eyebrow className="mb-2">How it works</Eyebrow>
        <h2 className="max-w-2xl font-display text-4xl sm:text-5xl">Two sides of the same pass.</h2>
        <div className="mt-12 grid gap-12 lg:grid-cols-2">
          {col('For job seekers', seeker, <Button to="/signup">Create a free profile</Button>)}
          {col('For employers', employer, <Button to="/employers" variant="outline">See employer plans</Button>)}
        </div>
      </div>
    </section>
  );
}

const CAT_ICONS = { chef: ChefHat, sous_chef: ChefHat, line_cook: UtensilsCrossed, bartender: Wine, barista: Coffee, server: UtensilsCrossed, host: Hotel, event_staff: PartyPopper, catering_staff: PartyPopper };
function Categories() {
  const { data: counts } = useAsync(async () => {
    const jobs = await db.Job.filter({ status: 'active' }, '-created_date', 2000, 0, ['category']);
    return jobs.reduce((m, j) => ({ ...m, [j.category]: (m[j.category] || 0) + 1 }), {});
  }, []);
  const cats = CATEGORIES.filter((c) => c.value !== 'other');
  return (
    <section className="mx-auto max-w-page px-4 py-20 sm:px-6">
      <Eyebrow className="mb-2">Browse by role</Eyebrow>
      <h2 className="font-display text-4xl sm:text-5xl">Popular job categories</h2>
      <div className="mt-10 grid grid-cols-2 border-l border-t border-line sm:grid-cols-3 lg:grid-cols-5">
        {cats.map((c) => {
          const Icon = CAT_ICONS[c.value] || Users;
          const n = counts?.[c.value] || 0;
          return (
            <Link key={c.value} to={`/jobs?category=${c.value}`} className="group flex flex-col justify-between gap-6 border-b border-r border-line p-5 transition hover:bg-ink hover:text-paper">
              <Icon className="h-5 w-5 text-signal" aria-hidden />
              <div>
                <p className="font-medium">{c.label}</p>
                <p className="mt-0.5 font-mono text-2xs uppercase tracking-wider text-muted group-hover:text-muted-dark">{counts ? `${n} open` : '—'}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Testimonials() {
  const { data: reviews } = useAsync(() => db.Review.filter({ status: 'approved' }, '-created_date', 12), []);
  const list = (reviews || []).sort((a, b) => Number(!!b.featured) - Number(!!a.featured)).slice(0, 3);
  return (
    <section className="bg-lake text-paper">
      <div className="mx-auto max-w-page px-4 py-20 sm:px-6">
        <Eyebrow className="mb-2 text-paper/60">From the community</Eyebrow>
        <h2 className="font-display text-4xl sm:text-5xl">In their words</h2>
        {list.length ? (
          <div className="mt-10 grid gap-10 md:grid-cols-3">
            {list.map((r) => (
              <figure key={r.id} className="border-t border-paper/25 pt-6">
                <blockquote className="font-display text-2xl leading-snug">“{r.quote}”</blockquote>
                <figcaption className="mt-5 text-sm text-paper/70">{r.author_name}{r.author_role ? ` · ${r.author_role}` : ''}{r.business_name ? `, ${r.business_name}` : ''}</figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="mt-8 max-w-2xl border-t border-paper/25 pt-6">
            <p className="text-lg text-paper/85">We only publish testimonials from real StaffTO members, with their permission. Hired or hiring through StaffTO? Tell us how it went.</p>
            <Button to="/account/testimonial" variant="light" className="mt-5">Share your story</Button>
          </div>
        )}
      </div>
    </section>
  );
}

function CommunityBand() {
  const { settings } = useSession();
  const url = settings.community?.facebook_group_url;
  return (
    <section className="mx-auto grid max-w-page gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:items-center">
      <div>
        <Eyebrow className="mb-2 text-signal">The StaffTO community</Eyebrow>
        <h2 className="font-display text-4xl sm:text-6xl">The group chat for Toronto hospitality.</h2>
        <p className="mt-5 max-w-xl text-[17px] text-muted">Shift swaps, last-minute openings, industry news and new jobs every day — shared by cooks, servers, bartenders and the owners who hire them.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          {url ? <Button href={url} target="_blank" rel="noopener noreferrer" variant="signal" size="lg">Join our Facebook community</Button> : <Button to="/community" variant="signal" size="lg">Join the community</Button>}
          <Button to="/community" variant="outline" size="lg">Community guidelines</Button>
        </div>
      </div>
      <ul className="divide-y divide-line border-y border-line">
        {[['Daily job drops', 'New GTA listings shared to the group with pay up front.'], ['Workers first', 'No pay-to-apply, no fake listings. Report anything off.'], ['Owners welcome', 'Introduce your spot, share openings, find staff fast.']].map(([t, d]) => (
          <li key={t} className="py-4"><p className="font-semibold">{t}</p><p className="text-[15px] text-muted">{d}</p></li>
        ))}
      </ul>
    </section>
  );
}

function ClassifiedsPreview() {
  const { data: items } = useAsync(() => db.ClassifiedListing.filter({ status: 'active' }, '-created_date', 4), []);
  return (
    <section className="border-t border-line bg-paper-2/50">
      <div className="mx-auto max-w-page px-4 py-20 sm:px-6">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div><Eyebrow className="mb-2">Classifieds</Eyebrow><h2 className="font-display text-4xl sm:text-5xl">Equipment, supplies & opportunities</h2></div>
          <Button to="/classifieds" variant="link">Browse classifieds →</Button>
        </div>
        {items?.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((l) => (
              <Link key={l.id} to={`/classifieds/${l.id}`} className="group block">
                <div className="aspect-[4/3] overflow-hidden border border-line bg-white">
                  {l.photos?.[0] ? <img src={l.photos[0]} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" /> : <div className="flex h-full items-center justify-center font-mono text-2xs uppercase tracking-wider text-muted">{label(l.category)}</div>}
                </div>
                <p className="mt-3 font-medium group-hover:underline">{l.title}</p>
                <p className="text-sm text-muted">{l.price_type === 'free' ? 'Free' : l.price_type === 'contact' ? 'Contact for price' : money(l.price_cents)} · {label(l.location)}</p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="max-w-xl text-muted">Selling a reach-in fridge, a pasta roller or a whole restaurant? List it free for the Toronto hospitality community. <Link to="/classifieds/new" className="text-ink underline">Create a listing</Link></p>
        )}
      </div>
    </section>
  );
}

export default function Home() {
  useSeo({
    title: 'Restaurant & Hospitality Jobs in Toronto',
    description: "Toronto's hospitality job community. Find restaurant, bar, café and hotel jobs across the GTA with pay on every listing — or hire cooks, servers and bartenders fast.",
    path: '/',
    jsonLd: { '@context': 'https://schema.org', '@type': 'WebSite', name: 'StaffTO', url: 'https://staffto.ca/', potentialAction: { '@type': 'SearchAction', target: 'https://staffto.ca/jobs?q={search_term_string}', 'query-input': 'required name=search_term_string' } },
  });
  return (
    <>
      <Hero />
      <LiveStats />
      <FeaturedJobs />
      <HowItWorks />
      <Categories />
      <Testimonials />
      <CommunityBand />
      <ClassifiedsPreview />
    </>
  );
}
