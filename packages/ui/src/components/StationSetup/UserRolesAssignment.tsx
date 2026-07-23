import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CloudUserAssignmentService, CloudStationService } from '../../services/cloud.js';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, TIER } from '../../query/hooks.js';
import { Station } from '@pump/shared';
import { Drawer } from '../Drawer.js';
import { DataTable } from '../primitives/DataTable.js';
import { Checkbox, Switch } from '../primitives/Toggle.js';
import { useToast } from '../primitives/ToastProvider.js';
import type { ColumnDef } from '@tanstack/react-table';
import { Edit, KeyRound } from 'lucide-react';

const userService = new CloudUserAssignmentService();
const stationService = new CloudStationService();

const userFormSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Invalid email address').or(z.literal('')).optional().nullable(),
  phone: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  role: z.enum(['Owner', 'Manager', 'Accountant', 'Staff', 'Attendant']),
  enableAppAccess: z.boolean(),
});

type UserFormValues = z.infer<typeof userFormSchema>;

// --- helpers ---------------------------------------------------------------
function generatePassword(): string {
  // Readable, strong: avoids ambiguous chars (0/O, 1/l/I).
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  let out = pick(upper) + pick(lower) + pick(digits);
  for (let i = 0; i < 7; i++) out += pick(all);
  return out
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const inputStyle: React.CSSProperties = {
  height: '32px',
  padding: '0 8px',
  borderRadius: 'var(--radius-input)',
  border: '1px solid var(--border-strong)',
  fontSize: '13px',
};

type StatusKind = 'active' | 'inactive' | 'nologin';
function statusOf(u: any): StatusKind {
  if (u.status === 'INACTIVE') return 'inactive';
  if (!u.authUserId) return 'nologin';
  return 'active';
}
const STATUS_META: Record<StatusKind, { label: string; bg: string; fg: string }> = {
  active: { label: 'Active', bg: 'rgba(16, 185, 129, 0.15)', fg: 'rgb(5, 150, 105)' },
  inactive: { label: 'Inactive', bg: 'rgba(239, 68, 68, 0.15)', fg: 'rgb(220, 38, 38)' },
  nologin: { label: 'No login', bg: 'rgba(148, 163, 184, 0.18)', fg: 'var(--text-muted)' },
};

function loginIdentity(u: any): string {
  if (u.email) return u.email;
  if (u.phone) return u.phone;
  return '—';
}

const buildUserColumns = (
  stations: any[],
  startEdit: (u: any) => void,
  onReset: (u: any) => void,
  onToggleActive: (u: any) => void,
): ColumnDef<any, any>[] => [
  { accessorKey: 'fullName', header: 'Name', cell: ({ getValue }) => <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{getValue() as string}</span> },
  {
    id: 'identity',
    header: 'Login',
    cell: ({ row }) => {
      const u = row.original;
      const id = loginIdentity(u);
      return <span style={{ fontSize: '12px', color: u.authUserId ? 'var(--text-default)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{id}</span>;
    },
  },
  {
    accessorKey: 'role',
    header: 'Role',
    cell: ({ row }) => {
      const u = row.original;
      const bg = u.role === 'Owner' ? 'rgba(99, 102, 241, 0.15)' : u.role === 'Manager' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(46, 94, 136, 0.15)';
      const fg = u.role === 'Owner' ? '#6366f1' : u.role === 'Manager' ? 'rgb(52, 211, 153)' : '#2e5e88';
      return <span style={{ fontSize: '11px', fontWeight: 650, padding: '2px 6px', borderRadius: '4px', backgroundColor: bg, color: fg }}>{u.role}</span>;
    },
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const meta = STATUS_META[statusOf(row.original)];
      return <span style={{ fontSize: '11px', fontWeight: 650, padding: '2px 6px', borderRadius: '4px', backgroundColor: meta.bg, color: meta.fg }}>{meta.label}</span>;
    },
  },
  {
    id: 'stations',
    header: 'Assigned Stations',
    cell: ({ row }) => {
      const u = row.original;
      const assignedNames = u.stationIds ? u.stationIds.map((sid: string) => stations.find((s) => s.id === sid)?.name || 'Unknown').join(', ') : 'None';
      return <span style={{ color: 'var(--text-muted)' }}>{u.role === 'Owner' ? 'All Stations (Global)' : assignedNames || 'None'}</span>;
    },
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => {
      const u = row.original;
      const iconBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '26px', width: '26px', background: 'none', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 };
      const isActive = u.status !== 'INACTIVE';
      return (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
          <button onClick={() => startEdit(u)} title="Edit member" style={iconBtn}>
            <Edit size={14} />
          </button>
          {u.authUserId && (
            <button onClick={() => onReset(u)} title="Reset password" style={iconBtn}>
              <KeyRound size={14} />
            </button>
          )}
          {u.authUserId && (
            <span
              title={isActive ? 'Deactivate login' : 'Activate login'}
              style={{ display: 'inline-flex', alignItems: 'center' }}
            >
              <Switch
                checked={isActive}
                onChange={() => onToggleActive(u)}
                aria-label={isActive ? 'Deactivate login' : 'Activate login'}
              />
            </span>
          )}
        </div>
      );
    },
  },
];

export const UserRolesAssignment: React.FC = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);

  // Drawer visibility state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);

  // Credentials card shown after provisioning a login account.
  const [credentials, setCredentials] = useState<{ login: string; password: string } | null>(null);

  // Reset-password dialog state.
  const [resetTarget, setResetTarget] = useState<any | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  // Station assignments + identity type are managed outside react-hook-form: an
  // unregistered RHF field (set only via setValue) can be dropped from the
  // submitted payload, which previously left new members with no station
  // assignments and could mis-detect the identity type.
  const [stationIds, setStationIds] = useState<string[]>([]);
  const [identityType, setIdentityType] = useState<'Email' | 'Phone'>('Phone');

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      password: '',
      status: 'ACTIVE' as const,
      role: 'Staff',
      enableAppAccess: true,
    }
  });

  const watchEnableAppAccess = watch('enableAppAccess');
  const watchRole = watch('role');
  const watchPassword = watch('password') || '';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (force = false) => {
    try {
      setLoading(true);
      if (force) await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.users() }),
        qc.invalidateQueries({ queryKey: queryKeys.stations() }),
      ]);
      const [userList, stationList] = await Promise.all([
        qc.ensureQueryData({ queryKey: queryKeys.users(), queryFn: () => userService.listUsers(), staleTime: TIER.static.staleTime }),
        qc.ensureQueryData({ queryKey: queryKeys.stations(), queryFn: () => stationService.getStations(), staleTime: TIER.static.staleTime }),
      ]);
      setUsers(userList);
      setStations(stationList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const mergeUser = (row: any) => {
    const merge = (list: any[] = []) => (list.some((u) => u.id === row.id)
      ? list.map((u) => (u.id === row.id ? { ...u, ...row } : u))
      : [...list, row]);
    setUsers((prev) => merge(prev));
    qc.setQueryData(queryKeys.users(), (prev: any[] | undefined) => merge(prev));
    qc.invalidateQueries({ queryKey: queryKeys.users(), refetchType: 'none' });
  };

  const handleCreateOrUpdate = async (values: UserFormValues) => {
    const wantsLogin = !!values.enableAppAccess;
    const isPhone = identityType === 'Phone';

    if (!editingUser && wantsLogin) {
      // Provisioning a new login account requires an identity + password.
      if (isPhone && (!values.phone || values.phone.trim() === '')) {
        toast.error('A phone number is required for phone login.');
        return;
      }
      if (!isPhone && (!values.email || values.email.trim() === '')) {
        toast.error('An email address is required for email login.');
        return;
      }
      if (!values.password || values.password.length < 8) {
        toast.error('Set a password of at least 8 characters (use Generate).');
        return;
      }
    }

    try {
      const payload: any = {
        fullName: values.fullName,
        // For a phone identity we deliberately clear email so the server uses
        // the synthetic phone handle as the login identity.
        email: wantsLogin && !isPhone ? values.email : (editingUser ? values.email || null : null),
        phone: values.phone || null,
        status: values.status,
        role: wantsLogin ? values.role : 'Staff',
        stationIds,
      };
      if (!editingUser && wantsLogin) {
        payload.enableAppAccess = true;
        payload.password = values.password;
      }

      const saved = editingUser
        ? await userService.updateUser(editingUser.id, payload)
        : await userService.createUser(payload);

      // Show credentials to hand over when a fresh login was provisioned.
      if (!editingUser && wantsLogin) {
        const login = isPhone ? (values.phone || '').trim() : (values.email || '').trim();
        setCredentials({ login, password: values.password || '' });
      } else {
        setIsFormOpen(false);
      }

      const rowId = editingUser?.id ?? (saved as any)?.id;
      if (rowId) {
        mergeUser({ ...(editingUser || {}), id: rowId, ...(saved as any), ...payload });
      } else {
        loadData(true);
      }
      resetForm();
      toast.success(editingUser ? 'Team member updated.' : 'Team member added.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save team member');
    }
  };

  const startEdit = (u: any) => {
    setCredentials(null);
    setEditingUser(u);
    setStationIds(u.stationIds || []);
    setIdentityType(u.email ? 'Email' : 'Phone');
    reset({
      fullName: u.fullName,
      enableAppAccess: !!u.authUserId,
      email: u.email || '',
      phone: u.phone || '',
      password: '',
      status: u.status || 'ACTIVE',
      role: u.role || 'Staff',
    });
    setIsFormOpen(true);
  };

  const resetForm = () => {
    setEditingUser(null);
    setStationIds([]);
    setIdentityType('Phone');
    reset({
      fullName: '',
      enableAppAccess: true,
      email: '',
      phone: '',
      password: '',
      status: 'ACTIVE',
      role: 'Staff',
    });
  };

  const closeForm = () => {
    resetForm();
    setCredentials(null);
    setIsFormOpen(false);
  };

  const handleStationCheckbox = (stationId: string, checked: boolean) => {
    setStationIds((prev) => (checked ? [...prev, stationId] : prev.filter((id) => id !== stationId)));
  };

  const openReset = (u: any) => {
    setResetTarget(u);
    setResetPassword(generatePassword());
  };

  const confirmReset = async () => {
    if (!resetTarget || resetPassword.length < 8) return;
    setResetBusy(true);
    try {
      await userService.resetUserPassword(resetTarget.id, resetPassword);
      setCredentials({ login: loginIdentity(resetTarget), password: resetPassword });
      toast.success('Password reset. Share the new credentials.');
      setResetTarget(null);
      setIsFormOpen(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset password');
    } finally {
      setResetBusy(false);
    }
  };

  const toggleActive = async (u: any) => {
    try {
      const updated = u.status === 'INACTIVE'
        ? await userService.reactivateUser(u.id)
        : await userService.deactivateUser(u.id);
      mergeUser({ ...u, ...(updated as any) });
      toast.success(u.status === 'INACTIVE' ? 'Member reactivated.' : 'Member deactivated.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update member');
    }
  };

  if (loading) return <div style={{ color: '#9ca3af', fontFamily: 'var(--font-mono)' }}>Loading team assignments...</div>;

  const radioLabel = (value: 'Email' | 'Phone', label: string) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
      <input type="radio" value={value} checked={identityType === value} onChange={() => setIdentityType(value)} />
      {label}
    </label>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="animate-fade-in">

      {/* Header section with + Add Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)' }}>Team</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Add members with an email or phone, set their password, and manage access.</p>
        </div>
        {!isFormOpen && (
          <button
            onClick={() => {
              resetForm();
              setCredentials(null);
              setIsFormOpen(true);
            }}
            style={{
              height: '32px',
              padding: '0 12px',
              backgroundColor: 'var(--brand-primary)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-button)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            + Add Team Member
          </button>
        )}
      </div>

      {/* List / Table */}
      <DataTable
        columns={buildUserColumns(stations, startEdit, openReset, toggleActive)}
        data={users}
        emptyMessage="No team members yet."
        getRowId={(r: any) => r.id}
      />

      {/* Form Drawer */}
      <Drawer
        isOpen={isFormOpen}
        onClose={closeForm}
        title={editingUser ? 'Edit Team Member' : 'New Team Member'}
      >
        {credentials ? (
          <CredentialsCard credentials={credentials} onDone={closeForm} onCopy={copyText} toast={toast} />
        ) : (
          <form onSubmit={handleSubmit(handleCreateOrUpdate)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Full Name *</label>
              <input type="text" style={inputStyle} placeholder="e.g. John Doe" {...register('fullName')} />
              {errors.fullName && <span style={{ color: 'var(--state-danger-fg)', fontSize: '11px' }}>{errors.fullName.message}</span>}
            </div>

            {!editingUser && (
              <div style={{ margin: '4px 0' }}>
                <Checkbox label="Enable app access (allows login)" {...register('enableAppAccess')} />
              </div>
            )}

            {/* Identity picker — only when provisioning a new login */}
            {!editingUser && watchEnableAppAccess && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', backgroundColor: 'var(--bg-canvas)' }}>
                <div style={{ display: 'flex', gap: '20px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Login with</span>
                  {radioLabel('Phone', 'Phone')}
                  {radioLabel('Email', 'Email')}
                </div>

                {identityType === 'Email' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Email Address *</label>
                    <input type="email" style={inputStyle} placeholder="e.g. john@station.com" {...register('email')} />
                    {errors.email && <span style={{ color: 'var(--state-danger-fg)', fontSize: '11px' }}>{errors.email.message}</span>}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Phone Number *</label>
                    <input type="tel" style={inputStyle} placeholder="e.g. 98765 43210" {...register('phone')} />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>They sign in with this phone number + password. No SMS is sent.</span>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Password *</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input type="text" style={{ ...inputStyle, flex: 1, fontFamily: 'var(--font-mono)' }} placeholder="At least 8 characters" {...register('password')} />
                    <button type="button" onClick={() => setValue('password', generatePassword())} style={{ ...inputStyle, cursor: 'pointer', backgroundColor: 'var(--bg-surface)', fontWeight: 600 }}>Generate</button>
                    <button type="button" onClick={async () => (await copyText(watchPassword)) ? toast.success('Password copied.') : toast.error('Copy failed.')} disabled={!watchPassword} style={{ ...inputStyle, cursor: watchPassword ? 'pointer' : 'not-allowed', backgroundColor: 'var(--bg-surface)', fontWeight: 600, opacity: watchPassword ? 1 : 0.5 }}>Copy</button>
                  </div>
                </div>
              </div>
            )}

            {/* Profile phone for record-only / edit (non-login) */}
            {(editingUser || !watchEnableAppAccess) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Phone Number</label>
                <input type="tel" style={inputStyle} placeholder="e.g. 98765 43210" {...register('phone')} />
              </div>
            )}

            {(editingUser ? !!editingUser.authUserId : watchEnableAppAccess) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>System Role</label>
                <select style={{ ...inputStyle, color: 'var(--text-strong)' }} {...register('role')}>
                  <option value="Owner">Owner (Global Admin)</option>
                  <option value="Manager">Manager</option>
                  <option value="Accountant">Accountant</option>
                  <option value="Staff">Staff</option>
                  <option value="Attendant">Attendant (Mobile handover)</option>
                </select>
              </div>
            )}

            {watchRole !== 'Owner' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Assign Stations</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                  {stations.map((s) => (
                    <Checkbox
                      key={s.id}
                      label={`${s.name} (${s.code})`}
                      checked={stationIds.includes(s.id)}
                      onChange={(e) => handleStationCheckbox(s.id, e.target.checked)}
                    />
                  ))}
                </div>
              </div>
            )}

            {editingUser && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Status</label>
                <select style={{ ...inputStyle, color: 'var(--text-strong)' }} {...register('status')}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                height: '36px',
                backgroundColor: 'var(--brand-primary)',
                border: 'none',
                color: '#ffffff',
                borderRadius: 'var(--radius-button)',
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: '12px',
                opacity: isSubmitting ? 0.6 : 1,
              }}
            >
              {isSubmitting ? 'Saving...' : (editingUser ? 'Save Changes' : 'Add Member')}
            </button>
          </form>
        )}
      </Drawer>

      {/* Reset password dialog */}
      <Drawer
        isOpen={!!resetTarget}
        onClose={() => setResetTarget(null)}
        title="Reset password"
      >
        {resetTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-default)' }}>
              Set a new password for <strong>{resetTarget.fullName}</strong> ({loginIdentity(resetTarget)}). The old password stops working immediately.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>New Password *</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input type="text" style={{ ...inputStyle, flex: 1, fontFamily: 'var(--font-mono)' }} value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} />
                <button type="button" onClick={() => setResetPassword(generatePassword())} style={{ ...inputStyle, cursor: 'pointer', backgroundColor: 'var(--bg-surface)', fontWeight: 600 }}>Generate</button>
                <button type="button" onClick={async () => (await copyText(resetPassword)) ? toast.success('Password copied.') : toast.error('Copy failed.')} style={{ ...inputStyle, cursor: 'pointer', backgroundColor: 'var(--bg-surface)', fontWeight: 600 }}>Copy</button>
              </div>
            </div>
            <button
              type="button"
              onClick={confirmReset}
              disabled={resetBusy || resetPassword.length < 8}
              style={{ height: '36px', backgroundColor: 'var(--brand-primary)', border: 'none', color: '#fff', borderRadius: 'var(--radius-button)', fontWeight: 600, cursor: 'pointer', opacity: resetBusy || resetPassword.length < 8 ? 0.6 : 1 }}
            >
              {resetBusy ? 'Resetting...' : 'Set New Password'}
            </button>
          </div>
        )}
      </Drawer>
    </div>
  );
};

