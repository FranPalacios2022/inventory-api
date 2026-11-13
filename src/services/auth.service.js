const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { User } = require('../models');
const { unauthorized, conflict } = require('../errors');

const SALT_ROUNDS = 10;
// Used to keep login timing similar when the email does not exist (avoids user enumeration).
const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy-password', SALT_ROUNDS);

const toPublic = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role });

function signToken(user) {
  return jwt.sign({ role: user.role }, config.jwt.secret, {
    algorithm: 'HS256',
    subject: String(user.id),
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
    expiresIn: config.jwt.expiresIn,
  });
}

async function register({ name, email, password }) {
  const exists = await User.findOne({ where: { email } });
  if (exists) throw conflict('Email already registered');
  // Public sign-up always creates the lowest-privilege role; the client cannot choose it.
  const user = await User.create({
    name,
    email,
    passwordHash: await bcrypt.hash(password, SALT_ROUNDS),
    role: 'viewer',
  });
  return { token: signToken(user), user: toPublic(user) };
}

async function login({ email, password }) {
  const user = await User.findOne({ where: { email } });
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok || !user.active) throw unauthorized('Invalid credentials');
  return { token: signToken(user), user: toPublic(user) };
}

module.exports = { register, login, toPublic, SALT_ROUNDS };
