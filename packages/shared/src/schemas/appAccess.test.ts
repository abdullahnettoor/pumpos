import { describe, expect, it } from 'vite-plus/test';
import {
  appAccessBodySchema,
  appAccessFormSchema,
  appAccessRequest,
  userSchema,
  type AppAccessFormValues,
} from './validation.js';

const form: AppAccessFormValues = {
  identity: 'Phone',
  phone: '98765 43210',
  email: '',
  password: 'Abcdef23x',
};

const formIssues = (over: Partial<AppAccessFormValues>) => {
  const r = appAccessFormSchema.safeParse({ ...form, ...over });
  const out: Record<string, string> = {};
  if (!r.success) for (const i of r.error.issues) out[String(i.path[0])] ??= i.message;
  return out;
};

describe('appAccessBodySchema (#462)', () => {
  const password = 'correct-horse';

  it('accepts one identity with a password', () => {
    expect(appAccessBodySchema.safeParse({ email: 'r@example.com', password }).success).toBe(true);
    expect(appAccessBodySchema.safeParse({ phone: '98765 43210', password }).success).toBe(true);
  });

  it.each([
    ['no identity', { password }],
    ['both identities', { email: 'r@example.com', phone: '9876543210', password }],
    ['a short password', { email: 'r@example.com', password: 'short' }],
    ['an invalid phone', { phone: '555', password }],
    ['an invalid email', { email: 'nope', password }],
  ])('rejects %s', (_name, body) => {
    expect(appAccessBodySchema.safeParse(body).success).toBe(false);
  });
});

describe('appAccessRequest', () => {
  it('sends a phone login with the phone only, in one stored spelling', () => {
    expect(appAccessRequest({ ...form, email: 'x@y.in' })).toEqual({
      phone: '+919876543210',
      password: 'Abcdef23x',
    });
  });

  it('sends an email login with the email only, lower-cased', () => {
    expect(appAccessRequest({ ...form, identity: 'Email', email: ' Sajid@Example.com ' })).toEqual({
      email: 'sajid@example.com',
      password: 'Abcdef23x',
    });
  });

  it('is accepted by the body schema and by the create schema', () => {
    const body = appAccessRequest(form);
    expect(appAccessBodySchema.safeParse(body).success).toBe(true);
    expect(
      userSchema.safeParse({ fullName: 'Sajid', enableAppAccess: true, ...body }).success,
    ).toBe(true);
  });
});

describe('appAccessFormSchema', () => {
  it('accepts a complete form', () => {
    expect(formIssues({})).toEqual({});
  });

  it('needs the picked identity, named in the message', () => {
    expect(formIssues({ phone: '' }).phone).toBe('A phone number is required for phone login.');
    expect(formIssues({ identity: 'Email', email: '' }).email).toBe(
      'An email address is required for email login.',
    );
  });

  it('ignores the identity that is not picked', () => {
    expect(formIssues({ identity: 'Email', email: 'a@b.in', phone: '123' })).toEqual({});
  });

  it('holds contact details and the password to the shared rules', () => {
    expect(formIssues({ phone: '12345' }).phone).toBe(
      'Enter a valid 10-digit Indian mobile number',
    );
    expect(formIssues({ identity: 'Email', email: 'nope' }).email).toBe('Invalid email address');
    expect(formIssues({ password: 'short' }).password).toBe(
      'Password must be at least 8 characters',
    );
    expect(formIssues({ password: '' }).password).toBeTruthy();
  });
});
