import { describe, it, expect } from 'vitest';
import { stationSchema, nozzleReadingSchema, supplierPaymentSchema, shiftPurchaseSchema } from './validation.js';

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
});
