import { getAccessToken } from '@base44/sdk';

const isNode = typeof window === 'undefined';

if (!isNode && new URLSearchParams(window.location.search).get('clear_access_token') === 'true') {
  window.localStorage.removeItem('base44_access_token');
  window.localStorage.removeItem('token');
}

export const appParams = {
  appId: import.meta.env.VITE_BASE44_APP_ID || (import.meta.env.VITE_LOCAL_BACKEND === '1' ? 'local-staffto' : undefined),
  token: isNode ? null : getAccessToken(),
  functionsVersion: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION,
  appBaseUrl: import.meta.env.VITE_BASE44_APP_BASE_URL,
};
