import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudProductService } from '../../services/cloud.js';
import { queryKeys, TIER } from '../../query/hooks.js';
import { Product, PRODUCT_UNITS } from '@pump/shared';
import { StatusBadge } from '../StatusBadge.js';
import { Drawer } from '../Drawer.js';
import { DataTable } from '../primitives/DataTable.js';
import type { ColumnDef } from '@tanstack/react-table';

const productService = new CloudProductService();
let isSeedingFuels = false;

const buildProductColumns = (startEdit: (p: any) => void, archive: (id: string) => void): ColumnDef<any, any>[] => [
  { accessorKey: 'name', header: 'Name', cell: ({ getValue }) => <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{getValue() as string}</span> },
  { accessorKey: 'brand', header: 'Brand', cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{(getValue() as string) || '—'}</span> },
  { accessorKey: 'code', header: 'Code', cell: ({ getValue }) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{getValue() as string}</span> },
  {
    accessorKey: 'productType',
    header: 'Type',
    cell: ({ getValue }) => {
      const t = getValue() as string;
      return <StatusBadge status={t} type={t === 'FUEL' ? 'info' : t === 'LUBRICANT' ? 'success' : 'default'} />;
    },
  },
  {
    id: 'tax',
    header: 'Tax',
    cell: ({ row }) => {
      const p = row.original;
      const cat = p.taxCategory || (p.productType === 'FUEL' ? 'FUEL_VAT' : 'GST');
      const text = cat === 'FUEL_VAT' ? `VAT ${p.taxConfig?.vat_rate || 0}%` : cat === 'GST' ? `GST ${p.taxConfig?.gst_rate || 0}%` : cat === 'EXEMPT' ? 'Exempt' : '—';
      return <span style={{ fontFamily: 'var(--font-mono)' }}>{text}</span>;
    },
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => {
      const p = row.original;
      return (
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => startEdit(p)} style={{ height: '24px', padding: '0 8px', fontSize: '11px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-strong)', color: 'var(--text-default)', borderRadius: '4px', cursor: 'pointer' }}>Edit</button>
          {p.isActive && (
            <button onClick={() => archive(p.id)} style={{ height: '24px', padding: '0 8px', fontSize: '11px', backgroundColor: 'var(--state-danger-bg)', border: '1px solid rgba(159, 63, 54, 0.2)', color: 'var(--state-danger-fg)', borderRadius: '4px', cursor: 'pointer' }}>Archive</button>
          )}
        </div>
      );
    },
  },
];

