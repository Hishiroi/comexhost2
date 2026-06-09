'use strict';

require('dotenv').config();

const path = require('path');

function int(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const v = String(value).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function csv(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';

const env = {
  nodeEnv,
  isProd,
  port: int(process.env.PORT, 3000),

  cors: {
    origins: csv(process.env.CORS_ORIGIN || 'http://localhost:4200'),
    credentials: bool(process.env.CORS_CREDENTIALS, false),
  },

  trustProxy: bool(process.env.TRUST_PROXY, false),

  db: {
    url: process.env.DATABASE_URL || '',
    host: process.env.DB_HOST || '127.0.0.1',
    port: int(process.env.DB_PORT, 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'postgres',
    connectionLimit: int(process.env.DB_CONNECTION_LIMIT, 10),
    ssl: bool(process.env.DB_SSL, true),
    sslRejectUnauthorized: bool(process.env.DB_SSL_REJECT_UNAUTHORIZED, false),
  },

  supabase: {
    url: process.env.SUPABASE_URL || '',
    key: process.env.SUPABASE_KEY || '',
    bucket: process.env.SUPABASE_BUCKET || 'comex-documents',
  },

  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    issuer: process.env.JWT_ISSUER || 'comex-approval-api',
    audience: process.env.JWT_AUDIENCE || 'comex-approval-app',
  },

  bcryptRounds: int(process.env.BCRYPT_SALT_ROUNDS, isProd ? 12 : 10),

  uploads: {
    dir: path.resolve(
      __dirname,
      '..',
      '..',
      process.env.UPLOAD_DIR || 'uploads'
    ),
    maxBytes: int(process.env.MAX_UPLOAD_MB, 20) * 1024 * 1024,
  },

  rateLimit: {
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: int(process.env.RATE_LIMIT_MAX, 300),
    loginWindowMs: int(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    loginMax: int(process.env.LOGIN_RATE_LIMIT_MAX, 10),
  },

  seedAdmin: {
    name: process.env.SEED_ADMIN_NAME || 'Principal Admin',
    email: process.env.SEED_ADMIN_EMAIL || 'admin@comex.local',
    password: process.env.SEED_ADMIN_PASSWORD || 'Admin@12345',
  },
};

/**
 * Boot-time validation. Refuses to start in production with weak/missing
 * secrets, wildcard CORS + credentials, etc. Throwing here is intentional:
 * a misconfigured server should fail fast and loud, not silently expose data.
 */
function validate() {
  const errors = [];

  if (!env.jwt.secret || env.jwt.secret.length < 32) {
    if (env.isProd) {
      errors.push('JWT_SECRET must be set and at least 32 characters in production');
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        '[env] WARNING: JWT_SECRET is missing or short. Generate one with:\n' +
          '       node -e "console.log(require(\\"crypto\\").randomBytes(48).toString(\\"hex\\"))"'
      );
      if (!env.jwt.secret) env.jwt.secret = 'dev-only-insecure-secret-change-me-please';
    }
  }

  if (env.cors.credentials && env.cors.origins.includes('*')) {
    errors.push('CORS_ORIGIN cannot be "*" when CORS_CREDENTIALS=true');
  }

  if (env.isProd && env.cors.origins.length === 0) {
    errors.push('CORS_ORIGIN must list at least one allowed origin in production');
  }

  if (env.bcryptRounds < 10) {
    errors.push('BCRYPT_SALT_ROUNDS must be >= 10');
  }

  if (errors.length) {
    throw new Error('Invalid configuration:\n  - ' + errors.join('\n  - '));
  }
}

module.exports = env;
module.exports.validate = validate;
