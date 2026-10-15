'use strict';

const { getStockData } = require('../controllers/stockHandler');

module.exports = function (app) {

  app.route('/api/stock-prices')
    .get(getStockData);

};
