import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Briefcase, UserRound } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button, Checkbox, cx, ErrorNote, Field, Input, Notice } from '@/staffto/components/ui';
import { call, errMsg } from '@/staffto/lib/api';
import { useSession } from '@/staffto/lib/session';
import { useSeo } from '@/staffto/lib/seo';
import { attribution } from '@/staffto/lib/analytics';
import { dashboardPath } from '@/staffto/components/Layout';

function AuthFrame({ title, sub, children, aside }) {
  return (
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-page lg:grid-cols-2">
      <div className="flex items-center px-4 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <h1 className="font-display text-5xl leading-none tracking-tight">{title}</h1>
          {sub && <p className="mt-3 text-muted">{sub}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
      <div className="hidden bg-ink p-12 text-paper lg:flex lg:flex-col lg:justify-end">{aside || (
        <>
          <p className="font-display text-5xl leading-[1.05]">“Pay on every listing. No fees for workers. Ever.”</p>
          <p className="mt-4 text-sm text-paper/60">The StaffTO standard</p>
        </>
      )}</div>
    </div>
  );
}

function GoogleButton() {
  return (
    <Button variant="outline" className="w-full" onClick={() => base44.auth.loginWithProvider('google', `${window.location.origin}/onboarding`)}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.3 6.6 2.3 12s4.3 9.8 9.7 9.8c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z" /></svg>
      Continue with Google
    </Button>
  );
}

export function Login() {
  useSeo({ title: 'Log in', path: '/login', noindex: true });
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const s = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await base44.auth.loginViaEmailPassword(email.trim(), password);
      const next = await s.reload();
      navigate(params.get('next') || dashboardPath({ ...s, ...next, isEmployer: next?.profile?.account_type === 'employer' }), { replace: true });
    } catch (e2) { setError(errMsg(e2)); } finally { setBusy(false); }
  };
  const reset = async () => {
    if (!email) return setError('Enter your email first.');
    try { await base44.auth.resetPasswordRequest(email.trim()); setResetSent(true); } catch (e2) { setError(errMsg(e2)); }
  };
  return (
    <AuthFrame title="Welcome back" sub="Log in to apply, track applications or manage your listings.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email" htmlFor="email"><Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password" htmlFor="password"><Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <ErrorNote>{error}</ErrorNote>
        {resetSent && <Notice>If an account exists for {email}, a reset link is on its way.</Notice>}
        <Button type="submit" loading={busy} className="w-full" size="lg">Log in</Button>
        <div className="flex justify-between text-sm"><button type="button" onClick={reset} className="text-muted underline">Forgot password?</button><Link to={`/signup${params.get('next') ? `?next=${encodeURIComponent(params.get('next'))}` : ''}`} className="underline">Create an account</Link></div>
      </form>
      <div className="my-6 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
      <GoogleButton />
    </AuthFrame>
  );
}

export function Signup() {
  useSeo({ title: 'Create your account', path: '/signup', description: 'Create a free StaffTO account to apply for Toronto hospitality jobs or hire staff.' });
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const s = useSession();
  const [step, setStep] = useState('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const type = params.get('type') === 'employer' ? 'employer' : '';
  const nextQ = new URLSearchParams({ ...(type ? { type } : {}), ...(params.get('next') ? { next: params.get('next') } : {}) }).toString();

  const register = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await base44.auth.register({ email: email.trim(), password, referral_code: attribution().ref || null });
      setStep('verify');
    } catch (e2) { setError(errMsg(e2)); } finally { setBusy(false); }
  };
  const verify = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await base44.auth.verifyOtp({ email: email.trim(), otpCode: otp.trim() });
      if (res?.access_token) base44.auth.setToken(res.access_token, true);
      else await base44.auth.loginViaEmailPassword(email.trim(), password);
      await s.reload();
      navigate(`/onboarding${nextQ ? `?${nextQ}` : ''}`, { replace: true });
    } catch (e2) { setError(errMsg(e2)); } finally { setBusy(false); }
  };
  return (
    <AuthFrame title={step === 'form' ? 'Create your account' : 'Check your inbox'} sub={step === 'form' ? (type === 'employer' ? 'Free business account. Post jobs when you’re ready.' : 'Free for job seekers, always.') : `We sent a 6-digit code to ${email}.`}>
      {step === 'form' ? (
        <>
          <form onSubmit={register} className="space-y-4">
            <Field label="Email" htmlFor="su-email"><Input id="su-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Password" htmlFor="su-password" hint="At least 8 characters."><Input id="su-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <ErrorNote>{error}</ErrorNote>
            <Button type="submit" loading={busy} className="w-full" size="lg">Continue</Button>
            <p className="text-sm text-muted">Already have an account? <Link to={`/login${params.get('next') ? `?next=${encodeURIComponent(params.get('next'))}` : ''}`} className="text-ink underline">Log in</Link></p>
          </form>
          <div className="my-6 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
          <GoogleButton />
        </>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <Field label="Verification code" htmlFor="otp"><Input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} className="h-12 text-center font-mono text-xl tracking-[0.5em]" /></Field>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" loading={busy} className="w-full" size="lg">Verify email</Button>
          <button type="button" className="text-sm text-muted underline" onClick={() => base44.auth.resendOtp(email.trim()).then(() => setError('A new code has been sent.')).catch((e2) => setError(errMsg(e2)))}>Resend code</button>
        </form>
      )}
    </AuthFrame>
  );
}

