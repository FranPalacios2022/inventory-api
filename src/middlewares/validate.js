const { badRequest } = require('../errors');

/** Validates req[source] against a zod schema and replaces it with the parsed value. */
const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return next(badRequest('Invalid input', details));
  }
  if (source === 'query') {
    req.validatedQuery = result.data; // req.query is read-only in Express 5
  } else {
    req[source] = result.data;
  }
  return next();
};

module.exports = validate;
