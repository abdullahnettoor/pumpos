import { z } from 'zod';

export const organizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters'),
  subscriptionPlan: z.string().default('Core'),
  subscriptionStatus: z.string().default('Active'),
});

export const stationSchema = z.object({
  name: z.string().min(2, 'Station name must be at least 2 characters'),
  code: z.string().min(2, 'Station code must be at least 2 characters').toUpperCase(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  settings: z.object({
    shift_grace_minutes: z.number().int().min(0).default(15),
    shift_lock_grace_days: z.number().int().min(0).default(3),
    offline_warning_days: z.number().int().min(1).default(3),
    offline_critical_days: z.number().int().min(1).default(7),
  }).default({
    shift_grace_minutes: 15,
    shift_lock_grace_days: 3,
    offline_warning_days: 3,
    offline_critical_days: 7,
  }),
  onboardingStatus: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'READY_FOR_OPERATIONS']).default('NOT_STARTED'),
  isActive: z.boolean().default(true),
});

export const userSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const expenseSchema = z.object({
  categoryId: z.string().uuid('Invalid category ID'),
  amount: z.number().positive('Expense amount must be positive'),
  description: z.string().max(255).optional().nullable(),
  parentExpenseId: z.string().uuid().optional().nullable(),
  adjustmentReason: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'ADJUSTMENT', 'VOIDED']).default('ACTIVE'),
});

export const shiftSchema = z.object({
  shiftTemplateId: z.string().uuid('Invalid shift template ID'),
  openingCash: z.number().nonnegative('Opening cash must be non-negative'),
});

export const shiftOpenSchema = z.object({
  stationId: z.string().uuid('Invalid station ID'),
  shiftTemplateId: z.string().uuid('Invalid shift template ID'),
  openingCash: z.number().nonnegative('Opening cash must be non-negative'),
  staffAssignments: z.array(
    z.object({
      userId: z.string().uuid('Invalid user ID'),
      duId: z.string().uuid('Invalid dispenser unit ID'),
    })
  ).optional(),
  initialReadings: z.array(
    z.object({
      nozzleId: z.string().uuid('Invalid nozzle ID'),
      openingReading: z.number().nonnegative('Opening reading must be non-negative'),
    })
  ).optional(),
});

export const shiftCloseSchema = z.object({
  closingCash: z.number().nonnegative('Closing cash must be non-negative'),
  nozzleReadings: z.array(
    z.object({
      nozzleId: z.string().uuid('Invalid nozzle ID'),
      closingReading: z.number().nonnegative('Closing reading must be non-negative'),
    })
  ),
});


export const nozzleReadingSchema = z.object({
  nozzleId: z.string().uuid('Invalid nozzle ID'),
  openingReading: z.number().nonnegative('Opening reading must be non-negative'),
  closingReading: z.number().nonnegative('Closing reading must be non-negative'),
}).refine((data) => data.closingReading >= data.openingReading, {
  message: 'Closing reading must be greater than or equal to opening reading',
  path: ['closingReading'],
});

export const syncEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  payload: z.record(z.any()),
  status: z.enum(['PENDING', 'PROCESSING', 'SYNCED', 'FAILED']).default('PENDING'),
  retryCount: z.number().int().nonnegative().default(0),
});

export const shiftExpenseSchema = z.object({
  shiftId: z.string().uuid('Invalid shift ID'),
  categoryId: z.string().uuid('Invalid category ID'),
  amount: z.number().positive('Expense amount must be positive'),
  description: z.string().max(255).optional().nullable(),
});

export const shiftPurchaseSchema = z.object({
  shiftId: z.string().uuid('Invalid shift ID'),
  supplierId: z.string().uuid('Invalid supplier ID'),
  productId: z.string().uuid('Invalid product ID'),
  quantity: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().positive('Price must be positive'),
  invoiceNumber: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const shiftCollectionSchema = z.object({
  shiftId: z.string().uuid('Invalid shift ID'),
  customerId: z.string().uuid('Invalid customer ID').optional().nullable(),
  amount: z.number().positive('Amount must be positive'),
  paymentMethod: z.enum(['Cash', 'Card', 'UPI', 'Credit']),
  notes: z.string().max(500).optional().nullable(),
});

