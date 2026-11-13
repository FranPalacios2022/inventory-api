const express = require('express');
const { z } = require('zod');
const validate = require('../middlewares/validate');
const { authorize } = require('../middlewares/auth');
const stockService = require('../services/stock.service');
const { MOVEMENT_TYPES } = require('../models');

const router = express.Router();

const movementSchema = z.strictObject({
  productId: z.number().int().positive(),
  type: z.enum(MOVEMENT_TYPES),
  quantity: z.number().int().positive().max(1_000_000),
  reason: z.string().trim().max(200).optional(),
});

router.post('/movements', authorize('admin', 'operator'), validate(movementSchema), async (req, res) => {
  const { product, movement } = await stockService.registerMovement(req.body, req.user.id);
  res.status(201).json({ product, movement });
});

router.post(
  '/import',
  authorize('admin'),
  express.text({ type: ['text/csv', 'text/plain'], limit: '1mb' }),
  async (req, res) => {
    res.json(await stockService.importCsv(typeof req.body === 'string' ? req.body : '', req.user.id));
  },
);

module.exports = router;
