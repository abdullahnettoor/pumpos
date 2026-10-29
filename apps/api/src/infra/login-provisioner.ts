import { coreError, conflictError, err, ok } from '@pump/core';
import type { LoginProvisioner, Result } from '@pump/core';
import type { SupabaseAdmin } from './supabase-admin.js';

/**
 * Supabase Auth adapter for the `LoginProvisioner` port. It remembers the
 * login it created so the route can delete it if the surrounding database
 * transaction does not commit (the auth call is external and cannot roll back
 * with it).
 */
export class SupabaseLoginProvisioner implements LoginProvisioner {
  private createdAuthUserId: string | null = null;

  constructor(private readonly admin: SupabaseAdmin) {}

  async createLogin(input: {
    email: string;
    password: string;
  }): Promise<Result<{ authUserId: string }>> {
    try {
      const created = await this.admin.createUser(input);
      this.createdAuthUserId = created.id;
      return ok({ authUserId: created.id });
    } catch (e: any) {
      // GoTrue answers 422 for an email (or phone handle) that already has a login.
      if (e?.status === 422) {
        return err(
          conflictError('That email or phone already has a login', { reason: 'IDENTITY_TAKEN' }),
        );
      }
      return err(
        coreError('AUTH_PROVISION_FAILED', e?.message ?? 'Could not create login account'),
      );
    }
  }

  /** Delete the login this request created, if any. Never throws: it runs on a failure path. */
  async rollback(): Promise<void> {
    const id = this.createdAuthUserId;
    if (!id) return;
    this.createdAuthUserId = null;
    try {
      await this.admin.deleteUser(id);
    } catch (e: any) {
      console.error('[APP-ACCESS] Could not delete login after a failed link', {
        authUserId: id,
        message: e?.message,
      });
    }
  }
}
