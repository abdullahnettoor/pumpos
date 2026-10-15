import { describe, expect, it } from 'vitest';
import {
  GSTIN_PATTERN,
  PAN_PATTERN,
  autofillStateCode,
  gstinStateCode,
  orgProfileSchema,
} from './orgProfileForm.js';

const values = (metadata: Record<string, string>) => ({
  name: 'Sri Lakshmi Fuels',
  metadata: {
    legalName: '',
    gstin: '',
    pan: '',
    stateCode: '',
    address: '',
    phone: '',
    email: '',
    ...metadata,
  },
});

const issues = (metadata: Record<string, string>) => {
  const r = orgProfileSchema.safeParse(values(metadata));
  return r.success
    ? {}
    : Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]));
};

describe('GSTIN and PAN formats (#605)', () => {
  it('knows a GSTIN and a PAN', () => {
    expect(GSTIN_PATTERN.test('32ABCDE1234F1Z5')).toBe(true);
    expect(GSTIN_PATTERN.test('32ABCDE1234F0Z5')).toBe(false); // entity number 0
    expect(GSTIN_PATTERN.test('32ABCDE1234F1X5')).toBe(false); // 14th is always Z
    expect(GSTIN_PATTERN.test('32ABCDE1234F1Z')).toBe(false);
    expect(PAN_PATTERN.test('ABCDE1234F')).toBe(true);
    expect(PAN_PATTERN.test('ABCD12345F')).toBe(false);
  });

  it('accepts blanks and well-formed values, in any case, saving them upper-case', () => {
    expect(issues({})).toEqual({});
    const r = orgProfileSchema.parse(
      values({ gstin: ' 32abcde1234f1z5 ', pan: 'abcde1234f', stateCode: '32' }),
    );
    expect(r.metadata).toMatchObject({
      gstin: '32ABCDE1234F1Z5',
      pan: 'ABCDE1234F',
      stateCode: '32',
    });
  });

  it('refuses a malformed GSTIN, PAN or state code with what it should look like', () => {
    expect(issues({ gstin: '32ABCDE12' })).toEqual({
      'metadata.gstin': 'A GSTIN is 15 characters, like 29ABCDE1234F1Z5',
    });
    expect(issues({ pan: 'ABC1' })).toEqual({
      'metadata.pan': 'A PAN is 10 characters, like ABCDE1234F',
    });
    expect(issues({ stateCode: '3' })).toEqual({
      'metadata.stateCode': 'A state code is 2 digits',
    });
  });

  it('refuses a state code the GSTIN contradicts', () => {
    expect(issues({ gstin: '32ABCDE1234F1Z5', stateCode: '29' })).toEqual({
      'metadata.stateCode': 'The GSTIN is registered in state 32',
    });
  });

  it('saves the GSTIN’s state code when none was given', () => {
    expect(orgProfileSchema.parse(values({ gstin: '32ABCDE1234F1Z5' })).metadata.stateCode).toBe(
      '32',
    );
  });
});

describe('state code from the GSTIN (#605)', () => {
  it('reads the first two digits', () => {
    expect(gstinStateCode('32ABCDE1234F1Z5')).toBe('32');
    expect(gstinStateCode('3')).toBeNull();
    expect(gstinStateCode('AB12')).toBeNull();
    expect(gstinStateCode(null)).toBeNull();
  });

  it('fills a blank state code, and follows a code it filled itself', () => {
    expect(autofillStateCode('', '32', '')).toBe('32');
    expect(autofillStateCode('32ABC', '29ABC', '32')).toBe('29');
  });

  it('keeps a code typed by hand, and leaves it while the GSTIN has no code yet', () => {
    expect(autofillStateCode('32ABC', '29ABC', '33')).toBe('33');
    expect(autofillStateCode('', '3', '')).toBe('');
    expect(autofillStateCode('32', '', '32')).toBe('32');
  });
});
