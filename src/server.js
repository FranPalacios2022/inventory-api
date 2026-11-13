const app = require('./app');
const config = require('./config');
const { sequelize } = require('./models');

(async () => {
  await sequelize.sync();
  app.listen(config.port, () => {
    console.log(`Inventory API listening on http://localhost:${config.port}/api`);
  });
})();
