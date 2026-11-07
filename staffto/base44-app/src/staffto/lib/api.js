import { base44 } from '@/api/base44Client';
import { staffBackend } from '@/lib/staffto-backend';

export const db = base44.entities;
export const integrations = base44.integrations;

export function errMsg(e) {
  const d = e?.data || e?.response?.data;
  return (d && (d.message || d.error || d.detail)) || e?.message || 'Something went wrong. Please try again.';
}
export const errCode = (e) => (e?.data || e?.response?.data)?.code || null;

// Calls a StaffTO server action (TanStack Start server function) and returns its JSON payload.
// Errors are rethrown in the same shape SDK errors have ({ status, data: { message, code } }).
export async function call(fn, action, payload = {}) {
  const r = await staffBackend({ data: { fn, action, payload, origin: typeof window === 'undefined' ? '' : window.location.origin } });
  if (!r?.ok) {
    const e = new Error(r?.error?.message || 'Request failed');
    e.status = r?.error?.status;
    e.data = { message: e.message, code: r?.error?.code || null };
    throw e;
  }
  return r.raw ?? r.result;
}

export async function uploadPublic(file) {
  const { file_url } = await base44.integrations.Core.UploadFile({ file });
  return file_url;
}
export async function uploadPrivate(file) {
  const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
  return file_uri;
}
