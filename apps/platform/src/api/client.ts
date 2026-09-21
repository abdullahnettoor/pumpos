/**
 * Authenticated calls to `/platform/*`.
 *
 * Mirrors `packages/db/platform.mjs`: sign in as a platform admin through
 * Supabase's password grant, then present the JWT as a Bearer token. The API
 * re-checks the email against `PLATFORM_ADMIN_EMAILS`, so this client is a
 * convenience, never the authority.
 *
 * The token lives in a module-level variable and nowhere else — no
 * localStorage, no Supabase client with session persistence. Closing the tab
 * ends the session. For a console whose buttons suspend live organizations,
 * re-authenticating is the right amount of friction.
 */
import { SUPABASE_ANON_KEY, SUPABASE_URL, type ApiTarget } from './targets.js';

export interface PlatformSession {
  email: string;
  token: string;
  /** Epoch ms at which the JWT stops being accepted. */
  expiresAt: number;
}

/**
 * Raised for a failed API call. `code` is the API's error code
 * (`ORG_NOT_EMPTY`, `ALREADY_ACCEPTED`, …) so callers can explain a refusal
 * instead of showing a bare HTTP status.
 */
export class PlatformApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PlatformApiError';
  }
}

let session: PlatformSession | null = null;
/** Notified when the session is established or dropped, so the shell re-renders. */
const listeners = new Set<(session: PlatformSession | null) => void>();

export function getSession(): PlatformSession | null {
  return session;
}

export function subscribeToSession(
  listener: (session: PlatformSession | null) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setSession(next: PlatformSession | null): void {
  session = next;
  for (const listener of listeners) listener(next);
}

export function signOut(): void {
  setSession(null);
}

/** The fields of Supabase's password-grant response this app reads. */
interface PasswordGrantResponse {
  access_token?: string;
  expires_in?: number;
  user?: { email?: string };
  error_description?: string;
  msg?: string;
}

/** Supabase password grant. Throws a readable message on bad credentials. */
export async function signIn(email: string, password: string): Promise<PlatformSession> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const body = (await res.json().catch(() => null)) as PasswordGrantResponse | null;
  if (!res.ok || !body?.access_token) {
    throw new Error(body?.error_description ?? body?.msg ?? `Sign-in failed (HTTP ${res.status})`);
  }
  const next: PlatformSession = {
    email: body.user?.email ?? email.trim().toLowerCase(),
    token: body.access_token,
    // `expires_in` is seconds; fall back to an hour, Supabase's default.
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  setSession(next);
  return next;
}

/**
 * One authenticated request against the selected target.
 *
 * A 401 drops the session rather than retrying: there is no refresh token held
 * anywhere, so an expired JWT can only be resolved by signing in again, and
 * silently failing every subsequent call would be worse than saying so.
 */
export async function request<T>(
  target: ApiTarget,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const current = session;
  if (!current) throw new PlatformApiError('Not signed in', 'UNAUTHORIZED', 401);

  const res = await fetch(`${target.url.replace(/\/$/, '')}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${current.token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    // A browser reports a blocked origin and an unreachable host identically,
    // so name both possibilities rather than echoing "Failed to fetch".
    throw new PlatformApiError(
      `Could not reach ${target.url} — is the API running and this origin allowed by CORS?`,
      'NETWORK_ERROR',
      0,
    );
  });

  const json = (await res.json().catch(() => null)) as
    | { success: true; data: T }
    | { success: false; error: { code: string; message: string } }
    | null;

  if (res.status === 401) {
    setSession(null);
    throw new PlatformApiError('Session expired — sign in again', 'UNAUTHORIZED', 401);
  }
  if (!res.ok || !json || json.success !== true) {
    const error = json && json.success === false ? json.error : null;
    throw new PlatformApiError(
      error?.message ?? `Request failed (HTTP ${res.status})`,
      error?.code ?? String(res.status),
      res.status,
    );
  }
  return json.data;
}
