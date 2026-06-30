import React, { useState, useEffect } from 'react';
import { CloudShiftTemplateService } from '../../services/cloud.js';
import { ShiftTemplate } from '@pump/shared';
import { StatusBadge } from '../StatusBadge.js';
import { Drawer } from '../Drawer.js';
import { useToast } from '../primitives/ToastProvider.js';

const templateService = new CloudShiftTemplateService();

export const ShiftTemplates: React.FC = () => {
  const toast = useToast();
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('06:00');
  const [endTime, setEndTime] = useState('14:00');

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await templateService.listTemplates();
      setTemplates(data);
      
      // Default name for next shift
      setName(`Shift ${data.length + 1}`);
      if (data.length === 0) {
        setStartTime('06:00');
        setEndTime('14:00');
      } else if (data.length === 1) {
        setStartTime('14:00');
        setEndTime('22:00');
      } else if (data.length === 2) {
        setStartTime('22:00');
        setEndTime('06:00');
      } else {
        setStartTime('08:00');
        setEndTime('16:00');
      }
    } catch (err) {
      console.error('Failed to load shift templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await templateService.createTemplate({
        name,
        startTime,
        endTime,
        isActive: true,
      });
      setIsFormOpen(false);
      loadTemplates();
      toast.success('Shift template created.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create shift template');
    }
  };

  const prefillDefaultShifts = async () => {
    try {
      setLoading(true);
      await templateService.createTemplate({
        name: 'Morning Shift',
        startTime: '06:00',
        endTime: '14:00',
        isActive: true,
      });
      await templateService.createTemplate({
        name: 'Evening Shift',
        startTime: '14:00',
        endTime: '22:00',
        isActive: true,
      });
      await templateService.createTemplate({
        name: 'Night Shift',
        startTime: '22:00',
        endTime: '06:00',
        isActive: true,
      });
      await loadTemplates();
      toast.success('Default shifts created.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to pre-fill default shifts');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName(`Shift ${templates.length + 1}`);
    if (templates.length === 0) {
      setStartTime('06:00');
      setEndTime('14:00');
    } else if (templates.length === 1) {
      setStartTime('14:00');
      setEndTime('22:00');
    } else if (templates.length === 2) {
      setStartTime('22:00');
      setEndTime('06:00');
    } else {
      setStartTime('08:00');
      setEndTime('16:00');
    }
  };

  if (loading) return <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Loading shift templates...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="animate-fade-in">
      
      {/* Header & Add Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)' }}>Shift Schedules</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Configure standard timing templates for station operators.</p>
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
            + Add Shift
          </button>
        )}
      </div>

      {templates.length === 0 && (
        <div style={{
          backgroundColor: 'var(--bg-surface-alt)',
          padding: '16px 20px',
          borderRadius: 'var(--radius-card)',
          border: '1px solid var(--border-soft)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-strong)' }}>Recommended Shifts Setup</span>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Create standard 8-hour operational shifts with a single click: Morning (06:00 - 14:00), Evening (14:00 - 22:00), and Night (22:00 - 06:00).
            </p>
          </div>
          <button
            onClick={prefillDefaultShifts}
            style={{
              height: '30px',
              padding: '0 12px',
              backgroundColor: 'var(--brand-primary)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-button)',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Pre-fill Default Shifts
          </button>
        </div>
      )}

      {/* Shift timing Creation Drawer */}
      <Drawer
        isOpen={isFormOpen}
        onClose={() => {
          resetForm();
          setIsFormOpen(false);
        }}
        title="Add Shift Template"
      >
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Shift Name *</label>
            <input
              type="text"
              style={{
                height: '32px',
                padding: '0 8px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border-strong)',
                fontSize: '13px',
              }}
              placeholder="e.g. Morning Shift"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Start Time *</label>
            <input
              type="time"
              style={{
                height: '32px',
                padding: '0 8px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border-strong)',
                fontSize: '13px',
              }}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>End Time *</label>
            <input
              type="time"
              style={{
                height: '32px',
                padding: '0 8px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border-strong)',
                fontSize: '13px',
              }}
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
            <button
              type="submit"
              style={{
                flex: 1,
                height: '32px',
                backgroundColor: 'var(--brand-primary)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius-button)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Create Shift
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setIsFormOpen(false);
              }}
              style={{
                flex: 1,
                height: '32px',
                backgroundColor: 'var(--bg-surface-alt)',
                color: 'var(--text-default)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-button)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </Drawer>

      {/* Shifts Grid View */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
        {templates.map((t) => (
          <div
            key={t.id}
            style={{
              backgroundColor: 'var(--bg-surface)',
              padding: '18px',
              borderRadius: 'var(--radius-card)',
              border: '1px solid var(--border-soft)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.01)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-strong)' }}>{t.name}</span>
              <StatusBadge status={t.isActive ? 'ACTIVE' : 'INACTIVE'} type={t.isActive ? 'success' : 'default'} />
            </div>
            <div>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>OPERATING HOURS</span>
              <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-strong)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                {t.startTime} - {t.endTime}
              </p>
            </div>
          </div>
        ))}

        {templates.length === 0 && (
          <div
            style={{
              gridColumn: '1 / -1',
              padding: '32px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              backgroundColor: 'var(--bg-surface)',
              borderRadius: 'var(--radius-card)',
              border: '1px solid var(--border-soft)',
            }}
          >
            No shift timing templates configured.
          </div>
        )}
      </div>
    </div>
  );
};
