const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 2 });
const cad0 = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

export const money = (cents) => cad.format((Number(cents) || 0) / 100);
export const number = (n) => new Intl.NumberFormat('en-CA').format(Number(n) || 0);

export function pay(job) {
  if (!job?.salary_min) return 'Pay not listed';
  const per = job.salary_period === 'year' ? '/yr' : '/hr';
  const f = (v) => (job.salary_period === 'year' ? cad0.format(v) : cad.format(v).replace(/\.00$/, ''));
  return job.salary_max && job.salary_max !== job.salary_min ? `${f(job.salary_min)}–${f(job.salary_max)}${per}` : `${f(job.salary_min)}${per}`;
}

export function ago(iso) {
  if (!iso) return '';
  const d = new Date(iso.endsWith('000') && !iso.endsWith('Z') ? iso.replace(/000$/, 'Z') : iso);
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}
export const date = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
export const pct = (x) => `${Math.round((x || 0) * 1000) / 10}%`;
export const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
export const jobPath = (job) => `/jobs/${job.id}/${job.slug || ''}`;
