import { createContext, forwardRef, useCallback, useContext, useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Loader2, Check } from 'lucide-react';

export const cx = (...c) => c.filter(Boolean).join(' ');

const BTN = {
  primary: 'bg-ink text-paper hover:bg-ink-3 border border-ink',
  signal: 'bg-signal text-white hover:bg-signal-600 border border-signal',
  outline: 'bg-transparent text-ink border border-ink/80 hover:bg-ink hover:text-paper',
  ghost: 'bg-transparent text-ink border border-transparent hover:bg-paper-2',
  light: 'bg-paper text-ink border border-paper hover:bg-paper-2',
  danger: 'bg-transparent text-signal border border-signal/50 hover:bg-signal-50',
  link: 'bg-transparent text-ink underline underline-offset-4 decoration-ink/30 hover:decoration-ink border border-transparent px-0',
};
const SIZE = { sm: 'h-8 px-3 text-[13px]', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-[15px]' };

export const Button = forwardRef(function Button({ as, to, href, variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }, ref) {
  const cls = cx('inline-flex items-center justify-center gap-2 rounded font-medium tracking-tight transition-colors duration-150 select-none whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:opacity-50 disabled:pointer-events-none', BTN[variant], variant !== 'link' && SIZE[size], className);
  const inner = <>{loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{children}</>;
  if (to) return <Link ref={ref} to={to} className={cls} {...rest}>{inner}</Link>;
  if (href) return <a ref={ref} href={href} className={cls} {...rest}>{inner}</a>;
  return <button ref={ref} className={cls} disabled={disabled || loading} type={rest.type || 'button'} {...rest}>{inner}</button>;
});

export function Field({ label, hint, error, children, required, className, htmlFor }) {
  return (
    <div className={cx('space-y-1.5', className)}>
      {label && <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink">{label}{required && <span className="text-signal"> *</span>}</label>}
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs text-signal" role="alert">{error}</p>}
    </div>
  );
}

const inputCls = 'w-full rounded border border-line bg-white px-3 text-[15px] text-ink placeholder:text-muted/70 transition focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10 disabled:bg-paper-2';
export const Input = forwardRef(function Input({ className, ...p }, ref) { return <input ref={ref} className={cx(inputCls, 'h-10', className)} {...p} />; });
export const Textarea = forwardRef(function Textarea({ className, rows = 4, ...p }, ref) { return <textarea ref={ref} rows={rows} className={cx(inputCls, 'py-2 leading-relaxed', className)} {...p} />; });
export function Select({ options = [], placeholder, className, ...p }) {
  return (
    <select className={cx(inputCls, 'h-10 pr-8 appearance-none bg-[length:12px] bg-[right_12px_center] bg-no-repeat', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23111417' fill='none' stroke-width='1.5'/%3E%3C/svg%3E\")" }} {...p}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Checkbox({ label, checked, onChange, hint, className, ...p }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cx('flex cursor-pointer items-start gap-3 text-sm', className)}>
      <input id={id} type="checkbox" checked={!!checked} onChange={(e) => onChange?.(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-ink" {...p} />
      <span><span className="text-ink">{label}</span>{hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}</span>
    </label>
  );
}

// Toggle chips for multi-select lists (categories, shifts, locations).
export function ChipSelect({ options, value = [], onChange, max, name }) {
  const toggle = (v) => {
    const has = value.includes(v);
    if (!has && max && value.length >= max) return;
    onChange(has ? value.filter((x) => x !== v) : [...value, v]);
  };
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={name}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button type="button" key={o.value} onClick={() => toggle(o.value)} aria-pressed={on}
            className={cx('inline-flex h-8 items-center gap-1 rounded-sm border px-2.5 text-[13px] transition', on ? 'border-ink bg-ink text-paper' : 'border-line bg-white text-ink hover:border-ink/50')}>
            {on && <Check className="h-3.5 w-3.5" aria-hidden />}{o.label}
          </button>
        );
      })}
    </div>
  );
}

// Free-text tags input (skills, certifications).
export function TagInput({ value = [], onChange, placeholder = 'Type and press Enter', suggestions = [] }) {
  const [text, setText] = useState('');
  const add = (t) => {
    const v = t.trim().replace(/,$/, '');
    if (v && !value.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...value, v]);
    setText('');
  };
  return (
    <div>
      <div className={cx(inputCls, 'flex min-h-10 flex-wrap items-center gap-1.5 py-1.5')}>
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-sm bg-paper-2 px-2 py-0.5 text-[13px]">
            {t}<button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}><X className="h-3 w-3" /></button>
          </span>
        ))}
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={value.length ? '' : placeholder}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(text); } if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1)); }}
          onBlur={() => text && add(text)} className="min-w-[8rem] flex-1 border-0 bg-transparent p-0 text-[15px] focus:outline-none focus:ring-0" />
      </div>
      {suggestions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {suggestions.filter((s) => !value.includes(s)).slice(0, 10).map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-sm border border-dashed border-line px-2 py-0.5 text-xs text-muted hover:border-ink hover:text-ink">+ {s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const TONE = {
  neutral: 'bg-paper-2 text-ink border-line', ok: 'bg-[#E6F2EC] text-ok border-[#CDE4D8]', signal: 'bg-signal-50 text-signal border-signal/20',
  lake: 'bg-lake-50 text-lake border-lake/20', brass: 'bg-brass-50 text-[#7A5A12] border-brass/30', muted: 'bg-transparent text-muted border-line', dark: 'bg-ink text-paper border-ink',
};
export function Badge({ tone = 'neutral', children, className }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-2xs uppercase tracking-wider', TONE[tone], className)}>{children}</span>;
}

export const Spinner = ({ className }) => <Loader2 className={cx('h-5 w-5 animate-spin text-muted', className)} aria-label="Loading" />;
export function Loading({ label = 'Loading…' }) {
  return <div className="flex items-center gap-3 py-16 text-sm text-muted" role="status"><Spinner /> {label}</div>;
}
export function ErrorNote({ children, className }) {
  if (!children) return null;
  return <div role="alert" className={cx('border-l-2 border-signal bg-signal-50 px-3 py-2 text-sm text-signal-600', className)}>{children}</div>;
}
export function Notice({ children, tone = 'lake', className }) {
  return <div className={cx('border-l-2 px-3 py-2 text-sm', tone === 'lake' ? 'border-lake bg-lake-50 text-lake' : 'border-brass bg-brass-50 text-[#6B4E0F]', className)}>{children}</div>;
}
export function Empty({ title, children, action, icon: Icon }) {
  return (
    <div className="border border-dashed border-line px-6 py-12 text-center">
      {Icon && <Icon className="mx-auto mb-3 h-6 w-6 text-muted" aria-hidden />}
      <p className="font-display text-2xl">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Eyebrow({ children, className }) {
  return <p className={cx('font-mono text-2xs uppercase tracking-[0.18em] text-muted', className)}>{children}</p>;
}

export function Modal({ open, onClose, title, children, wide, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx('max-h-[92vh] w-full overflow-y-auto bg-paper shadow-2xl animate-rise', wide ? 'sm:max-w-4xl' : 'sm:max-w-lg')}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-paper px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-paper-2"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer && <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-paper px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((msg, tone = 'ok') => {
    const id = Math.random();
    setItems((x) => [...x, { id, msg, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx('pointer-events-auto animate-rise border px-4 py-3 text-sm shadow-lg', t.tone === 'error' ? 'border-signal bg-signal text-white' : 'border-ink bg-ink text-paper')}>{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cx('flex gap-0 overflow-x-auto border-b border-line', className)} role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cx('-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm transition', value === t.value ? 'border-ink font-medium text-ink' : 'border-transparent text-muted hover:text-ink')}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 font-mono text-2xs text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, dark }) {
  return (
    <div className={cx('border-t pt-3', dark ? 'border-line-dark' : 'border-line')}>
      <p className={cx('font-mono text-2xs uppercase tracking-[0.16em]', dark ? 'text-muted-dark' : 'text-muted')}>{label}</p>
      <p className="mt-1 font-display text-4xl leading-none tabular-nums">{value}</p>
      {sub && <p className={cx('mt-1 text-xs', dark ? 'text-muted-dark' : 'text-muted')}>{sub}</p>}
    </div>
  );
}

export function Table({ columns, rows, empty = 'Nothing here yet.', rowKey = 'id' }) {
  return (
    <div className="overflow-x-auto border border-line bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-line bg-paper-2/60">
          <tr>{columns.map((c) => <th key={c.key} className={cx('px-3 py-2.5 font-mono text-2xs font-normal uppercase tracking-wider text-muted', c.className)}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns.length} className="px-3 py-10 text-center text-muted">{empty}</td></tr>}
          {rows.map((r) => (
            <tr key={r[rowKey]} className="border-b border-line/70 last:border-0 hover:bg-paper/60">
              {columns.map((c) => <td key={c.key} className={cx('px-3 py-2.5 align-top', c.className)}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PageHead({ eyebrow, title, children, actions }) {
  return (
    <div className="mb-8 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <Eyebrow className="mb-2">{eyebrow}</Eyebrow>}
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">{title}</h1>
        {children && <div className="mt-2 max-w-2xl text-[15px] text-muted">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
