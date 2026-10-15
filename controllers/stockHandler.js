'use strict';

const fetch = require('node-fetch');
const crypto = require('crypto');

let mongoose;
let Stock;
let useDB = false;

// In-memory fallback store: { symbol: { likes: Set<string> } }
const memStore = {};

// Try to use MongoDB if DB env var is set
if (process.env.DB) {
  try {
    mongoose = require('mongoose');
    mongoose.connect(process.env.DB, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }).then(() => {
      console.log('Connected to MongoDB');
      useDB = true;
    }).catch((err) => {
      console.error('MongoDB connection error, using in-memory store:', err.message);
    });

    const stockSchema = new mongoose.Schema({
      symbol: { type: String, required: true, uppercase: true, unique: true },
      likes: { type: [String], default: [] },
    });

    Stock = mongoose.model('Stock', stockSchema);
    useDB = true;
  } catch (err) {
    console.error('Mongoose not available, using in-memory store');
  }
}

// Anonymize IP using SHA-256 hash (first 16 chars) — GDPR/Privacy compliance
function anonymizeIp(ip) {
  if (!ip) return 'unknown';
  // Strip IPv6 prefix
  const cleanIp = ip.replace(/^::ffff:/, '');
  return crypto.createHash('sha256').update(cleanIp).digest('hex').substring(0, 16);
}

// Fetch stock price from FreeCodeCamp proxy
async function fetchStockPrice(symbol) {
  const url = `https://stock-price-checker-proxy.freecodecamp.rocks/v1/stock/${symbol}/quote`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    const data = await response.json();
    return {
      stock: data.symbol || symbol.toUpperCase(),
      price: parseFloat(data.latestPrice) || 0,
    };
  } catch (err) {
    console.error(`Error fetching stock ${symbol}:`, err.message);
    return { stock: symbol.toUpperCase(), price: 0 };
  }
}

// --- DB helpers ---

async function getLikeCountDB(symbol) {
  const sym = symbol.toUpperCase();
  let doc = await Stock.findOne({ symbol: sym });
  if (!doc) {
    doc = await Stock.create({ symbol: sym, likes: [] });
  }
  return doc.likes.length;
}

async function addLikeDB(symbol, anonIp) {
  const sym = symbol.toUpperCase();
  let doc = await Stock.findOne({ symbol: sym });
  if (!doc) {
    doc = await Stock.create({ symbol: sym, likes: [] });
  }
  if (!doc.likes.includes(anonIp)) {
    doc.likes.push(anonIp);
    await doc.save();
  }
  return doc.likes.length;
}

// --- In-memory helpers ---

function getLikeCountMem(symbol) {
  const sym = symbol.toUpperCase();
  if (!memStore[sym]) memStore[sym] = { likes: new Set() };
  return memStore[sym].likes.size;
}

function addLikeMem(symbol, anonIp) {
  const sym = symbol.toUpperCase();
  if (!memStore[sym]) memStore[sym] = { likes: new Set() };
  memStore[sym].likes.add(anonIp);
  return memStore[sym].likes.size;
}

// --- Unified helpers ---

async function getLikes(symbol) {
  if (useDB && Stock) {
    try { return await getLikeCountDB(symbol); } catch (e) { /* fall through */ }
  }
  return getLikeCountMem(symbol);
}

async function addLike(symbol, anonIp) {
  if (useDB && Stock) {
    try { return await addLikeDB(symbol, anonIp); } catch (e) { /* fall through */ }
  }
  return addLikeMem(symbol, anonIp);
}

// Main handler
async function getStockData(req, res) {
  try {
    const { stock, like } = req.query;
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const anonIp = anonymizeIp(ip);
    const shouldLike = like === 'true' || like === true;

    if (!stock) {
      return res.json({ error: 'no stock provided' });
    }

    // Single stock
    if (!Array.isArray(stock)) {
      const stockData = await fetchStockPrice(stock);
      const likes = shouldLike
        ? await addLike(stock, anonIp)
        : await getLikes(stock);

      return res.json({
        stockData: {
          stock: stockData.stock,
          price: stockData.price,
          likes,
        },
      });
    }

    // Two stocks
    if (stock.length === 2) {
      const [stock1Data, stock2Data] = await Promise.all([
        fetchStockPrice(stock[0]),
        fetchStockPrice(stock[1]),
      ]);

      let likes1, likes2;
      if (shouldLike) {
        [likes1, likes2] = await Promise.all([
          addLike(stock[0], anonIp),
          addLike(stock[1], anonIp),
        ]);
      } else {
        [likes1, likes2] = await Promise.all([
          getLikes(stock[0]),
          getLikes(stock[1]),
        ]);
      }

      return res.json({
        stockData: [
          {
            stock: stock1Data.stock,
            price: stock1Data.price,
            rel_likes: likes1 - likes2,
          },
          {
            stock: stock2Data.stock,
            price: stock2Data.price,
            rel_likes: likes2 - likes1,
          },
        ],
      });
    }

    return res.json({ error: 'invalid stock query' });
  } catch (err) {
    console.error('Error in getStockData:', err);
    return res.status(500).json({ error: 'server error' });
  }
}

module.exports = { getStockData };
