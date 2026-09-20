import { zValidator } from '@hono/zod-validator';
import { ZodSchema } from 'zod';
/**
 * Validate a JSON request body against a schema, answering in the standard
 * envelope whatever goes wrong.
 *
 * The body is parsed here first rather than left to the validator, because a
 * body that is not JSON at all makes `zValidator` answer with plain text — so
 * a client trying to read the failure hits a `SyntaxError` on top of its
 * original error. Every failure from this middleware is
 * `{ success: false, error: { code, message } }`, parseable by the same code
 * that handles every other failure (#205).
 */
export const validateJson = (schema: ZodSchema, errorCode = 'VALIDATION_ERROR') => {
  const validate = zValidator('json', schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: {
            code: errorCode,
            message:
              result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ') ||
              result.error.message,
          },
        },
        400,
      );
    }
  });

  // Typed as the validator it wraps, so routes keep the inference that makes
  // `c.req.valid('json')` a known shape rather than `never`.
  const guarded: typeof validate = async (c, next) => {
    try {
      // Hono caches the parsed body, so the validator and the handler below
      // reuse this parse rather than reading the stream again.
      await c.req.json();
    } catch {
      return c.json(
        {
          success: false,
          error: { code: errorCode, message: 'Request body must be valid JSON' },
        },
        400,
      );
    }
    return validate(c, next);
  };

  return guarded;
};
