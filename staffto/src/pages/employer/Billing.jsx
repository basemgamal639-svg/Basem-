import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { PlanGrid } from '@/components/PlanGrid';
import { Badge, Button, Empty, ErrorNote, Field, Input, Loading, Modal, Notice, PageHead, Table, useToast } from '@/components/ui';
import { call, db, errMsg } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { date, money } from '@/lib/format';

function Checkout({ product, onClose, onDone }) {
  const toast = useToast();
  const [promo, setPromo] = useState('');
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const refresh = async (code = promo) => {
    setError('');
    try { const r = await call('billing', 'quote', { product, promo_code: code }); setQuote(r.quote); } catch (e) { setError(errMsg(e)); if (code) refresh(''); }
  };
  useEffect(() => { refresh(''); }, [product]); // eslint-disable-line react-hooks/exhaustive-deps
  const pay = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await call('billing', 'checkout', { product, promo_code: promo });
      if (r.status === 'redirect') window.location.href = r.url;
      else if (r.status === 'paid') { toast('Done — your purchase is active.'); onDone(); }
      else if (r.status === 'payments_not_configured') setNotice(r.message);
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Checkout" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={pay} loading={busy} disabled={!quote}>{quote?.total_cents === 0 ? 'Activate' : `Pay ${quote ? money(quote.total_cents) : ''}`}</Button></>}>
      {!quote ? <Loading /> : (
        <div className="space-y-5">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt>{quote.name}</dt><dd className="tabular-nums">{money(quote.subtotal_cents)}</dd></div>
            {quote.discount_cents > 0 && <div className="flex justify-between text-ok"><dt>Promo</dt><dd className="tabular-nums">−{money(quote.discount_cents)}</dd></div>}
            <div className="flex justify-between text-muted"><dt>{quote.tax_label}</dt><dd className="tabular-nums">{money(quote.tax_cents)}</dd></div>
            <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>Total ({quote.currency})</dt><dd className="tabular-nums">{money(quote.total_cents)}</dd></div>
          </dl>
          <div className="flex items-end gap-2"><Field label="Promo code" className="flex-1"><Input value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} /></Field><Button variant="outline" onClick={() => refresh(promo)}>Apply</Button></div>
          {quote.kind === 'subscription' && <p className="text-xs text-muted">Billed monthly. Cancel any time; your plan stays active until the end of the paid period.</p>}
          <ErrorNote>{error}</ErrorNote>
          {notice && <Notice tone="brass">{notice}</Notice>}
        </div>
      )}
    </Modal>
  );
}

