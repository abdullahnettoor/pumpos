import React, { useState, useEffect } from 'react';
import { CloudPricingService } from '../../services/cloud.js';
import { Station } from '@pump/shared';
import { useToast } from '../primitives/ToastProvider.js';
import { LoadingSpinner } from '../LoadingSpinner.js';
import { Field, NumberInput, Select } from '../primitives/Field.js';
import { inr } from '../../utils/format.js';

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
    return <LoadingSpinner text="Loading fuel pricing..." />;
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
                  {inr(cp.price)}/L
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
                  <Field label="Fuel product" required style={{ marginBottom: 0 }}>
                    <Select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)} required>
                      {currentPrices.map(cp => (
                        <option key={cp.productId} value={cp.productId}>{cp.productName}</option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Rate per litre (₹)" required style={{ marginBottom: 0 }}>
                    <NumberInput
                      step="0.01"
                      placeholder="e.g. 96.43"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      required
                    />
                  </Field>
                </div>

                <Field label="Effective from" required style={{ marginBottom: 0 }}>
                  <input
                    type="datetime-local"
                    className="input"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    required
                  />
                </Field>

                <button
                  type="submit"
                  className="btn btn-primary btn-md"
                  disabled={submitting}
                  style={{ marginTop: '8px' }}
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
                      {inr(record.price)}
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
