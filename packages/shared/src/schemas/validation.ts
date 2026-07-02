import { z } from 'zod';

const timeStringSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:MM format');

const weekdaySchema = z.enum([
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]);

export const organizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters'),
  subscriptionPlan: z.string().default('Core'),
  subscriptionStatus: z.string().default('Active'),
});

/** Owner-editable organization profile (name + legal/branding metadata). */
export const organizationUpdateSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').max(255),
  metadata: z.object({
    legalName: z.string().max(255).optional().nullable(),
    gstin: z.string().max(15).optional().nullable(),
    pan: z.string().max(10).optional().nullable(),
    stateCode: z.string().max(2).optional().nullable(),
    address: z.string().max(500).optional().nullable(),
    phone: z.string().max(50).optional().nullable(),
    email: z.string().email('Invalid email address').or(z.literal('')).optional().nullable(),
  }).optional().nullable(),
});
export type OrganizationUpdateValues = z.infer<typeof organizationUpdateSchema>;

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
    business_day_starts_at: timeStringSchema.optional(),
    timezone: z.string().min(1).optional(),
    operating_schedule: z.object({
      isTwentyFourSeven: z.boolean(),
      days: z.array(z.object({
        day: weekdaySchema,
        isOpen: z.boolean(),
        openTime: timeStringSchema,
        closeTime: timeStringSchema,
      })).optional(),
    }).optional(),
    pending_opening_stock_seed: z.array(z.object({
      tankId: z.string().uuid('Invalid tank ID'),
      productId: z.string().uuid('Invalid product ID'),
      quantity: z.number().nonnegative('Opening quantity must be non-negative'),
    })).optional().nullable(),
    legal: z.object({
      legalName: z.string().optional().nullable(),
      gstin: z.string().max(15).optional().nullable(),
      stateCode: z.string().max(2).optional().nullable(),
      addressLine: z.string().optional().nullable(),
      pincode: z.string().max(6).optional().nullable(),
      roCode: z.string().optional().nullable(),
      contact: z.string().optional().nullable(),
    }).optional().nullable(),
    fuel_brand: z.string().optional().nullable(),
    logo_data_url: z.string().optional().nullable(),
    report_config: z.object({
      shiftSummary: z.array(z.string()).optional(),
      dssr: z.array(z.string()).optional(),
    }).optional().nullable(),
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
  email: z.string().email('Invalid email address').or(z.literal('')).optional().nullable(),
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
  dipReadings: z.array(
    z.object({
      tankId: z.string().uuid('Invalid tank ID'),
      actualQuantity: z.number().nonnegative('Actual quantity must be non-negative'),
    })
  ).optional(),
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
  tankAllocations: z.array(
    z.object({
      tankId: z.string().uuid('Invalid tank ID'),
      quantity: z.number().nonnegative('Allocation quantity must be non-negative'),
    })
  ).optional().nullable(),
});

export const shiftCollectionSchema = z.object({
  shiftId: z.string().uuid('Invalid shift ID'),
  customerId: z.string().uuid('Invalid customer ID').optional().nullable(),
  vehicleId: z.string().uuid('Invalid vehicle ID').optional().nullable(),
  productId: z.string().uuid('Invalid product ID').optional().nullable(),
  quantity: z.number().positive('Quantity must be positive').optional().nullable(),
  unitPrice: z.number().nonnegative('Unit price must be non-negative').optional().nullable(),
  amount: z.number().positive('Amount must be positive'),
  paymentMethod: z.enum(['Cash', 'Card', 'UPI', 'Credit']),
  notes: z.string().max(500).optional().nullable(),
});

export const customerCreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  phone: z.string().max(50).optional().nullable(),
  customerType: z.enum(['Regular', 'Credit', 'Fleet']).default('Regular'),
  creditLimit: z.number().nonnegative().optional().nullable(),
  fleetCode: z.string().max(100).optional().nullable(),
  isPrepaid: z.boolean().default(false),
  isActive: z.boolean().default(true),
  metadata: z.object({
    gstin: z.string().max(15).optional().nullable(),
    stateCode: z.string().max(2).optional().nullable(),
    pan: z.string().max(10).optional().nullable(),
    tradeName: z.string().max(255).optional().nullable(),
    billingAddress: z.string().max(500).optional().nullable(),
  }).optional().nullable(),
});

export const customerTopupSchema = z.object({
  amount: z.number().positive('Top-up amount must be positive'),
  paymentMethod: z.enum(['Cash', 'Card', 'UPI', 'BankTransfer']),
  notes: z.string().max(500).optional().nullable(),
});

export const customerVehicleCreateSchema = z.object({
  registrationNumber: z.string().min(3, 'Registration number is required').max(50),
  vehicleType: z.string().min(2, 'Vehicle type is required').max(50),
  defaultProductId: z.string().uuid('Invalid product ID').optional().nullable(),
  isActive: z.boolean().default(true),
});

