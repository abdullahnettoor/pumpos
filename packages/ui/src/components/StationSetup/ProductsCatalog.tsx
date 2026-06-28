import React, { useState, useEffect } from 'react';
import { CloudProductService } from '../../services/cloud.js';
import { Product } from '@pump/shared';
import { StatusBadge } from '../StatusBadge.js';
import { Drawer } from '../Drawer.js';

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
  const [productType, setProductType] = useState<'FUEL' | 'LUBRICANT' | 'ADDITIVE' | 'ACCESSORY' | 'CONSUMABLE' | 'SPARE_PART' | 'SERVICE' | 'OTHER'>('FUEL');
  const [inventoryType, setInventoryType] = useState<'BULK' | 'ITEM' | 'NONE'>('BULK');
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
      setProducts(data);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAdd = async (type: 'MS' | 'HSD') => {
    try {
      if (type === 'MS') {
        await productService.createProduct({
          name: 'Petrol (MS)',
          code: 'MS',
          productType: 'FUEL',
          stockTracked: true,
          isTaxable: false,
          unit: 'Liters',
          taxConfig: { gst_rate: 0, hsn_code: '2710' },
          isActive: true,
        });
      } else {
        await productService.createProduct({
          name: 'Diesel (HSD)',
          code: 'HSD',
          productType: 'FUEL',
          stockTracked: true,
          isTaxable: false,
          unit: 'Liters',
          taxConfig: { gst_rate: 0, hsn_code: '2710' },
          isActive: true,
        });
      }
      loadProducts();
    } catch (err: any) {
      alert(err.message || 'Failed to quick add standard product');
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
        inventoryType,
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
    setInventoryType(p.inventoryType);
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
    setInventoryType('BULK');
    setStockTracked(true);
    setIsTaxable(true);
    setUnit('Liters');
    setGstRate(18);
    setHsnCode('');
    setIsCodeEdited(false);
  };

  if (loading) return <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Loading catalog data...</div>;

  const hasMS = products.some((p) => p.code === 'MS');
  const hasHSD = products.some((p) => p.code === 'HSD');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="animate-fade-in">
      
      {(!hasMS || !hasHSD) && (
        <div style={{
          backgroundColor: 'var(--bg-surface-alt)',
          border: '1px solid var(--border-soft)',
          borderRadius: 'var(--radius-card)',
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '4px'
        }}>
          <div>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>Quick Add Standard Indian Fuels</span>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Add pre-configured products for standard Indian petroleum fuels with correct units and tax-exempt defaults.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {!hasMS && (
              <button
                type="button"
                onClick={() => handleQuickAdd('MS')}
                style={{
                  height: '28px',
                  padding: '0 12px',
                  backgroundColor: 'var(--brand-primary)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 'var(--radius-button)',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                + Add Petrol (MS)
              </button>
            )}
            {!hasHSD && (
              <button
                type="button"
                onClick={() => handleQuickAdd('HSD')}
                style={{
                  height: '28px',
                  padding: '0 12px',
                  backgroundColor: 'var(--brand-primary)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 'var(--radius-button)',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                + Add Diesel (HSD)
              </button>
            )}
          </div>
        </div>
      )}

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
      {/* Product Creation/Edit Drawer */}
      <Drawer
        isOpen={isFormOpen}
        onClose={() => {
          resetForm();
          setIsFormOpen(false);
        }}
        title={editingProduct ? 'Edit Catalog Item' : 'New Catalog Item'}
      >
        <form onSubmit={handleCreateOrUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Product Name *</label>
            <input
              type="text"
              style={{
                height: '32px',
                padding: '0 8px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border-strong)',
                fontSize: '13px',
              }}
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Petrol (MS) or Engine Oil 4T"
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Product Code *</label>
            <input
              type="text"
              style={{
                height: '32px',
                padding: '0 8px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border-strong)',
                fontSize: '13px',
              }}
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="e.g. MS or HSD"
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Product Type *</label>
            <select
              value={productType}
              onChange={(e) => {
                const val = e.target.value as 'FUEL' | 'LUBRICANT' | 'ADDITIVE' | 'ACCESSORY' | 'CONSUMABLE' | 'SPARE_PART' | 'SERVICE' | 'OTHER';
                setProductType(val);
                setInventoryType(val === 'FUEL' ? 'BULK' : val === 'SERVICE' ? 'NONE' : 'ITEM');
              }}
              style={{
                height: '32px',
                padding: '0 8px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border-strong)',
                fontSize: '13px',
                backgroundColor: 'var(--bg-surface)'
              }}
            >
              <option value="FUEL">FUEL</option>
              <option value="LUBRICANT">LUBRICANT</option>
              <option value="ADDITIVE">ADDITIVE (coolant, AdBlue, battery water)</option>
              <option value="ACCESSORY">ACCESSORY</option>
              <option value="CONSUMABLE">CONSUMABLE</option>
              <option value="SPARE_PART">SPARE PART</option>
              <option value="SERVICE">SERVICE</option>
              <option value="OTHER">OTHER</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Inventory Engine *</label>
            <select
              value={inventoryType}
              onChange={(e) => setInventoryType(e.target.value as 'BULK' | 'ITEM' | 'NONE')}
              style={{
                height: '32px',
                padding: '0 8px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border-strong)',
                fontSize: '13px',
                backgroundColor: 'var(--bg-surface)'
              }}
            >
              <option value="BULK">Bulk (fuel tanks)</option>
              <option value="ITEM">Item (packaged stock)</option>
              <option value="NONE">None (service / non-stocked)</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Sales Unit *</label>
            <input
              type="text"
              style={{
                height: '32px',
                padding: '0 8px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border-strong)',
                fontSize: '13px',
              }}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g. Liters, Nos"
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '4px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="stockTracked"
                checked={stockTracked}
                onChange={(e) => setStockTracked(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="stockTracked" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', cursor: 'pointer' }}>
                Track Inventory (Maintain stock levels automatically)
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="isTaxable"
                checked={isTaxable}
                onChange={(e) => setIsTaxable(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="isTaxable" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', cursor: 'pointer' }}>
                Taxable Product (Apply GST rate on sales)
              </label>
            </div>
          </div>

          {isTaxable && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid var(--border-soft)', paddingTop: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>GST Rate (%)</label>
                <input
                  type="number"
                  style={{
                    height: '32px',
                    padding: '0 8px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border-strong)',
                    fontSize: '13px',
                  }}
                  value={gstRate}
                  onChange={(e) => setGstRate(parseInt(e.target.value))}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>HSN Code</label>
                <input
                  type="text"
                  style={{
                    height: '32px',
                    padding: '0 8px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border-strong)',
                    fontSize: '13px',
                  }}
                  value={hsnCode}
                  onChange={(e) => setHsnCode(e.target.value)}
                  placeholder="e.g. 2710"
                />
              </div>
            </div>
          )}

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
              {editingProduct ? 'Save Changes' : 'Create Item'}
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
