import React, { useState, useEffect } from 'react';
import { CloudUserAssignmentService, CloudStationService } from '../../services/cloud.js';
import { Station } from '@pump/shared';

const userService = new CloudUserAssignmentService();
const stationService = new CloudStationService();

export const UserRolesAssignment: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('Staff');
  const [selectedStationIds, setSelectedStationIds] = useState<string[]>([]);

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await userService.createUser({
        fullName,
        email,
        phone,
        status: 'ACTIVE',
        role,
        stationIds: selectedStationIds,
      });

      setFullName('');
      setEmail('');
      setPhone('');
      setRole('Staff');
      setSelectedStationIds([]);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleStationCheckbox = (stationId: string, checked: boolean) => {
    if (checked) {
      setSelectedStationIds([...selectedStationIds, stationId]);
    } else {
      setSelectedStationIds(selectedStationIds.filter((id) => id !== stationId));
    }
  };

  if (loading) return <div style={{ color: '#9ca3af' }}>Loading user roles assignments...</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '24px' }}>
      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700 }}>Team & Roles</h2>
          <p style={{ color: '#9ca3af', fontSize: '13px' }}>Manage user access permissions and station scoping.</p>
        </div>

        <div style={{ overflowX: 'auto', backgroundColor: '#111318', borderRadius: '12px', border: '1px solid #1f222a' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1f222a', color: '#9ca3af', fontSize: '12px' }}>
                <th style={{ padding: '12px 16px' }}>NAME</th>
                <th style={{ padding: '12px 16px' }}>EMAIL</th>
                <th style={{ padding: '12px 16px' }}>ROLE</th>
                <th style={{ padding: '12px 16px' }}>ASSIGNED STATIONS</th>
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
                  <tr key={u.id} style={{ borderBottom: '1px solid #1f222a', fontSize: '14px' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{u.fullName}</td>
                    <td style={{ padding: '12px 16px' }}>{u.email}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 650,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor:
                            u.role === 'Owner'
                              ? 'rgba(99, 102, 241, 0.15)'
                              : u.role === 'Manager'
                              ? 'rgba(16, 185, 129, 0.15)'
                              : 'rgba(255, 255, 255, 0.05)',
                          color:
                            u.role === 'Owner'
                              ? '#6366f1'
                              : u.role === 'Manager'
                              ? 'rgb(52, 211, 153)'
                              : '#f3f4f6',
                        }}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#9ca3af' }}>
                      {u.role === 'Owner' ? 'All Stations (Global)' : assignedNames || 'None'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form */}
      <div
        style={{
          backgroundColor: '#111318',
          padding: '24px',
          borderRadius: '12px',
          border: '1px solid #1f222a',
          alignSelf: 'start',
        }}
      >
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Add Team Member</h3>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input
              type="text"
              className="form-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <input
              type="text"
              className="form-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">System Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="form-input">
              <option value="Owner">Owner (Global Admin)</option>
              <option value="Manager">Manager</option>
              <option value="Accountant">Accountant</option>
              <option value="Staff">Staff</option>
            </select>
          </div>

          {role !== 'Owner' && (
            <div className="form-group">
              <label className="form-label">Assign Stations</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                {stations.map((s) => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={selectedStationIds.includes(s.id)}
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
            style={{
              padding: '8px 16px',
              backgroundColor: '#6366f1',
              border: 'none',
              color: '#ffffff',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              marginTop: '8px',
            }}
          >
            Create User
          </button>
        </form>
      </div>
    </div>
  );
};
