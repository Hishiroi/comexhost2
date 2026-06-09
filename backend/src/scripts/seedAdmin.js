'use strict';

/**
 * Inserts (or updates) the bootstrap Principal/Admin user.
 * Usage: npm run db:seed
 */
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { pool } = require('../config/db');
const { ROLES } = require('../utils/roles');

async function main() {
  const { name, email, password } = env.seedAdmin;
  const normEmail = email.trim().toLowerCase();

  const [existing] = await pool.query(
    'SELECT id FROM users WHERE email = $1 LIMIT 1',
    [normEmail]
  );

  const hash = await bcrypt.hash(password, env.bcryptRounds);

  if (existing.length) {
    await pool.query(
      `UPDATE users
          SET name = $1, password_hash = $2, role_level = $3, is_active = true
        WHERE id = $4`,
      [name, hash, ROLES.ADMIN, existing[0].id]
    );
    console.log(`[db:seed] updated existing admin (${normEmail})`);
  } else {
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role_level)
       VALUES ($1, $2, $3, $4)`,
      [name, normEmail, hash, ROLES.ADMIN]
    );
    console.log(`[db:seed] created admin (${normEmail})`);
  }

  console.log(`[db:seed] login with: ${normEmail} / ${password}`);
}

main()
  .catch((err) => {
    console.error('[db:seed] failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
