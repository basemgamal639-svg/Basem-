import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bell, MessageSquare } from 'lucide-react';
import { Button, cx, Empty, ErrorNote, Loading, PageHead, Textarea } from '@/staffto/components/ui';
import { call, db, errMsg } from '@/staffto/lib/api';
import { useAsync } from '@/staffto/lib/hooks';
import { useSession } from '@/staffto/lib/session';
import { useSeo } from '@/staffto/lib/seo';
import { ago } from '@/staffto/lib/format';

export function Thread({ threadKey, compact }) {
  const { user } = useSession();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  const { data: msgs, loading, reload } = useAsync(() => db.Message.filter({ thread_key: threadKey }, 'created_date', 300), [threadKey]);
  useEffect(() => {
    if (msgs?.some((m) => m.recipient_id === user.id && !m.read)) call('marketplace', 'markThreadRead', { thread_key: threadKey }).catch(() => {});
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [msgs]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setError('');
    try { await call('marketplace', 'sendMessage', { thread_key: threadKey, body: text }); setText(''); reload(); } catch (e2) { setError(errMsg(e2)); } finally { setBusy(false); }
  };
  return (
    <div className="border border-line bg-white">
      <div className={cx('space-y-3 overflow-y-auto p-4', compact ? 'max-h-64' : 'max-h-[55vh] min-h-[200px]')}>
        {loading ? <Loading /> : msgs?.length ? msgs.map((m) => {
          const mine = m.sender_id === user.id;
          return (
            <div key={m.id} className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
              <div className={cx('max-w-[80%] px-3 py-2 text-sm', mine ? 'bg-ink text-paper' : 'bg-paper-2')}>
                <p className="whitespace-pre-line">{m.body}</p>
                <p className={cx('mt-1 text-[11px]', mine ? 'text-paper/60' : 'text-muted')}>{mine ? 'You' : m.sender_name} · {ago(m.created_date)}</p>
              </div>
            </div>
          );
        }) : <p className="text-sm text-muted">No messages yet. Say hello — keep it professional and job-related.</p>}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Write a message…" className="flex-1" aria-label="Message" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(e); }} />
        <Button type="submit" loading={busy} className="self-end">Send</Button>
      </form>
      <ErrorNote className="m-3 mt-0">{error}</ErrorNote>
    </div>
  );
}

export default function Messages() {
  useSeo({ title: 'Messages', noindex: true });
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const { data, loading } = useAsync(async () => {
    const [sent, received] = await Promise.all([db.Message.filter({ sender_id: user.id }, '-created_date', 500), db.Message.filter({ recipient_id: user.id }, '-created_date', 500)]);
    return [...sent, ...received];
  }, [user.id]);
  const threads = useMemo(() => {
    const m = new Map();
    for (const msg of data || []) {
      const t = m.get(msg.thread_key) || { key: msg.thread_key, title: msg.context_title, last: msg, unread: 0, other: msg.sender_id === user.id ? msg.recipient_name : msg.sender_name };
      if (msg.created_date > t.last.created_date) t.last = msg;
      if (msg.recipient_id === user.id && !msg.read) t.unread++;
      m.set(msg.thread_key, t);
    }
    return [...m.values()].sort((a, b) => b.last.created_date.localeCompare(a.last.created_date));
  }, [data, user.id]);
  const current = params.get('t') || threads[0]?.key;
  return (
    <div className="mx-auto max-w-page px-4 py-10 sm:px-6">
      <PageHead eyebrow="Inbox" title="Messages">Conversations with employers, applicants and classifieds buyers or sellers. Your email address is never shown.</PageHead>
      {loading ? <Loading /> : threads.length === 0 ? <Empty icon={MessageSquare} title="No conversations yet">Employers can message you after you apply; you can message sellers from any classified listing.</Empty> : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <ul className="divide-y divide-line border-y border-line">
            {threads.map((t) => (
              <li key={t.key}><button onClick={() => setParams({ t: t.key })} className={cx('w-full px-3 py-3 text-left', current === t.key ? 'bg-white' : 'hover:bg-paper-2/60')}>
                <p className="flex items-center justify-between gap-2 text-sm font-medium"><span className="truncate">{t.other}</span>{t.unread > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-signal" />}</p>
                <p className="truncate text-xs text-muted">{t.title}</p>
                <p className="mt-1 truncate text-xs text-ink/70">{t.last.body}</p>
              </button></li>
            ))}
          </ul>
          {current && <div><p className="mb-2 text-sm font-semibold">{threads.find((t) => t.key === current)?.title}</p><Thread threadKey={current} /></div>}
        </div>
      )}
    </div>
  );
}

export function Notifications() {
  useSeo({ title: 'Notifications', noindex: true });
  const { user } = useSession();
  const { data, loading, setData } = useAsync(() => db.Notification.filter({ user_id: user.id }, '-created_date', 200), [user.id]);
  const markAll = async () => {
    const unread = (data || []).filter((n) => !n.read);
    await Promise.all(unread.map((n) => db.Notification.update(n.id, { read: true })));
    setData((d) => d.map((n) => ({ ...n, read: true })));
  };
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageHead eyebrow="Updates" title="Notifications" actions={data?.some((n) => !n.read) && <Button variant="outline" size="sm" onClick={markAll}>Mark all read</Button>} />
      {loading ? <Loading /> : !data?.length ? <Empty icon={Bell} title="You're all caught up" /> : (
        <ul className="divide-y divide-line border-y border-line">
          {data.map((n) => (
            <li key={n.id} className={cx('flex gap-3 px-2 py-4', !n.read && 'bg-white')}>
              <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-signal')} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{n.title}</p>
                <p className="text-sm text-muted">{n.body}</p>
                <p className="mt-1 text-xs text-muted">{ago(n.created_date)}{n.link && <> · <Link to={n.link} onClick={() => !n.read && db.Notification.update(n.id, { read: true })} className="text-ink underline">Open</Link></>}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
