import React, { useState, useEffect } from 'react';
import { CloudProductService } from '../../services/cloud.js';
import { Product } from '@pump/shared';
import { StatusBadge } from '../StatusBadge.js';

const productService = new CloudProductService();
let isSeedingFuels = false;

export const ProductsCatalog: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCodeEdited, setIsCodeEdited] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [productType, setProductType] = useState<'FUEL' | 'LUBRICANT' | 'ACCESSORY' | 'SERVICE'>('FUEL');
  const [stockTracked, setStockTracked] = useState(true);
  const [isTaxable, setIsTaxable] = useState(true);
  const [unit, setUnit] = useState('Liters');
  const [gstRate, setGstRate] = useState(18);
  const [hsnCode, setHsnCode] = useState('');

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await productService.listProducts();
      const hasMSOrHSD = data.some((p) => p.code === 'MS' || p.code === 'HSD');

      if (data.length === 0 && !hasMSOrHSD) {
        if (isSeedingFuels) return;
        isSeedingFuels = true;
        try {
          // Auto-seed primary fuel products (exempt of GST by default)
          const seededPetrol = await productService.createProduct({
            name: 'Petrol (MS)',
            code: 'MS',
            productType: 'FUEL',
            stockTracked: true,
            isTaxable: false,
            unit: 'Liters',
            taxConfig: { gst_rate: 0, hsn_code: '2710' },
            isActive: true,
          });

          const seededDiesel = await productService.createProduct({
            name: 'Diesel (HSD)',
            code: 'HSD',
            productType: 'FUEL',
            stockTracked: true,
            isTaxable: false,
            unit: 'Liters',
            taxConfig: { gst_rate: 0, hsn_code: '2710' },
            isActive: true,
          });

          setProducts([seededPetrol, seededDiesel]);
        } finally {
          isSeedingFuels = false;
        }
      } else {
        setProducts(data);
      }
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!isCodeEdited && !editingProduct) {
      setCode(
        val
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 15)
      );
    }
  };

  const handleCodeChange = (val: string) => {
    setCode(val);
    setIsCodeEdited(true);
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name,
        code: code.toUpperCase(),
        productType,
        stockTracked,
        isTaxable,
        unit,
        taxConfig: {
          gst_rate: gstRate,
          hsn_code: hsnCode,
        },
        isActive: true,
      };

      if (editingProduct) {
        await productService.updateProduct(editingProduct.id, payload);
      } else {
        await productService.createProduct(payload);
      }

      resetForm();
      setIsFormOpen(false);
      loadProducts();
    } catch (err: any) {
      alert(err.message || 'Failed to save product');
    }
  };

  const startEdit = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setCode(p.code);
    setProductType(p.productType);
    setStockTracked(p.stockTracked);
    setIsTaxable(p.isTaxable);
    setUnit(p.unit);
    setGstRate(p.taxConfig?.gst_rate || 18);
    setHsnCode(p.taxConfig?.hsn_code || '');
    setIsCodeEdited(true);
    setIsFormOpen(true);
  };

  const handleArchive = async (id: string) => {
    if (!confirm('Are you sure you want to archive this product?')) return;
    try {
      await productService.archiveProduct(id);
      loadProducts();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const resetForm = () => {
    setEditingProduct(null);
    setName('');
    setCode('');
    setProductType('FUEL');
    setStockTracked(true);
    setIsTaxable(true);
    setUnit('Liters');
    setGstRate(18);
    setHsnCode('');
    setIsCodeEdited(false);
  };

  if (loading) return <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Loading catalog data...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="animate-fade-in">
      
      {/* Catalog Header Info & Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)' }}>Products Catalogue</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Manage fuels, lubricants, shop inventory, or services.</p>
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
            + Add Product
          </button>
        )}
      </div>

      {/* Inline Form Panel */}
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
            {editingProduct ? 'Edit Catalog Item' : 'New Catalog Item'}
          </h3>
          <form onSubmit={handleCreateOrUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Product Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Petrol (MS) or Engine Oil 4T"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Product Code</label>
                <input
                  type="text"
                  className="form-input"
                  value={code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  placeholder="e.g. MS or HSD"
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Product Type</label>
                <select
                  value={productType}
                  onChange={(e) => setProductType(e.target.value as any)}
                  className="form-input"
                  style={{ height: '36px', width: '100%' }}
                >
                  <option value="FUEL">FUEL</option>
                  <option value="LUBRICANT">LUBRICANT</option>
                  <option value="ACCESSORY">ACCESSORY</option>
                  <option value="SERVICE">SERVICE</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Sales Unit</label>
                <input
                  type="text"
                  className="form-input"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="e.g. Liters, Nos"
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '32px', margin: '4px 0' }}>
              <div className="switch-container">
                <div className="switch-label-group">
                  <span className="switch-title">Track Inventory</span>
                  <span className="switch-description">Maintain stock levels automatically</span>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    className="switch-input"
                    checked={stockTracked}
                    onChange={(e) => setStockTracked(e.target.checked)}
                  />
                  <span className="switch-slider"></span>
                </label>
              </div>

              <div className="switch-container">
                <div className="switch-label-group">
                  <span className="switch-title">Taxable Product</span>
                  <span className="switch-description">Apply GST rate on sales</span>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    className="switch-input"
                    checked={isTaxable}
                    onChange={(e) => setIsTaxable(e.target.checked)}
                  />
                  <span className="switch-slider"></span>
                </label>
              </div>
            </div>

            {isTaxable && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', borderTop: '1px solid var(--border-soft)', paddingTop: '16px' }}>
                <div className="form-group">
                  <label className="form-label">GST Rate (%)</label>
                  <input
                    type="number"
                    className="form-input mono-num"
                    value={gstRate}
                    onChange={(e) => setGstRate(parseInt(e.target.value))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">HSN Code</label>
                  <input
                    type="text"
                    className="form-input mono-num"
                    value={hsnCode}
                    onChange={(e) => setHsnCode(e.target.value)}
                    placeholder="e.g. 2710"
                  />
                </div>
              </div>
            )}

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
                {editingProduct ? 'Save Changes' : 'Create Item'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Product List Table */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-card)', backgroundColor: 'var(--bg-surface)' }}>
        <table className="dense-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: '35%', textAlign: 'left', padding: '10px 12px' }}>Name</th>
              <th style={{ width: '15%', textAlign: 'left', padding: '10px 12px' }}>Code</th>
              <th style={{ width: '15%', textAlign: 'left', padding: '10px 12px' }}>Type</th>
              <th style={{ width: '15%', textAlign: 'right', padding: '10px 12px' }}>Tax (GST)</th>
              <th style={{ width: '20%', textAlign: 'center', padding: '10px 12px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} style={{ opacity: p.isActive ? 1 : 0.5, borderBottom: '1px solid var(--border-soft)' }}>
                <td style={{ fontWeight: 600, color: 'var(--text-strong)', padding: '10px 12px' }}>{p.name}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '10px 12px' }}>{p.code}</td>
                <td style={{ padding: '10px 12px' }}>
                  <StatusBadge 
                    status={p.productType} 
                    type={p.productType === 'FUEL' ? 'info' : p.productType === 'LUBRICANT' ? 'success' : 'default'} 
                  />
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', padding: '10px 12px' }}>
                  {p.isTaxable ? `${p.taxConfig?.gst_rate || 0}%` : 'Exempt'}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                    <button
                      onClick={() => startEdit(p)}
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
                    {p.isActive && (
                      <button
                        onClick={() => handleArchive(p.id)}
                        style={{
                          height: '24px',
                          padding: '0 8px',
                          fontSize: '11px',
                          backgroundColor: 'var(--state-danger-bg)',
                          border: '1px solid rgba(159, 63, 54, 0.2)',
                          color: 'var(--state-danger-fg)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        Archive
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No products added to the catalogue yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
