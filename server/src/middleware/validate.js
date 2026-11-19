import { ApiError } from '../utils/ApiError.js';

/**
 * Validates request parts with Zod before the controller runs.
 *
 *   router.post('/login', validate({ body: loginSchema }), login)
 *
 * On failure the client receives 400 with a per-field list, which the React
 * forms turn into inline messages. On success the *parsed* value replaces
 * req.body, so unknown keys are stripped and types are already correct.
 */
export const validate = (schemas) => (req, _res, next) => {
  const issues = [];

  for (const location of ['body', 'params', 'query']) {
    const schema = schemas[location];
    if (!schema) continue;

    const result = schema.safeParse(req[location]);
    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push({
          field: issue.path.join('.') || location,
          message: issue.message,
          location,
        });
      }
      continue;
    }

    if (location === 'body') req.body = result.data;
    else if (location === 'params') req.params = result.data;
    else req.validatedQuery = result.data;
  }

  if (issues.length > 0) {
    return next(ApiError.badRequest('Please check the highlighted fields', issues));
  }
  return next();
};
