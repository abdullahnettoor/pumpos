import React, { useEffect, useRef, useState } from 'react';
import { Panel } from '../../pump-ds/index.js';

interface NozzleReadingsGridProps {
  nozzleReadings: any[];
  closingReadings: Record<string, number>;
  staffAssignments: any[];
}

/**
 * Active-shift read-only grid summarising each nozzle's opening/closing readings,
 * volume sold and sales value, compiled from recorded attendant handovers.
 * Pure presentational — extracted from ShiftsManagement.
 */
export const NozzleReadingsGrid: React.FC<NozzleReadingsGridProps> = ({
  nozzleReadings,
  closingReadings,
  staffAssignments,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showLeftHint, setShowLeftHint] = useState(false);
  const [showRightHint, setShowRightHint] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const updateHints = () => {
      const maxScrollLeft = el.scrollWidth - el.clientWidth;
      if (maxScrollLeft <= 1) {
        setShowLeftHint(false);
        setShowRightHint(false);
        return;
      }
      setShowLeftHint(el.scrollLeft > 1);
      setShowRightHint(el.scrollLeft < maxScrollLeft - 1);
    };

    updateHints();
    el.addEventListener('scroll', updateHints, { passive: true });
    window.addEventListener('resize', updateHints);

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateHints) : null;
    if (observer) {
      observer.observe(el);
      if (el.firstElementChild instanceof HTMLElement) {
        observer.observe(el.firstElementChild);
      }
    }

    return () => {
      el.removeEventListener('scroll', updateHints);
      window.removeEventListener('resize', updateHints);
      observer?.disconnect();
    };
  }, [nozzleReadings, closingReadings, staffAssignments]);

  return (
    <Panel flush title="Nozzle readings">
      <div
        className="shift-table-shell"
        data-shadow-left={showLeftHint ? 'true' : 'false'}
        data-shadow-right={showRightHint ? 'true' : 'false'}
        style={{ '--sticky-shadow-left': '170px' } as React.CSSProperties}
      >
      <div
        ref={scrollRef}
        className="shift-table-scroll-container"
      >
      <table className="shift-table" style={{ width: '100%', minWidth: '1140px', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-surface-alt)', borderBottom: '1px solid var(--border-soft)', textAlign: 'left', color: 'var(--text-muted)' }}>
            <th style={{ padding: '10px 12px', fontWeight: 600, position: 'sticky', left: 0, zIndex: 2, backgroundColor: 'var(--bg-surface-alt)', width: '80px', minWidth: '80px' }}>Nozzle</th>
            <th style={{ padding: '10px 12px', fontWeight: 600, position: 'sticky', left: 80, zIndex: 2, backgroundColor: 'var(--bg-surface-alt)', width: '90px', minWidth: '90px' }}>Dispenser</th>
            <th style={{ padding: '10px 20px', fontWeight: 600 }}>Staff</th>
            <th style={{ padding: '10px 20px', fontWeight: 600 }}>Product</th>
            <th style={{ padding: '10px 20px', fontWeight: 600 }}>Tank</th>
            <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Price</th>
            <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Opening Rd</th>
            <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Closing Rd</th>
            <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Volume Sold</th>
            <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Sales Value</th>
          </tr>
        </thead>
        <tbody>
          {nozzleReadings.map((nr: any, idx: number) => {
            const opening = Number(nr.openingReading);
            const closing = closingReadings[nr.nozzleId] ?? opening;
            const volume = closing - opening;
            const price = Number(nr.unitPrice || 0);
            const value = volume * price;

            const assignment = staffAssignments?.find(
              (sa: any) => sa.duId === nr.duId
            );
            const assignedStaffName = assignment ? assignment.userName : 'Unassigned';

            return (
              <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                <td style={{ padding: '12px 12px', fontWeight: 600, color: 'var(--text-strong)', position: 'sticky', left: 0, zIndex: 1, backgroundColor: 'var(--bg-surface)', width: '80px', minWidth: '80px' }}>{nr.nozzleName}</td>
                <td style={{ padding: '12px 12px', color: 'var(--text-default)', position: 'sticky', left: 80, zIndex: 1, backgroundColor: 'var(--bg-surface)', width: '90px', minWidth: '90px' }}>{nr.duCode || nr.duName || 'N/A'}</td>
                <td style={{ padding: '12px 20px', color: 'var(--text-default)' }}>
                  <span style={{ 
                    fontSize: '11px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: assignedStaffName === 'Unassigned' ? 'var(--bg-surface-alt)' : 'rgba(16, 185, 129, 0.08)',
                    color: assignedStaffName === 'Unassigned' ? 'var(--text-muted)' : '#059669',
                    fontWeight: 600
                  }}>
                    {assignedStaffName}
                  </span>
                </td>
                <td style={{ padding: '12px 20px', color: 'var(--text-default)' }}>{nr.productName} ({nr.productCode})</td>
                <td style={{ padding: '12px 20px', color: 'var(--text-muted)' }}>{nr.tankName}</td>
                <td style={{ padding: '12px 20px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  ₹{price.toFixed(2)}
                </td>
                <td style={{ padding: '12px 20px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  {opening.toFixed(3)}
                </td>
                <td style={{ padding: '12px 20px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>
                  {closing.toFixed(3)}
                </td>
                <td style={{
                  padding: '12px 20px',
                  textAlign: 'right',
                  fontWeight: 600,
                  color: volume < 0 ? 'var(--state-danger-fg)' : 'var(--text-strong)',
                  fontFamily: 'var(--font-mono)'
                }}>
                  {volume.toFixed(3)} L
                </td>
                <td style={{
                  padding: '12px 20px',
                  textAlign: 'right',
                  fontWeight: 600,
                  color: 'var(--text-strong)',
                  fontFamily: 'var(--font-mono)'
                }}>
                  ₹{value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      </div>
    </Panel>
  );
};
