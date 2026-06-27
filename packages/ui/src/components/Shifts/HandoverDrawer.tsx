import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Drawer } from '../Drawer.js';
import { CloudShiftService } from '../../services/cloud.js';

const shiftService = new CloudShiftService();

// Define form validation schema using Zod
const handoverFormSchema = z.object({
  cashHandedOver: z.coerce.number().nonnegative('Cash must be non-negative'),
  cardHandedOver: z.coerce.number().nonnegative('Card Swipe total must be non-negative'),
  upiHandedOver: z.coerce.number().nonnegative('UPI QR total must be non-negative'),
  creditHandedOver: z.coerce.number().nonnegative('Credit chits total must be non-negative'),
  nozzleReadings: z.record(z.string().uuid(), z.coerce.number().nonnegative('Reading must be non-negative')),
  nozzleTesting: z.record(z.string().uuid(), z.coerce.number().nonnegative('Testing liters must be non-negative')),
});

type HandoverFormValues = z.infer<typeof handoverFormSchema>;

interface HandoverDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  shiftId: string;
  userId: string;
  userName: string;
  duId: string;
  duCode: string;
  nozzles: any[];
  existingHandover: any;
  onSaveSuccess: () => void;
}

export const HandoverDrawer: React.FC<HandoverDrawerProps> = ({
  isOpen,
  onClose,
  shiftId,
  userId,
  userName,
  duId,
  duCode,
  nozzles,
  existingHandover,
  onSaveSuccess,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<HandoverFormValues>({
    resolver: zodResolver(handoverFormSchema),
    defaultValues: {
      cashHandedOver: 0,
      cardHandedOver: 0,
      upiHandedOver: 0,
      creditHandedOver: 0,
      nozzleReadings: {},
      nozzleTesting: {},
    },
  });

  // Pre-fill form if existing handover is passed
  useEffect(() => {
    if (isOpen) {
      setError(null);
      if (existingHandover) {
        setValue('cashHandedOver', Number(existingHandover.cashHandedOver ?? 0));
        setValue('cardHandedOver', Number(existingHandover.cardHandedOver ?? 0));
        setValue('upiHandedOver', Number(existingHandover.upiHandedOver ?? 0));
        setValue('creditHandedOver', Number(existingHandover.creditHandedOver ?? 0));
      } else {
        setValue('cashHandedOver', 0);
        setValue('cardHandedOver', 0);
        setValue('upiHandedOver', 0);
        setValue('creditHandedOver', 0);
      }

      // Initialize readings and testing maps
      nozzles.forEach((nz) => {
        setValue(`nozzleReadings.${nz.nozzleId}`, Number(nz.closingReading ?? nz.openingReading ?? 0));
        setValue(`nozzleTesting.${nz.nozzleId}`, 0); // Default testing volume to 0
      });
    }
  }, [isOpen, existingHandover, nozzles, setValue]);

  // Watch form values reactively for live expected sales and variance computations
  const formValues = watch();
  const formNozzleReadings = formValues.nozzleReadings || {};
  const formNozzleTesting = formValues.nozzleTesting || {};
  const formCash = formValues.cashHandedOver || 0;
  const formCard = formValues.cardHandedOver || 0;
  const formUpi = formValues.upiHandedOver || 0;
  const formCredit = formValues.creditHandedOver || 0;

  // Derived Calculations
  const calculatedNozzles = nozzles.map((nz) => {
    const opening = Number(nz.openingReading || 0);
    const closing = Number(formNozzleReadings[nz.nozzleId] ?? opening);
    const volume = Math.max(0, closing - opening);
    const price = Number(nz.unitPrice || 0);
    const testing = Number(formNozzleTesting[nz.nozzleId] || 0);

    const rawValue = volume * price;
    const testingDeduction = testing * price;

    return {
      ...nz,
      opening,
      closing,
      volume,
      price,
      testing,
      rawValue,
      testingDeduction,
    };
  });

  const totalVolumeSold = calculatedNozzles.reduce((sum, n) => sum + n.volume, 0);
  const totalRawSales = calculatedNozzles.reduce((sum, n) => sum + n.rawValue, 0);
  const totalTestingVolume = calculatedNozzles.reduce((sum, n) => sum + n.testing, 0);
  const totalTestingDeduction = calculatedNozzles.reduce((sum, n) => sum + n.testingDeduction, 0);

  const expectedSales = Math.max(0, totalRawSales - totalTestingDeduction);

  const totalDeclared = Number(formCash) + Number(formCard) + Number(formUpi) + Number(formCredit);
  const variance = totalDeclared - expectedSales;

  const onSubmit = async (values: HandoverFormValues) => {
    setError(null);

    // Validate reading constraints: closing cannot be less than opening
    for (const nz of calculatedNozzles) {
      if (nz.closing < nz.opening) {
        setError(`Closing reading for nozzle ${nz.nozzleName} (${nz.closing}) cannot be less than opening reading (${nz.opening}).`);
        return;
      }
    }

    try {
      setSubmitting(true);
      const nozzleReadingsPayload = Object.entries(values.nozzleReadings).map(([nozzleId, closingVal]) => ({
        nozzleId,
        closingReading: Number(closingVal),
      }));

      const payload = {
        shiftId,
        userId,
        duId,
        cashHandedOver: Number(values.cashHandedOver),
        cardHandedOver: Number(values.cardHandedOver),
        upiHandedOver: Number(values.upiHandedOver),
        creditHandedOver: Number(values.creditHandedOver),
        testingVolume: totalTestingVolume, // aggregate sum of all nozzles testing volumes
        expectedSales,
        varianceAmount: variance,
        nozzleReadings: nozzleReadingsPayload,
      };

      await shiftService.recordHandover(payload);
      onSaveSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save attendant handover');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={`Attendant Handover: ${userName} (${duCode})`}
    >
      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {error && (
          <div style={{
            backgroundColor: 'var(--state-danger-bg)',
            border: '1px solid var(--border-soft)',
            color: 'var(--state-danger-fg)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-input)',
            fontSize: '12px',
            fontWeight: 500,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* 1. Nozzle Readings Section */}
        <div>
          <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
            1. Nozzle Readings & Calibration Testing
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {calculatedNozzles.map((nz) => (
              <div
                key={nz.nozzleId}
                style={{
                  backgroundColor: 'var(--bg-surface-alt)',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 'var(--radius-input)',
                  padding: '10px 12px',
                  display: 'grid',
                  gridTemplateColumns: '1fr 90px 110px 90px',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-strong)' }}>{nz.nozzleName}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {nz.productCode} • <strong>₹{nz.price.toFixed(2)}/L</strong>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Opening</label>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-faint)' }}>{nz.opening.toFixed(3)}</span>
                </div>
                <div>
                  <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Closing Rd</label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    {...register(`nozzleReadings.${nz.nozzleId}`)}
                    style={{
                      width: '100%',
                      height: '28px',
                      padding: '0 6px',
                      border: '1px solid var(--border-strong)',
                      borderRadius: 'var(--radius-input)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                      textAlign: 'right',
                    }}
                  />
                  {errors.nozzleReadings?.[nz.nozzleId] && (
                    <span style={{ color: 'var(--brand-danger)', fontSize: '9px', display: 'block', marginTop: '2px' }}>
                      Err
                    </span>
                  )}
                </div>
                <div>
                  <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Testing (L)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    {...register(`nozzleTesting.${nz.nozzleId}`)}
                    style={{
                      width: '100%',
                      height: '28px',
                      padding: '0 6px',
                      border: '1px solid var(--border-strong)',
                      borderRadius: 'var(--radius-input)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                      textAlign: 'right',
                    }}
                  />
                  {errors.nozzleTesting?.[nz.nozzleId] && (
                    <span style={{ color: 'var(--brand-danger)', fontSize: '9px', display: 'block', marginTop: '2px' }}>
                      Err
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Handover Amounts Section */}
        <div>
          <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
            2. Payment & Chit Deposits
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-default)' }}>Cash Handed Over (₹)</label>
              <input
                type="number"
                step="any"
                {...register('cashHandedOver')}
                style={{
                  height: '32px',
                  padding: '0 8px',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-input)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                }}
              />
              {errors.cashHandedOver && (
                <span style={{ color: 'var(--brand-danger)', fontSize: '10px' }}>
                  {errors.cashHandedOver.message}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-default)' }}>Card Swipe Total (₹)</label>
              <input
                type="number"
                step="any"
                {...register('cardHandedOver')}
                style={{
                  height: '32px',
                  padding: '0 8px',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-input)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                }}
              />
              {errors.cardHandedOver && (
                <span style={{ color: 'var(--brand-danger)', fontSize: '10px' }}>
                  {errors.cardHandedOver.message}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-default)' }}>UPI QR Total (₹)</label>
              <input
                type="number"
                step="any"
                {...register('upiHandedOver')}
                style={{
                  height: '32px',
                  padding: '0 8px',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-input)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                }}
              />
              {errors.upiHandedOver && (
                <span style={{ color: 'var(--brand-danger)', fontSize: '10px' }}>
                  {errors.upiHandedOver.message}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-default)' }}>Credit Chits Total (₹)</label>
              <input
                type="number"
                step="any"
                {...register('creditHandedOver')}
                style={{
                  height: '32px',
                  padding: '0 8px',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-input)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                }}
              />
              {errors.creditHandedOver && (
                <span style={{ color: 'var(--brand-danger)', fontSize: '10px' }}>
                  {errors.creditHandedOver.message}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 3. Live Reconciliation Summary Card */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface-alt)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-input)',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            marginTop: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span>Derived Fuel Volume:</span>
            <strong style={{ fontFamily: 'var(--font-mono)' }}>{totalVolumeSold.toFixed(3)} Liters</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span>Testing/Calibration Volume:</span>
            <strong style={{ fontFamily: 'var(--font-mono)' }}>{totalTestingVolume.toFixed(1)} Liters</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span>Expected Fuel Sales Value:</span>
            <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{expectedSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span>Declared Deposit Sum:</span>
            <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{totalDeclared.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '13px',
              fontWeight: 700,
              borderTop: '1px solid var(--border-soft)',
              paddingTop: '8px',
              marginTop: '4px',
              color: variance === 0 ? 'var(--state-success-fg)' : variance > 0 ? 'var(--brand-warning)' : 'var(--brand-danger)',
            }}
          >
            <span>Handover Variance:</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              {variance > 0 ? '+' : ''}₹{variance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              {variance === 0 ? ' (Balanced)' : variance > 0 ? ' (Surplus)' : ' (Shortage)'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <button
            type="submit"
            disabled={submitting}
            style={{
              flex: 1,
              height: '36px',
              backgroundColor: 'var(--brand-primary)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-button)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Saving...' : 'Save Handover & Readings'}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              height: '36px',
              backgroundColor: 'var(--bg-surface-alt)',
              color: 'var(--text-default)',
              border: '1px solid var(--border-soft)',
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
  );
};
