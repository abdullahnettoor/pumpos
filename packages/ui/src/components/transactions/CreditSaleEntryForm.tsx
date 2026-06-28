import React, { useEffect, useRef, useState } from 'react';

export interface ShiftOption {
  id: string;
  label: string;
}

export interface VehicleSearchResult {
  id: string;
  registrationNumber: string;
  vehicleType: string;
  customerId: string;
  customerName: string;
  customerType: string;
  isPrepaid: boolean;
  creditLimit?: string | null;
  defaultProductId?: string | null;
  defaultProductName?: string | null;
  defaultProductCode?: string | null;
  defaultProductUnit?: string | null;
}

export interface CreditSaleEntryFormProps {
  shiftOptions: ShiftOption[];
  targetShiftId: string;
  onTargetShiftIdChange: (value: string) => void;
  searchVehicles: (q: string) => Promise<VehicleSearchResult[]>;
  getPriceForProduct?: (productId: string | null | undefined) => number | null;
  /** Credit-eligible (non-prepaid Credit/Fleet) customers, each with currentBalance + creditLimit. */
  customers?: any[];
  customerId?: string;
  onCustomerIdChange?: (value: string) => void;
  /** Fuel products selectable when no vehicle is chosen. */
  products?: any[];
  productId?: string;
  onProductIdChange?: (value: string) => void;
  selectedVehicle: VehicleSearchResult | null;
  onSelectedVehicleChange: (vehicle: VehicleSearchResult | null) => void;
  quantity: string;
  onQuantityChange: (value: string) => void;
  unitPrice: string;
  onUnitPriceChange: (value: string) => void;
  amount: string;
  onAmountChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  /** Shift attendants for attribution; when provided a selector is shown. */
  attendants?: { userId: string; userName: string }[];
  attendantId?: string;
  onAttendantIdChange?: (value: string) => void;
  submitting: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

const inputStyle: React.CSSProperties = {
  height: '32px',
  borderRadius: 'var(--radius-input)',
  border: '1px solid var(--border-strong)',
  padding: '0 10px',
  fontSize: '13px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
  fontWeight: 600,
};

export const CreditSaleEntryForm: React.FC<CreditSaleEntryFormProps> = ({
  shiftOptions,
  targetShiftId,
  onTargetShiftIdChange,
  searchVehicles,
  getPriceForProduct,
  customers,
  customerId,
  onCustomerIdChange,
  products,
  productId,
  onProductIdChange,
  selectedVehicle,
  onSelectedVehicleChange,
  quantity,
  onQuantityChange,
  unitPrice,
  onUnitPriceChange,
  amount,
  onAmountChange,
  notes,
  onNotesChange,
  attendants,
  attendantId,
  onAttendantIdChange,
  submitting,
  error,
  onCancel,
  onSubmit,
}) => {
  const hasMultipleShiftOptions = shiftOptions.length > 1;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<VehicleSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const debounceRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const quantityRef = useRef<HTMLInputElement | null>(null);

  // Debounced search
  useEffect(() => {
    if (selectedVehicle) {
      setShowResults(false);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const data = await searchVehicles(query);
        setResults(data);
        setShowResults(true);
        setActiveIndex(0);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, selectedVehicle, searchVehicles]);

  // Bidirectional binding: editing quantity derives amount; editing amount derives quantity.
  // Editing unit price recomputes whichever side wasn't the last user-edited field.
  const lastEditedRef = useRef<'qty' | 'amount'>('qty');

  const handleQuantityChange = (v: string) => {
    lastEditedRef.current = 'qty';
    onQuantityChange(v);
    const qty = Number(v);
    const price = Number(unitPrice);
    if (!v) {
      onAmountChange('');
    } else if (qty > 0 && price > 0) {
      onAmountChange((qty * price).toFixed(2));
    }
  };

  const handleAmountChange = (v: string) => {
    lastEditedRef.current = 'amount';
    onAmountChange(v);
    const amt = Number(v);
    const price = Number(unitPrice);
    if (!v) {
      onQuantityChange('');
    } else if (amt > 0 && price > 0) {
      onQuantityChange((amt / price).toFixed(3));
    }
  };

  const handleUnitPriceChange = (v: string) => {
    onUnitPriceChange(v);
    const price = Number(v);
    if (!(price > 0)) return;
    if (lastEditedRef.current === 'qty') {
      const qty = Number(quantity);
      if (qty > 0) onAmountChange((qty * price).toFixed(2));
    } else {
      const amt = Number(amount);
      if (amt > 0) onQuantityChange((amt / price).toFixed(3));
    }
  };

  const handleSelect = (vehicle: VehicleSearchResult) => {
    onSelectedVehicleChange(vehicle);
    setQuery(vehicle.registrationNumber);
    setShowResults(false);
    setResults([]);
    // A vehicle implies its owning customer + default product.
    onCustomerIdChange?.(vehicle.customerId);
    onProductIdChange?.(vehicle.defaultProductId ?? '');
    // Prefill unit price from current shift's nozzle prices (no DB round-trip)
    if (!unitPrice && getPriceForProduct) {
      const price = getPriceForProduct(vehicle.defaultProductId);
      if (price && price > 0) {
        onUnitPriceChange(price.toFixed(2));
      }
    }
    // Focus quantity next
    setTimeout(() => quantityRef.current?.focus(), 0);
  };

  const handleClearVehicle = () => {
    onSelectedVehicleChange(null);
    setQuery('');
    setResults([]);
    setShowResults(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showResults || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((idx) => Math.min(idx + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((idx) => Math.max(idx - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelect(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setShowResults(false);
    }
  };

  const customerMode = Array.isArray(customers);
  const effectiveCustomerId = selectedVehicle?.customerId ?? customerId ?? '';
  const hasCustomer = Boolean(effectiveCustomerId);
  const selectedCustomer = customerMode ? customers!.find((c) => c.id === effectiveCustomerId) : null;
  const creditLimit = Number(selectedCustomer?.creditLimit ?? 0);
  const currentBalance = Number(selectedCustomer?.currentBalance ?? 0);
  const amountNum = Number(amount) || 0;
  const available = creditLimit > 0 ? creditLimit - currentBalance : null;
  const exceedsLimit = available != null && amountNum > available;
  // No vehicle chosen → the attendant must pick which fuel product this credit covers.
  const needsManualProduct = customerMode && !selectedVehicle?.defaultProductName;

  const canSubmit = Boolean(hasCustomer && Number(amount) > 0 && (!needsManualProduct || productId) && !submitting);

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {hasMultipleShiftOptions ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>Target Shift</label>
          <select
            value={targetShiftId}
            onChange={(e) => onTargetShiftIdChange(e.target.value)}
            disabled={submitting}
            style={inputStyle}
          >
            {shiftOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </div>
      ) : shiftOptions.length === 1 ? (
        <div style={{
          backgroundColor: 'var(--state-info-bg)',
          color: 'var(--state-info-fg)',
          padding: '10px 12px',
          borderRadius: 'var(--radius-input)',
          fontSize: '12px',
        }}>
          Logging to shift: <strong>{shiftOptions[0].label}</strong>
        </div>
      ) : null}

      {/* Customer (required) — credit can be booked against a customer with or without a vehicle */}
      {customerMode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>Customer</label>
          <select
            value={customerId ?? ''}
            onChange={(e) => {
              onCustomerIdChange?.(e.target.value);
              // Switching customer detaches any previously chosen vehicle.
              if (selectedVehicle && selectedVehicle.customerId !== e.target.value) {
                onSelectedVehicleChange(null);
                setQuery('');
              }
            }}
            disabled={submitting}
            style={inputStyle}
          >
            <option value="">-- Select credit customer --</option>
            {(customers ?? []).map((c) => {
              const lim = Number(c.creditLimit ?? 0);
              const bal = Number(c.currentBalance ?? 0);
              const avail = lim > 0 ? ` · avail ₹${(lim - bal).toLocaleString('en-IN')}` : '';
              return <option key={c.id} value={c.id}>{c.name} ({c.customerType}){avail}</option>;
            })}
          </select>
          {(customers ?? []).length === 0 && (
            <span style={{ fontSize: '11px', color: 'var(--brand-warning)' }}>
              No credit-eligible customers. Add a Credit/Fleet customer in Customers first.
            </span>
          )}
        </div>
      )}

      {/* Vehicle autocomplete */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}>
        <label style={labelStyle}>{customerMode ? 'Vehicle (optional)' : 'Vehicle Registration'}</label>
        {selectedVehicle ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 10px',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-input)',
            backgroundColor: 'var(--bg-surface-alt)',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-default)' }}>
                {selectedVehicle.registrationNumber}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {selectedVehicle.customerName} · {selectedVehicle.vehicleType}
                {selectedVehicle.defaultProductName ? ` · ${selectedVehicle.defaultProductName}` : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={handleClearVehicle}
              disabled={submitting}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '12px',
                padding: '4px 8px',
              }}
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              onFocus={() => results.length > 0 && setShowResults(true)}
              disabled={submitting}
              autoFocus={!customerMode}
              placeholder="Type registration (e.g. KA01)"
              style={{ ...inputStyle, textTransform: 'uppercase' }}
            />
            {showResults && results.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '4px',
                maxHeight: '240px',
                overflowY: 'auto',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-input)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                zIndex: 10,
              }}>
                {results.map((v, idx) => (
                  <div
                    key={v.id}
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(v); }}
                    onMouseEnter={() => setActiveIndex(idx)}
                    style={{
                      padding: '8px 10px',
                      cursor: 'pointer',
                      backgroundColor: idx === activeIndex ? 'var(--bg-surface-alt)' : 'transparent',
                      borderBottom: idx === results.length - 1 ? 'none' : '1px solid var(--border-soft)',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--text-default)' }}>{v.registrationNumber}</div>
                    <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                      {v.customerName} · {v.vehicleType}
                      {v.defaultProductName ? ` · ${v.defaultProductName}` : ''}
                      {v.isPrepaid ? ' · Prepaid' : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {showResults && results.length === 0 && !searching && query.trim() && (
              <div style={{
                marginTop: '4px',
                padding: '8px 10px',
                fontSize: '12px',
                color: 'var(--text-muted)',
                border: '1px solid var(--border-soft)',
                borderRadius: 'var(--radius-input)',
              }}>
                No vehicles match "{query}". Check registration or add the vehicle in Customers.
              </div>
            )}
          </>
        )}
      </div>

      {/* Product chip (read-only) when a vehicle defines the product */}
      {selectedVehicle?.defaultProductName && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>Product</label>
          <div style={{
            padding: '6px 10px',
            backgroundColor: 'var(--bg-surface-alt)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-input)',
            fontSize: '12px',
            color: 'var(--text-default)',
          }}>
            {selectedVehicle.defaultProductName}
            {selectedVehicle.defaultProductCode ? ` (${selectedVehicle.defaultProductCode})` : ''}
          </div>
        </div>
      )}

      {/* Manual product picker when no vehicle drives the product */}
      {needsManualProduct && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>Fuel Product</label>
          <select
            value={productId ?? ''}
            onChange={(e) => {
              onProductIdChange?.(e.target.value);
              if (getPriceForProduct) {
                const price = getPriceForProduct(e.target.value);
                if (price && price > 0) onUnitPriceChange(price.toFixed(2));
              }
            }}
            disabled={submitting || !hasCustomer}
            style={inputStyle}
          >
            <option value="">-- Select fuel --</option>
            {(products ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}
          </select>
        </div>
      )}

      {/* Quantity + Unit Price */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>
            Quantity {selectedVehicle?.defaultProductUnit ? `(${selectedVehicle.defaultProductUnit})` : ''}
          </label>
          <input
            ref={quantityRef}
            type="number"
            inputMode="decimal"
            step="0.001"
            min="0"
            value={quantity}
            onChange={(e) => handleQuantityChange(e.target.value)}
            disabled={submitting || !hasCustomer}
            placeholder="0.000"
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>Unit Price (₹)</label>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={unitPrice}
            onChange={(e) => handleUnitPriceChange(e.target.value)}
            disabled={submitting || !hasCustomer}
            placeholder="0.00"
            style={inputStyle}
          />
        </div>
      </div>

      {/* Amount */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={labelStyle}>
          Amount (₹) <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>— edit either qty or amount; the other recalculates</span>
        </label>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => handleAmountChange(e.target.value)}
          disabled={submitting || !hasCustomer}
          placeholder="0.00"
          style={{ ...inputStyle, fontWeight: 600 }}
        />
      </div>

      {/* Notes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={labelStyle}>Notes / Slip Ref</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          disabled={submitting}
          placeholder="Slip number, driver, ref..."
          style={inputStyle}
        />
      </div>

      {attendants && attendants.length > 0 && onAttendantIdChange && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>Attendant (sold by)</label>
          <select value={attendantId ?? ''} onChange={(e) => onAttendantIdChange(e.target.value)} disabled={submitting} style={inputStyle}>
            {attendants.map((a) => <option key={a.userId} value={a.userId}>{a.userName}</option>)}
          </select>
        </div>
      )}

      {exceedsLimit && (
        <div style={{
          backgroundColor: 'var(--state-warning-bg)',
          color: 'var(--state-warning-fg)',
          padding: '8px 10px',
          borderRadius: 'var(--radius-input)',
          fontSize: '12px',
          border: '1px solid var(--border-soft)',
        }}>
          This sale (₹{amountNum.toLocaleString('en-IN')}) exceeds the customer's available credit
          {available != null ? ` of ₹${available.toLocaleString('en-IN')}` : ''} (limit ₹{creditLimit.toLocaleString('en-IN')}, outstanding ₹{currentBalance.toLocaleString('en-IN')}). You can still record it.
        </div>
      )}

      {error && (
        <div style={{
          backgroundColor: 'var(--state-danger-bg)',
          color: 'var(--state-danger-fg)',
          padding: '8px 10px',
          borderRadius: 'var(--radius-input)',
          fontSize: '12px',
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          style={{
            height: '32px',
            padding: '0 14px',
            fontSize: '12px',
            fontWeight: 600,
            backgroundColor: 'transparent',
            color: 'var(--text-muted)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-input)',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            height: '32px',
            padding: '0 14px',
            fontSize: '12px',
            fontWeight: 600,
            backgroundColor: canSubmit ? 'var(--brand-primary)' : 'var(--bg-surface-alt)',
            color: canSubmit ? 'white' : 'var(--text-muted)',
            border: 'none',
            borderRadius: 'var(--radius-input)',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          {submitting ? 'Recording...' : 'Log Credit Sale'}
        </button>
      </div>
    </form>
  );
};
