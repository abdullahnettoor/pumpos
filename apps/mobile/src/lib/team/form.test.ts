import { describe, expect, it } from 'vitest';
import { userSchema } from '@pump/shared';
import {
  generatePassword,
  memberFormSchema,
  memberRequest,
  type MemberFormValues,
  type MemberFormRules,
} from './form.js';

const base: MemberFormValues = {
  fullName: 'Sajid Pillai',
  phone: '98765 43210',
  email: '',
  role: 'Staff',
  stationIds: ['s1'],
  enableAppAccess: true,
  identity: 'Phone',
  password: 'Abcdef23x',
};
const ownerRules: MemberFormRules = {
  mode: 'create',
  allowedRoles: ['Owner', 'Manager', 'Accountant', 'Staff', 'Attendant'],
  allowedStationIds: ['s1', 's2'],
  requireStation: false,
};
const managerRules: MemberFormRules = {
  mode: 'create',
  allowedRoles: ['Staff', 'Attendant'],
  allowedStationIds: ['s1'],
  requireStation: true,
};

const issues = (values: Partial<MemberFormValues>, rules = ownerRules) => {
  const r = memberFormSchema(rules).safeParse({ ...base, ...values });
  const out: Record<string, string> = {};
  if (!r.success) for (const i of r.error.issues) out[String(i.path[0])] ??= i.message;
  return out;
};

describe('memberRequest', () => {
  it('sends a phone login with the phone only, in one stored spelling', () => {
    const body = memberRequest({ ...base, email: 'x@y.in' }, 'create');
    expect(body).toMatchObject({
      fullName: 'Sajid Pillai',
      phone: '+919876543210',
      email: null,
      enableAppAccess: true,
      password: 'Abcdef23x',
      role: 'Staff',
      stationIds: ['s1'],
    });
  });
  it('sends an email login with the email only, lower-cased', () => {
    const body = memberRequest(
      { ...base, identity: 'Email', email: ' Sajid@Example.com ' },
      'create',
    );
    expect(body).toMatchObject({ email: 'sajid@example.com', phone: null });
  });
  it('sends a record-only member with both contacts and no login fields', () => {
    const body = memberRequest({ ...base, enableAppAccess: false, email: 'a@b.co' }, 'create');
    expect(body).toMatchObject({ email: 'a@b.co', phone: '+919876543210' });
    expect(body).not.toHaveProperty('password');
    expect(body).not.toHaveProperty('enableAppAccess');
  });
  it('is accepted by the API schema', () => {
    expect(userSchema.safeParse(memberRequest(base, 'create')).success).toBe(true);
  });
  it('drops stations for an Owner on create, and leaves them alone on edit', () => {
    expect(memberRequest({ ...base, role: 'Owner' }, 'create')).toMatchObject({ stationIds: [] });
    expect(memberRequest({ ...base, role: 'Owner' }, 'edit')).not.toHaveProperty('stationIds');
  });
  it('edit sends contact, role and stations but never login fields', () => {
    const body = memberRequest(base, 'edit');
    expect(body).toEqual({
      fullName: 'Sajid Pillai',
      phone: '+919876543210',
      email: null,
      role: 'Staff',
      stationIds: ['s1'],
    });
  });
});

describe('memberFormSchema', () => {
  it('accepts a complete member', () => {
    expect(issues({})).toEqual({});
  });
  it('holds the name to the shared rule', () => {
    expect(issues({ fullName: ' a ' }).fullName).toMatch(/at least 2/);
  });
  it('holds the phone to the shared Indian-mobile rule', () => {
    expect(issues({ phone: '12345' }).phone).toMatch(/mobile/i);
  });
  it('holds the email to the shared rule', () => {
    expect(issues({ email: 'nope', identity: 'Email' }).email).toMatch(/email/i);
  });
  it('needs the chosen identity when giving app access', () => {
    expect(issues({ phone: '' }).phone).toMatch(/phone/i);
    expect(issues({ identity: 'Email', email: '' }).email).toMatch(/email/i);
  });
  it('does not need an identity for a record-only member', () => {
    expect(issues({ enableAppAccess: false, phone: '', password: '' })).toEqual({});
  });
  it('holds the password to the shared minimum', () => {
    expect(issues({ password: 'short' }).password).toMatch(/at least 8/);
    expect(issues({ password: '' }).password).toBeTruthy();
  });
  it('does not check login fields when editing', () => {
    expect(issues({ password: '', phone: '' }, { ...ownerRules, mode: 'edit' })).toEqual({});
  });
  it('refuses a Role the actor may not give', () => {
    expect(issues({ role: 'Manager' }, managerRules).role).toBeTruthy();
    expect(issues({ role: 'Attendant' }, managerRules).role).toBeUndefined();
  });
  it("refuses a station outside the actor's own", () => {
    expect(issues({ stationIds: ['s2'] }, managerRules).stationIds).toBeTruthy();
  });
  it('needs a Manager to pick a station, but not an Owner', () => {
    expect(issues({ stationIds: [] }, managerRules).stationIds).toMatch(/at least one/);
    expect(issues({ stationIds: [] })).toEqual({});
  });
  it('does not ask for stations when the member is an Owner', () => {
    expect(
      issues({ role: 'Owner', stationIds: [] }, { ...ownerRules, requireStation: true }),
    ).toEqual({});
  });
});

describe('generatePassword', () => {
  it('is readable, long enough, and has every kind of character', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p.length).toBeGreaterThanOrEqual(8);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).not.toMatch(/[0OIl1]/);
    }
  });
  it('is deterministic with an injected generator', () => {
    expect(generatePassword(() => 0)).toBe(generatePassword(() => 0));
  });
});
