import { createContext, useContext } from 'react';
import type { KpiScope } from './scope.js';

/** The period a `KpiStrip` names once; its tiles drop a chip that repeats it (#604). */
const KpiStripScopeContext = createContext<KpiScope | undefined>(undefined);

export const KpiStripScopeProvider = KpiStripScopeContext.Provider;

export function useKpiStripScope(): KpiScope | undefined {
  return useContext(KpiStripScopeContext);
}
