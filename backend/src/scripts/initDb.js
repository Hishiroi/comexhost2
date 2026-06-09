'use strict';

/**
 * Runs sql/schema.sql against the PostgreSQL database.
 *
 * Usage: npm run db:init
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const env = require('../config/env');

async function main() {
  const sqlPath = path.resolve(__dirname, '..', '..', 'sql', 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  let connectionString = env.db.url;
  if (!connectionString) {
    connectionString = `postgresql://${env.db.user}:${env.db.password}@${env.db.host}:${env.db.port}/${env.db.database}`;
  }

  const client = new Client({
    connectionString,
    ssl: env.db.ssl ? { rejectUnauthorized: env.db.sslRejectUnauthorized } : false,
  });

  try {
    await client.connect();
    
    // PostgreSQL allows executing multiple statements in one query string
    await client.query(sql);
    console.log('[db:init] schema applied successfully');
    
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[db:init] failed:', err.message);
  process.exit(1);
});
