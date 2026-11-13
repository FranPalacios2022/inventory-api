const { Router } = require('express');
const { z } = require('zod');
const { Op } = require('sequelize');
const validate = require('../middlewares/validate');
const { authorize } = require('../middlewares/auth');
const { Product, StockMovement, User } = require('../models');
const { notFound } = require('../errors');

const router = Router();

const productSchema = z.strictObject({
  sku: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(120),
  price: z.number().nonnegative(),
  minStock: z.number().int().nonnegative().default(0),
});
// Stock is not editable here on purpose: it only changes through movements, so every change is audited.
const updateSchema = productSchema.partial();

const listSchema = z.object({
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const idParam = z.object({ id: z.coerce.number().int().positive() });

async function findOr404(id) {
  const product = await Product.findByPk(id);
  if (!product) throw notFound('Product not found');
  return product;
}

router.get('/', validate(listSchema, 'query'), async (req, res) => {
  const { search, page, limit } = req.validatedQuery;
  const where = search
    ? { [Op.or]: [{ name: { [Op.like]: `%${search}%` } }, { sku: { [Op.like]: `%${search}%` } }] }
    : {};
  const { rows, count } = await Product.findAndCountAll({
    where,
    order: [['name', 'ASC'], ['id', 'ASC']],
    limit,
    offset: (page - 1) * limit,
  });
  res.json({ items: rows, total: count, page, limit, totalPages: Math.ceil(count / limit) });
});

router.get('/low-stock', async (_req, res) => {
  const items = await Product.findAll({
    where: { stock: { [Op.lte]: Product.sequelize.col('minStock') } },
    order: [['stock', 'ASC']],
  });
  res.json({ items });
});

router.get('/:id', validate(idParam, 'params'), async (req, res) => {
  res.json(await findOr404(req.params.id));
});

router.get('/:id/movements', validate(idParam, 'params'), async (req, res) => {
  await findOr404(req.params.id);
  const items = await StockMovement.findAll({
    where: { productId: req.params.id },
    include: [{ model: User, attributes: ['id', 'name'] }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
  });
  res.json({ items });
});

router.post('/', authorize('admin'), validate(productSchema), async (req, res) => {
  res.status(201).json(await Product.create(req.body));
});

router.patch('/:id', authorize('admin'), validate(idParam, 'params'), validate(updateSchema), async (req, res) => {
  const product = await findOr404(req.params.id);
  await product.update(req.body);
  res.json(product);
});

router.delete('/:id', authorize('admin'), validate(idParam, 'params'), async (req, res) => {
  const product = await findOr404(req.params.id);
  await StockMovement.destroy({ where: { productId: product.id } });
  await product.destroy();
  res.status(204).end();
});

module.exports = router;
