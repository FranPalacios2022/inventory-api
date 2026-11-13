# Inventory API

Secure REST API for inventory management, built with **Node.js, Express 5, Sequelize and SQLite**.

It models a problem I've solved in production for e-commerce clients: keeping stock correct and traceable when it changes from many places (sales, manual corrections, bulk imports from an ERP or a spreadsheet).

![CI](https://github.com/FranPalacios2022/inventory-api/actions/workflows/ci.yml/badge.svg)

## Highlights

- **Authentication with JWT** (HS256), verifying signature, issuer, audience and expiry. The user is reloaded on every request, so blocking a user or changing their role takes effect immediately.
- **Role-based access control**: `admin`, `operator`, `viewer`. Public sign-up always creates a `viewer`; the client can never choose its role.
- **Passwords hashed with bcrypt**, same response for unknown email and wrong password (no user enumeration), **rate limiting** on auth endpoints.
- **Audited stock**: stock can't be edited directly. Every change is a movement (`in`, `out`, `adjustment`) that stores who, when, previous and new value, written in a **database transaction** together with the product update. Stock can never go negative.
- **CSV stock import** (`sku,stock`): validated row by row and applied **all or nothing**; if any row is wrong, nothing changes and every error is reported with its line number.
- **Input validation with zod** (strict schemas reject unknown fields), consistent JSON errors, no internal details leaked on 500s, security headers with helmet.
- **19 integration tests** with Jest + Supertest on an in-memory database, run on every push with GitHub Actions.

## Getting started

Requirements: Node.js 20+.

```bash
npm install
cp .env.example .env      # then set JWT_SECRET to a long random value
npm run seed              # demo users and products
npm run dev               # http://localhost:3000/api
npm test
```

Demo users (local only): `admin@demo.local`, `operator@demo.local`, `viewer@demo.local` — password `Demo2026!`.

## API

All routes except `/health`, `/auth/register` and `/auth/login` require `Authorization: Bearer <token>`.

| Method | Route | Role | Description |
| --- | --- | --- | --- |
| GET | `/api/health` | — | Health check |
| POST | `/api/auth/register` | — | Sign up (always `viewer`) |
| POST | `/api/auth/login` | — | Returns a JWT and the public profile |
| GET | `/api/auth/me` | any | Current user |
| GET | `/api/products?search=&page=&limit=` | any | Search and paginate products |
| GET | `/api/products/low-stock` | any | Products at or below their minimum stock |
| GET | `/api/products/:id` | any | Product detail |
| GET | `/api/products/:id/movements` | any | Stock history (who, when, before/after) |
| POST | `/api/products` | admin | Create product |
| PATCH | `/api/products/:id` | admin | Update name, SKU, price or minimum stock |
| DELETE | `/api/products/:id` | admin | Delete product |
| POST | `/api/stock/movements` | admin, operator | Register a movement |
| POST | `/api/stock/import` | admin | Import stock from CSV (`Content-Type: text/csv`) |

### Examples

```bash
# Log in
curl -s -X POST localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"operator@demo.local","password":"Demo2026!"}'

# Register a sale
curl -s -X POST localhost:3000/api/stock/movements \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"productId":1,"type":"out","quantity":2,"reason":"Order #1001"}'

# Bulk update from a CSV export
curl -s -X POST localhost:3000/api/stock/import \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: text/csv' \
  --data-binary @stock.csv
```

Errors always look like `{ "message": "...", "details": [...] }` with `400` (invalid input), `401` (no/invalid token), `403` (role not allowed), `404`, `409` (duplicate) or `429` (rate limit).

## Project structure

```
src/
  app.js                 Express app: middleware and routes
  server.js              Starts the server
  config.js              Environment configuration
  models/                User, Product, StockMovement (Sequelize)
  middlewares/           JWT auth + roles, zod validation, error handler
  services/              Business rules: auth, stock movements, CSV import
  routes/                HTTP layer
scripts/seed.js          Demo data
tests/api.test.js        Integration tests
```

## Design notes and limits

- SQLite keeps the project easy to run; Sequelize makes moving to PostgreSQL or MySQL a config change.
- No refresh tokens or token revocation list; blocking a user is effective immediately because the user is reloaded per request.
- Built as a portfolio project; for production you'd add HTTPS termination, structured logging and a migration tool.

## License

MIT
