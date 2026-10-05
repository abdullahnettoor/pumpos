import { describe, expect, it } from 'vitest';
import { seedDemoStation } from './seed-demo-station.js';

describe('seedDemoStation', () => {
  it('rejects invalid configuration before using the transaction', async () => {
    await expect(
      seedDemoStation({} as never, {
        organizationId: 'org',
        ownerUserId: 'owner',
        tanks: 0,
      }),
    ).rejects.toThrow('tanks must be an integer between 1 and 20');
  });
});
