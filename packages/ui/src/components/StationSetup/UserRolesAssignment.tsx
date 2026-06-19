import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CloudUserAssignmentService, CloudStationService } from '../../services/cloud.js';
import { Station, userSchema } from '@pump/shared';
import { Drawer } from '../Drawer.js';

const userService = new CloudUserAssignmentService();
const stationService = new CloudStationService();

const userFormSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Invalid email address').or(z.literal('')).optional().nullable(),
  phone: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  role: z.enum(['Owner', 'Manager', 'Accountant', 'Staff']),
  stationIds: z.array(z.string()),
  enableAppAccess: z.boolean(),
});

type UserFormValues = z.infer<typeof userFormSchema>;

export const UserRolesAssignment: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Drawer visibility state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);

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
      status: 'ACTIVE' as const,
      role: 'Staff',
      stationIds: [] as string[],
      enableAppAccess: true,
    }
  });

  const watchEnableAppAccess = watch('enableAppAccess');
  const watchRole = watch('role');
  const watchStationIds = watch('stationIds') || [];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [userList, stationList] = await Promise.all([
        userService.listUsers(),
        stationService.getStations(),
      ]);
      setUsers(userList);
      setStations(stationList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrUpdate = async (values: any) => {
    // Custom check: if app access is enabled, email is required
    if (values.enableAppAccess && (!values.email || values.email.trim() === '')) {
      alert('Email address is required for application login access.');
      return;
    }

    try {
      const payload = {
        fullName: values.fullName,
        email: values.enableAppAccess ? values.email : null,
        phone: values.phone || null,
        status: values.status,
        role: values.enableAppAccess ? values.role : 'Staff',
        stationIds: values.stationIds,
      };

      if (editingUser) {
        await userService.updateUser(editingUser.id, payload);
      } else {
        await userService.createUser(payload);
      }

      resetForm();
      setIsFormOpen(false);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save team member');
    }
  };

  const startEdit = (u: any) => {
    setEditingUser(u);
    reset({
      fullName: u.fullName,
      enableAppAccess: !!u.email,
      email: u.email || '',
      phone: u.phone || '',
      status: u.status || 'ACTIVE',
      role: u.role || 'Staff',
      stationIds: u.stationIds || [],
    });
    setIsFormOpen(true);
  };

  const resetForm = () => {
    setEditingUser(null);
    reset({
      fullName: '',
      enableAppAccess: true,
      email: '',
      phone: '',
      status: 'ACTIVE',
      role: 'Staff',
      stationIds: [],
    });
  };

  const handleStationCheckbox = (stationId: string, checked: boolean) => {
    if (checked) {
      setValue('stationIds', [...watchStationIds, stationId]);
    } else {
      setValue('stationIds', watchStationIds.filter((id) => id !== stationId));
    }
  };

  if (loading) return <div style={{ color: '#9ca3af', fontFamily: 'var(--font-mono)' }}>Loading team assignments...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="animate-fade-in">
      
      {/* Header section with + Add Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)' }}>Team & Roster</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Manage user access permissions, station scoping, and offline pump attendants.</p>
        </div>
        {!isFormOpen && (
          <button
            onClick={() => {
              resetForm();
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
      <div style={{ overflowX: 'auto', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-card)', backgroundColor: 'var(--bg-surface)' }}>
        <table className="dense-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: '25%', textAlign: 'left', padding: '10px 12px' }}>Name</th>
              <th style={{ width: '30%', textAlign: 'left', padding: '10px 12px' }}>Email / Type</th>
              <th style={{ width: '15%', textAlign: 'left', padding: '10px 12px' }}>Role</th>
              <th style={{ width: '20%', textAlign: 'left', padding: '10px 12px' }}>Assigned Stations</th>
              <th style={{ width: '10%', textAlign: 'center', padding: '10px 12px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const assignedNames = u.stationIds
                 ? u.stationIds
                    .map((sid: string) => stations.find((s) => s.id === sid)?.name || 'Unknown')
                    .join(', ')
                 : 'None';
              return (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td style={{ fontWeight: 600, color: 'var(--text-strong)', padding: '10px 12px' }}>{u.fullName}</td>
                  <td style={{ padding: '10px 12px' }}>
                    {u.email || (
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic' }}>
                        Offline Attendant
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 650,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor:
                          !u.email
                            ? 'rgba(245, 158, 11, 0.15)'
                            : u.role === 'Owner'
                            ? 'rgba(99, 102, 241, 0.15)'
                            : u.role === 'Manager'
                            ? 'rgba(16, 185, 129, 0.15)'
                            : 'rgba(46, 94, 136, 0.15)',
                        color:
                          !u.email
                            ? '#f59e0b'
                            : u.role === 'Owner'
                            ? '#6366f1'
                            : u.role === 'Manager'
                            ? 'rgb(52, 211, 153)'
                            : '#2e5e88',
                      }}
                    >
                      {!u.email ? 'Attendant' : u.role}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                    {u.role === 'Owner' ? 'All Stations (Global)' : assignedNames || 'None'}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <button
                      onClick={() => startEdit(u)}
                      style={{
                        height: '24px',
                        padding: '0 8px',
                        fontSize: '11px',
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-strong)',
                        color: 'var(--text-default)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Form Drawer */}
      <Drawer
        isOpen={isFormOpen}
        onClose={() => {
          resetForm();
          setIsFormOpen(false);
        }}
        title={editingUser ? 'Edit Team Member Profile' : 'New Team Member / Attendant'}
      >
        <form onSubmit={handleSubmit(handleCreateOrUpdate)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Full Name *</label>
            <input
              type="text"
              style={{
                height: '32px',
                padding: '0 8px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border-strong)',
                fontSize: '13px',
              }}
              placeholder="e.g. John Doe"
              {...register('fullName')}
            />
            {errors.fullName && <span style={{ color: 'var(--state-danger-fg)', fontSize: '11px' }}>{errors.fullName.message}</span>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', margin: '4px 0' }}>
            <input
              type="checkbox"
              id="enableAppAccess"
              {...register('enableAppAccess')}
            />
            <label htmlFor="enableAppAccess" style={{ cursor: 'pointer', color: 'var(--text-strong)', fontWeight: 500 }}>Enable App Access (allows login)</label>
          </div>

          {watchEnableAppAccess && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Email Address *</label>
              <input
                type="email"
                style={{
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '13px',
                }}
                placeholder="e.g. john@station.com"
                {...register('email')}
              />
              {errors.email && <span style={{ color: 'var(--state-danger-fg)', fontSize: '11px' }}>{errors.email.message}</span>}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Phone Number</label>
            <input
              type="text"
              style={{
                height: '32px',
                padding: '0 8px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border-strong)',
                fontSize: '13px',
              }}
              placeholder="e.g. +91 9999999999"
              {...register('phone')}
            />
            {errors.phone && <span style={{ color: 'var(--state-danger-fg)', fontSize: '11px' }}>{errors.phone.message}</span>}
          </div>

          {watchEnableAppAccess && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>System Role</label>
              <select
                style={{
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '13px',
                  color: 'var(--text-strong)'
                }}
                {...register('role')}
              >
                <option value="Owner">Owner (Global Admin)</option>
                <option value="Manager">Manager</option>
                <option value="Accountant">Accountant</option>
                <option value="Staff">Staff</option>
              </select>
            </div>
          )}

          {(!watchEnableAppAccess || watchRole !== 'Owner') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Assign Stations</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                {stations.map((s) => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={watchStationIds.includes(s.id)}
                      onChange={(e) => handleStationCheckbox(s.id, e.target.checked)}
                    />
                    {s.name} ({s.code})
                  </label>
                ))}
              </div>
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
            {isSubmitting ? 'Saving...' : (editingUser ? 'Save Profile Changes' : 'Add to Roster')}
          </button>
        </form>
      </Drawer>
    </div>
  );
};
