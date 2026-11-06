import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { db, call } from '@/lib/api';
import { BRAND_DEFAULTS } from '@/lib/brand';

const SessionCtx = createContext(null);
const first = (rows) => (Array.isArray(rows) ? rows[0] : rows?.items?.[0]) || null;

// Holds the signed-in user and their StaffTO records (profile, employer, candidate) plus public platform settings.
export function SessionProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, profile: null, employer: null, candidate: null });
  const [settings, setSettings] = useState({ branding: BRAND_DEFAULTS, community: {}, seo: {}, pricing: null, payments: { enabled: false } });

  const load = useCallback(async () => {
    if (!base44.auth.hasToken?.() && !localStorage.getItem('base44_access_token')) {
      setState({ loading: false, user: null, profile: null, employer: null, candidate: null });
      return null;
    }
    try {
      const user = await base44.auth.me();
      const [profile, employer, candidate] = await Promise.all([
        db.UserProfile.filter({ user_id: user.id }, '-created_date', 1).then(first),
        db.Employer.filter({ owner_id: user.id }, '-created_date', 1).then(first),
        db.CandidateProfile.filter({ user_id: user.id }, '-created_date', 1).then(first),
      ]);
      const next = { loading: false, user, profile, employer, candidate };
      setState(next);
      return next;
    } catch {
      setState({ loading: false, user: null, profile: null, employer: null, candidate: null });
      return null;
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const [rows, catalog] = await Promise.all([db.PlatformSetting.list('-updated_date', 50), call('billing', 'catalog').catch(() => null)]);
      const byKey = Object.fromEntries((rows || []).map((r) => [r.key, r.value]));
      setSettings({
        branding: { ...BRAND_DEFAULTS, ...(byKey.branding || {}) },
        community: byKey.community || {},
        seo: byKey.seo || {},
        pricing: catalog?.pricing || null,
        payments: catalog?.payments || { enabled: false },
      });
    } catch { /* public settings are optional */ }
  }, []);

  useEffect(() => { load(); loadSettings(); }, [load, loadSettings]);

  const value = useMemo(() => ({
    ...state,
    settings,
    reload: load,
    reloadSettings: loadSettings,
    isAdmin: state.user?.role === 'admin',
    isEmployer: state.profile?.account_type === 'employer',
    isSeeker: state.profile?.account_type === 'seeker',
    logout: () => { base44.auth.logout('/'); },
  }), [state, settings, load, loadSettings]);

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export const useSession = () => useContext(SessionCtx);
