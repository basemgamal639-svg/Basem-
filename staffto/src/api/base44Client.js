import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// serverUrl '' = same origin. On Base44 hosting /api is the app's backend; locally Vite proxies /api
// to the Base44 dev backend (`base44 dev`) or to test/local-backend.
export const base44 = createClient({ appId, token, functionsVersion, serverUrl: '', appBaseUrl });
