import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CloudDispenserService,
  CloudTankService,
  CloudProductService,
  CloudNozzleService
} from '../../services/cloud.js';
import { queryKeys, TIER } from '../../query/hooks.js';
import { DispenserUnit, Tank, Product, Nozzle } from '@pump/shared';
import { StatusBadge } from '../StatusBadge.js';
import { Drawer } from '../Drawer.js';
import { useToast } from '../primitives/ToastProvider.js';

const dispenserService = new CloudDispenserService();
const tankService = new CloudTankService();
const productService = new CloudProductService();
const nozzleService = new CloudNozzleService();

export interface DispensersListProps {
  stationId: string;
}

interface NozzleInput {
  name: string;
  productId: string;
  tankId: string;
  currentReading: number;
}

export const DispensersList: React.FC<DispensersListProps> = ({ stationId }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [dispensers, setDispensers] = useState<DispenserUnit[]>([]);
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [nozzles, setNozzles] = useState<Nozzle[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCodeEdited, setIsCodeEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [nozzlesList, setNozzlesList] = useState<NozzleInput[]>([]);

  useEffect(() => {
    loadData();
  }, [stationId]);

  const loadData = async (force = false) => {
    if (!stationId) return;
    try {
      setLoading(true);
      if (force) await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.dispensers(stationId) }),
        qc.invalidateQueries({ queryKey: queryKeys.nozzles(stationId) }),
      ]);
      const [duList, tankList, prodList, nozzleList] = await Promise.all([
        qc.ensureQueryData({ queryKey: queryKeys.dispensers(stationId), queryFn: () => dispenserService.listDispensers(stationId), staleTime: TIER.static.staleTime }),
        qc.ensureQueryData({ queryKey: queryKeys.tanks(stationId), queryFn: () => tankService.listTanks(stationId), staleTime: TIER.static.staleTime }),
        qc.ensureQueryData({ queryKey: queryKeys.products(), queryFn: () => productService.listProducts(), staleTime: TIER.semi.staleTime }),
        qc.ensureQueryData({ queryKey: queryKeys.nozzles(stationId), queryFn: () => nozzleService.listNozzles(stationId), staleTime: TIER.static.staleTime }),
      ]);

      setDispensers(duList);
      setTanks(tankList);

      const fuels = prodList.filter((p) => p.productType === 'FUEL' && p.isActive);
      setProducts(fuels);
      setNozzles(nozzleList);

      // Setup defaults for form
      setName(`Dispenser Unit ${duList.length + 1}`);
      setCode(`DU-${String(duList.length + 1).padStart(2, '0')}`);
    } catch (err) {
      console.error('Failed to load dispenser setup data:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName(`Dispenser Unit ${dispensers.length + 1}`);
    setCode(`DU-${String(dispensers.length + 1).padStart(2, '0')}`);
    setNozzlesList([]);
    setIsCodeEdited(false);
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!isCodeEdited) {
      setCode(
        val
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 10)
      );
    }
  };

  const addNozzleRow = () => {
    const defaultProduct = products[0]?.id || '';
    const defaultTank = tanks.find(t => t.productId === defaultProduct)?.id || '';
    const nextNozzleNum = nozzles.length + nozzlesList.length + 1;
    setNozzlesList(prev => [
      ...prev,
      {
        name: `N${nextNozzleNum}`,
        productId: defaultProduct,
        tankId: defaultTank,
        currentReading: 1000
      }
    ]);
  };

  const removeNozzleRow = (idx: number) => {
    setNozzlesList(prev => prev.filter((_, i) => i !== idx));
  };

  const handleNozzleProductChange = (idx: number, prodId: string) => {
    const defaultTank = tanks.find(t => t.productId === prodId)?.id || '';
    setNozzlesList(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      return { ...item, productId: prodId, tankId: defaultTank };
    }));
  };

  const handleNozzleTankChange = (idx: number, tankId: string) => {
    setNozzlesList(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      return { ...item, tankId };
    }));
  };

  const handleNozzleNameChange = (idx: number, nozzleName: string) => {
    setNozzlesList(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      return { ...item, name: nozzleName };
    }));
  };

  const handleNozzleReadingChange = (idx: number, reading: number) => {
    setNozzlesList(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      return { ...item, currentReading: reading };
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    try {
      setSubmitting(true);
      // Create Dispenser
      const createdDU = await dispenserService.createDispenser({
        stationId,
        name,
        code: code.toUpperCase(),
        status: 'ACTIVE',
      });

      // Sequential nozzle creations for SQLite resilience
      for (const nozzleInput of nozzlesList) {
        if (!nozzleInput.tankId || !nozzleInput.productId) {
          throw new Error('Please make sure all nozzles have a valid tank and product selected.');
        }
        await nozzleService.createNozzle({
          stationId,
          duId: createdDU.id,
          tankId: nozzleInput.tankId,
          productId: nozzleInput.productId,
          name: nozzleInput.name,
          currentReading: nozzleInput.currentReading
        });
      }

      setIsFormOpen(false);
      resetForm();
      loadData(true);
      toast.success('Dispenser unit created.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create dispenser unit and nozzles');
    } finally {
      setSubmitting(false);
    }
  };

  const prefillDualNozzles = () => {
    const petrol = products.find(p => p.code === 'MS');
    const diesel = products.find(p => p.code === 'HSD');
    const petrolTank = tanks.find(t => t.productId === petrol?.id);
    const dieselTank = tanks.find(t => t.productId === diesel?.id);

    setName(`Dispenser Unit ${dispensers.length + 1}`);
    setCode(`DU-${String(dispensers.length + 1).padStart(2, '0')}`);

    const baseNozzleNum = nozzles.length + 1;
    const recommendedNozzles: NozzleInput[] = [];

    if (petrol && petrolTank) {
      recommendedNozzles.push({
        name: `N${baseNozzleNum}`,
        productId: petrol.id,
        tankId: petrolTank.id,
        currentReading: 1000
      });
    }
    if (diesel && dieselTank) {
      recommendedNozzles.push({
        name: `N${baseNozzleNum + recommendedNozzles.length}`,
        productId: diesel.id,
        tankId: dieselTank.id,
        currentReading: 1000
      });
    }

    setNozzlesList(recommendedNozzles);
    setIsFormOpen(true);
  };

  const prefillQuadNozzles = () => {
    const petrol = products.find(p => p.code === 'MS');
    const diesel = products.find(p => p.code === 'HSD');
    const petrolTank = tanks.find(t => t.productId === petrol?.id);
    const dieselTank = tanks.find(t => t.productId === diesel?.id);

    setName(`Dispenser Unit ${dispensers.length + 1}`);
    setCode(`DU-${String(dispensers.length + 1).padStart(2, '0')}`);

    const baseNozzleNum = nozzles.length + 1;
    const recommendedNozzles: NozzleInput[] = [];

    if (petrol && petrolTank) {
      recommendedNozzles.push({
        name: `N${baseNozzleNum}`,
        productId: petrol.id,
        tankId: petrolTank.id,
        currentReading: 1000
      });
      recommendedNozzles.push({
        name: `N${baseNozzleNum + 1}`,
        productId: petrol.id,
        tankId: petrolTank.id,
        currentReading: 1000
      });
    }
    if (diesel && dieselTank) {
      const currentLen = recommendedNozzles.length;
      recommendedNozzles.push({
        name: `N${baseNozzleNum + currentLen}`,
        productId: diesel.id,
        tankId: dieselTank.id,
        currentReading: 1000
      });
      recommendedNozzles.push({
        name: `N${baseNozzleNum + currentLen + 1}`,
        productId: diesel.id,
        tankId: dieselTank.id,
        currentReading: 1000
      });
    }

    setNozzlesList(recommendedNozzles);
    setIsFormOpen(true);
  };

  if (loading) return <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Loading dispenser units...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="animate-fade-in">

      {/* Header & Add Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)' }}>Dispenser Units (DUs)</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Configure physical fuel pump islands, linked underground tanks, and nozzles.</p>
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
            + Add Dispenser
          </button>
        )}
      </div>

      {/* Recommended Configuration Suggestions Banner */}
      {products.length > 0 && tanks.length > 0 && (
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
            <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-strong)' }}>Recommended Layout Templates</span>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Select a template to pre-fill the form with standard dispenser configurations:
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={prefillDualNozzles}
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
              Auto-fill Dual Dispenser (2 Nozzles)
            </button>
            <button
              onClick={prefillQuadNozzles}
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
              Auto-fill Quad Dispenser (4 Nozzles)
            </button>
          </div>
        </div>
      )}

      {/* Dispenser Creation Drawer */}
      <Drawer
        isOpen={isFormOpen}
        onClose={() => {
          resetForm();
          setIsFormOpen(false);
        }}
        title="Add Dispenser Island"
      >
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Dispenser Name *</label>
            <input
              type="text"
              style={{
                height: '32px',
                padding: '0 8px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border-strong)',
                fontSize: '13px',
              }}
              placeholder="e.g. Dispenser 01"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Code / Reference ID *</label>
            <input
              type="text"
              style={{
                height: '32px',
                padding: '0 8px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border-strong)',
                fontSize: '13px',
              }}
              placeholder="e.g. DU-01"
              value={code}
              onChange={(e) => { setCode(e.target.value); setIsCodeEdited(true); }}
              required
            />
          </div>

          {/* Nozzles Mapping Section */}
          <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>Map Nozzles</span>
              <button
                type="button"
                onClick={addNozzleRow}
                style={{
                  padding: '4px 8px',
                  backgroundColor: 'var(--bg-canvas)',
                  border: '1px solid var(--border-strong)',
                  color: 'var(--text-default)',
                  borderRadius: 'var(--radius-button)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                + Add Nozzle
              </button>
            </div>

            {nozzlesList.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {nozzlesList.map((nozzle, idx) => {
                  const filteredTanks = tanks.filter(t => t.productId === nozzle.productId);
                  return (
                    <div
                      key={idx}
                      style={{
                        padding: '12px',
                        border: '1px solid var(--border-soft)',
                        borderRadius: '6px',
                        backgroundColor: 'var(--bg-surface-alt)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>Nozzle #{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeNozzleRow(idx)}
                          style={{
                            border: 'none',
                            background: 'none',
                            color: 'var(--state-danger-fg)',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: 600
                          }}
                        >
                          Remove
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Name</label>
                          <input
                            type="text"
                            value={nozzle.name}
                            onChange={(e) => handleNozzleNameChange(idx, e.target.value)}
                            style={{
                              height: '28px',
                              padding: '0 8px',
                              borderRadius: 'var(--radius-input)',
                              border: '1px solid var(--border-strong)',
                              fontSize: '12px',
                            }}
                            required
                          />
                        </div>
                        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Reading (Liters)</label>
                          <input
                            type="number"
                            value={nozzle.currentReading}
                            onChange={(e) => handleNozzleReadingChange(idx, parseFloat(e.target.value) || 0)}
                            style={{
                              height: '28px',
                              padding: '0 8px',
                              borderRadius: 'var(--radius-input)',
                              border: '1px solid var(--border-strong)',
                              fontSize: '12px',
                            }}
                            required
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Fuel</label>
                          <select
                            value={nozzle.productId}
                            onChange={(e) => handleNozzleProductChange(idx, e.target.value)}
                            style={{
                              height: '28px',
                              padding: '0 4px',
                              borderRadius: 'var(--radius-input)',
                              border: '1px solid var(--border-strong)',
                              fontSize: '12px',
                              backgroundColor: 'var(--bg-surface)'
                            }}
                          >
                            {products.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Tank</label>
                          <select
                            value={nozzle.tankId}
                            onChange={(e) => handleNozzleTankChange(idx, e.target.value)}
                            style={{
                              height: '28px',
                              padding: '0 4px',
                              borderRadius: 'var(--radius-input)',
                              border: '1px solid var(--border-strong)',
                              fontSize: '12px',
                              backgroundColor: 'var(--bg-surface)'
                            }}
                          >
                            <option value="">-- Select Tank --</option>
                            {filteredTanks.map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '12px' }}>
                No nozzles mapped yet. Click "+ Add Nozzle" to connect fuel lines to this dispenser.
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
            <button
              type="submit"
              disabled={submitting}
              style={{
                flex: 1,
                height: '32px',
                backgroundColor: submitting ? 'var(--text-muted)' : 'var(--brand-primary)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius-button)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Creating...' : 'Create Dispenser'}
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

      {/* DU Grid View */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
        {dispensers.map((du) => {
          const duNozzles = nozzles.filter((n) => n.duId === du.id);
          return (
            <div
              key={du.id}
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
                <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-strong)' }}>{du.name}</span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: du.status === 'ACTIVE' ? 'var(--state-success-bg)' : 'var(--state-danger-bg)',
                    color: du.status === 'ACTIVE' ? 'var(--state-success-fg)' : 'var(--state-danger-fg)',
                  }}
                >
                  {du.status}
                </span>
              </div>
              <div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ISLAND CODE</span>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', marginTop: '2px' }}>
                  {du.code}
                </p>
              </div>

              {/* Nozzles Sub-list */}
              <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '10px', marginTop: '4px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nozzles</span>
                {duNozzles.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                    {duNozzles.map((n) => {
                      const prod = products.find((p) => p.id === n.productId);
                      const tank = tanks.find((t) => t.id === n.tankId);
                      return (
                        <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-default)' }}>
                          <span style={{ fontWeight: 500 }}>
                            {n.name} → <span style={{ color: 'var(--text-muted)' }}>{tank?.name || 'No Tank'} ({prod?.name || 'No Fuel'})</span>
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-strong)' }}>
                            {parseFloat(n.currentReading.toString()).toLocaleString(undefined, { minimumFractionDigits: 1 })} L
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                    No nozzles connected to this dispenser.
                  </p>
                )}
              </div>
            </div>
          );
        })}

        {dispensers.length === 0 && (
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
            No dispenser units registered yet.
          </div>
        )}
      </div>
    </div>
  );
};
