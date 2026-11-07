import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Clock, BadgeCheck, Copy, Download, Share2, Facebook, MessageCircle, Linkedin, Flag } from 'lucide-react';
import { Badge, Button, cx, Field, Modal, Select, Textarea, useToast, ErrorNote } from '@/staffto/components/ui';
import { label, REPORT_REASONS } from '@/staffto/lib/constants';
import { ago, jobPath, pay } from '@/staffto/lib/format';
import { track } from '@/staffto/lib/analytics';
import { useSession } from '@/staffto/lib/session';
import { call, errMsg } from '@/staffto/lib/api';

export function JobCard({ job, compact, saved, onSave }) {
  return (
    <article className="group relative border-b border-line py-5 transition-colors first:border-t hover:bg-white/70 sm:px-3">
      <div className="flex items-start gap-4">
        <div className="hidden h-12 w-12 shrink-0 items-center justify-center overflow-hidden border border-line bg-white sm:flex">
          {job.employer_logo ? <img src={job.employer_logo} alt="" className="h-full w-full object-cover" loading="lazy" /> : <span className="font-display text-xl text-muted">{(job.employer_name || '?')[0]}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {job.is_featured && <Badge tone="signal">Featured</Badge>}
            <span className="font-mono text-2xs uppercase tracking-wider text-muted">{label(job.category)}</span>
          </div>
          <h3 className="mt-1 text-[17px] font-semibold leading-snug tracking-tight">
            <Link to={jobPath(job)} className="after:absolute after:inset-0">{job.title}</Link>
          </h3>
          <p className="mt-0.5 flex items-center gap-1 text-[14px] text-ink/80">
            {job.employer_name}{job.employer_verified && <BadgeCheck className="h-4 w-4 text-lake" aria-label="Verified employer" />}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{label(job.location)}</span>
            <span>{label(job.employment_type)}</span>
            {!compact && <span>{label(job.experience_level)}</span>}
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{ago(job.published_at || job.created_date)}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <p className="font-mono text-[14px] font-medium tabular-nums">{pay(job)}</p>
          {job.tips && job.tips !== 'none' && <p className="text-xs text-muted">+ {label(job.tips).toLowerCase()}</p>}
          {onSave && (
            <button onClick={(e) => { e.preventDefault(); onSave(job); }} className="relative z-10 text-xs text-muted underline-offset-2 hover:text-ink hover:underline">{saved ? 'Saved ✓' : 'Save'}</button>
          )}
          {!compact && <Button to={jobPath(job)} size="sm" variant="outline" className="relative z-10 hidden sm:inline-flex">Apply</Button>}
        </div>
      </div>
    </article>
  );
}

export function shareUrl(job, site, channel) {
  const base = `${site.replace(/\/$/, '')}${jobPath(job)}`;
  const p = new URLSearchParams({ utm_source: channel, utm_medium: 'social', utm_campaign: `job-${job.id.slice(-6)}` });
  return `${base}?${p}`;
}

export function announcement(job, site, channel = 'facebook') {
  const lines = [
    `HIRING — ${job.title.toUpperCase()}`,
    `${job.employer_name}`,
    `Location: ${label(job.location)}${job.address ? ` (${job.address})` : ''}`,
    `Pay: ${pay(job)}${job.tips && job.tips !== 'none' ? ` + ${label(job.tips).toLowerCase()}` : ''}`,
    `${label(job.employment_type)}${job.experience_level && job.experience_level !== 'none' ? ` · ${label(job.experience_level)} experience` : ''}`,
    job.shifts?.length ? `Shifts: ${job.shifts.map(label).join(', ')}` : '',
    '',
    `Apply here: ${shareUrl(job, site, channel)}`,
    '',
    '#TorontoJobs #HospitalityJobs #RestaurantJobs #GTAJobs',
  ];
  return lines.filter((l, i) => l !== '' || i > 0).join('\n').replace(/\n{3,}/g, '\n\n');
}

// Draws a 1080×1080 announcement image on a canvas (brand-consistent, no external assets).
function drawCard(canvas, job, brandName) {
  const S = 1080;
  canvas.width = S; canvas.height = S;
  const g = canvas.getContext('2d');
  g.fillStyle = '#111417'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#D2341E'; g.fillRect(0, 0, S, 14);
  g.fillStyle = '#FBFAF7';
  g.font = '500 30px Geist, Arial, sans-serif';
  g.fillText('NOW HIRING · TORONTO', 80, 130);
  g.font = '400 112px "Instrument Serif", Georgia, serif';
  const words = job.title.split(' ');
  let line = ''; let y = 290; const lines = [];
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > S - 160 && line) { lines.push(line); line = w; } else line = test;
  }
  lines.push(line);
  lines.slice(0, 3).forEach((l) => { g.fillText(l, 80, y); y += 116; });
  g.font = '500 40px Geist, Arial, sans-serif';
  g.fillStyle = '#C9CDD1';
  g.fillText(job.employer_name.slice(0, 40), 80, y + 10);
  const rows = [['PAY', pay(job)], ['WHERE', label(job.location)], ['TYPE', label(job.employment_type)]];
  let ry = 760;
  for (const [k, v] of rows) {
    g.fillStyle = '#2E353C'; g.fillRect(80, ry - 52, S - 160, 1);
    g.fillStyle = '#9AA1A8'; g.font = '500 24px "Geist Mono", monospace'; g.fillText(k, 80, ry);
    g.fillStyle = '#FBFAF7'; g.font = '600 40px Geist, Arial, sans-serif'; g.fillText(v, 300, ry + 4);
    ry += 92;
  }
  g.fillStyle = '#D2341E'; g.fillRect(S - 260, S - 120, 180, 56);
  g.fillStyle = '#FFFFFF'; g.font = '700 28px Geist, Arial, sans-serif'; g.fillText('APPLY', S - 222, S - 82);
  g.fillStyle = '#FBFAF7'; g.font = '400 44px "Instrument Serif", Georgia, serif'; g.fillText(brandName, 80, S - 78);
}

