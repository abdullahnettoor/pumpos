import { z } from 'zod';
import { err, ok, validationError } from '../../../kernel/index.js';
import type { Result } from '../../../kernel/index.js';
import type { CreateProductCommand, UpdateProductCommand } from './command.js';

const productTypeEnum = z.enum(['FUEL', 'LUBRICANT', 'ACCESSORY', 'SERVICE']);
const inventoryTypeEnum = z.enum(['BULK', 'ITEM', 'NONE']);
const taxConfigSchema = z
  .object({ gst_rate: z.number().min(0).max(100).optional(), hsn_code: z.string().max(20).optional() })
  .optional();

const createSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(255),
  code: z.string().trim().min(1, 'code is required').max(100),
  productType: productTypeEnum,
  inventoryType: inventoryTypeEnum.optional(),
  stockTracked: z.boolean().optional(),
  isTaxable: z.boolean().optional(),
  unit: z.string().trim().min(1, 'unit is required').max(50),
  taxConfig: taxConfigSchema,
});

export function validateCreateProduct(input: unknown): Result<CreateProductCommand> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return err(validationError('Invalid CreateProduct command', { issues: parsed.error.flatten() }));
  }
  return ok(parsed.data);
}

const updateSchema = z.object({
  id: z.string().min(1, 'id is required'),
  name: z.string().trim().min(1).max(255).optional(),
  code: z.string().trim().min(1).max(100).optional(),
  productType: productTypeEnum.optional(),
  inventoryType: inventoryTypeEnum.optional(),
  stockTracked: z.boolean().optional(),
  isTaxable: z.boolean().optional(),
  unit: z.string().trim().min(1).max(50).optional(),
  taxConfig: taxConfigSchema,
  isActive: z.boolean().optional(),
});

export function validateUpdateProduct(input: unknown): Result<UpdateProductCommand> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return err(validationError('Invalid UpdateProduct command', { issues: parsed.error.flatten() }));
  }
  return ok(parsed.data);
}
