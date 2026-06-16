import React, { useState, useEffect } from 'react';
import { CloudTankService, CloudProductService } from '../../services/cloud.js';
import { Tank, Product } from '@pump/shared';
import { StatusBadge } from '../StatusBadge.js';
import { Drawer } from '../Drawer.js';

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

  // Quick add states
  const [quickPetrolCapacity, setQuickPetrolCapacity] = useState('15000');
  const [quickDieselCapacity, setQuickDieselCapacity] = useState('20000');
  const [quickSubmitting, setQuickSubmitting] = useState(false);

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

  const handleQuickAdd = async (fuelCode: 'MS' | 'HSD', capStr: string) => {
    const fuel = fuelProducts.find(p => p.code === fuelCode);
    if (!fuel) {
      alert(`Please define active ${fuelCode === 'MS' ? 'Petrol (MS)' : 'Diesel (HSD)'} in the catalog first.`);
      return;
    }
    const cap = parseInt(capStr);
    if (!cap || cap <= 0) {
      alert('Please enter a valid capacity');
      return;
    }

    try {
      setQuickSubmitting(true);
      const sameProductTanksCount = tanks.filter(t => t.productId === fuel.id).length;
      const tankName = fuelCode === 'MS' 
        ? `Petrol Tank ${sameProductTanksCount + 1}` 
        : `Diesel Tank ${sameProductTanksCount + 1}`;

      await tankService.createTank({
        stationId,
        name: tankName,
        productId: fuel.id,
        capacity: cap,
      });

      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to create tank');
    } finally {
      setQuickSubmitting(false);
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

      {/* Quick Add Tanks Panel */}
      {fuelProducts.length > 0 && (
        <div style={{
          backgroundColor: 'var(--bg-surface-alt)',
          padding: '14px 20px',
          borderRadius: 'var(--radius-card)',
          border: '1px solid var(--border-soft)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-strong)' }}>Quick Add Storage Tanks</span>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Add a new Petrol or Diesel underground storage tank instantly by entering its capacity:
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center' }}>
            {/* Petrol Quick Add */}
            {fuelProducts.some(p => p.code === 'MS') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)' }}>Petrol Tank (MS):</span>
                <input
                  type="number"
                  placeholder="Liters"
                  value={quickPetrolCapacity}
                  onChange={(e) => setQuickPetrolCapacity(e.target.value)}
                  disabled={quickSubmitting}
                  style={{
                    width: '100px',
                    height: '28px',
                    padding: '0 8px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border-strong)',
                    fontSize: '12px',
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleQuickAdd('MS', quickPetrolCapacity)}
                  disabled={quickSubmitting}
                  style={{
                    height: '28px',
                    padding: '0 12px',
                    backgroundColor: 'var(--brand-primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 'var(--radius-button)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: quickSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  Quick Add
                </button>
              </div>
            )}

            {/* Diesel Quick Add */}
            {fuelProducts.some(p => p.code === 'HSD') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)' }}>Diesel Tank (HSD):</span>
                <input
                  type="number"
                  placeholder="Liters"
                  value={quickDieselCapacity}
                  onChange={(e) => setQuickDieselCapacity(e.target.value)}
                  disabled={quickSubmitting}
                  style={{
                    width: '100px',
                    height: '28px',
                    padding: '0 8px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border-strong)',
                    fontSize: '12px',
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleQuickAdd('HSD', quickDieselCapacity)}
                  disabled={quickSubmitting}
                  style={{
                    height: '28px',
                    padding: '0 12px',
                    backgroundColor: 'var(--brand-primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 'var(--radius-button)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: quickSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  Quick Add
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tank Creation/Edit Drawer */}
      <Drawer
        isOpen={isFormOpen}
        onClose={() => {
          resetForm();
          setIsFormOpen(false);
        }}
        title="Add Storage Tank"
      >
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Tank Identifier *</label>
            <input
              type="text"
              style={{
                height: '32px',
                padding: '0 8px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border-strong)',
                fontSize: '13px',
              }}
              placeholder="e.g. Tank 1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Linked Fuel Product *</label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              style={{
                height: '32px',
                padding: '0 8px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border-strong)',
                fontSize: '13px',
                backgroundColor: 'var(--bg-surface)'
              }}
            >
              {fuelProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Capacity (Liters) *</label>
            <input
              type="number"
              style={{
                height: '32px',
                padding: '0 8px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border-strong)',
                fontSize: '13px',
              }}
              value={capacity}
              onChange={(e) => setCapacity(parseInt(e.target.value) || 0)}
              placeholder="e.g. 15000"
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
              Create Tank
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
