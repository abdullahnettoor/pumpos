import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CloudStationService,
  setApiBaseUrl,
  setAuthToken,
  clearPersistedQueryCache,
  supabase,
} from '@pump/ui';

export type UserRole = 'Owner' | 'Manager' | 'Accountant' | 'Staff' | 'Attendant';

/** Resolve the API base URL from the current mobile host (mirrors console). */
export function resolveApiUrl(): string | undefined {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL as string;
  if (typeof window !== 'undefined') {
    const { hostname } = window.location;
    if (
      hostname === 'dev-pumpos-mobile.abdullahnettoor.workers.dev' ||
      hostname === 'm.pumpos.abdullahnettoor.com' ||
      hostname === 'm.pumpos.app'
    ) {
      return 'https://pumpos-api.abdullahnettoor.workers.dev';
    }
  }
  return undefined;
}

setApiBaseUrl(resolveApiUrl());

const stationService = new CloudStationService();

export interface SessionState {
  status: 'loading' | 'signed-out' | 'ready' | 'error';
  session: any;
  role: UserRole | null;
  userName: string;
  error: { message: string; code?: string } | null;
}

/**
 * Mirrors the console's auth wiring: subscribe to Supabase auth, push the JWT
 * into the request layer, and resolve the backend session (role + name).
 */
export function useSession(): SessionState {
  const qc = useQueryClient();
  const lastUserIdRef = useRef<string | null>(null);
  const [state, setState] = useState<SessionState>({
    status: 'loading',
    session: null,
    role: null,
    userName: '',
    error: null,
  });

  useEffect(() => {
    const handle = async (session: any) => {
      if (!session) {
        setAuthToken('');
        lastUserIdRef.current = null;
        setState({ status: 'signed-out', session: null, role: null, userName: '', error: null });
        return;
      }
      setAuthToken(session.access_token);

      // Account switch: purge caches so the previous user's data can't bleed.
      if (lastUserIdRef.current && lastUserIdRef.current !== session.user.id) {
        qc.clear();
        clearPersistedQueryCache();
      }
      lastUserIdRef.current = session.user.id;

      try {
        const ctx = await stationService.getCurrentSession();
        setState({
          status: 'ready',
          session,
          role: ctx.user.role,
          userName: ctx.user.fullName?.trim() || ctx.user.email,
          error: null,
        });
      } catch (e: any) {
        setState({
          status: 'error',
          session,
          role: null,
          userName: '',
          error: { message: e?.message ?? 'Failed to load session', code: e?.code },
        });
      }
    };

    supabase.auth.getSession().then(({ data }: any) => handle(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e: any, session: any) => handle(session));
    return () => subscription.unsubscribe();
  }, [qc]);

  return state;
}

export function signOut() {
  return supabase.auth.signOut();
}