export const ProductsCatalog: React.FC = () => {
  const qc = useQueryClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCodeEdited, setIsCodeEdited] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterText, setFilterText] = useState('');

  // Form states
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [productType, setProductType] = useState<'FUEL' | 'LUBRICANT' | 'ADDITIVE' | 'ACCESSORY' | 'CONSUMABLE' | 'SPARE_PART' | 'SERVICE' | 'OTHER'>('FUEL');
  const [inventoryType, setInventoryType] = useState<'BULK' | 'ITEM' | 'NONE'>('BULK');
  const [stockTracked, setStockTracked] = useState(true);
  const [taxCategory, setTaxCategory] = useState<'FUEL_VAT' | 'GST' | 'EXEMPT' | 'NON_TAXABLE'>('FUEL_VAT');
  const [unit, setUnit] = useState('L');
  const [brand, setBrand] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [gstRate, setGstRate] = useState(18);
  const [hsnCode, setHsnCode] = useState('');
  const [vatRate, setVatRate] = useState(0);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async (force = false) => {
    try {
      setLoading(true);
      if (force) await qc.invalidateQueries({ queryKey: queryKeys.products() });
      const data = await qc.ensureQueryData({ queryKey: queryKeys.products(), queryFn: () => productService.listProducts(), staleTime: TIER.semi.staleTime });
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
          taxCategory: 'FUEL_VAT',
          unit: 'Liters',
          taxConfig: { vat_rate: 0, hsn_code: '2710' },
          isActive: true,
        });
      } else {
        await productService.createProduct({
          name: 'Diesel (HSD)',
          code: 'HSD',
          productType: 'FUEL',
          stockTracked: true,
          taxCategory: 'FUEL_VAT',
          unit: 'Liters',
          taxConfig: { vat_rate: 0, hsn_code: '2710' },
          isActive: true,
        });
      }
      loadProducts(true);
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
        taxCategory,
        unit,
        brand: brand.trim() || null,
        sellingPrice: sellingPrice === '' ? null : Number(sellingPrice),
        taxConfig: {
          gst_rate: gstRate,
          vat_rate: vatRate,
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
      loadProducts(true);
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
    setTaxCategory((p as any).taxCategory || (p.productType === 'FUEL' ? 'FUEL_VAT' : 'GST'));
    setUnit(p.unit);
    setBrand((p as any).brand ?? '');
    setSellingPrice((p as any).sellingPrice != null ? String((p as any).sellingPrice) : '');
    setGstRate(p.taxConfig?.gst_rate || 18);
    setHsnCode(p.taxConfig?.hsn_code || '');
    setVatRate((p.taxConfig as any)?.vat_rate || 0);
    setIsCodeEdited(true);
    setIsFormOpen(true);
  };

  const handleArchive = async (id: string) => {
    if (!confirm('Are you sure you want to archive this product?')) return;
    try {
      await productService.archiveProduct(id);
      loadProducts(true);
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
    setTaxCategory('FUEL_VAT');
    setUnit('L');
    setBrand('');
    setSellingPrice('');
    setGstRate(18);
    setHsnCode('');
    setVatRate(0);
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
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              required
              style={{
                height: '32px',
                padding: '0 8px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border-strong)',
                fontSize: '13px',
                backgroundColor: 'var(--bg-surface)',
              }}
            >
              {!PRODUCT_UNITS.some((u) => u.value === unit) && unit && (
                <option value={unit}>{unit}</option>
              )}
              {PRODUCT_UNITS.map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Brand / Company</label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. Castrol, Shell, Exide"
              style={{ height: '32px', padding: '0 8px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', fontSize: '13px' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Selling Price (₹){productType === 'FUEL' ? ' — fuel uses price schedule' : ''}</label>
            <input
              type="number"
              step="any"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              placeholder="Optional — prefills merchandise sales"
              disabled={productType === 'FUEL'}
              style={{ height: '32px', padding: '0 8px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', fontSize: '13px', fontFamily: 'var(--font-mono)' }}
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>Tax Category</label>
              <select
                value={taxCategory}
                onChange={(e) => setTaxCategory(e.target.value as any)}
                style={{ height: '32px', padding: '0 8px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', fontSize: '13px' }}
              >
                <option value="FUEL_VAT">Fuel — VAT (outside GST)</option>
                <option value="GST">GST (lubricants / merchandise)</option>
                <option value="EXEMPT">GST Exempt</option>
                <option value="NON_TAXABLE">Non-Taxable</option>
              </select>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Petrol/diesel attract state VAT (no input credit); lubes &amp; merchandise attract GST.
              </span>
            </div>
          </div>

          {(taxCategory === 'GST' || taxCategory === 'FUEL_VAT') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid var(--border-soft)', paddingTop: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
                  {taxCategory === 'GST' ? 'GST Rate (%)' : 'VAT Rate (%)'}
                </label>
                <input
                  type="number"
                  style={{
                    height: '32px',
                    padding: '0 8px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border-strong)',
                    fontSize: '13px',
                  }}
                  value={taxCategory === 'GST' ? gstRate : vatRate}
                  onChange={(e) => (taxCategory === 'GST' ? setGstRate(parseFloat(e.target.value) || 0) : setVatRate(parseFloat(e.target.value) || 0))}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>{taxCategory === 'GST' ? 'HSN / SAC Code' : 'HSN Code'}</label>
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
      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{ height: '32px', padding: '0 8px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', fontSize: '13px', backgroundColor: 'var(--bg-surface)' }}
        >
          <option value="">All Types</option>
          <option value="FUEL">FUEL</option>
          <option value="LUBRICANT">LUBRICANT</option>
          <option value="ADDITIVE">ADDITIVE</option>
          <option value="ACCESSORY">ACCESSORY</option>
          <option value="CONSUMABLE">CONSUMABLE</option>
          <option value="SPARE_PART">SPARE PART</option>
          <option value="SERVICE">SERVICE</option>
          <option value="OTHER">OTHER</option>
        </select>
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Search name, code, brand…"
          style={{ flex: 1, minWidth: '220px', height: '32px', padding: '0 8px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', fontSize: '13px' }}
        />
      </div>
      <DataTable
        columns={buildProductColumns(startEdit, handleArchive)}
        data={products.filter((p) => {
          if (filterType && p.productType !== filterType) return false;
          if (filterText) {
            const q = filterText.toLowerCase();
            const hay = `${p.name} ${p.code} ${(p as any).brand ?? ''} ${(p as any).category ?? ''}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        })}
        emptyMessage="No products added to the catalogue yet."
        getRowId={(r: any) => r.id}
      />
    </div>
  );
};
