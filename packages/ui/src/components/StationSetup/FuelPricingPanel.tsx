import React, { useState, useEffect } from 'react';
import { CloudPricingService } from '../../services/cloud.js';
import { Station } from '@pump/shared';
import { useToast } from '../primitives/ToastProvider.js';

const pricingService = new CloudPricingService();

interface FuelPricingPanelProps {
  selectedStation: Station | null;
}

export const FuelPricingPanel: React.FC<FuelPricingPanelProps> = ({ selectedStation }) => {
  const toast = useToast();
  const [currentPrices, setCurrentPrices] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [selectedProductId, setSelectedProductId] = useState('');
  const [price, setPrice] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');

  useEffect(() => {
    loadPricingData();
  }, [selectedStation]);

  const loadPricingData = async () => {
    if (!selectedStation) return;
    try {
      setLoading(true);
      const [pricesData, historyData] = await Promise.all([
        pricingService.getPricing(selectedStation.id),
        pricingService.getPricingHistory(selectedStation.id),
      ]);
      setCurrentPrices(pricesData);
      setHistory(historyData);

      // Pre-select first fuel product if none selected
      if (pricesData.length > 0) {
        setSelectedProductId(pricesData[0].productId);
      }
      
      // Default effective from to current local date-time (ISO format for input type="datetime-local")
      const localNow = new Date();
      localNow.setMinutes(localNow.getMinutes() - localNow.getTimezoneOffset());
      setEffectiveFrom(localNow.toISOString().slice(0, 16));
    } catch (err) {
      console.error('Failed to load pricing data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRecordPricing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStation || !selectedProductId || !price || submitting) return;

    try {
      setSubmitting(true);
      await pricingService.recordPricing({
        stationId: selectedStation.id,
        productId: selectedProductId,
        price: parseFloat(price),
        effectiveFrom: new Date(effectiveFrom).toISOString(),
      });

      setPrice('');
      // Refresh local state
      await loadPricingData();
      toast.success('Price updated.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to record new price');
    } finally {
      setSubmitting(false);
    }
  };

  if (!selectedStation) {
    return <div style={{ color: 'var(--text-muted)' }}>Please select a station to manage pricing.</div>;
  }

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Loading fuel pricing metrics...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} className="animate-fade-in">
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
        
        {/* Current Fuel Prices & Update Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>Active Fuel Rates</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>Current rates active at this station.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {currentPrices.map((cp) => (
              <div 
                key={cp.productId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 'var(--radius-card)',
                  backgroundColor: 'var(--bg-surface)'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>
                    {cp.productName} ({cp.productCode})
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Effective: {cp.effectiveFrom ? new Date(cp.effectiveFrom).toLocaleString() : 'Not Set'}
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, color: 'var(--brand-primary)' }}>
                  ₹{Number(cp.price).toFixed(2)}/L
                </div>
              </div>
            ))}
            {currentPrices.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', border: '1px dashed var(--border-soft)', borderRadius: 'var(--radius-card)' }}>
                No active fuel products. Configure them in the "Products Catalog" tab first.
              </div>
            )}
          </div>

          {currentPrices.length > 0 && (
            <div style={{
              padding: '16px',
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-card)',
              backgroundColor: 'var(--bg-surface-alt)'
            }}>
              <h4 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '12px' }}>Record Price Update</h4>
              <form onSubmit={handleRecordPricing} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Fuel Product *</label>
                    <select
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(e.target.value)}
                      style={{
                        height: '32px',
                        padding: '0 8px',
                        borderRadius: 'var(--radius-input)',
                        border: '1px solid var(--border-strong)',
                        fontSize: '13px',
                        backgroundColor: 'var(--bg-surface)'
                      }}
                      required
                    >
                      {currentPrices.map(cp => (
                        <option key={cp.productId} value={cp.productId}>{cp.productName}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Rate per Litre (₹) *</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 96.43"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      style={{
                        height: '32px',
                        padding: '0 8px',
                        borderRadius: 'var(--radius-input)',
                        border: '1px solid var(--border-strong)',
                        fontSize: '13px',
                      }}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Effective From *</label>
                  <input
                    type="datetime-local"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    style={{
                      height: '32px',
                      padding: '0 8px',
                      borderRadius: 'var(--radius-input)',
                      border: '1px solid var(--border-strong)',
                      fontSize: '13px',
                    }}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    height: '32px',
                    backgroundColor: submitting ? 'var(--text-muted)' : 'var(--brand-primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 'var(--radius-button)',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    marginTop: '8px'
                  }}
                >
                  {submitting ? 'Applying...' : 'Apply New Rate'}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Pricing Adjustment History Log */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>Pricing Adjustment Log</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>Historical price alterations at this station.</p>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-card)', backgroundColor: 'var(--bg-surface)' }}>
            <table className="dense-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Fuel</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px' }}>Rate</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Effective From</th>
                </tr>
              </thead>
              <tbody>
                {history.map((record) => (
                  <tr key={record.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                    <td style={{ fontWeight: 600, color: 'var(--text-strong)', padding: '10px 12px' }}>
                      {record.productName}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '10px 12px' }}>
                      ₹{Number(record.price).toFixed(2)}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '10px 12px' }}>
                      {new Date(record.effectiveFrom).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                      No pricing changes have been logged.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};
