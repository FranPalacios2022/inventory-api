/* Creates demo users and products. Demo passwords are for local testing only. */
const bcrypt = require('bcryptjs');
const { sequelize, User, Product } = require('../src/models');
const { SALT_ROUNDS } = require('../src/services/auth.service');

const DEMO_PASSWORD = 'Demo2026!';

(async () => {
  await sequelize.sync({ force: true });
  const hash = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);
  await User.bulkCreate([
    { name: 'Admin Demo', email: 'admin@demo.local', passwordHash: hash, role: 'admin' },
    { name: 'Operator Demo', email: 'operator@demo.local', passwordHash: hash, role: 'operator' },
    { name: 'Viewer Demo', email: 'viewer@demo.local', passwordHash: hash, role: 'viewer' },
  ]);
  await Product.bulkCreate([
    { sku: 'DRL-18V', name: 'Cordless drill 18V', price: 89990, stock: 12, minStock: 5 },
    { sku: 'GRD-115', name: 'Angle grinder 115mm', price: 54990, stock: 3, minStock: 4 },
    { sku: 'PLR-08', name: 'Combination pliers 8"', price: 8990, stock: 40, minStock: 10 },
    { sku: 'LVL-LSR', name: 'Laser level', price: 129990, stock: 0, minStock: 2 },
  ]);
  console.log(`Seeded. Demo users: admin@ / operator@ / viewer@demo.local — password: ${DEMO_PASSWORD}`);
  await sequelize.close();
})();
