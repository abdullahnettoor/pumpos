import { describe, expect, it } from 'vitest';
import { onboardingProvisionedQueryKeys, queryKeys } from './hooks.js';

describe('onboardingProvisionedQueryKeys', () => {
  it('invalidates every cache populated by station provisioning', () => {
    const stationId = 'station-1';

    expect(onboardingProvisionedQueryKeys(stationId)).toEqual([
      queryKeys.stations(),
      queryKeys.users(),
      queryKeys.products(),
      queryKeys.tanks(stationId),
      queryKeys.dispensers(stationId),
      queryKeys.nozzles(stationId),
      queryKeys.shiftTemplates(),
      queryKeys.paymentTerminals(stationId),
      queryKeys.pricing(stationId),
      queryKeys.financialAccounts(stationId),
      queryKeys.businessDayStatusPrefix(stationId),
      queryKeys.inventoryStatus(stationId),
      queryKeys.inventoryItems(stationId),
      queryKeys.inventoryMovements(stationId),
    ]);
  });
});
