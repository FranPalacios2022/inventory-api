const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const config = require('../src/config');
const { sequelize, User, Product, StockMovement } = require('../src/models');

const PASSWORD = 'Secret123!';
let tokens = {};
let drill;

async function loginAs(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return res.body.token;
}

beforeEach(async () => {
  await sequelize.sync({ force: true });
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  await User.bulkCreate([
    { name: 'Admin', email: 'admin@test.local', passwordHash, role: 'admin' },
    { name: 'Operator', email: 'operator@test.local', passwordHash, role: 'operator' },
    { name: 'Viewer', email: 'viewer@test.local', passwordHash, role: 'viewer' },
    { name: 'Blocked', email: 'blocked@test.local', passwordHash, role: 'admin', active: false },
  ]);
  drill = await Product.create({ sku: 'DRL-18V', name: 'Cordless drill', price: 100, stock: 10, minStock: 5 });
  await Product.create({ sku: 'GRD-115', name: 'Angle grinder', price: 50, stock: 2, minStock: 4 });
  tokens = {
    admin: await loginAs('admin@test.local'),
    operator: await loginAs('operator@test.local'),
    viewer: await loginAs('viewer@test.local'),
  };
});

afterAll(() => sequelize.close());

const auth = (role) => ({ Authorization: `Bearer ${tokens[role]}` });

describe('auth', () => {
  test('register creates a viewer and never accepts a role from the client', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Eve', email: 'eve@test.local', password: 'longpassword', role: 'admin' });
    expect(res.status).toBe(400); // unknown field rejected by the strict schema

    const ok = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Eve', email: 'eve@test.local', password: 'longpassword' });
    expect(ok.status).toBe(201);
    expect(ok.body.user.role).toBe('viewer');
    expect(ok.body.user).not.toHaveProperty('passwordHash');
  });

  test('duplicate email returns 409', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Admin 2', email: 'ADMIN@test.local', password: 'longpassword' });
    expect(res.status).toBe(409);
  });

  test('wrong password and unknown email return the same 401', async () => {
    const a = await request(app).post('/api/auth/login').send({ email: 'admin@test.local', password: 'nope' });
    const b = await request(app).post('/api/auth/login').send({ email: 'ghost@test.local', password: 'nope' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });

  test('blocked users cannot log in', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'blocked@test.local', password: PASSWORD });
    expect(res.status).toBe(401);
  });

  test('protected routes require a valid token', async () => {
    expect((await request(app).get('/api/products')).status).toBe(401);
    const forged = jwt.sign({ role: 'admin' }, 'wrong-secret', { subject: '1' });
    const res = await request(app).get('/api/products').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  test('a token is rejected once the user is blocked', async () => {
    await User.update({ active: false }, { where: { email: 'viewer@test.local' } });
    expect((await request(app).get('/api/products').set(auth('viewer'))).status).toBe(401);
  });

  test('expired tokens are rejected', async () => {
    const expired = jwt.sign({ role: 'admin' }, config.jwt.secret, {
      subject: '1', issuer: config.jwt.issuer, audience: config.jwt.audience, expiresIn: -10,
    });
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`)).status).toBe(401);
  });
});

describe('products', () => {
  test('lists with search and pagination', async () => {
    const res = await request(app).get('/api/products?search=drill&page=1&limit=1').set(auth('viewer'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, page: 1, limit: 1, totalPages: 1 });
    expect(res.body.items[0].sku).toBe('DRL-18V');
  });

  test('low-stock returns products at or below their minimum', async () => {
    const res = await request(app).get('/api/products/low-stock').set(auth('viewer'));
    expect(res.body.items.map((p) => p.sku)).toEqual(['GRD-115']);
  });

  test('only admins can create products', async () => {
    const body = { sku: 'NEW-1', name: 'New product', price: 10 };
    expect((await request(app).post('/api/products').set(auth('operator')).send(body)).status).toBe(403);
    const res = await request(app).post('/api/products').set(auth('admin')).send(body);
    expect(res.status).toBe(201);
    expect(res.body.stock).toBe(0);
  });

  test('stock cannot be edited directly', async () => {
    const res = await request(app).patch(`/api/products/${drill.id}`).set(auth('admin')).send({ stock: 999 });
    expect(res.status).toBe(400);
  });

  test('invalid id returns 400 and missing product 404', async () => {
    expect((await request(app).get('/api/products/abc').set(auth('viewer'))).status).toBe(400);
    expect((await request(app).get('/api/products/9999').set(auth('viewer'))).status).toBe(404);
  });
});

describe('stock movements', () => {
  test('operator registers an outgoing movement and it is audited', async () => {
    const res = await request(app)
      .post('/api/stock/movements')
      .set(auth('operator'))
      .send({ productId: drill.id, type: 'out', quantity: 3, reason: 'Sale #1001' });
    expect(res.status).toBe(201);
    expect(res.body.product.stock).toBe(7);
    expect(res.body.movement).toMatchObject({ previousStock: 10, newStock: 7 });

    const history = await request(app).get(`/api/products/${drill.id}/movements`).set(auth('viewer'));
    expect(history.body.items).toHaveLength(1);
    expect(history.body.items[0].User.name).toBe('Operator');
  });

  test('stock can never go negative', async () => {
    const res = await request(app)
      .post('/api/stock/movements')
      .set(auth('operator'))
      .send({ productId: drill.id, type: 'out', quantity: 11 });
    expect(res.status).toBe(400);
    expect((await Product.findByPk(drill.id)).stock).toBe(10);
  });

  test('viewers cannot move stock', async () => {
    const res = await request(app)
      .post('/api/stock/movements')
      .set(auth('viewer'))
      .send({ productId: drill.id, type: 'in', quantity: 1 });
    expect(res.status).toBe(403);
  });
});

describe('CSV import', () => {
  const send = (role, csv) =>
    request(app).post('/api/stock/import').set(auth(role)).set('Content-Type', 'text/csv').send(csv);

  test('applies valid rows as audited adjustments', async () => {
    const res = await send('admin', 'sku,stock\nDRL-18V,25\nGRD-115,2\n');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ rows: 2, changed: 1, unchanged: 1 });
    expect((await Product.findByPk(drill.id)).stock).toBe(25);
    expect(await StockMovement.count()).toBe(1);
  });

  test('rejects the whole file if any row is invalid', async () => {
    const res = await send('admin', 'sku,stock\nDRL-18V,25\nUNKNOWN,3\nGRD-115,-1\n');
    expect(res.status).toBe(400);
    expect(res.body.details).toHaveLength(2);
    expect((await Product.findByPk(drill.id)).stock).toBe(10);
  });

  test('rejects files without the required columns', async () => {
    expect((await send('admin', 'code,qty\nDRL-18V,1\n')).status).toBe(400);
  });

  test('only admins can import', async () => {
    expect((await send('operator', 'sku,stock\nDRL-18V,1\n')).status).toBe(403);
  });
});
