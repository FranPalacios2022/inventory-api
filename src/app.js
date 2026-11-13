const express = require('express');
const helmet = require('helmet');
const { authenticate } = require('./middlewares/auth');
const errorHandler = require('./middlewares/errorHandler');
const { notFound } = require('./errors');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/products', authenticate, require('./routes/product.routes'));
app.use('/api/stock', authenticate, require('./routes/stock.routes'));

app.use((_req, _res, next) => next(notFound('Route not found')));
app.use(errorHandler);

module.exports = app;
