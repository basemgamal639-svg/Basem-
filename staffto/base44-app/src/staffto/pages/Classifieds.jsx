import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ImagePlus, MapPin, X } from 'lucide-react';
import { Badge, Button, Empty, ErrorNote, Eyebrow, Field, Input, Loading, Notice, PageHead, Select, Table, Textarea, useToast } from '@/staffto/components/ui';
import { ReportButton } from '@/staffto/components/jobs';
import { call, db, errMsg, uploadPublic } from '@/staffto/lib/api';
import { useAsync } from '@/staffto/lib/hooks';
import { useSeo } from '@/staffto/lib/seo';
import { useSession } from '@/staffto/lib/session';
import { CLASSIFIED_CATEGORIES, CONDITIONS, LOCATIONS, label } from '@/staffto/lib/constants';
import { ago, money } from '@/staffto/lib/format';
import { track } from '@/staffto/lib/analytics';

const priceText = (l) => (l.price_type === 'free' ? 'Free' : l.price_type === 'contact' ? 'Contact for price' : `${money(l.price_cents)}${l.price_type === 'negotiable' ? ' OBO' : ''}`);

export default function Classifieds() {
  useSeo({ title: 'Restaurant Equipment & Hospitality Classifieds — Toronto', description: 'Buy and sell restaurant equipment, kitchen equipment, furniture, supplies and hospitality business opportunities in Toronto and the GTA.', path: '/classifieds' });
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const { data, loading } = useAsync(() => db.ClassifiedListing.filter({ status: 'active' }, '-created_date', 1000), []);
  const rows = useMemo(() => (data || []).filter((l) => (!category || l.category === category) && (!location || l.location === location) && (!maxPrice || (l.price_cents || 0) <= Number(maxPrice) * 100) && (!q || `${l.title} ${l.description}`.toLowerCase().includes(q.toLowerCase()))), [data, q, category, location, maxPrice]);
  return (
    <div className="mx-auto max-w-page px-4 py-10 sm:px-6 lg:py-14">
      <PageHead eyebrow="Classifieds" title="Equipment, supplies & opportunities" actions={<Button to="/classifieds/new" variant="signal">Create a listing</Button>}>
        Buy and sell within Toronto’s hospitality community. Free to list; every listing is reviewed before it goes live.
      </PageHead>
      <div className="mb-8 grid gap-3 sm:grid-cols-4">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search listings" aria-label="Search listings" />
        <Select value={category} onChange={(e) => setCategory(e.target.value)} placeholder="All categories" options={CLASSIFIED_CATEGORIES} aria-label="Category" />
        <Select value={location} onChange={(e) => setLocation(e.target.value)} placeholder="All areas" options={LOCATIONS} aria-label="Area" />
        <Select value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="Any price" options={[100, 500, 1000, 5000, 20000].map((v) => ({ value: String(v), label: `Under $${v.toLocaleString()}` }))} aria-label="Max price" />
      </div>
      {loading ? <Loading /> : rows.length === 0 ? <Empty title="No listings match" action={<Button to="/classifieds/new" variant="outline">List something</Button>}>Selling a combi oven, bar stools or a turnkey café? Be the first.</Empty> : (
        <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((l) => (
            <Link key={l.id} to={`/classifieds/${l.id}`} className="group">
              <div className="aspect-[4/3] overflow-hidden border border-line bg-white">{l.photos?.[0] ? <img src={l.photos[0]} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" /> : <div className="flex h-full items-center justify-center font-mono text-2xs uppercase tracking-wider text-muted">{label(l.category)}</div>}</div>
              <p className="mt-3 font-mono text-2xs uppercase tracking-wider text-muted">{label(l.category)}</p>
              <p className="font-medium group-hover:underline">{l.title}</p>
              <p className="text-sm">{priceText(l)} <span className="text-muted">· {label(l.location)} · {ago(l.created_date)}</span></p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function ClassifiedDetail() {
  const { id } = useParams();
  const s = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: l, loading, error } = useAsync(() => db.ClassifiedListing.get(id), [id]);
  const [photo, setPhoto] = useState(0);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (l?.status === 'active') track('page_view', { listing_id: l.id }); }, [l?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useSeo({ title: l ? `${l.title} — ${label(l.location)}` : 'Listing', description: l?.description?.slice(0, 155), path: `/classifieds/${id}`, noindex: l && l.status !== 'active', image: l?.photos?.[0] });
  if (loading) return <div className="mx-auto max-w-page px-6"><Loading /></div>;
  if (error || !l) return <div className="mx-auto max-w-xl px-6 py-24 text-center"><h1 className="font-display text-4xl">Listing not found</h1><Button to="/classifieds" className="mt-6">Back to classifieds</Button></div>;
  const mine = s.user?.id === l.owner_id;
  const contact = async (e) => {
    e.preventDefault();
    if (!s.user) return navigate(`/login?next=/classifieds/${id}`);
    if (!s.profile) return navigate(`/onboarding?next=/classifieds/${id}`);
    setBusy(true);
    try { const r = await call('marketplace', 'contactSeller', { listing_id: id, body: msg }); toast('Message sent to the seller.'); navigate(`/messages?t=${encodeURIComponent(r.thread_key)}`); } catch (e2) { toast(errMsg(e2), 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-page px-4 py-8 sm:px-6 lg:py-12">
      <Link to="/classifieds" className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Classifieds</Link>
      {l.status !== 'active' && <Notice tone="brass" className="mb-6">This listing is {l.status === 'pending' ? 'awaiting review' : l.status}.{l.moderation_note && ` ${l.moderation_note}`}</Notice>}
      <div className="grid gap-12 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <div className="aspect-[4/3] overflow-hidden border border-line bg-white">{l.photos?.length ? <img src={l.photos[photo]} alt={l.title} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-muted">No photos</div>}</div>
          {l.photos?.length > 1 && <div className="mt-3 flex gap-2">{l.photos.map((p, i) => <button key={p} onClick={() => setPhoto(i)} className={`h-16 w-20 overflow-hidden border ${i === photo ? 'border-ink' : 'border-line'}`}><img src={p} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" /></button>)}</div>}
        </div>
        <div>
          <Eyebrow>{label(l.category)}</Eyebrow>
          <h1 className="mt-2 font-display text-5xl leading-none">{l.title}</h1>
          <p className="mt-4 font-mono text-2xl">{priceText(l)}</p>
          <p className="mt-2 flex items-center gap-1 text-sm text-muted"><MapPin className="h-4 w-4" />{label(l.location)} · {l.condition !== 'not_applicable' && `${label(l.condition)} · `}Listed {ago(l.created_date)} by {l.seller_name}</p>
          <p className="mt-6 whitespace-pre-line text-[15px] leading-relaxed">{l.description}</p>
          {mine ? <Button to={`/classifieds/${l.id}/edit`} variant="outline" className="mt-8">Edit listing</Button> : l.status === 'active' && (
            <form onSubmit={contact} className="mt-8 space-y-3 border border-ink bg-white p-4">
              <Field label="Message the seller"><Textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} required placeholder="Hi, is this still available? Could I see it this week?" /></Field>
              <Button type="submit" loading={busy} className="w-full">{s.user ? 'Send message' : 'Log in to contact seller'}</Button>
              <p className="text-xs text-muted">Meet in a public place, inspect before you pay, and never send deposits to strangers.</p>
            </form>
          )}
          <div className="mt-6"><ReportButton targetType="classified" targetId={l.id} /></div>
        </div>
      </div>
    </div>
  );
}

export function ClassifiedEditor() {
  const { id } = useParams();
  const s = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: existing, loading } = useAsync(() => (id ? db.ClassifiedListing.get(id) : Promise.resolve(null)), [id]);
  const [f, setF] = useState({ title: '', category: 'kitchen_equipment', description: '', price: '', price_type: 'fixed', condition: 'good', location: 'downtown_toronto', photos: [], seller_name: s.employer?.business_name || s.profile?.full_name || '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => { if (existing) setF({ title: existing.title, category: existing.category, description: existing.description || '', price: existing.price_cents ? existing.price_cents / 100 : '', price_type: existing.price_type, condition: existing.condition || 'good', location: existing.location, photos: existing.photos || [], seller_name: existing.seller_name }); }, [existing]);
  if (id && loading) return <Loading />;
  if (existing && existing.owner_id !== s.user.id) return <Empty title="You can only edit your own listings" />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const addPhotos = async (files) => {
    const list = [...(files || [])].slice(0, 8 - f.photos.length);
    if (list.some((x) => !/^image\//.test(x.type) || x.size > 5 * 1024 * 1024)) return setError('Photos must be images under 5 MB.');
    setUploading(true); setError('');
    try { const urls = await Promise.all(list.map(uploadPublic)); setF((x) => ({ ...x, photos: [...x.photos, ...urls] })); } catch (e) { setError(errMsg(e)); } finally { setUploading(false); }
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { const { listing } = await call('marketplace', 'saveListing', { listing_id: id, data: f }); toast(listing.status === 'pending' ? 'Submitted — we’ll review it shortly.' : 'Listing saved.'); navigate('/classifieds/mine'); } catch (e2) { setError(errMsg(e2)); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageHead eyebrow="Classifieds" title={id ? 'Edit listing' : 'Create a listing'}>Equipment, supplies, furniture and business opportunities for the hospitality industry. No job ads here — use “Post a Job” for hiring.</PageHead>
      <form onSubmit={save} className="grid gap-5 sm:grid-cols-2">
        <Field label="Title" required className="sm:col-span-2"><Input value={f.title} onChange={set('title')} required maxLength={120} placeholder="True 2-door reach-in fridge" /></Field>
        <Field label="Category" required><Select value={f.category} onChange={set('category')} options={CLASSIFIED_CATEGORIES} /></Field>
        <Field label="Condition"><Select value={f.condition} onChange={set('condition')} options={CONDITIONS} /></Field>
        <Field label="Pricing"><Select value={f.price_type} onChange={set('price_type')} options={[{ value: 'fixed', label: 'Fixed price' }, { value: 'negotiable', label: 'Negotiable' }, { value: 'free', label: 'Free' }, { value: 'contact', label: 'Contact for price' }]} /></Field>
        {['fixed', 'negotiable'].includes(f.price_type) && <Field label="Price (CAD)" required><Input type="number" min="1" step="1" value={f.price} onChange={set('price')} required /></Field>}
        <Field label="Area" required><Select value={f.location} onChange={set('location')} options={LOCATIONS} /></Field>
        <Field label="Seller name shown"><Input value={f.seller_name} onChange={set('seller_name')} maxLength={80} /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea value={f.description} onChange={set('description')} rows={6} maxLength={6000} placeholder="Model, dimensions, age, pickup details…" /></Field>
        <Field label={`Photos (${f.photos.length}/8)`} className="sm:col-span-2">
          <div className="flex flex-wrap gap-3">
            {f.photos.map((p) => <div key={p} className="relative h-24 w-28 border border-line"><img src={p} alt="" className="h-full w-full object-cover" /><button type="button" onClick={() => setF({ ...f, photos: f.photos.filter((x) => x !== p) })} className="absolute right-1 top-1 bg-ink p-0.5 text-paper" aria-label="Remove photo"><X className="h-3 w-3" /></button></div>)}
            {f.photos.length < 8 && <label className="flex h-24 w-28 cursor-pointer flex-col items-center justify-center gap-1 border border-dashed border-line text-xs text-muted hover:border-ink"><ImagePlus className="h-5 w-5" />{uploading ? 'Uploading…' : 'Add photos'}<input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => addPhotos(e.target.files)} /></label>}
          </div>
        </Field>
        <ErrorNote className="sm:col-span-2">{error}</ErrorNote>
        <div className="sm:col-span-2"><Button type="submit" loading={busy} size="lg">{id ? 'Save changes' : 'Submit for review'}</Button></div>
      </form>
    </div>
  );
}

export function MyClassifieds() {
  const s = useSession();
  const toast = useToast();
  const { data, loading, reload } = useAsync(() => db.ClassifiedListing.filter({ owner_id: s.user.id }, '-created_date', 200), [s.user.id]);
  const setStatus = async (l, status) => { try { await call('marketplace', 'setListingStatus', { listing_id: l.id, status }); toast(status === 'delete' ? 'Listing deleted.' : `Marked ${status}.`); reload(); } catch (e) { toast(errMsg(e), 'error'); } };
  return (
    <div className="mx-auto max-w-page px-4 py-10 sm:px-6">
      <PageHead eyebrow="Classifieds" title="My listings" actions={<Button to="/classifieds/new">New listing</Button>} />
      {loading ? <Loading /> : (
        <Table rows={data || []} empty="You haven’t listed anything yet." columns={[
          { key: 't', label: 'Listing', render: (l) => <Link to={`/classifieds/${l.id}`} className="font-medium hover:underline">{l.title}</Link> },
          { key: 'p', label: 'Price', render: priceText },
          { key: 's', label: 'Status', render: (l) => <Badge tone={l.status === 'active' ? 'ok' : l.status === 'removed' ? 'signal' : 'muted'}>{l.status === 'pending' ? 'In review' : l.status}</Badge> },
          { key: 'v', label: 'Views', render: (l) => l.views || 0 },
          { key: 'a', label: '', className: 'text-right', render: (l) => l.status === 'removed' ? <span className="text-xs text-muted">{l.moderation_note}</span> : (
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" to={`/classifieds/${l.id}/edit`}>Edit</Button>
              {l.status === 'active' && <Button size="sm" variant="ghost" onClick={() => setStatus(l, 'sold')}>Mark sold</Button>}
              {l.status === 'sold' && <Button size="sm" variant="ghost" onClick={() => setStatus(l, 'active')}>Relist</Button>}
              <Button size="sm" variant="danger" onClick={() => window.confirm('Delete this listing?') && setStatus(l, 'delete')}>Delete</Button>
            </div>
          ) },
        ]} />
      )}
    </div>
  );
}
