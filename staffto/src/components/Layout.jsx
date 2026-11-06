import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Bell, MessageSquare, LayoutDashboard } from 'lucide-react';
import { useSession } from '@/lib/session';
import { db } from '@/lib/api';
import { Button, cx, Loading } from '@/components/ui';
import { CATEGORIES, LOCATIONS } from '@/lib/constants';
import { getConsent, setConsent, track, captureAttribution } from '@/lib/analytics';

export function Logo({ dark, className }) {
  const { settings } = useSession();
  const [a, b] = settings.branding.wordmark || ['Staff', 'TO'];
  return (
    <Link to="/" className={cx('group inline-flex items-center gap-0 leading-none', className)} aria-label={`${settings.branding.name} home`}>
      <span className={cx('font-display text-[28px] tracking-tight', dark ? 'text-paper' : 'text-ink')}>{a}</span>
      <span className="ml-1 inline-flex h-[22px] items-center bg-signal px-1.5 font-sans text-[13px] font-bold tracking-[0.06em] text-white transition-transform duration-200 group-hover:-translate-y-0.5">{b}</span>
    </Link>
  );
}

function useUnread(userId) {
  const [counts, setCounts] = useState({ notifications: 0, messages: 0 });
  const location = useLocation();
  useEffect(() => {
    if (!userId) return;
    Promise.all([
      db.Notification.filter({ user_id: userId, read: false }, '-created_date', 50),
      db.Message.filter({ recipient_id: userId, read: false }, '-created_date', 50),
    ]).then(([n, m]) => setCounts({ notifications: n.length, messages: m.length })).catch(() => {});
  }, [userId, location.pathname]);
  return counts;
}

export function dashboardPath(s) {
  if (!s.user) return '/login';
  if (!s.profile) return '/onboarding';
  if (s.isAdmin && !s.profile) return '/admin';
  return s.isEmployer ? '/employer' : '/account';
}

function SiteNav() {
  const s = useSession();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const unread = useUnread(s.user?.id);
  useEffect(() => setOpen(false), [location.pathname]);
  const links = [
    ['/jobs', 'Find Jobs'], ['/employers', 'For Employers'], ['/classifieds', 'Classifieds'], ['/how-it-works', 'How It Works'], ['/community', 'Community'],
  ];
  const postJobTo = s.user ? (s.isEmployer ? '/employer/jobs/new' : s.profile ? '/employers' : '/onboarding?type=employer') : '/signup?type=employer';
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="mx-auto flex h-16 max-w-page items-center justify-between gap-6 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => cx('rounded px-3 py-2 text-[14px] transition', isActive ? 'text-ink font-medium' : 'text-ink/70 hover:text-ink')}>{label}</NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {s.user ? (
            <>
              <Link to="/messages" className="relative hidden rounded p-2 hover:bg-paper-2 sm:block" aria-label={`Messages${unread.messages ? `, ${unread.messages} unread` : ''}`}>
                <MessageSquare className="h-[18px] w-[18px]" />{unread.messages > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-signal" />}
              </Link>
              <Link to="/notifications" className="relative hidden rounded p-2 hover:bg-paper-2 sm:block" aria-label={`Notifications${unread.notifications ? `, ${unread.notifications} unread` : ''}`}>
                <Bell className="h-[18px] w-[18px]" />{unread.notifications > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-signal" />}
              </Link>
              <Button to={dashboardPath(s)} variant="ghost" size="sm" className="hidden sm:inline-flex"><LayoutDashboard className="h-4 w-4" />Dashboard</Button>
              {s.isAdmin && <Button to="/admin" variant="ghost" size="sm" className="hidden md:inline-flex">Admin</Button>}
            </>
          ) : (
            <Button to="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">Login</Button>
          )}
          <Button to={postJobTo} variant="signal" size="sm">Post a Job</Button>
          <button className="rounded p-2 lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
      </div>
      {open && (
        <div className="border-t border-line bg-paper px-4 pb-5 pt-2 lg:hidden">
          <nav className="flex flex-col" aria-label="Mobile">
            {links.map(([to, label]) => <Link key={to} to={to} className="border-b border-line py-3 text-[15px]">{label}</Link>)}
            {s.user ? (
              <>
                <Link to={dashboardPath(s)} className="border-b border-line py-3 text-[15px]">Dashboard</Link>
                <Link to="/messages" className="border-b border-line py-3 text-[15px]">Messages {unread.messages > 0 && `(${unread.messages})`}</Link>
                <Link to="/notifications" className="border-b border-line py-3 text-[15px]">Notifications {unread.notifications > 0 && `(${unread.notifications})`}</Link>
                {s.isAdmin && <Link to="/admin" className="border-b border-line py-3 text-[15px]">Admin</Link>}
                <button onClick={s.logout} className="py-3 text-left text-[15px] text-muted">Sign out</button>
              </>
            ) : (
              <Link to="/login" className="py-3 text-[15px]">Login</Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

function Footer() {
  const { settings } = useSession();
  const year = new Date().getFullYear();
  const col = (title, items) => (
    <div>
      <p className="mb-3 font-mono text-2xs uppercase tracking-[0.18em] text-muted-dark">{title}</p>
      <ul className="space-y-2 text-[13.5px]">{items.map(([to, l]) => <li key={to}><Link to={to} className="text-paper/80 hover:text-paper">{l}</Link></li>)}</ul>
    </div>
  );
  return (
    <footer className="bg-ink text-paper">
      <div className="mx-auto max-w-page px-4 pb-10 pt-16 sm:px-6">
        <div className="grid gap-10 border-b border-line-dark pb-12 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr]">
          <div>
            <Logo dark />
            <p className="mt-4 max-w-xs text-sm text-paper/70">{settings.branding.tagline}</p>
            <p className="mt-6 text-xs text-muted-dark">Proudly built for Toronto & the GTA.</p>
          </div>
          {col('Jobs by role', [['/cook-jobs-toronto', 'Cook jobs Toronto'], ['/chef-jobs-toronto', 'Chef jobs Toronto'], ['/server-jobs-toronto', 'Server jobs Toronto'], ['/bartender-jobs-toronto', 'Bartender jobs Toronto'], ['/dishwasher-jobs-toronto', 'Dishwasher jobs Toronto'], ['/restaurant-jobs-toronto', 'All restaurant jobs']])}
          {col('Jobs by area', LOCATIONS.slice(0, 9).map((l) => [`/jobs?location=${l.value}`, `${l.label}`]))}
          {col('Employers', [['/employers', 'Hire hospitality staff'], ['/pricing', 'Pricing'], ['/restaurant-hiring-toronto', 'Restaurant hiring Toronto'], ['/hospitality-staffing-toronto', 'Hospitality staffing'], ['/legal/employers', 'Posting rules (Ontario)'], ['/resources', 'Hiring guides']])}
          {col('StaffTO', [['/how-it-works', 'How it works'], ['/community', 'Community'], ['/classifieds', 'Classifieds'], ['/contact', 'Contact'], ['/legal/privacy', 'Privacy'], ['/legal/terms', 'Terms'], ['/legal/ai', 'AI transparency'], ['/legal/cookies', 'Cookies']])}
        </div>
        <div className="flex flex-col gap-3 pt-6 text-xs text-muted-dark sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} {settings.branding.name}. Hospitality jobs in Toronto, Mississauga, Brampton, Markham, Vaughan and across the GTA.</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">{CATEGORIES.slice(0, 6).map((c) => <Link key={c.value} to={`/jobs?category=${c.value}`} className="hover:text-paper">{c.label} jobs</Link>)}</p>
        </div>
      </div>
    </footer>
  );
}

function CookieBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(!getConsent()); }, []);
  if (!show) return null;
  const choose = (analytics) => { setConsent({ analytics }); setShow(false); if (analytics) track('page_view'); };
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-ink bg-ink text-paper animate-rise" role="dialog" aria-label="Cookie and analytics choices">
      <div className="mx-auto flex max-w-page flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="max-w-3xl text-[13.5px] text-paper/85">
          We use essential storage to keep you signed in. With your OK we also count page and job views with our own first-party analytics — no ad trackers, no data sold. <Link to="/legal/cookies" className="underline">Details</Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" className="border-paper/40 text-paper hover:bg-paper hover:text-ink" onClick={() => choose(false)}>Essential only</Button>
          <Button variant="light" size="sm" onClick={() => choose(true)}>Allow analytics</Button>
        </div>
      </div>
    </div>
  );
}

function RouteEffects() {
  const location = useLocation();
  useEffect(() => { captureAttribution(); }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
    const attr = new URLSearchParams(location.search);
    if (attr.get('ref')) track('referral_visit', { ref: attr.get('ref') });
    if (!location.pathname.startsWith('/jobs/')) track('page_view');
  }, [location.pathname]);
  return null;
}

