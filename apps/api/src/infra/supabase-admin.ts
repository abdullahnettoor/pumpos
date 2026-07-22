/**
 * Supabase GoTrue Admin adapter (Phase A).
 *
 * Thin server-only wrapper over the Supabase Auth Admin REST API, called with
 * the Supabase secret key (a Worker secret — never shipped to any client). Used
 * to provision staff login accounts, reset passwords, and ban/unban users
 * without sending any email or SMS.
 *
 * We hit the REST endpoints with `fetch` rather than pulling in
 * `@supabase/supabase-js` to keep the Worker bundle small and dependency-free.
 */

export interface SupabaseAdminUser {
  id: string;
  email: string | null;
  phone: string | null;
}

export interface CreateAuthUserInput {
  /** Real email, OR the synthetic phone handle. Provisioned as confirmed. */
  email: string;
  password: string;
}

export class SupabaseAdminError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'SupabaseAdminError';
  }
}

export interface SupabaseAdminConfig {
  url: string;
  /** Supabase secret key (modern `sb_secret_...`; legacy service_role also works). */
  secretKey: string;
}

export class SupabaseAdmin {
  private readonly base: string;
  private readonly headers: Record<string, string>;

  constructor(config: SupabaseAdminConfig) {
    this.base = config.url.replace(/\/$/, '');
    this.headers = {
      apikey: config.secretKey,
      Authorization: `Bearer ${config.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}/auth/v1${path}`, {
      method,
      headers: this.headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const parsed = text ? safeJson(text) : null;
    if (!res.ok) {
      const message =
        (parsed && typeof parsed === 'object' && (parsed as any).msg) ||
        (parsed && typeof parsed === 'object' && (parsed as any).message) ||
        `Supabase admin request failed (${res.status})`;
      throw new SupabaseAdminError(String(message), res.status, parsed);
    }
    return parsed as T;
  }

  /**
   * Create a verified auth user (email is the real address OR the synthetic
   * phone handle). `email_confirm: true` marks it confirmed and sends nothing.
   */
  async createUser(input: CreateAuthUserInput): Promise<SupabaseAdminUser> {
    const user = await this.request<SupabaseAdminUser>('POST', '/admin/users', {
      email: input.email,
      password: input.password,
      email_confirm: true,
    });
    return user;
  }

  /** Set a new password directly — no email/SMS reset flow. */
  async updatePassword(authUserId: string, password: string): Promise<void> {
    await this.request('PUT', `/admin/users/${authUserId}`, { password });
  }

  /**
   * Ban (disable) a user so existing tokens are rejected immediately.
   * `ban_duration` accepts a GoTrue duration string, e.g. `"876000h"` (~100y).
   */
  async banUser(authUserId: string, banDuration = '876000h'): Promise<void> {
    await this.request('PUT', `/admin/users/${authUserId}`, { ban_duration: banDuration });
  }

  /** Lift a ban (`"none"` clears `banned_until`). */
  async unbanUser(authUserId: string): Promise<void> {
    await this.request('PUT', `/admin/users/${authUserId}`, { ban_duration: 'none' });
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
