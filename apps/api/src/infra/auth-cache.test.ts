import { describe, expect, it } from 'vitest';
import { evictCachedAuthUser, getCachedAuthUser, setCachedAuthUser } from './auth-cache.js';

const user = {
  id: 'u',
  email: null,
  fullName: null,
  organizationId: 'o',
  role: 'Manager' as const,
  assignedStationIds: [],
};

describe('auth cache eviction', () => {
  it('drops only the named user so the next request re-reads permissions', () => {
    setCachedAuthUser('a', user);
    setCachedAuthUser('b', user);
    evictCachedAuthUser('a');
    expect(getCachedAuthUser('a')).toBeNull();
    expect(getCachedAuthUser('b')).not.toBeNull();
    evictCachedAuthUser(null);
  });
});
