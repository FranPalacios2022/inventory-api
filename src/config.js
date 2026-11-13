require('dotenv').config({ quiet: true });

const env = process.env.NODE_ENV || 'development';

if (!process.env.JWT_SECRET && env !== 'test') {
  throw new Error('JWT_SECRET is not set. Copy .env.example to .env and set a long random value.');
}

module.exports = {
  env,
  port: Number(process.env.PORT) || 3000,
  dbStorage: env === 'test' ? ':memory:' : process.env.DB_STORAGE || 'data/inventory.sqlite',
  jwt: {
    secret: process.env.JWT_SECRET || 'test-only-secret-not-for-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    issuer: 'inventory-api',
    audience: 'inventory-api-clients',
  },
};
