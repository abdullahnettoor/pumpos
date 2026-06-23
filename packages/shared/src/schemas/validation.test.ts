import { describe, it, expect } from 'vitest';
import { stationSchema, nozzleReadingSchema, supplierPaymentSchema, shiftPurchaseSchema, onboardingDraftSchema, finalizeOnboardingSchema } from './validation.js';

describe('Validation Schemas Tests', () => {
  describe('stationSchema', () => {
    it('should validate correct station inputs', () => {
      const valid = {
        name: 'Main Station A',
        code: 'STA-A',
        settings: {
          shift_grace_minutes: 20,
          offline_warning_days: 3,
          offline_critical_days: 7,
        },
        isActive: true,
      };

      const result = stationSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject short name or code', () => {
      const invalid = {
        name: 'A',
        code: 'S',
      };

      const result = stationSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('nozzleReadingSchema', () => {
    it('should validate reading values where closing >= opening', () => {
      const valid = {
        nozzleId: '550e8400-e29b-41d4-a716-446655440000',
        openingReading: 1250.5,
        closingReading: 1300.0,
      };

      const result = nozzleReadingSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject reading values where closing < opening', () => {
      const invalid = {
        nozzleId: '550e8400-e29b-41d4-a716-446655440000',
        openingReading: 1250.5,
        closingReading: 1200.0,
      };

      const result = nozzleReadingSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('supplierPaymentSchema', () => {
    it('should validate correct supplier payment inputs', () => {
      const valid = {
        shiftId: '550e8400-e29b-41d4-a716-446655440000',
        supplierId: '550e8400-e29b-41d4-a716-446655440001',
        amount: 25000,
        notes: 'RTGS Pay HPCL',
      };

      const result = supplierPaymentSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject negative or zero payment amount', () => {
      const invalid = {
        shiftId: '550e8400-e29b-41d4-a716-446655440000',
        supplierId: '550e8400-e29b-41d4-a716-446655440001',
        amount: -500,
      };

      const result = supplierPaymentSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('shiftPurchaseSchema', () => {
    it('should validate correct purchase inputs without tank allocations', () => {
      const valid = {
        shiftId: '550e8400-e29b-41d4-a716-446655440000',
        supplierId: '550e8400-e29b-41d4-a716-446655440001',
        productId: '550e8400-e29b-41d4-a716-446655440002',
        quantity: 12000,
        unitPrice: 96.5,
        invoiceNumber: 'INV-HPCL-1234',
        notes: 'Bulk HPCL delivery',
      };

      const result = shiftPurchaseSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should validate correct purchase inputs with tank allocations', () => {
      const valid = {
        shiftId: '550e8400-e29b-41d4-a716-446655440000',
        supplierId: '550e8400-e29b-41d4-a716-446655440001',
        productId: '550e8400-e29b-41d4-a716-446655440002',
        quantity: 12000,
        unitPrice: 96.5,
        invoiceNumber: 'INV-HPCL-1234',
        notes: 'Bulk HPCL delivery',
        tankAllocations: [
          { tankId: '550e8400-e29b-41d4-a716-446655440003', quantity: 7000 },
          { tankId: '550e8400-e29b-41d4-a716-446655440004', quantity: 5000 },
        ],
      };

      const result = shiftPurchaseSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject purchase with negative allocation quantity', () => {
      const invalid = {
        shiftId: '550e8400-e29b-41d4-a716-446655440000',
        supplierId: '550e8400-e29b-41d4-a716-446655440001',
        productId: '550e8400-e29b-41d4-a716-446655440002',
        quantity: 12000,
        unitPrice: 96.5,
        tankAllocations: [
          { tankId: '550e8400-e29b-41d4-a716-446655440003', quantity: -100 },
        ],
      };

      const result = shiftPurchaseSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('onboardingDraftSchema', () => {
    const validDraft = {
      station: {
        name: 'Gachibowli Station',
        code: 'GB-01',
        address: '123 Gachibowli Road',
        phone: '+919999999999',
        shiftGraceMinutes: 15,
        timezone: 'Asia/Kolkata',
      },
      businessRules: {
        businessDayStartsAt: '06:00',
        operatingSchedule: {
          isTwentyFourSeven: true,
          days: [
            { day: 'MONDAY', isOpen: true, openTime: '00:00', closeTime: '23:59' },
            { day: 'TUESDAY', isOpen: true, openTime: '00:00', closeTime: '23:59' },
            { day: 'WEDNESDAY', isOpen: true, openTime: '00:00', closeTime: '23:59' },
            { day: 'THURSDAY', isOpen: true, openTime: '00:00', closeTime: '23:59' },
            { day: 'FRIDAY', isOpen: true, openTime: '00:00', closeTime: '23:59' },
            { day: 'SATURDAY', isOpen: true, openTime: '00:00', closeTime: '23:59' },
            { day: 'SUNDAY', isOpen: true, openTime: '00:00', closeTime: '23:59' },
          ],
        },
      },
      products: [
        {
          draftId: 'prod-ms',
          name: 'Petrol (MS)',
          code: 'MS',
          productType: 'FUEL',
          stockTracked: true,
          isTaxable: false,
          unit: 'Liters',
          taxConfig: { gst_rate: 0, hsn_code: '2710' },
          isActive: true,
          currentPrice: 104.5,
        },
      ],
      tanks: [
        {
          draftId: 'tank-1',
          name: 'Tank 1',
          productDraftId: 'prod-ms',
          capacity: 20000,
          openingQuantity: 10000,
        },
      ],
      dispensers: [
        {
          draftId: 'du-1',
          name: 'Dispenser 1',
          code: 'DU-1',
          status: 'ACTIVE',
        },
      ],
      nozzles: [
        {
          draftId: 'noz-1',
          dispenserDraftId: 'du-1',
          tankDraftId: 'tank-1',
          productDraftId: 'prod-ms',
          name: 'N1',
          openingReading: 12000.5,
        },
      ],
      shiftTemplates: [
        {
          draftId: 'shift-t1',
          name: 'Morning Shift',
          startTime: '06:00',
          endTime: '14:00',
          isActive: true,
        },
      ],
    };

    it('should validate a complete, correct onboarding draft', () => {
      const result = onboardingDraftSchema.safeParse(validDraft);
      expect(result.success).toBe(true);
    });

    it('should reject a draft with invalid times or missing fields', () => {
      const invalidDraft = {
        ...validDraft,
        station: {
          ...validDraft.station,
          name: '', // invalid: short name
        },
      };

      const result = onboardingDraftSchema.safeParse(invalidDraft);
      expect(result.success).toBe(false);
    });

    it('should validate finalize onboarding payload', () => {
      const payload = { draft: validDraft };
      const result = finalizeOnboardingSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });
});
