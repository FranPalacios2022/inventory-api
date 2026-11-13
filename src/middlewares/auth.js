const jwt = require('jsonwebtoken');
const config = require('../config');
const { User } = require('../models');
const { unauthorized, forbidden } = require('../errors');

/**
 * Verifies the Bearer token (signature, algorithm, issuer, audience, expiry)
 * and then reloads the user from the database, so a blocked user or a role
 * change takes effect immediately instead of trusting stale token claims.
 */
async function authenticate(req, _res, next) {
  const header = req.get('Authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(unauthorized());

  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret, {
      algorithms: ['HS256'],
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    });
  } catch {
    return next(unauthorized('Invalid or expired token'));
  }

  const user = await User.findByPk(payload.sub);
  if (!user || !user.active) return next(unauthorized('User not found or blocked'));

  req.user = { id: user.id, role: user.role, name: user.name };
  return next();
}

const authorize = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(forbidden());

module.exports = { authenticate, authorize };
