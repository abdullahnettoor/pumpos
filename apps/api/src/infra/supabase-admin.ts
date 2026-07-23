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
  /** ISO timestamp; null until the invite is accepted (password set). */
  email_confirmed_at?: string | null;
  /** ISO timestamp when the invite email was sent. */
  invited_at?: string | null;
  /** ISO timestamp of last sign-in, or null. */
  last_sign_in_at?: string | null;
  /** ISO timestamp — set to a far-future date while the user is banned. */
  banned_until?: string | null;
  user_metadata?: Record<string, unknown>;
  created_at?: string | null;
}

export interface CreateAuthUserInput {
  /** Real email, OR the synthetic phone handle. Provisioned as confirmed. */
  email: string;
  password: string;
  /**
   * Optional auth-user metadata (`raw_user_meta_data`). Read by the gated
   * `handle_new_user()` trigger — e.g. `signup_intent`, `organization_name`,
   * `full_name`, `role` for owner provisioning. Omit for staff accounts.
   */
  userMetadata?: Record<string, unknown>;
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
      ...(input.userMetadata ? { user_metadata: input.userMetadata } : {}),
    });
    return user;
  }

  /** Set a new password directly — no email/SMS reset flow. */
  async updatePassword(authUserId: string, password: string): Promise<void> {
    await this.request('PUT', `/admin/users/${authUserId}`, { password });
  }

  /**
   * Send an invite email so the recipient sets their own password. Carries
   * `data` into the auth user's metadata (read by the gated `handle_new_user()`
   * trigger, e.g. `signup_intent`, `organization_name`). `redirectTo` becomes
   * the link's destination (must be in the Supabase redirect allow-list).
   */
  async inviteUserByEmail(
    email: string,
    options: { data?: Record<string, unknown>; redirectTo?: string } = {},
  ): Promise<SupabaseAdminUser> {
    const qs = options.redirectTo ? `?redirect_to=${encodeURIComponent(options.redirectTo)}` : '';
    const user = await this.request<SupabaseAdminUser>('POST', `/invite${qs}`, {
      email,
      data: options.data ?? {},
    });
    return user;
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

  /** Fetch a Supabase auth user by id (includes invite / ban / sign-in state). */
  async getUserById(authUserId: string): Promise<SupabaseAdminUser | null> {
    try {
      return await this.request<SupabaseAdminUser>('GET', `/admin/users/${authUserId}`);
    } catch (err) {
      if (err instanceof SupabaseAdminError && err.status === 404) return null;
      throw err;
    }
  }

  /**
   * Permanently delete an auth user. Only used by the platform back-office to
   * revoke a never-accepted owner invite; for accepted users prefer banUser.
   */
  async deleteUser(authUserId: string): Promise<void> {
    await this.request('DELETE', `/admin/users/${authUserId}`);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