const CredentialsCard: React.FC<{
  credentials: { login: string; password: string };
  onDone: () => void;
  onCopy: (text: string) => Promise<boolean>;
  toast: ReturnType<typeof useToast>;
}> = ({ credentials, onDone, onCopy, toast }) => {
  const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: 'var(--radius-input)', backgroundColor: 'var(--bg-canvas)', border: '1px solid var(--border-soft)' };
  const copyBtn: React.CSSProperties = { height: '26px', padding: '0 8px', fontSize: '11px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-input)', backgroundColor: 'rgba(16, 185, 129, 0.12)', color: 'rgb(5, 150, 105)', fontSize: '12px', fontWeight: 600 }}>
        ✓ Login ready. Copy and hand these over — the password is shown only once.
      </div>
      <div style={rowStyle}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Login</span>
          <span style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>{credentials.login}</span>
        </div>
        <button type="button" style={copyBtn} onClick={async () => (await onCopy(credentials.login)) ? toast.success('Login copied.') : toast.error('Copy failed.')}>Copy</button>
      </div>
      <div style={rowStyle}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Password</span>
          <span style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>{credentials.password}</span>
        </div>
        <button type="button" style={copyBtn} onClick={async () => (await onCopy(credentials.password)) ? toast.success('Password copied.') : toast.error('Copy failed.')}>Copy</button>
      </div>
      <button
        type="button"
        onClick={async () => { await onCopy(`Login: ${credentials.login}\nPassword: ${credentials.password}`); toast.success('Credentials copied.'); }}
        style={{ height: '32px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-strong)', color: 'var(--text-default)', borderRadius: 'var(--radius-button)', fontWeight: 600, cursor: 'pointer', fontSize: '12px' }}
      >
        Copy both
      </button>
      <button
        type="button"
        onClick={onDone}
        style={{ height: '36px', backgroundColor: 'var(--brand-primary)', border: 'none', color: '#fff', borderRadius: 'var(--radius-button)', fontWeight: 600, cursor: 'pointer' }}
      >
        Done
      </button>
    </div>
  );
};