export const supplierCreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  phone: z.string().max(50).optional().nullable(),
  isActive: z.boolean().default(true),
  metadata: z.object({
    gstin: z.string().max(15).optional().nullable(),
    stateCode: z.string().max(2).optional().nullable(),
    pan: z.string().max(10).optional().nullable(),
    tradeName: z.string().max(255).optional().nullable(),
    billingAddress: z.string().max(500).optional().nullable(),
  }).optional().nullable(),
});

export const fuelPriceSchema = z.object({
  stationId: z.string().uuid('Invalid station ID'),
  productId: z.string().uuid('Invalid product ID'),
  price: z.number().positive('Price must be positive'),
  effectiveFrom: z.string().datetime().optional().nullable(),
});

export const operatingDayScheduleSchema = z.object({
  day: weekdaySchema,
  isOpen: z.boolean(),
  openTime: timeStringSchema,
  closeTime: timeStringSchema,
});

export const weeklyOperatingScheduleSchema = z.object({
  isTwentyFourSeven: z.boolean(),
  days: z.array(operatingDayScheduleSchema).length(7, 'Operating schedule must include all 7 days'),
}).superRefine((data, ctx) => {
  const uniqueDays = new Set(data.days.map((day) => day.day));
  if (uniqueDays.size !== data.days.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Operating schedule contains duplicate weekdays',
      path: ['days'],
    });
  }

  if (!data.isTwentyFourSeven && !data.days.some((day) => day.isOpen)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one business day must be open',
      path: ['days'],
    });
  }
});

export const onboardingProductDraftSchema = z.object({
  draftId: z.string().min(1, 'Missing product draft ID'),
  name: z.string().min(1, 'Product name is required').max(255),
  code: z.string().min(1, 'Product code is required').max(100),
  productType: z.literal('FUEL'),
  stockTracked: z.boolean().default(true),
  isTaxable: z.boolean().default(false),
  unit: z.string().min(1, 'Unit is required').max(50),
  taxConfig: z.object({
    gst_rate: z.number().min(0).max(100).optional().nullable(),
    hsn_code: z.string().max(50).optional().nullable(),
  }),
  isActive: z.boolean().default(true),
  currentPrice: z.number().positive('Fuel rate must be positive'),
});

export const onboardingTankDraftSchema = z.object({
  draftId: z.string().min(1, 'Missing tank draft ID'),
  name: z.string().min(1, 'Tank name is required').max(100),
  productDraftId: z.string().min(1, 'Fuel product is required'),
  capacity: z.number().positive('Tank capacity must be positive'),
  openingQuantity: z.number().nonnegative('Opening quantity must be non-negative'),
});

export const onboardingDispenserDraftSchema = z.object({
  draftId: z.string().min(1, 'Missing dispenser draft ID'),
  name: z.string().min(1, 'Dispenser name is required').max(100),
  code: z.string().min(1, 'Dispenser code is required').max(50),
  status: z.enum(['ACTIVE', 'MAINTENANCE', 'INACTIVE']).default('ACTIVE'),
});

export const onboardingNozzleDraftSchema = z.object({
  draftId: z.string().min(1, 'Missing nozzle draft ID'),
  dispenserDraftId: z.string().min(1, 'Dispenser mapping is required'),
  tankDraftId: z.string().min(1, 'Tank mapping is required'),
  productDraftId: z.string().min(1, 'Fuel mapping is required'),
  name: z.string().min(1, 'Nozzle name is required').max(100),
  openingReading: z.number().nonnegative('Opening reading must be non-negative'),
});

export const onboardingShiftTemplateDraftSchema = z.object({
  draftId: z.string().min(1, 'Missing shift template draft ID'),
  name: z.string().min(1, 'Shift template name is required').max(100),
  startTime: timeStringSchema,
  endTime: timeStringSchema,
  isActive: z.boolean().default(true),
});

export const onboardingPaymentTerminalDraftSchema = z.object({
  draftId: z.string().min(1, 'Missing payment terminal draft ID'),
  label: z.string().min(1, 'Terminal label is required').max(100),
  provider: z.string().max(100).optional().default(''),
  terminalCode: z.string().max(100).optional().default(''),
  supportsCard: z.boolean().default(true),
  supportsUpi: z.boolean().default(true),
});

export const onboardingDraftSchema = z.object({
  station: z.object({
    name: z.string().min(2, 'Station name must be at least 2 characters'),
    code: z.string().min(2, 'Station code must be at least 2 characters').max(50).toUpperCase(),
    address: z.string().max(500).optional().nullable(),
    phone: z.string().max(50).optional().nullable(),
    shiftGraceMinutes: z.number().int().min(0).max(180),
    timezone: z.string().min(1, 'Timezone is required'),
  }),
  businessRules: z.object({
    businessDayStartsAt: timeStringSchema,
    operatingSchedule: weeklyOperatingScheduleSchema,
  }),
  products: z.array(onboardingProductDraftSchema),
  tanks: z.array(onboardingTankDraftSchema),
  dispensers: z.array(onboardingDispenserDraftSchema),
  nozzles: z.array(onboardingNozzleDraftSchema),
  shiftTemplates: z.array(onboardingShiftTemplateDraftSchema),
  // Payment terminals are optional; a station may operate cash-only at launch.
  paymentTerminals: z.array(onboardingPaymentTerminalDraftSchema).optional().default([]),
});

