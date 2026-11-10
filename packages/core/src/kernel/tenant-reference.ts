import { notFoundError } from './errors.js';
import { err, ok, type Result } from './result.js';

/** Request-supplied foreign keys must resolve inside the acting Organization. */
export type TenantReferenceKind =
  | 'Product'
  | 'Tank'
  | 'Vehicle'
  | 'Attendant'
  | 'Dispenser'
  | 'Expense head'
  | 'Income head';

export interface TenantReferenceReader {
  exists(
    organizationId: string,
    kind: TenantReferenceKind,
    id: string,
    scope?: { stationId?: string; customerId?: string | null; productId?: string },
  ): Promise<boolean>;
}

export async function requireTenantReference(
  reader: TenantReferenceReader,
  organizationId: string,
  kind: TenantReferenceKind,
  id: string | null | undefined,
  scope?: { stationId?: string; customerId?: string | null; productId?: string },
): Promise<Result<void>> {
  if (id && !(await reader.exists(organizationId, kind, id, scope)))
    return err(notFoundError(kind, id));
  return ok(undefined);
}
