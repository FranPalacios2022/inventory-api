const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const ROLES = ['admin', 'operator', 'viewer'];
const MOVEMENT_TYPES = ['in', 'out', 'adjustment'];

const User = sequelize.define('User', {
  name: { type: DataTypes.STRING(80), allowNull: false },
  email: { type: DataTypes.STRING(120), allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.ENUM(...ROLES), allowNull: false, defaultValue: 'viewer' },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
});

const Product = sequelize.define('Product', {
  sku: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(120), allowNull: false },
  price: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  stock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
  minStock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
});

const StockMovement = sequelize.define('StockMovement', {
  type: { type: DataTypes.ENUM(...MOVEMENT_TYPES), allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false },
  previousStock: { type: DataTypes.INTEGER, allowNull: false },
  newStock: { type: DataTypes.INTEGER, allowNull: false },
  reason: { type: DataTypes.STRING(200) },
});

Product.hasMany(StockMovement, { foreignKey: { name: 'productId', allowNull: false } });
StockMovement.belongsTo(Product, { foreignKey: 'productId' });
User.hasMany(StockMovement, { foreignKey: { name: 'userId', allowNull: false } });
StockMovement.belongsTo(User, { foreignKey: 'userId' });

module.exports = { sequelize, User, Product, StockMovement, ROLES, MOVEMENT_TYPES };
