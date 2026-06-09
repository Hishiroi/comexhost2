'use strict';

const cors = require('cors');
const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * Build a strict CORS middleware that:
 *   - reads the allowed origins from env (comma-separated list)
 *   - supports an explicit "*" wildcard for fully-public APIs
 *   - blocks every other origin (preventing CORS-based data leaks)
 *   - allows credentials only when configured (and never with "*")
 *   - exposes a stable, well-defined set of methods/headers so the
 *     browser can preflight a deployment behind any host without
 *     hitting "blocked by CORS policy" errors.
 *
 * Frontend and backend can therefore live on different domains
 * (e.g. https://comex.example.com  -> https://api.comex.example.com)
 * provided the frontend origin is listed in CORS_ORIGIN.
 */
function buildCors() {
  const allowed = new Set(env.cors.origins);
  const allowAll = allowed.has('*');

  const options = {
    origin(origin, cb) {
      // Same-origin requests, server-to-server, curl, mobile apps, etc.
      // do not send an Origin header. We allow them through and let
      // route-level auth do its job.
      if (!origin) return cb(null, true);

      if (allowAll) return cb(null, true);
      if (allowed.has(origin)) return cb(null, true);

      logger.warn('cors.blocked', { origin });
      return cb(new Error('Origin not allowed by CORS policy'));
    },
    credentials: env.cors.credentials,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'X-Request-Id',
    ],
    exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
    optionsSuccessStatus: 204,
    maxAge: 86400, // cache preflight for 24h
  };

  return cors(options);
}

module.exports = { buildCors };
