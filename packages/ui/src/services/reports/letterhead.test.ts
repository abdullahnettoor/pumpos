import { describe, expect, it } from 'vitest';
import { letterheadFromOrganization } from './letterhead.js';

describe('letterheadFromOrganization (#605)', () => {
  it('prints the legal name, GSTIN, address and contact', () => {
    expect(
      letterheadFromOrganization({
        name: 'Sri Lakshmi Fuels',
        metadata: {
          legalName: 'Sri Lakshmi Fuels LLP',
          gstin: '32abcde1234f1z5',
          stateCode: '32',
          address: 'NH 66, Kottakkal',
          phone: '+91 98470 12345',
          email: 'owner@srilakshmi.in',
        },
      }),
    ).toEqual({
      legalName: 'Sri Lakshmi Fuels LLP',
      gstin: '32ABCDE1234F1Z5',
      stateCode: '32',
      addressLine: 'NH 66, Kottakkal',
      contact: '+91 98470 12345 · owner@srilakshmi.in',
      showLogo: false,
    });
  });

  it('falls back to the organization name and prints nothing for blanks', () => {
    expect(
      letterheadFromOrganization({
        name: 'Sri Lakshmi Fuels',
        metadata: { legalName: ' ', phone: '' },
      }),
    ).toEqual({
      legalName: 'Sri Lakshmi Fuels',
      gstin: undefined,
      stateCode: undefined,
      addressLine: undefined,
      contact: undefined,
      showLogo: false,
    });
  });
});
