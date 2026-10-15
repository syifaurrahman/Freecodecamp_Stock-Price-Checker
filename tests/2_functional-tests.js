const chaiHttp = require('chai-http');
const chai = require('chai');
const assert = chai.assert;
const server = require('../server');

chai.use(chaiHttp);

suite('Functional Tests', function() {
  this.timeout(10000);

  suite('GET /api/stock-prices', function() {

    // Test 1: Viewing one stock
    test('Viewing one stock: GET request to /api/stock-prices/', function(done) {
      chai.request(server)
        .get('/api/stock-prices')
        .query({ stock: 'GOOG' })
        .end(function(err, res) {
          assert.equal(res.status, 200);
          assert.property(res.body, 'stockData');
          assert.property(res.body.stockData, 'stock');
          assert.property(res.body.stockData, 'price');
          assert.property(res.body.stockData, 'likes');
          assert.equal(res.body.stockData.stock, 'GOOG');
          assert.isNumber(res.body.stockData.price);
          assert.isNumber(res.body.stockData.likes);
          done();
        });
    });

    // Test 2: Viewing one stock and liking it
    test('Viewing one stock and liking it: GET request to /api/stock-prices/', function(done) {
      chai.request(server)
        .get('/api/stock-prices')
        .query({ stock: 'GOOG', like: 'true' })
        .end(function(err, res) {
          assert.equal(res.status, 200);
          assert.property(res.body, 'stockData');
          assert.property(res.body.stockData, 'stock');
          assert.property(res.body.stockData, 'price');
          assert.property(res.body.stockData, 'likes');
          assert.equal(res.body.stockData.stock, 'GOOG');
          assert.isNumber(res.body.stockData.likes);
          assert.isAtLeast(res.body.stockData.likes, 1);
          done();
        });
    });

    // Test 3: Viewing the same stock and liking it again (should not increment)
    test('Viewing the same stock and liking it again: GET request to /api/stock-prices/', function(done) {
      // First like
      chai.request(server)
        .get('/api/stock-prices')
        .query({ stock: 'GOOG', like: 'true' })
        .end(function(err, res1) {
          const likesAfterFirst = res1.body.stockData.likes;
          // Second like from same IP
          chai.request(server)
            .get('/api/stock-prices')
            .query({ stock: 'GOOG', like: 'true' })
            .end(function(err, res2) {
              assert.equal(res2.status, 200);
              assert.property(res2.body, 'stockData');
              assert.equal(res2.body.stockData.likes, likesAfterFirst);
              done();
            });
        });
    });

    // Test 4: Viewing two stocks
    test('Viewing two stocks: GET request to /api/stock-prices/', function(done) {
      chai.request(server)
        .get('/api/stock-prices')
        .query({ stock: ['GOOG', 'MSFT'] })
        .end(function(err, res) {
          assert.equal(res.status, 200);
          assert.property(res.body, 'stockData');
          assert.isArray(res.body.stockData);
          assert.equal(res.body.stockData.length, 2);
          assert.property(res.body.stockData[0], 'stock');
          assert.property(res.body.stockData[0], 'price');
          assert.property(res.body.stockData[0], 'rel_likes');
          assert.property(res.body.stockData[1], 'stock');
          assert.property(res.body.stockData[1], 'price');
          assert.property(res.body.stockData[1], 'rel_likes');
          assert.isNumber(res.body.stockData[0].rel_likes);
          assert.isNumber(res.body.stockData[1].rel_likes);
          done();
        });
    });

    // Test 5: Viewing two stocks and liking them
    test('Viewing two stocks and liking them: GET request to /api/stock-prices/', function(done) {
      chai.request(server)
        .get('/api/stock-prices')
        .query({ stock: ['GOOG', 'MSFT'], like: 'true' })
        .end(function(err, res) {
          assert.equal(res.status, 200);
          assert.property(res.body, 'stockData');
          assert.isArray(res.body.stockData);
          assert.equal(res.body.stockData.length, 2);
          assert.property(res.body.stockData[0], 'rel_likes');
          assert.property(res.body.stockData[1], 'rel_likes');
          // rel_likes should be opposite of each other
          assert.equal(
            res.body.stockData[0].rel_likes,
            -res.body.stockData[1].rel_likes
          );
          done();
        });
    });

  });

});
