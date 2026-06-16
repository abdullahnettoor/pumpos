import { describe, it, expect } from 'vitest';
import { stationSchema, nozzleReadingSchema } from './validation.js';

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
});