export default function Billing() {
  const s = useSession();
  const toast = useToast();
  const [params] = useSearchParams();
  const [product, setProduct] = useState(null);
  const { data, loading, reload } = useAsync(async () => {
    if (!s.employer) return null;
    const [payments, subs, catalog, allowance] = await Promise.all([
      db.Payment.filter({ employer_id: s.employer.id }, '-created_date', 200), db.Subscription.filter({ employer_id: s.employer.id }, '-created_date', 5), call('billing', 'catalog'), call('jobs', 'allowance').catch(() => null),
    ]);
    return { payments, sub: subs[0], catalog, allowance };
  }, [s.employer?.id]);
  useEffect(() => { if (params.get('status') === 'success') { toast('Payment received — thank you!'); s.reload(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s.employer) return <Empty title="Set up your business profile first" action={<Button to="/employer/profile">Create business profile</Button>} />;
  if (loading) return <Loading />;
  const cancel = async () => { if (!window.confirm('Cancel at the end of the current period?')) return; try { await call('billing', 'cancelSubscription'); toast('Your plan will end at the close of this period.'); reload(); } catch (e) { toast(errMsg(e), 'error'); } };
  return (
    <>
      <PageHead eyebrow="Employer" title="Plan & billing">
        {data.allowance && <>Current plan <strong className="capitalize text-ink">{data.allowance.plan}</strong> · {data.allowance.active_count} live job(s) · {data.allowance.credits} job credit(s) · {data.allowance.featured_credits} featured credit(s)</>}
      </PageHead>
      {!data.catalog.payments.enabled && <Notice tone="brass" className="mb-6">Online card payments are being activated. Promo codes work now, and our team can activate any plan for you — <Link to="/contact" className="underline">contact us</Link>.</Notice>}
      {data.sub && (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border border-line bg-white p-4 text-sm">
          <p><strong className="capitalize">{data.sub.plan}</strong> subscription · <Badge tone={data.sub.status === 'active' ? 'ok' : 'muted'}>{data.sub.status}</Badge> · {data.sub.cancel_at_period_end ? 'ends' : 'renews'} {date(data.sub.current_period_end)}</p>
          {data.sub.status === 'active' && !data.sub.cancel_at_period_end && <Button size="sm" variant="ghost" onClick={cancel}>Cancel plan</Button>}
        </div>
      )}
      <PlanGrid pricing={data.catalog.pricing} current={s.employer.plan} onChoose={setProduct} />
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm"><span className="text-muted">Need a boost?</span><Button size="sm" variant="outline" onClick={() => setProduct('featured_upgrade')}>Buy featured upgrade ({money(data.catalog.pricing.products.featured_upgrade.price_cents)})</Button></div>
      <h2 className="mb-3 mt-12 font-semibold">Payment history</h2>
      <Table rows={data.payments} empty="No payments yet." columns={[
        { key: 'invoice_number', label: 'Invoice', render: (p) => <Link to={`/employer/billing/invoice/${p.id}`} className="font-mono text-xs underline">{p.invoice_number}</Link> },
        { key: 'description', label: 'Item' },
        { key: 'date', label: 'Date', render: (p) => date(p.paid_at || p.created_date) },
        { key: 'total', label: 'Total', className: 'tabular-nums', render: (p) => money(p.total_cents) },
        { key: 'status', label: 'Status', render: (p) => <Badge tone={p.status === 'paid' ? 'ok' : 'muted'}>{p.status}</Badge> },
      ]} />
      {product && <Checkout product={product} onClose={() => setProduct(null)} onDone={() => { setProduct(null); reload(); s.reload(); }} />}
    </>
  );
}

export function Invoice() {
  const { id } = useParams();
  const s = useSession();
  const { data: p, loading, error } = useAsync(() => db.Payment.get(id), [id]);
  if (loading) return <Loading />;
  if (error || !p) return <Empty title="Invoice not found" />;
  const b = s.settings.branding;
  return (
    <div className="max-w-2xl border border-line bg-white p-8 print:border-0">
      <div className="flex items-start justify-between">
        <div><p className="font-display text-3xl">{b.name}</p><p className="text-xs text-muted">{b.legal_name}<br />{b.address}<br />{b.support_email}</p>{b.hst_number && <p className="text-xs text-muted">HST # {b.hst_number}</p>}</div>
        <div className="text-right"><p className="font-mono text-2xs uppercase tracking-wider text-muted">Invoice</p><p className="font-mono">{p.invoice_number}</p><p className="text-sm">{date(p.paid_at || p.created_date)}</p><Badge tone={p.status === 'paid' ? 'ok' : 'muted'}>{p.status}</Badge></div>
      </div>
      <p className="mt-8 text-sm"><span className="text-muted">Billed to</span><br /><strong>{p.employer_name}</strong></p>
      <table className="mt-8 w-full text-sm">
        <tbody>
          <tr className="border-b border-line"><td className="py-2">{p.description}</td><td className="py-2 text-right tabular-nums">{money(p.subtotal_cents)}</td></tr>
          {p.discount_cents > 0 && <tr className="border-b border-line"><td className="py-2">Discount {p.promo_code && `(${p.promo_code})`}</td><td className="py-2 text-right tabular-nums">−{money(p.discount_cents)}</td></tr>}
          <tr className="border-b border-line"><td className="py-2 text-muted">HST (13%)</td><td className="py-2 text-right tabular-nums">{money(p.tax_cents)}</td></tr>
          <tr><td className="py-3 font-semibold">Total {p.currency}</td><td className="py-3 text-right font-semibold tabular-nums">{money(p.total_cents)}</td></tr>
        </tbody>
      </table>
      <Button variant="outline" size="sm" className="mt-6 print:hidden" onClick={() => window.print()}><Printer className="h-4 w-4" />Print / save PDF</Button>
    </div>
  );
}
