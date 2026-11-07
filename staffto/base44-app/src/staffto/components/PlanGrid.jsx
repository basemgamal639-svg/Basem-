import { Check } from 'lucide-react';
import { Badge, Button, cx, Loading } from '@/staffto/components/ui';
import { money } from '@/staffto/lib/format';

export const PLAN_FEATURES = {
  free: ['Business profile', 'Browse the marketplace', 'Classified listings', 'Buy single job posts any time'],
  single: ['One job live for 30 days', 'Share kit: Facebook post + image', 'Applicant inbox & messaging', 'Pay once, no subscription'],
  pro: ['Up to 5 live jobs', '2 featured listings / month', 'Advanced applicant pipeline & notes', 'Recruitment analytics'],
  premium: ['Up to 25 live jobs', '6 featured listings / month', 'Multiple GTA locations', 'Priority placement', 'AI-assisted candidate organisation'],
};

export function PlanGrid({ pricing, current, onChoose }) {
  if (!pricing) return <Loading />;
  const p = pricing.products;
  const cards = [
    { key: 'free', name: 'Free', price: 0, unit: '', cta: null },
    { key: 'single', name: 'Single Job', price: p.single_job.price_cents, unit: 'per post', product: 'single_job' },
    { key: 'pro', name: 'Pro', price: p.pro_monthly.price_cents, unit: '/month', product: 'pro_monthly', highlight: true },
    { key: 'premium', name: 'Premium', price: p.premium_monthly.price_cents, unit: '/month', product: 'premium_monthly' },
  ];
  return (
    <div className="grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.key} className={cx('flex flex-col border-b border-r border-line p-6', c.highlight && 'bg-ink text-paper')}>
          <div className="flex items-center justify-between"><p className="font-semibold">{c.name}</p>{current === c.key && <Badge tone={c.highlight ? 'dark' : 'ok'}>Current</Badge>}{c.highlight && current !== c.key && <Badge tone="signal">Popular</Badge>}</div>
          <p className="mt-4 font-display text-5xl tabular-nums">{c.price ? money(c.price).replace('.00', '') : '$0'}</p>
          <p className={cx('text-sm', c.highlight ? 'text-paper/60' : 'text-muted')}>{c.unit || 'forever'}{c.price ? ' + HST' : ''}</p>
          <ul className="mt-6 flex-1 space-y-2 text-sm">{PLAN_FEATURES[c.key].map((f) => <li key={f} className="flex gap-2"><Check className={cx('mt-0.5 h-4 w-4 shrink-0', c.highlight ? 'text-paper' : 'text-signal')} />{f}</li>)}</ul>
          {c.product && onChoose && <Button className="mt-6 w-full" variant={c.highlight ? 'light' : 'outline'} onClick={() => onChoose(c.product)}>{c.key === 'single' ? 'Buy a job post' : current === c.key ? 'Renew' : `Choose ${c.name}`}</Button>}
        </div>
      ))}
    </div>
  );
}

