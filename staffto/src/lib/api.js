import { base44 } from '@/api/base44Client';

export const db = base44.entities;
export const integrations = base44.integrations;

export function errMsg(e) {
  const d = e?.data || e?.response?.data;
  return (d && (d.message || d.error || d.detail)) || e?.message || 'Something went wrong. Please try again.';
}
export const errCode = (e) => (e?.data || e?.response?.data)?.code || null;

// Calls a backend function action and returns its JSON payload.
export async function call(fn, action, payload = {}) {
  const res = await base44.functions.invoke(fn, { action, ...payload });
  return res?.data ?? res;
}

export async function uploadPublic(file) {
  const { file_url } = await base44.integrations.Core.UploadFile({ file });
  return file_url;
}
export async function uploadPrivate(file) {
  const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
  return file_uri;
}
