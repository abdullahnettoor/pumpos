import type { AccessMode } from '@pump/shared';
import {
  err,
  ok,
  organizationSuspendedError,
  subscriptionRestrictedError,
} from '../../kernel/index.js';
import type { Result } from '../../kernel/index.js';

/**
 * Write policy for Organization access modes.
 *
 * Restricted Access is not "read-only". A station that has already opened a
 * Business Day must be able to finish it safely — record sales and readings,
 * reconcile the drawer, close the Shift and close the day — while growth,
 * setup changes and premium actions stop. That distinction cannot be derived
 * from the HTTP method: closing a Shift and onboarding a Station are both
 * POSTs, and only one of them may continue.
 *
 * So every mutation *declares* its own answer. The declaration lives next to
 * the route, the decision lives here, and `assertWritePolicyComplete` makes a
 * missing declaration a test failure rather than a silent allow.
 */

/**
 * What an operation may do while the Organization is under Restricted Access.
 *
 * - `FINISH_OPEN_WORK` — permitted: it closes out work already in progress.
 * - `BLOCKED` — refused: growth, setup, invitations, premium actions.
 *
 * SUSPENDED ignores this entirely: nothing is written for a suspended
 * Organization, because suspension is a security, legal, fraud or abuse stop
 * rather than a billing state.
 */
export type RestrictedPolicy = 'FINISH_OPEN_WORK' | 'BLOCKED';

/** One mutating operation's declared policy. */
export interface WritePolicyDeclaration {
  /** Stable operation key, e.g. `shifts.close`. Appears in the error detail. */
  operation: string;
  restricted: RestrictedPolicy;
  /** Why this answer — read by whoever revisits the matrix later. */
  rationale: string;
}

/**
 * Decide whether a declared operation may proceed in the current access mode.
 *
 * Reads are not routed through here: historical records stay readable in every
 * mode, so revoking access never damages auditability.
 *
 * When the offline write outbox lands (Phase O), replayed mutations must reach
 * this same function with the mode resolved *at replay time*, not the one that
 * applied when the write was queued: a Station that went Restricted while
 * offline must not drain a backlog of growth operations on reconnect. The
 * queue is a delivery mechanism, not a licence — see
 * docs/roadmap/phase-O-offline-sync.md (O2).
 */
export function evaluateWritePolicy(
  mode: AccessMode,
  declaration: WritePolicyDeclaration,
): Result<void> {
  if (mode === 'SUSPENDED') {
    return err(
      organizationSuspendedError('This Organization is suspended. Contact PumpOS.', {
        operation: declaration.operation,
        resolution: 'WAIT_FOR_REACTIVATION',
        actionLabel: 'Contact PumpOS',
      }),
    );
  }

  if (mode === 'RESTRICTED' && declaration.restricted === 'BLOCKED') {
    return err(
      subscriptionRestrictedError(
        'Access is restricted until payment is completed. You can still finish open station work.',
        {
          operation: declaration.operation,
          resolution: 'COMPLETE_PAYMENT',
          actionLabel: 'Complete payment',
        },
      ),
    );
  }

  return ok(undefined);
}

/**
 * The declaration registry: every mutating operation, and its answer.
 *
 * Adding a mutation means adding a line here. That is the point — the matrix
 * is reviewable in one place, and the completeness check below turns an
 * omission into a failing test instead of an accidental allow.
 */
export type WritePolicyRegistry = Record<string, WritePolicyDeclaration>;

export function declareWritePolicies(
  declarations: readonly WritePolicyDeclaration[],
): WritePolicyRegistry {
  const registry: WritePolicyRegistry = {};
  for (const declaration of declarations) {
    if (registry[declaration.operation]) {
      throw new Error(`Duplicate write-policy declaration for "${declaration.operation}"`);
    }
    registry[declaration.operation] = declaration;
  }
  return registry;
}

/**
 * Which of `operations` have no declaration?
 *
 * Tests assert this is empty. A mutation that reaches production undeclared
 * would otherwise inherit whatever the default is — and any default is wrong:
 * "allow" lets an unpaid Organization keep growing, "block" breaks a station
 * mid-shift. The answer has to be written down per operation.
 */
export function undeclaredOperations(
  registry: WritePolicyRegistry,
  operations: readonly string[],
): string[] {
  return operations.filter((operation) => !registry[operation]);
}

/** Throw with a useful message when any operation lacks a declaration. */
export function assertWritePolicyComplete(
  registry: WritePolicyRegistry,
  operations: readonly string[],
): void {
  const missing = undeclaredOperations(registry, operations);
  if (missing.length === 0) return;
  throw new Error(
    `Undeclared write policy for: ${missing.join(', ')}. ` +
      'Every mutation must state whether Restricted Access permits it.',
  );
}