export function Onboarding() {
  useSeo({ title: 'Get started', path: '/onboarding', noindex: true });
  const s = useSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [type, setType] = useState(params.get('type') === 'employer' ? 'employer' : params.get('type') === 'seeker' ? 'seeker' : '');
  const [name, setName] = useState(s.user?.full_name || '');
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(params.get('community') === '1');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (s.profile) {
    const to = params.get('next') || (s.profile.account_type === 'employer' ? (s.employer ? '/employer' : '/employer/profile') : (s.candidate ? '/account' : '/account/profile'));
    return <Navigate to={to} replace />;
  }
  if (!s.user && !s.loading) return <Navigate to="/signup" replace />;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const a = attribution();
      await call('account', 'bootstrap', { account_type: type, full_name: name, accept_terms: terms, marketing_consent: marketing, referred_by: a.ref || '', utm_source: a.utm_source || '', utm_campaign: a.utm_campaign || '' });
      await s.reload();
      navigate(params.get('next') || (type === 'employer' ? '/employer/profile?welcome=1' : '/account/profile?welcome=1'), { replace: true });
    } catch (e2) { setError(errMsg(e2)); } finally { setBusy(false); }
  };
  const Opt = ({ value, icon: Icon, title, text }) => (
    <button type="button" onClick={() => setType(value)} aria-pressed={type === value} className={cx('flex w-full items-start gap-4 border p-5 text-left transition', type === value ? 'border-ink bg-white shadow-[4px_4px_0_#111417]' : 'border-line hover:border-ink/50')}>
      <Icon className="mt-0.5 h-5 w-5 text-signal" aria-hidden /><span><span className="block font-semibold">{title}</span><span className="mt-0.5 block text-sm text-muted">{text}</span></span>
    </button>
  );
  return (
    <AuthFrame title="How will you use StaffTO?" sub="You can’t switch later, but you can create a second account with another email.">
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-3">
          <Opt value="seeker" icon={UserRound} title="I’m looking for work" text="Build a profile, apply to jobs, track applications. Always free." />
          <Opt value="employer" icon={Briefcase} title="I’m hiring" text="Create a business profile, post jobs and manage applicants." />
        </div>
        <Field label={type === 'employer' ? 'Your name (hiring contact)' : 'Your full name'} htmlFor="ob-name"><Input id="ob-name" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
        <Checkbox checked={terms} onChange={setTerms} label={<>I agree to the <Link to="/legal/terms" target="_blank" className="underline">Terms</Link> and <Link to="/legal/privacy" target="_blank" className="underline">Privacy Policy</Link>.</>} />
        <Checkbox checked={marketing} onChange={setMarketing} label="Send me job alerts, community news and offers from StaffTO by email." hint="Optional. You can unsubscribe any time from any email or your settings. StaffTO, Toronto, ON." />
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" loading={busy} disabled={!type || !terms || !name} className="w-full" size="lg">Continue</Button>
      </form>
    </AuthFrame>
  );
}