export function ShareKit({ job }) {
  const { settings } = useSession();
  const toast = useToast();
  const site = settings.branding.site_url || window.location.origin;
  const origin = window.location.origin;
  const liveSite = site.includes('staffto.ca') && !origin.includes('staffto.ca') ? origin : site;
  const [channel, setChannel] = useState('facebook');
  const text = useMemo(() => announcement(job, liveSite, channel), [job, liveSite, channel]);
  const canvasRef = useRef(null);
  useEffect(() => {
    const draw = () => canvasRef.current && drawCard(canvasRef.current, job, settings.branding.name);
    document.fonts?.ready ? document.fonts.ready.then(draw) : draw();
  }, [job, settings.branding.name]);
  const record = (ch) => track('share', { job_id: job.id, channel: ch });
  const copy = async () => { await navigator.clipboard.writeText(text); toast('Post copied — paste it into your Facebook group or page.'); record(`copy_${channel}`); };
  const download = () => {
    const a = document.createElement('a');
    a.href = canvasRef.current.toDataURL('image/png');
    a.download = `${job.slug || 'job'}-hiring.png`;
    a.click();
    record('image');
  };
  const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl(job, liveSite, 'facebook'))}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(announcement(job, liveSite, 'whatsapp'))}`;
  const li = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl(job, liveSite, 'linkedin'))}`;
  const native = async () => {
    try {
      const blob = await new Promise((r) => canvasRef.current.toBlob(r, 'image/png'));
      const file = new File([blob], 'hiring.png', { type: 'image/png' });
      const data = { title: job.title, text, url: shareUrl(job, liveSite, 'native') };
      if (navigator.canShare?.({ files: [file] })) data.files = [file];
      await navigator.share(data);
      record('native');
    } catch { /* cancelled */ }
  };
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium">Announcement text</p>
          <Select value={channel} onChange={(e) => setChannel(e.target.value)} className="h-8 w-auto text-[13px]" options={[{ value: 'facebook', label: 'Facebook group/page' }, { value: 'instagram', label: 'Instagram caption' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'email', label: 'Email' }]} />
        </div>
        <Textarea readOnly value={text} rows={12} className="font-mono text-[13px]" aria-label="Announcement text" />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={copy}><Copy className="h-4 w-4" />Copy post</Button>
          <Button href={fb} target="_blank" rel="noopener noreferrer" variant="outline" onClick={() => record('facebook')}><Facebook className="h-4 w-4" />Share to Facebook</Button>
          <Button href={wa} target="_blank" rel="noopener noreferrer" variant="outline" onClick={() => record('whatsapp')}><MessageCircle className="h-4 w-4" />WhatsApp</Button>
          <Button href={li} target="_blank" rel="noopener noreferrer" variant="outline" onClick={() => record('linkedin')}><Linkedin className="h-4 w-4" />LinkedIn</Button>
          {typeof navigator !== 'undefined' && navigator.share && <Button variant="ghost" onClick={native}><Share2 className="h-4 w-4" />More…</Button>}
        </div>
        <p className="mt-4 text-xs text-muted">Links carry UTM tags so visits and applications from each channel show up in your analytics. StaffTO never posts to Facebook groups on your behalf — group admins decide what's posted, so share it yourself or ask a group admin.</p>
      </div>
      <div>
        <p className="mb-3 text-sm font-medium">Shareable image (1080×1080)</p>
        <canvas ref={canvasRef} className="aspect-square w-full border border-line" aria-label="Generated hiring image preview" />
        <Button onClick={download} variant="outline" className="mt-3 w-full"><Download className="h-4 w-4" />Download image</Button>
      </div>
    </div>
  );
}

export function ReportButton({ targetType, targetId, className }) {
  const { user } = useSession();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user) return <Link to="/login" className={cx('inline-flex items-center gap-1 text-xs text-muted hover:text-ink', className)}><Flag className="h-3.5 w-3.5" />Report</Link>;
  const submit = async () => {
    setBusy(true); setError('');
    try {
      await call('marketplace', 'report', { target_type: targetType, target_id: targetId, reason, details });
      toast('Thanks — our moderators will review it.');
      setOpen(false);
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <button onClick={() => setOpen(true)} className={cx('inline-flex items-center gap-1 text-xs text-muted hover:text-ink', className)}><Flag className="h-3.5 w-3.5" />Report</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Report this listing" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={submit} loading={busy} disabled={!reason}>Send report</Button></>}>
        <div className="space-y-4">
          <Field label="What's wrong?" required><Select value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Choose a reason" options={REPORT_REASONS} /></Field>
          <Field label="Details (optional)"><Textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} /></Field>
          <ErrorNote>{error}</ErrorNote>
        </div>
      </Modal>
    </>
  );
}
