import { useMemo } from 'react';
import { useInventoryStatus } from '@pump/ui';

/** Tank and product names, from the station's tank status (the cache Home already fills). */
export function useDecantationNames(stationId: string) {
  const q = useInventoryStatus(stationId);
  return useMemo(() => {
    const tanks: Record<string, string> = {};
    const products: Record<string, string> = {};
    for (const t of q.data ?? []) {
      tanks[t.id] = t.name;
      products[t.productId] = t.productName ?? t.productCode ?? 'Fuel';
    }
    return { tanks, products };
  }, [q.data]);
}
