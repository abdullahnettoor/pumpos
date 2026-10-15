import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudProductService } from '../../services/cloud.js';
import { queryKeys, useProducts } from '../../query/hooks.js';
import { Product, PRODUCT_UNITS, type TaxCategory } from '@pump/shared';
import {
  Button,
  Chip,
  ConceptIcon,
  DataSection,
  EmptyState,
  Form,
  Icon,
  InteractiveTable,
  SearchInput,
  SectionHeader,
  type TableColumn,
} from '../../pump-ds/index.js';
import { Field, MoneyInput, NumberInput, Select, TextInput } from '../primitives/Field.js';
import { countOf } from '../../utils/ledgerWindow.js';
import { Drawer } from '../Drawer.js';
import { ProductImportDrawer } from './ProductImportDrawer.js';
import { Checkbox } from '../primitives/Toggle.js';
import { useToast } from '../primitives/ToastProvider.js';
import { useConfirm } from '../primitives/ConfirmDialog.js';
import { useRunTask } from '../../utils/runTask.js';
import {
  officeSubmitKeys,
  sendKeyed,
  type SubmitKeySession,
} from '../../office-records/submitKeys.js';
import { useCreateRequest, type CreateRequestProps } from './useCreateRequest.js';

const productService = new CloudProductService();

type ProductType = Product['productType'];

const Faint: React.FC = () => <span className="text-ink-faint">—</span>;

const taxText = (p: any): string => {
  const cat = p.taxCategory || (p.productType === 'FUEL' ? 'FUEL_VAT' : 'GST');
  return cat === 'FUEL_VAT'
    ? `VAT ${p.taxConfig?.vat_rate || 0}%`
    : cat === 'GST'
      ? `GST ${p.taxConfig?.gst_rate || 0}%`
      : cat === 'EXEMPT'
        ? 'Exempt'
        : '—';
};

const buildProductColumns = (
  startEdit: (p: Product) => void,
  archive: (id: string) => void,
): TableColumn<Product>[] => [
  {
    id: 'name',
    header: 'Name',
    kind: 'text',
    value: (p) => p.name,
    cell: (p) => <span className="font-semibold text-ink-strong">{p.name}</span>,
  },
  {
    id: 'brand',
    header: 'Brand',
    kind: 'text',
    value: (p) => p.brand,
    cell: (p) => (p.brand ? <span className="text-ink-muted">{p.brand}</span> : <Faint />),
  },
  {
    id: 'code',
    header: 'Code',
    kind: 'text',
    value: (p) => p.code,
    cell: (p) => <span className="font-mono">{p.code}</span>,
  },
  {
    id: 'type',
    header: 'Type',
    kind: 'text',
    value: (p) => p.productType,
    cell: (p) => (
      <Chip tone="neutral" size="md">
        {p.productType}
      </Chip>
    ),
  },
  {
    id: 'tax',
    header: 'Tax',
    kind: 'text',
    value: taxText,
    cell: (p) => <span className="font-mono">{taxText(p)}</span>,
  },
  {
    id: 'actions',
    header: '',
    kind: 'text',
    sortable: false,
    width: '150px',
    value: () => null,
    cell: (p) => (
      <span className="flex justify-end gap-1.5">
        <Button variant="secondary" size="xs" onClick={() => startEdit(p)}>
          Edit
        </Button>
        {p.isActive && (
          <Button variant="ghost" size="xs" onClick={() => archive(p.id)}>
            Archive
          </Button>
        )}
      </span>
    ),
  },
];

export interface ProductsCatalogProps extends CreateRequestProps {
  selectedStation?: any | null;
  /** A fresh number per "Import CSV" pick in the Station page's Add ▾ menu. */
  importRequest?: number;
  onImportHandled?: () => void;
}

