const chaiHttp = require('chai-http');
const chai = require('chai');
const assert = chai.assert;
const server = require('../server');

chai.use(chaiHttp);

suite('Functional Tests', function() {
  this.timeout(15000); // 15s timeout for external API calls

  // Test 1: Viewing one stock
  test('Viewing one stock: GET request to /api/stock-prices/', function(done) {
    chai.request(server)
      .get('/api/stock-prices')
      .query({ stock: 'GOOG' })
      .end(function(err, res) {
        assert.equal(res.status, 200);
        assert.property(res.body, 'stockData');
        assert.isNotArray(res.body.stockData);
        assert.property(res.body.stockData, 'stock');
        assert.property(res.body.stockData, 'price');
        assert.property(res.body.stockData, 'likes');
        assert.isString(res.body.stockData.stock);
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
        assert.isString(res.body.stockData.stock);
        assert.isNumber(res.body.stockData.price);
        assert.isNumber(res.body.stockData.likes);
        assert.isAtLeast(res.body.stockData.likes, 1);
        done();
      });
  });

  // Test 3: Viewing the same stock and liking it again (no duplicate)
  test('Viewing the same stock and liking it again: GET request to /api/stock-prices/', function(done) {
    // First request
    chai.request(server)
      .get('/api/stock-prices')
      .query({ stock: 'GOOG', like: 'true' })
      .end(function(err, res1) {
        assert.equal(res1.status, 200);
        const likesAfterFirst = res1.body.stockData.likes;

        // Second request from same IP — likes should NOT increase
        chai.request(server)
          .get('/api/stock-prices')
          .query({ stock: 'GOOG', like: 'true' })
          .end(function(err, res2) {
            assert.equal(res2.status, 200);
            assert.property(res2.body, 'stockData');
            assert.property(res2.body.stockData, 'likes');
            assert.isNumber(res2.body.stockData.likes);
            // Should be equal — same IP cannot like twice
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

        const [s1, s2] = res.body.stockData;
        assert.property(s1, 'stock');
        assert.property(s1, 'price');
        assert.property(s1, 'rel_likes');
        assert.property(s2, 'stock');
        assert.property(s2, 'price');
        assert.property(s2, 'rel_likes');
        assert.isString(s1.stock);
        assert.isNumber(s1.price);
        assert.isNumber(s1.rel_likes);
        assert.isString(s2.stock);
        assert.isNumber(s2.price);
        assert.isNumber(s2.rel_likes);
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

        const [s1, s2] = res.body.stockData;
        assert.property(s1, 'rel_likes');
        assert.property(s2, 'rel_likes');
        assert.isNumber(s1.rel_likes);
        assert.isNumber(s2.rel_likes);
        // rel_likes of both stocks must be exact opposites
        assert.equal(s1.rel_likes, -s2.rel_likes);
        done();
      });
  });

});
