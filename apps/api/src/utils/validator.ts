import { zValidator } from '@hono/zod-validator';
import { ZodSchema } from 'zod';

export const validateJson = (schema: ZodSchema, errorCode = 'VALIDATION_ERROR') =>
  zValidator('json', schema, (result, c) => {
    if (!result.success) {
      return c.json({
        success: false,
        error: {
          code: errorCode,
          message: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ') || result.error.message,
        },
      }, 400);
    }
  });
