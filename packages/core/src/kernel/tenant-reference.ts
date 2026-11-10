import { notFoundError } from './errors.js';
import { err, ok, type Result } from './result.js';

/** Request-supplied foreign keys must resolve inside the acting Organization. */
export type TenantReferenceKind =
  | 'Station'
  | 'Shift Template'
  | 'Payment Terminal'
  | 'Nozzle'
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
    scope?: TenantReferenceScope,
  ): Promise<boolean>;
}

export interface TenantReferenceScope {
  stationId?: string;
  customerId?: string | null;
  productId?: string;
  tankId?: string | null;
}

export async function requireTenantReference(
  reader: TenantReferenceReader,
  organizationId: string,
  kind: TenantReferenceKind,
  id: string | null | undefined,
  scope?: TenantReferenceScope,
): Promise<Result<void>> {
  if (id != null && (id.length === 0 || !(await reader.exists(organizationId, kind, id, scope))))
    return err(notFoundError(kind, id));
  return ok(undefined);
}
