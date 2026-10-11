/**
 * The add / edit member form: its schema, the request it becomes, and a
 * generated password. Pure; no React and no fetching.
 *
 * Validation is `@pump/shared`'s: every field is checked by the same schema the
 * API's `POST|PUT /setup/users` uses (`userBaseSchema` / `userSchema`), applied
 * to the text as typed. This module only adds what a form needs on top: the
 * Role and Stations the actor may choose, and which identity a new login uses.
 */
import { z } from 'zod';
import { normalizeIndianMobile, userBaseSchema, userSchema, type Role } from '@pump/shared';

export type MemberFormMode = 'create' | 'edit';
export type LoginIdentity = 'Phone' | 'Email';

export interface MemberFormValues {
  fullName: string;
  phone: string;
  email: string;
  role: Role;
  stationIds: string[];
  /** Create only: provision a login so they can sign in to the mobile app. */
  enableAppAccess: boolean;
  /** Create only: what the login is. The other contact detail is not stored with it. */
  identity: LoginIdentity;
  password: string;
}

export interface MemberFormRules {
  mode: MemberFormMode;
  /** Roles the actor may give (`assignableRoles`). */
  allowedRoles: readonly Role[];
  /** Stations the actor may assign (`assignableStations`). */
  allowedStationIds: readonly string[];
  /** A Manager's member must belong to at least one of their stations. */
  requireStation: boolean;
}

/** Check trimmed text with a `@pump/shared` field schema, keeping its messages. */
function shared(schema: z.ZodTypeAny) {
  return z.string().superRefine((text, ctx) => {
    const r = schema.safeParse(text.trim());
    if (!r.success)
      for (const issue of r.error.issues)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue.message });
  });
}

/** The request body for `POST /setup/users` (create) or `PUT /setup/users/:id` (edit). */
export function memberRequest(
  values: MemberFormValues,
  mode: MemberFormMode,
): Record<string, unknown> {
  const fullName = values.fullName.trim();
  const phone = normalizeIndianMobile(values.phone) ?? null;
  const email = values.email.trim() ? values.email.trim().toLowerCase() : null;
  // An Owner reaches every station, so stations are not part of their record.
  const stations = values.role === 'Owner' ? [] : values.stationIds;

  if (mode === 'edit') {
    return {
      fullName,
      phone,
      email,
      role: values.role,
      // Leave an Owner's assignments as they are: they only matter if demoted.
      ...(values.role === 'Owner' ? {} : { stationIds: stations }),
    };
  }
  if (!values.enableAppAccess) {
    return { fullName, phone, email, role: values.role, stationIds: stations, status: 'ACTIVE' };
  }
  // A login has one identity: a phone login drops the email (the server derives
  // the sign-in handle from the phone), an email login keeps only the email.
  const phoneLogin = values.identity === 'Phone';
  return {
    fullName,
    phone: phoneLogin ? phone : null,
    email: phoneLogin ? null : email,
    role: values.role,
    stationIds: stations,
    status: 'ACTIVE',
    enableAppAccess: true,
    password: values.password,
  };
}

/** The resolver schema for the form. */
export function memberFormSchema(rules: MemberFormRules) {
  const roles = new Set<string>(rules.allowedRoles);
  const stations = new Set<string>(rules.allowedStationIds);
  return z
    .object({
      fullName: shared(userBaseSchema.shape.fullName),
      phone: shared(userBaseSchema.shape.phone),
      email: shared(userBaseSchema.shape.email),
      role: z.enum(['Owner', 'Manager', 'Accountant', 'Staff', 'Attendant']),
      stationIds: z.array(z.string()),
      enableAppAccess: z.boolean(),
      identity: z.enum(['Phone', 'Email']),
      password: z.string(),
    })
    .superRefine((v, ctx) => {
      const add = (path: keyof MemberFormValues, message: string) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

      if (!roles.has(v.role)) add('role', 'You cannot give this role.');
      if (v.role !== 'Owner') {
        if (v.stationIds.some((id) => !stations.has(id)))
          add('stationIds', 'Choose from your own stations.');
        else if (rules.requireStation && v.stationIds.length === 0)
          add('stationIds', 'Choose at least one station.');
      }

      if (rules.mode === 'create' && v.enableAppAccess) {
        // The API's own cross-field rule (identity + password), on the request it will get.
        const body = memberRequest(v, 'create');
        const r = userSchema.safeParse(body);
        if (!r.success) {
          for (const issue of r.error.issues) {
            const key = issue.path[0];
            if (key === 'password') {
              add('password', issue.message);
            } else if (key === 'email' || key === 'phone') {
              // The shared rule says "email or phone"; name the one this login uses.
              if (v.identity === 'Phone')
                add('phone', 'Enter a phone number: it is what they sign in with.');
              else add('email', 'Enter an email address: it is what they sign in with.');
            }
          }
        }
      }
    });
}

/** The reset-password form: the password is held to the API schema's own rule (8+ characters). */
export const resetPasswordSchema = z.object({ password: shared(userBaseSchema.shape.password) });
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';

/**
 * A readable strong password (no 0/O or 1/l/I), at least one of each kind. The
 * generator is injectable so tests are deterministic; the default is the
 * browser's CSPRNG.
 */
export function generatePassword(
  randomInt: (max: number) => number = (max) => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % max;
  },
): string {
  const pick = (set: string) => set[randomInt(set.length)];
  const all = UPPER + LOWER + DIGITS;
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  while (chars.length < 10) chars.push(pick(all));
  // Fisher-Yates so the guaranteed kinds are not always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
