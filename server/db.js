// db.js
// Simple JSON file-based persistence layer for the MVP.
// This avoids requiring a full database setup on Hostinger for Phase 1.
// Can be swapped for MySQL/Postgres in later phases.

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.json');

function ensureDbFile() {
  if (!fs.existsSync(DB_PATH)) {
    const initialData = { scores: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
  }
}

function readDb() {
  ensureDbFile();
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function getTopScores(limit = 10) {
  const db = readDb();
  return db.scores
    .slice()
    .sort((a, b) => b.distance - a.distance)
    .slice(0, limit);
}

function addScore(entry) {
  const db = readDb();
  db.scores.push({
    wallet: entry.wallet,
    coin: entry.coin,
    distance: entry.distance,
    timestamp: Date.now()
  });
  writeDb(db);
  return entry;
}

module.exports = {
  getTopScores,
  addScore
};
