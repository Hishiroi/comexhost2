'use strict';

const { Pool } = require('pg');
const env = require('./env');

/**
 * Build the PostgreSQL pool config. If DATABASE_URL is provided (e.g. from Supabase),
 * it will be used. Otherwise, it falls back to individual components.
 */
function buildPoolConfig() {
  const cfg = {};

  if (env.db.url) {
    cfg.connectionString = env.db.url;
  } else {
    cfg.host = env.db.host;
    cfg.port = env.db.port;
    cfg.user = env.db.user;
    cfg.password = env.db.password;
    cfg.database = env.db.database;
  }

  cfg.max = env.db.connectionLimit;
  cfg.idleTimeoutMillis = 30000;
  cfg.connectionTimeoutMillis = 10000;

  if (env.db.ssl) {
    cfg.ssl = { rejectUnauthorized: env.db.sslRejectUnauthorized };
  }

  return cfg;
}

const pool = new Pool(buildPoolConfig());

// Wrap the pg pool to mimic mysql2/promise `query` method signature
// mysql2 returns [rows, fields], whereas pg returns { rows, fields }
// This helps minimize the changes needed in other files
const db = {
  pool: {
    query: async (text, params) => {
      const res = await pool.query(text, params);
      return [res.rows, res.fields, res];
    },
    getConnection: async () => {
      const client = await pool.connect();
      // Mock the mysql2 transaction methods
      const wrappedClient = {
        query: async (text, params) => {
          const res = await client.query(text, params);
          return [res.rows, res.fields, res];
        },
        beginTransaction: () => client.query('BEGIN'),
        commit: () => client.query('COMMIT'),
        rollback: () => client.query('ROLLBACK'),
        release: () => client.release(),
      };
      return wrappedClient;
    },
    end: () => pool.end()
  },
};

async function ping() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}

module.exports = { pool: db.pool, ping };
