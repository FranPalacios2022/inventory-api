const { parse } = require('csv-parse/sync');
const { sequelize, Product, StockMovement } = require('../models');
const { badRequest, notFound } = require('../errors');

/**
 * Applies a stock movement inside a transaction: the product row, the new stock
 * value and the audit record are written together or not at all.
 */
async function registerMovement({ productId, type, quantity, reason }, userId, transaction) {
  const run = async (t) => {
    const product = await Product.findByPk(productId, { transaction: t });
    if (!product) throw notFound('Product not found');

    const previousStock = product.stock;
    let newStock;
    if (type === 'in') newStock = previousStock + quantity;
    else if (type === 'out') newStock = previousStock - quantity;
    else newStock = quantity; // adjustment sets the absolute value (e.g. after a physical count)

    if (newStock < 0) {
      throw badRequest(`Insufficient stock for ${product.sku}: available ${previousStock}, requested ${quantity}`);
    }

    product.stock = newStock;
    await product.save({ transaction: t });
    const movement = await StockMovement.create(
      { productId, userId, type, quantity, previousStock, newStock, reason },
      { transaction: t },
    );
    return { product, movement };
  };

  return transaction ? run(transaction) : sequelize.transaction(run);
}

/**
 * Imports a CSV with columns `sku,stock` and sets each product's stock.
 * The whole file is applied in one transaction: if any row is invalid,
 * nothing changes and every problem is reported back.
 */
async function importCsv(csvText, userId) {
  let rows;
  try {
    rows = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    throw badRequest(`Malformed CSV: ${e.message}`);
  }
  if (rows.length === 0) throw badRequest('CSV has no rows');
  if (!('sku' in rows[0]) || !('stock' in rows[0])) throw badRequest('CSV must have the columns: sku,stock');

  const errors = [];
  const updates = [];
  const skus = rows.map((r) => r.sku);
  const products = await Product.findAll({ where: { sku: skus } });
  const bySku = new Map(products.map((p) => [p.sku, p]));

  rows.forEach((row, i) => {
    const line = i + 2; // +1 for the header, +1 for 1-based lines
    const stock = Number(row.stock);
    if (!bySku.has(row.sku)) errors.push({ line, sku: row.sku, message: 'Unknown SKU' });
    else if (!Number.isInteger(stock) || stock < 0) errors.push({ line, sku: row.sku, message: 'Stock must be a non-negative integer' });
    else updates.push({ product: bySku.get(row.sku), stock });
  });

  if (errors.length) throw badRequest('CSV import rejected; no changes were applied', errors);

  return sequelize.transaction(async (t) => {
    let changed = 0;
    for (const { product, stock } of updates) {
      if (product.stock === stock) continue;
      await registerMovement(
        { productId: product.id, type: 'adjustment', quantity: stock, reason: 'CSV import' },
        userId,
        t,
      );
      changed += 1;
    }
    return { rows: rows.length, changed, unchanged: rows.length - changed };
  });
}

module.exports = { registerMovement, importCsv };