export const finalizeOnboardingSchema = z.object({
  draft: onboardingDraftSchema,
});

export const attendantHandoverSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  duId: z.string().uuid('Invalid DU ID'),
  cashHandedOver: z.number().nonnegative('Cash must be non-negative'),
  cardHandedOver: z.number().nonnegative('Card payments must be non-negative'),
  upiHandedOver: z.number().nonnegative('UPI payments must be non-negative'),
  creditHandedOver: z.number().nonnegative('Credit sales must be non-negative'),
  testingVolume: z.number().nonnegative('Testing volume must be non-negative'),
  expectedSales: z.number().nonnegative('Expected sales must be non-negative'),
  varianceAmount: z.number(),
  nozzleReadings: z.array(z.object({
    nozzleId: z.string().uuid('Invalid nozzle ID'),
    closingReading: z.number().nonnegative('Reading must be non-negative'),
  })),
});

export const supplierPaymentSchema = z.object({
  shiftId: z.string().uuid('Invalid shift ID'),
  supplierId: z.string().uuid('Invalid supplier ID'),
  amount: z.number().positive('Payment amount must be positive'),
  notes: z.string().max(500).optional().nullable(),
});

// ---------------------------------------------------------------------------
// UI entry-form schemas
//
// These back the transaction quick-entry forms (Expense / Collection / Purchase
// / Merchandise sale) which are driven by react-hook-form + zodResolver. They
// are string-friendly (number fields use z.coerce.number so raw <input> string
// values validate and coerce in one pass) and intentionally looser than the
// service-layer schemas above: `targetShiftId` is optional because some entry
// points (e.g. the standalone Expenses page) post to a business day with no
// drawer shift.
// ---------------------------------------------------------------------------

export const expenseEntryFormSchema = z.object({
  targetShiftId: z.string().optional().default(''),
  transactionDate: z.string().optional().default(''),
  categoryId: z.string().min(1, 'Category is required'),
  amount: z.coerce.number({ invalid_type_error: 'Amount is required' }).positive('Amount must be positive'),
  description: z.string().max(255).optional().default(''),
});
export type ExpenseEntryFormValues = z.infer<typeof expenseEntryFormSchema>;

export const collectionEntryFormSchema = z.object({
  targetShiftId: z.string().optional().default(''),
  transactionDate: z.string().optional().default(''),
  customerId: z.string().optional().default(''),
  amount: z.coerce.number({ invalid_type_error: 'Amount is required' }).positive('Amount must be positive'),
  paymentMethod: z.enum(['Cash', 'Card', 'UPI', 'BankTransfer']).default('Cash'),
  notes: z.string().max(500).optional().default(''),
});
export type CollectionEntryFormValues = z.infer<typeof collectionEntryFormSchema>;

export const purchaseLineFormSchema = z.object({
  productId: z.string().min(1, 'Product is required'),
  quantity: z.coerce.number({ invalid_type_error: 'Quantity is required' }).positive('Quantity must be positive'),
  unitPrice: z.coerce.number({ invalid_type_error: 'Rate is required' }).positive('Rate must be positive'),
  // Fuel lines may split the received quantity across destination tanks. The
  // form injects this on submit; it is not a user-typed RHF field.
  tankAllocations: z.array(z.object({ tankId: z.string(), quantity: z.coerce.number().nonnegative() })).optional(),
});
export type PurchaseLineFormValues = z.infer<typeof purchaseLineFormSchema>;

export const purchaseEntryFormSchema = z.object({
  targetShiftId: z.string().optional().default(''),
  transactionDate: z.string().optional().default(''),
  supplierId: z.string().min(1, 'Supplier is required'),
  invoiceNumber: z.string().max(100).optional().default(''),
  notes: z.string().max(500).optional().default(''),
  lines: z.array(purchaseLineFormSchema).min(1, 'Add at least one line item'),
});
export type PurchaseEntryFormValues = z.infer<typeof purchaseEntryFormSchema>;

export const merchandiseSaleEntryFormSchema = z.object({
  targetShiftId: z.string().optional().default(''),
  productId: z.string().min(1, 'Product is required'),
  quantity: z.coerce.number({ invalid_type_error: 'Quantity is required' }).positive('Quantity must be positive'),
  unitPrice: z.coerce.number({ invalid_type_error: 'Unit price is required' }).nonnegative('Unit price must be non-negative'),
  paymentMethod: z.enum(['Cash', 'Card', 'UPI', 'Credit']).default('Cash'),
  customerId: z.string().optional().default(''),
  attendantId: z.string().optional().default(''),
  notes: z.string().max(500).optional().default(''),
}).refine((data) => data.paymentMethod !== 'Credit' || !!data.customerId, {
  message: 'A customer account is required for credit sales',
  path: ['customerId'],
});
export type MerchandiseSaleEntryFormValues = z.infer<typeof merchandiseSaleEntryFormSchema>;