export const ProductsCatalog: React.FC<ProductsCatalogProps> = ({
  selectedStation,
  createRequest,
  onCreateHandled,
  importRequest,
  onImportHandled,
}) => {
  const qc = useQueryClient();
  const toast = useToast();
  const runTask = useRunTask();
  // One session per opened edit (#537): a new edit never inherits an unsettled key.
  // State, not a ref: startEdit is handed to the column builder during render.
  const [session, setSession] = useState<SubmitKeySession | null>(null);
  const confirm = useConfirm();
  // Read through the shared hook instead of copying the list into local state
  // behind an effect — that pattern was the source of this file's
  // immutability + exhaustive-deps violations, and it bypassed the tiered cache.
  const productsQ = useProducts();
  const products: Product[] = (productsQ.data as Product[]) ?? [];
  const refreshProducts = () => qc.invalidateQueries({ queryKey: queryKeys.products() });
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isCodeEdited, setIsCodeEdited] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterText, setFilterText] = useState('');

  // Form states
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [productType, setProductType] = useState<
    | 'FUEL'
    | 'LUBRICANT'
    | 'ADDITIVE'
    | 'ACCESSORY'
    | 'CONSUMABLE'
    | 'SPARE_PART'
    | 'SERVICE'
    | 'OTHER'
  >('FUEL');
  const [inventoryType, setInventoryType] = useState<'BULK' | 'ITEM' | 'NONE'>('BULK');
  const [stockTracked, setStockTracked] = useState(true);
  const [taxCategory, setTaxCategory] = useState<TaxCategory>('FUEL_VAT');
  const [unit, setUnit] = useState('L');
  const [brand, setBrand] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [openingStock, setOpeningStock] = useState('');
  const [gstRate, setGstRate] = useState(18);
  const [hsnCode, setHsnCode] = useState('');
  const [vatRate, setVatRate] = useState(0);
  const [priceInclusive, setPriceInclusive] = useState(true);

  const handleQuickAdd = async (type: 'MS' | 'HSD') => {
    try {
      const body = {
        name: type === 'MS' ? 'Petrol (MS)' : 'Diesel (HSD)',
        code: type,
        productType: 'FUEL',
        stockTracked: true,
        taxCategory: 'FUEL_VAT',
        unit: 'L',
        taxConfig: { vat_rate: 0, hsn_code: '2710' },
        isActive: true,
      };
      await sendKeyed(officeSubmitKeys.session('setup:products:new'), body, (idempotencyKey) =>
        productService.createProduct(body, { idempotencyKey }),
      );
      runTask(refreshProducts(), 'Saved, but the product list could not be refreshed.');
      toast.success('Standard product added.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to quick add standard product');
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
          .slice(0, 15),
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
      const payload: any = {
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
          price_inclusive: priceInclusive,
        },
        isActive: true,
      };

      if (editingProduct) {
        const id = editingProduct.id;
        await sendKeyed(
          session ?? officeSubmitKeys.session(`setup:products:${id}`),
          payload,
          (idempotencyKey) => productService.updateProduct(id, payload, { idempotencyKey }),
        );
      } else {
        // Opening cost basis is only seeded at creation; thereafter it is
        // maintained as a rolling weighted-average from purchases (FB1).
        if (costPrice !== '') payload.costBasis = Number(costPrice);
        // Opening stock (merchandise/ITEM only) posts an OpeningBalance movement
        // server-side, anchored to the selected station's business day.
        if (openingStock !== '' && Number(openingStock) > 0 && inventoryType === 'ITEM') {
          payload.openingStock = Number(openingStock);
          payload.stationId = selectedStation?.id ?? undefined;
        }
        await sendKeyed(
          session ?? officeSubmitKeys.session('setup:products:new'),
          payload,
          (idempotencyKey) => productService.createProduct(payload, { idempotencyKey }),
        );
      }

      resetForm();
      setIsFormOpen(false);
      runTask(refreshProducts(), 'Saved, but the product list could not be refreshed.');
      toast.success(editingProduct ? 'Product updated.' : 'Product created.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save product');
    }
  };

  const startEdit = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setCode(p.code);
    setProductType(p.productType);
    setInventoryType(p.inventoryType);
    setStockTracked(p.stockTracked);
    setTaxCategory(p.taxCategory || (p.productType === 'FUEL' ? 'FUEL_VAT' : 'GST'));
    setUnit(p.unit);
    setBrand(p.brand ?? '');
    setSellingPrice(p.sellingPrice != null ? String(p.sellingPrice) : '');
    setCostPrice(p.costBasis != null && Number(p.costBasis) > 0 ? String(p.costBasis) : '');
    // taxConfig is a jsonb column; normalize in case it arrives as a JSON string
    // so the GST rate / HSN / inclusive flag reliably repopulate on edit.
    const rawTc = p.taxConfig;
    const tc =
      (typeof rawTc === 'string'
        ? (() => {
            try {
              return JSON.parse(rawTc);
            } catch {
              return {};
            }
          })()
        : rawTc) || {};
    setGstRate(tc.gst_rate != null ? Number(tc.gst_rate) : 18);
    setHsnCode(tc.hsn_code || '');
    setPriceInclusive(tc.price_inclusive !== false);
    setVatRate(tc.vat_rate != null ? Number(tc.vat_rate) : 0);
    setIsCodeEdited(true);
    setSession(officeSubmitKeys.session(`setup:products:${p.id}`));
    setIsFormOpen(true);
  };

  const handleArchive = async (id: string) => {
    if (
      !(await confirm({
        title: 'Archive product?',
        message: 'This product will be archived and hidden from active lists.',
        confirmLabel: 'Archive',
        danger: true,
      }))
    )
      return;
    try {
      await sendKeyed(
        officeSubmitKeys.session(`setup:products:${id}`),
        { isActive: false },
        (idempotencyKey) => productService.archiveProduct(id, { idempotencyKey }),
      );
      runTask(refreshProducts(), 'Saved, but the product list could not be refreshed.');
      toast.success('Product archived.');
    } catch (err: any) {
      toast.error(err.message);
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
    setCostPrice('');
    setOpeningStock('');
    setGstRate(18);
    setHsnCode('');
    setPriceInclusive(true);
    setVatRate(0);
    setIsCodeEdited(false);
  };

  const openCreate = () => {
    resetForm();
    setSession(officeSubmitKeys.session('setup:products:new'));
    setIsFormOpen(true);
  };
  // The Station page's Add ▾ menu opens the add drawer or the CSV import.
  useCreateRequest(createRequest, openCreate, onCreateHandled);
  useCreateRequest(importRequest, () => setIsImportOpen(true), onImportHandled);

  const hasMS = products.some((p) => p.code === 'MS');
  const hasHSD = products.some((p) => p.code === 'HSD');
  const visible = products.filter((p) => {
    if (filterType && p.productType !== filterType) return false;
    if (filterText) {
      const q = filterText.toLowerCase();
      const hay = `${p.name} ${p.code} ${p.brand ?? ''} ${p.category ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const filtered = !!filterType || !!filterText.trim();

  return (
    <section className="flex flex-col gap-2">
      {productsQ.data && (!hasMS || !hasHSD) && (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-border-soft bg-surface-alt px-4 py-3">
          <div>
            <span className="text-[13px] font-semibold text-ink-strong">
              Quick Add Standard Indian Fuels
            </span>
            <p className="mt-0.5 text-[12px] text-ink-muted">
              Add pre-configured products for standard Indian petroleum fuels with correct units and
              tax-exempt defaults.
            </p>
          </div>
          <div className="flex gap-2">
            {!hasMS && (
              <Button
                type="button"
                variant="secondary"
                size="xs"
                leftIcon={<Icon name="plus" size="xs" />}
                onClick={() => runTask(handleQuickAdd('MS'), 'Could not add the product.')}
              >
                Add Petrol (MS)
              </Button>
            )}
            {!hasHSD && (
              <Button
                type="button"
                variant="secondary"
                size="xs"
                leftIcon={<Icon name="plus" size="xs" />}
                onClick={() => runTask(handleQuickAdd('HSD'), 'Could not add the product.')}
              >
                Add Diesel (HSD)
              </Button>
            )}
          </div>
        </div>
      )}

      <SectionHeader
        title="Products catalogue"
        subtitle={
          productsQ.data
            ? filtered
              ? `${visible.length} of ${products.length}`
              : countOf(products.length, 'product', 'products')
            : undefined
        }
        controls={{
          search: (
            <div className="w-[240px]">
              <SearchInput
                inputSize="sm"
                value={filterText}
                onChange={setFilterText}
                placeholder="Search name, code, brand…"
              />
            </div>
          ),
          filters: (
            <Select
              aria-label="Product type"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
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
            </Select>
          ),
        }}
      />
      <p className="px-0.5 text-[12px] text-ink-muted">
        Manage fuels, lubricants, shop inventory, or services.
      </p>
      <DataSection
        title="products"
        query={productsQ}
        placeholderHeight={240}
        flush
        isEmpty={visible.length === 0}
        empty={
          <div className="p-3">
            <EmptyState
              compact
              icon={<ConceptIcon concept="products" size="md" />}
              title={products.length === 0 ? 'No products yet' : 'No matching products'}
              description={
                products.length === 0
                  ? 'No products added to the catalogue yet.'
                  : 'Try a different search or type.'
              }
            />
          </div>
        }
      >
        <InteractiveTable
          bare
          columns={buildProductColumns(startEdit, (id) =>
            runTask(handleArchive(id), 'Could not archive the product.'),
          )}
          rows={visible}
          rowKey={(r) => r.id}
          title="products"
        />
      </DataSection>

      <Drawer
        isOpen={isFormOpen}
        onClose={() => {
          resetForm();
          setIsFormOpen(false);
        }}
        title={editingProduct ? 'Edit Catalog Item' : 'New Catalog Item'}
      >
        <Form onSubmit={handleCreateOrUpdate} className="flex flex-col">
          <Field label="Product Name" required>
            <TextInput
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Petrol (MS) or Engine Oil 4T"
              required
            />
          </Field>

          <Field label="Product Code" required>
            <TextInput
              type="text"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="e.g. MS or HSD"
              required
            />
          </Field>

          <Field label="Product Type" required>
            <Select
              value={productType}
              onChange={(e) => {
                const val = e.target.value as ProductType;
                setProductType(val);
                setInventoryType(val === 'FUEL' ? 'BULK' : val === 'SERVICE' ? 'NONE' : 'ITEM');
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
            </Select>
          </Field>

          <Field label="Inventory Engine" required>
            <Select
              value={inventoryType}
              onChange={(e) => setInventoryType(e.target.value as 'BULK' | 'ITEM' | 'NONE')}
            >
              <option value="BULK">Bulk (fuel tanks)</option>
              <option value="ITEM">Item (packaged stock)</option>
              <option value="NONE">None (service / non-stocked)</option>
            </Select>
          </Field>

          <Field label="Sales Unit" required>
            <Select value={unit} onChange={(e) => setUnit(e.target.value)} required>
              {!PRODUCT_UNITS.some((u) => u.value === unit) && unit && (
                <option value={unit}>{unit}</option>
              )}
              {PRODUCT_UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Brand / Company">
            <TextInput
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. Castrol, Shell, Exide"
            />
          </Field>

          <Field
            label={`Selling Price (₹)${productType === 'FUEL' ? ' — fuel uses price schedule' : ''}`}
          >
            <MoneyInput
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              placeholder="Optional — prefills product sales"
              disabled={productType === 'FUEL'}
            />
          </Field>

          {productType !== 'FUEL' && (
            <Field
              label={`Cost Price ex-GST (₹)${editingProduct ? ' — maintained by purchases' : ' — opening cost'}`}
              hint={
                editingProduct
                  ? 'Cost basis updates automatically as a weighted-average from purchases.'
                  : 'Enter the pre-tax (ex-GST) purchase cost — input GST is creditable, not a cost. Leave blank if unknown.'
              }
            >
              <MoneyInput
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="Opening pre-tax cost per unit — seeds margin"
                disabled={!!editingProduct}
              />
            </Field>
          )}

          {productType !== 'FUEL' && !editingProduct && inventoryType === 'ITEM' && (
            <Field
              label={`Opening Stock (${unit || 'units'})`}
              hint={
                selectedStation
                  ? 'Posts an opening balance to inventory for this station. Leave blank if none.'
                  : 'Select a station to record opening stock.'
              }
            >
              <NumberInput
                value={openingStock}
                onChange={(e) => setOpeningStock(e.target.value)}
                placeholder="Quantity on hand at start"
                disabled={!selectedStation}
              />
            </Field>
          )}

          <div className="mb-4">
            <Checkbox
              label="Track Inventory (Maintain stock levels automatically)"
              checked={stockTracked}
              onChange={(e) => setStockTracked(e.target.checked)}
            />
          </div>

          <Field
            label="Tax Category"
            hint="Petrol/diesel attract state VAT (no input credit); lubes & other products attract GST."
          >
            <Select
              value={taxCategory}
              onChange={(e) => setTaxCategory(e.target.value as TaxCategory)}
            >
              <option value="FUEL_VAT">Fuel — VAT (outside GST)</option>
              <option value="GST">GST (lubricants / products)</option>
              <option value="EXEMPT">GST Exempt</option>
              <option value="NON_TAXABLE">Non-Taxable</option>
            </Select>
          </Field>

          {(taxCategory === 'GST' || taxCategory === 'FUEL_VAT') && (
            <div className="flex flex-col border-t border-border-soft pt-3">
              <Field label={taxCategory === 'GST' ? 'GST Rate (%)' : 'VAT Rate (%)'}>
                <NumberInput
                  step="1"
                  value={taxCategory === 'GST' ? gstRate : vatRate}
                  onChange={(e) =>
                    taxCategory === 'GST'
                      ? setGstRate(parseFloat(e.target.value) || 0)
                      : setVatRate(parseFloat(e.target.value) || 0)
                  }
                />
              </Field>

              <Field label={taxCategory === 'GST' ? 'HSN / SAC Code' : 'HSN Code'}>
                <TextInput
                  type="text"
                  value={hsnCode}
                  onChange={(e) => setHsnCode(e.target.value)}
                  placeholder="e.g. 2710"
                />
              </Field>

              {taxCategory === 'GST' && (
                <div className="mb-4">
                  <Checkbox
                    label="Selling price is tax-inclusive (MRP)"
                    description="Retail MRP includes GST — tax is extracted from the price, not added on top. Turn off for pre-tax (B2B) rates."
                    checked={priceInclusive}
                    onChange={(e) => setPriceInclusive(e.target.checked)}
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-border-soft pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                resetForm();
                setIsFormOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {editingProduct ? 'Save Changes' : 'Create Item'}
            </Button>
          </div>
        </Form>
      </Drawer>

      <ProductImportDrawer
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        existingProducts={products}
        selectedStation={selectedStation}
        onImported={() =>
          runTask(refreshProducts(), 'Imported, but the product list could not be refreshed.')
        }
      />
    </section>
  );
};