export function SiteLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">Skip to content</a>
      <RouteEffects />
      <SiteNav />
      <main id="main" className="flex-1"><Outlet /></main>
      <Footer />
      <CookieBanner />
    </div>
  );
}

// Route guard. `need`: 'user' | 'seeker' | 'employer' | 'admin'
export function Guard({ need = 'user', children }) {
  const s = useSession();
  const location = useLocation();
  if (s.loading) return <div className="mx-auto max-w-page px-6"><Loading /></div>;
  if (!s.user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (need === 'admin') return s.isAdmin ? children : <Forbidden />;
  if (!s.profile && need !== 'user') return <Navigate to={`/onboarding?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (s.profile?.suspended) return <Forbidden msg="This account is suspended. Contact support if you think this is a mistake." />;
  if (need === 'employer' && !s.isEmployer) return <Forbidden msg="This area is for employer accounts." />;
  if (need === 'seeker' && !s.isSeeker) return <Forbidden msg="This area is for job seeker accounts." />;
  return children;
}

function Forbidden({ msg = "You don't have access to this page." }) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center">
      <p className="font-mono text-2xs uppercase tracking-[0.18em] text-signal">403 · Not permitted</p>
      <h1 className="mt-3 font-display text-4xl">{msg}</h1>
      <div className="mt-6 flex justify-center gap-2"><Button variant="outline" onClick={() => navigate(-1)}>Go back</Button><Button to="/">Home</Button></div>
    </div>
  );
}

export function DashboardShell({ title, nav, children }) {
  return (
    <div className="mx-auto grid max-w-page gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[220px_1fr] lg:py-12">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-3 font-mono text-2xs uppercase tracking-[0.18em] text-muted">{title}</p>
        <nav className="-mx-1 flex gap-1 overflow-x-auto pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:pb-0" aria-label={title}>
          {nav.map(([to, label, end]) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => cx('whitespace-nowrap rounded px-3 py-2 text-[14px] transition', isActive ? 'bg-ink text-paper' : 'text-ink/75 hover:bg-paper-2 hover:text-ink')}>{label}</NavLink>
          ))}
        </nav>
      </aside>
      <section className="min-w-0">{children}</section>
    </div>
  );
}
