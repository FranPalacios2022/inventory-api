const { HttpError } = require('../errors');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    const body = { message: err.message };
    if (err.details) body.details = err.details;
    return res.status(err.status).json(body);
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Malformed request body' });
  }
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ message: 'A record with that value already exists' });
  }
  console.error(err);
  // Never leak internals (stack traces, SQL) to the client.
  return res.status(500).json({ message: 'Internal server error' });
}

module.exports = errorHandler;
