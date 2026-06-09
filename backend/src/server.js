'use strict';

const env = require('./config/env');
const logger = require('./utils/logger');

async function main() {
  // Refuse to start with a misconfigured environment (weak secret,
  // wildcard CORS + credentials, missing origins in production, etc.).
  try {
    env.validate();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err.message);
    process.exit(1);
  }

  const createApp = require('./app');
  const { ping, pool } = require('./config/db');

  try {
    await ping();
    logger.info('db.connected', {
      host: env.db.host,
      port: env.db.port,
      database: env.db.database,
      ssl: env.db.ssl,
    });
  } catch (err) {
    logger.error('db.connect_failed', { msg: err.message });
    process.exit(1);
  }

  const app = createApp();

  const server = app.listen(env.port, () => {
    logger.info('http.listening', { port: env.port, env: env.nodeEnv });
  });

  // Graceful shutdown so in-flight requests complete and the DB pool is
  // closed cleanly. Important for zero-downtime deploys on most PaaS.
  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('process.shutdown', { signal });

    server.close(async () => {
      try { await pool.end(); } catch (_) { /* noop */ }
      process.exit(0);
    });

    // Hard exit if shutdown stalls.
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Last line of defense: log + keep running on a single rogue rejection,
  // exit on uncaught exceptions (state may be corrupted).
  process.on('unhandledRejection', (reason) => {
    logger.error('process.unhandledRejection', {
      msg: reason && reason.message ? reason.message : String(reason),
      stack: reason && reason.stack,
    });
  });
  process.on('uncaughtException', (err) => {
    logger.error('process.uncaughtException', { msg: err.message, stack: err.stack });
    shutdown('uncaughtException');
  });
}

main();
