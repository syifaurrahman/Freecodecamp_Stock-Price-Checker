'use strict';

const fetch = require('node-fetch');
const crypto = require('crypto');

// ─── In-memory store (always available as reliable source) ───────────────────
// { 'GOOG': Set<string>, 'MSFT': Set<string>, ... }
const memStore = {};

// ─── MongoDB setup (optional, only when DB env is set) ───────────────────────
let Stock = null; // null means DB not ready
let dbReady = false;

if (process.env.DB) {
  const mongoose = require('mongoose');

  const stockSchema = new mongoose.Schema({
    symbol: { type: String, required: true, uppercase: true, unique: true },
    likes:  { type: [String], default: [] },
  });

  // bufferCommands: false → fail immediately if not connected (no hanging!)
  mongoose.set('bufferCommands', false);

  mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 5000, // timeout fast, don't hang tests
    connectTimeoutMS:         5000,
  }).then(() => {
    console.log('MongoDB connected — using DB store');
    Stock   = mongoose.model('Stock', stockSchema);
    dbReady = true;
  }).catch((err) => {
    console.error('MongoDB connection failed, using in-memory store:', err.message);
    dbReady = false;
  });
}

// ─── IP Anonymization (GDPR / Privacy) ───────────────────────────────────────
function anonymizeIp(ip) {
  if (!ip) return 'unknown';
  // Remove IPv6-mapped IPv4 prefix  e.g. "::ffff:127.0.0.1" → "127.0.0.1"
  const clean = ip.replace(/^::ffff:/, '');
  return crypto.createHash('sha256').update(clean).digest('hex').substring(0, 16);
}

// ─── External stock price fetcher ────────────────────────────────────────────
async function fetchStockPrice(symbol) {
  const url = `https://stock-price-checker-proxy.freecodecamp.rocks/v1/stock/${symbol}/quote`;
  try {
    const res  = await fetch(url, { timeout: 8000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      stock: (data.symbol || symbol).toUpperCase(),
      price: parseFloat(data.latestPrice) || 0,
    };
  } catch (err) {
    console.error(`fetchStockPrice(${symbol}) error:`, err.message);
    return { stock: symbol.toUpperCase(), price: 0 };
  }
}

// ─── DB helpers ──────────────────────────────────────────────────────────────
async function getLikeCountDB(sym) {
  let doc = await Stock.findOne({ symbol: sym });
  if (!doc) doc = await Stock.create({ symbol: sym, likes: [] });
  return doc.likes.length;
}

async function addLikeDB(sym, anonIp) {
  let doc = await Stock.findOne({ symbol: sym });
  if (!doc) doc = await Stock.create({ symbol: sym, likes: [] });
  if (!doc.likes.includes(anonIp)) {
    doc.likes.push(anonIp);
    await doc.save();
  }
  return doc.likes.length;
}

// ─── In-memory helpers ───────────────────────────────────────────────────────
function getLikeCountMem(sym) {
  if (!memStore[sym]) memStore[sym] = new Set();
  return memStore[sym].size;
}

function addLikeMem(sym, anonIp) {
  if (!memStore[sym]) memStore[sym] = new Set();
  memStore[sym].add(anonIp);
  return memStore[sym].size;
}

// ─── Unified wrappers (DB with in-memory fallback) ───────────────────────────
async function getLikes(symbol) {
  const sym = symbol.toUpperCase();
  if (dbReady && Stock) {
    try { return await getLikeCountDB(sym); } catch (e) { /* fallthrough */ }
  }
  return getLikeCountMem(sym);
}

async function addLike(symbol, anonIp) {
  const sym = symbol.toUpperCase();
  if (dbReady && Stock) {
    try { return await addLikeDB(sym, anonIp); } catch (e) { /* fallthrough */ }
  }
  return addLikeMem(sym, anonIp);
}

// ─── Main route handler ───────────────────────────────────────────────────────
async function getStockData(req, res) {
  try {
    const { stock, like } = req.query;
    const ip       = req.ip || (req.connection && req.connection.remoteAddress) || '127.0.0.1';
    const anonIp   = anonymizeIp(ip);
    const shouldLike = like === 'true' || like === true;

    if (!stock) {
      return res.status(400).json({ error: 'no stock provided' });
    }

    // ── Single stock ──────────────────────────────────────────────────────────
    if (!Array.isArray(stock)) {
      const [stockData, likes] = await Promise.all([
        fetchStockPrice(stock),
        shouldLike ? addLike(stock, anonIp) : getLikes(stock),
      ]);

      return res.json({
        stockData: {
          stock:  stockData.stock,
          price:  stockData.price,
          likes,
        },
      });
    }

    // ── Two stocks ────────────────────────────────────────────────────────────
    if (Array.isArray(stock) && stock.length === 2) {
      const [[stock1Data, stock2Data], [likes1, likes2]] = await Promise.all([
        Promise.all([fetchStockPrice(stock[0]), fetchStockPrice(stock[1])]),
        shouldLike
          ? Promise.all([addLike(stock[0], anonIp), addLike(stock[1], anonIp)])
          : Promise.all([getLikes(stock[0]),         getLikes(stock[1])]),
      ]);

      return res.json({
        stockData: [
          { stock: stock1Data.stock, price: stock1Data.price, rel_likes: likes1 - likes2 },
          { stock: stock2Data.stock, price: stock2Data.price, rel_likes: likes2 - likes1 },
        ],
      });
    }

    return res.status(400).json({ error: 'invalid stock query' });

  } catch (err) {
    console.error('getStockData error:', err);
    return res.status(500).json({ error: 'server error' });
  }
}

module.exports = { getStockData };
