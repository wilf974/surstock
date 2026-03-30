const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DB_DIR || __dirname;
const DB_PATH = path.join(DATA_DIR, 'surstock.db');

let db = null;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  // Charger la base existante ou en créer une nouvelle
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Créer la table si elle n'existe pas
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      ean           TEXT NOT NULL,
      parkod        TEXT DEFAULT NULL,
      label         TEXT NOT NULL,
      qty_requested INTEGER NOT NULL DEFAULT 0,
      qty_sent      INTEGER DEFAULT NULL,
      scanned_at    TEXT DEFAULT NULL,
      created_at    TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // Migration : ajouter la colonne parkod si elle n'existe pas
  try {
    db.run('ALTER TABLE products ADD COLUMN parkod TEXT DEFAULT NULL');
  } catch (e) {
    // La colonne existe déjà, on ignore
  }

  db.run(`CREATE INDEX IF NOT EXISTS idx_products_ean ON products(ean)`);

  saveDb();
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Helper pour exécuter un SELECT et retourner un tableau d'objets
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Helper pour exécuter un SELECT et retourner un seul objet
function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

// Helper pour exécuter un INSERT/UPDATE/DELETE
function run(sql, params = []) {
  db.run(sql, params);
  const changes = db.getRowsModified();
  const result = db.exec("SELECT last_insert_rowid() as id");
  const lastInsertRowid = result.length > 0 ? result[0].values[0][0] : null;
  saveDb();
  return { lastInsertRowid, changes };
}

module.exports = { getDb, saveDb, queryAll, queryOne, run };
