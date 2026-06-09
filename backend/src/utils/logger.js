'use strict';

const env = require('../config/env');

/**
 * Tiny structured logger. Logs JSON in production (easy to ingest in
 * platforms like Render / Railway / CloudWatch / Datadog) and a colored
 * text format in development.
 */
function ts() {
  return new Date().toISOString();
}

function emit(level, msg, meta) {
  const payload = { ts: ts(), level, msg, ...(meta || {}) };
  if (env.isProd) {
    process.stdout.write(JSON.stringify(payload) + '\n');
    return;
  }
  // Dev-friendly format
  const tail = meta && Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
  // eslint-disable-next-line no-console
  console.log(`[${payload.ts}] ${level.toUpperCase()} ${msg}${tail}`);
}

module.exports = {
  info: (msg, meta) => emit('info', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  error: (msg, meta) => emit('error', msg, meta),
  debug: (msg, meta) => env.isProd || emit('debug', msg, meta),
};
