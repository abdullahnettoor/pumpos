import { describe, expect, it } from 'vitest';
import {
  assertWritePolicyComplete,
  declareWritePolicies,
  evaluateWritePolicy,
  undeclaredOperations,
  type WritePolicyDeclaration,
} from './write-policy.js';

/**
 * Restricted Access is not read-only, and that is the whole difficulty: a
 * station mid-day must finish safely while growth stops. These tests pin the
 * three decisions the framework makes — what Restricted permits, what
 * Suspended permits (nothing), and what happens to an operation nobody
 * declared.
 */

const declaration = (over: Partial<WritePolicyDeclaration> = {}): WritePolicyDeclaration => ({
  operation: 'POST /shifts/close',
  restricted: 'FINISH_OPEN_WORK',
  rationale: 'Drawer accountability must be settled.',
  ...over,
});

describe('evaluateWritePolicy', () => {
  it('permits everything while access is normal', () => {
    expect(evaluateWritePolicy('NORMAL', declaration({ restricted: 'BLOCKED' })).success).toBe(
      true,
    );
  });

  it('lets an Organization under Restricted Access finish open work', () => {
    expect(evaluateWritePolicy('RESTRICTED', declaration()).success).toBe(true);
  });

  it('refuses a blocked operation under Restricted Access, explaining the way out', () => {
    const result = evaluateWritePolicy(
      'RESTRICTED',
      declaration({ operation: 'POST /setup/stations', restricted: 'BLOCKED' }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('SUBSCRIPTION_RESTRICTED');
    expect(result.error.details).toEqual({
      operation: 'POST /setup/stations',
      resolution: 'COMPLETE_PAYMENT',
      actionLabel: 'Complete payment',
    });
    // The copy must say what still works, or an operator assumes everything stopped.
    expect(result.error.message).toMatch(/finish open station work/i);
  });

  it('refuses every write while the Organization is suspended, open work included', () => {
    // Suspension is a security, legal, fraud or abuse stop — not a billing
    // state — so the "finish the day" carve-out does not apply.
    const result = evaluateWritePolicy('SUSPENDED', declaration());

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('ORGANIZATION_SUSPENDED');
    expect(result.error.details).toMatchObject({ resolution: 'WAIT_FOR_REACTIVATION' });
  });

  it('does not decide by HTTP method: two POSTs, two answers', () => {
    const close = declaration({ operation: 'POST /shifts/close' });
    const onboard = declaration({ operation: 'POST /setup/stations', restricted: 'BLOCKED' });

    expect(evaluateWritePolicy('RESTRICTED', close).success).toBe(true);
    expect(evaluateWritePolicy('RESTRICTED', onboard).success).toBe(false);
  });
});

describe('the declaration registry', () => {
  it('rejects a duplicate declaration rather than letting one win silently', () => {
    expect(() => declareWritePolicies([declaration(), declaration()])).toThrow(/Duplicate/);
  });

  it('reports operations that have no declaration', () => {
    const registry = declareWritePolicies([declaration()]);

    expect(undeclaredOperations(registry, ['POST /shifts/close', 'POST /setup/tanks'])).toEqual([
      'POST /setup/tanks',
    ]);
  });

  it('fails loudly on an undeclared operation, naming it', () => {
    const registry = declareWritePolicies([declaration()]);

    expect(() => assertWritePolicyComplete(registry, ['POST /setup/tanks'])).toThrow(
      /POST \/setup\/tanks/,
    );
  });

  it('passes when every operation is declared', () => {
    const registry = declareWritePolicies([declaration()]);

    expect(() => assertWritePolicyComplete(registry, ['POST /shifts/close'])).not.toThrow();
  });
});
