import React, { useState, useEffect } from 'react';
import { CloudTankService, CloudProductService } from '../../services/cloud.js';
import { Tank, Product } from '@pump/shared';
import { StatusBadge } from '../StatusBadge.js';

const tankService = new CloudTankService();
const productService = new CloudProductService();

export interface TanksGridProps {
  stationId: string;
}

export const TanksGrid: React.FC<TanksGridProps> = ({ stationId }) => {
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [fuelProducts, setFuelProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [productId, setProductId] = useState('');
  const [capacity, setCapacity] = useState(20000);

  useEffect(() => {
    loadData();
  }, [stationId]);

  const loadData = async () => {
    if (!stationId) return;
    try {
      setLoading(true);
      const [tankList, prodList] = await Promise.all([
        tankService.listTanks(stationId),
        productService.listProducts(),
      ]);
      setTanks(tankList);
      const fuels = prodList.filter((p) => p.productType === 'FUEL' && p.isActive);
      setFuelProducts(fuels);
      
      // Initialize form defaults based on current state
      if (fuels.length > 0) {
        setProductId(fuels[0].id);
      }
      setName(`Tank ${tankList.length + 1}`);
    } catch (err) {
      console.error('Failed to load tanks data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) {
      alert('Please define a fuel product in the catalog first.');
      return;
    }
    try {
      await tankService.createTank({
        stationId,
        name,
        productId,
        capacity,
      });
      setIsFormOpen(false);
      resetForm();
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to create tank');
    }
  };

  const prefillSuggestion = (fuelCode: 'MS' | 'HSD') => {
    const fuel = fuelProducts.find(p => p.code === fuelCode);
    if (!fuel) {
      alert(`Please define active ${fuelCode === 'MS' ? 'Petrol (MS)' : 'Diesel (HSD)'} in step 2 first.`);
      return;
    }
    
    setName(fuelCode === 'MS' ? 'Petrol Tank 1' : 'Diesel Tank 1');
    setCapacity(fuelCode === 'MS' ? 15000 : 20000);
    setProductId(fuel.id);
    setIsFormOpen(true);
  };

  const resetForm = () => {
    setName(`Tank ${tanks.length + 1}`);
    if (fuelProducts.length > 0) {
      setProductId(fuelProducts[0].id);
    }
    setCapacity(20000);
  };

  if (loading) return <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Loading storage tanks...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="animate-fade-in">
      
      {/* Tanks Header & Add button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)' }}>Storage Tanks</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Monitor underground fuel reserves, capacity, and product configurations.</p>
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
            + Add Tank
          </button>
        )}
      </div>

      {/* Recommended Configuration Suggestions Banner */}
      {tanks.length === 0 && fuelProducts.length > 0 && (
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
            <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-strong)' }}>Recommended Layout</span>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              We recommend setting up underground storage tanks. Click a template to pre-fill the form, customize the liters, and save:
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => prefillSuggestion('MS')}
              style={{
                height: '30px',
                padding: '0 12px',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-strong)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-button)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              + Sug. Petrol Tank (15 KL)
            </button>
            <button
              onClick={() => prefillSuggestion('HSD')}
              style={{
                height: '30px',
                padding: '0 12px',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-strong)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-button)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              + Sug. Diesel Tank (20 KL)
            </button>
          </div>
        </div>
      )}

      {/* Inline Form Card */}
      {isFormOpen && (
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            padding: '20px',
            borderRadius: 'var(--radius-card)',
            border: '1px solid var(--brand-primary)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.02)',
          }}
        >
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)', paddingBottom: '8px', marginBottom: '16px' }}>
            Add Storage Tank
          </h3>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Tank Identifier</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Tank 1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Linked Fuel Product</label>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="form-input"
                  style={{ height: '36px', width: '100%' }}
                >
                  {fuelProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Capacity (Liters)</label>
                <input
                  type="number"
                  className="form-input mono-num"
                  value={capacity}
                  onChange={(e) => setCapacity(parseInt(e.target.value) || 0)}
                  placeholder="e.g. 15000"
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid var(--border-soft)', paddingTop: '12px' }}>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setIsFormOpen(false);
                }}
                style={{
                  height: '32px',
                  padding: '0 16px',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border-strong)',
                  color: 'var(--text-default)',
                  borderRadius: 'var(--radius-button)',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  height: '32px',
                  padding: '0 16px',
                  backgroundColor: 'var(--brand-primary)',
                  border: 'none',
                  color: '#ffffff',
                  borderRadius: 'var(--radius-button)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Create Tank
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tanks Grid View */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
        {tanks.map((t) => {
          const product = fuelProducts.find((p) => p.id === t.productId);
          return (
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
                <span style={{ fontWeight: 600, color: 'var(--text-strong)', fontSize: '14px' }}>{t.name}</span>
                <StatusBadge status={product?.name || 'Unknown'} type="info" />
              </div>
              <div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Capacity</span>
                <p style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  {t.capacity.toLocaleString()} L
                </p>
              </div>
            </div>
          );
        })}

        {tanks.length === 0 && (
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
            No storage tanks configured for this location yet.
          </div>
        )}
      </div>
    </div>
  );
};
