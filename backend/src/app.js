'use strict';

const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const multer = require('multer');

const env = require('./config/env');
const HttpError = require('./utils/httpError');
const logger = require('./utils/logger');

const { buildCors } = require('./middleware/corsMiddleware');
const { requestId } = require('./middleware/requestId');
const { apiLimiter, loginLimiter } = require('./middleware/rateLimit');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const fileRoutes = require('./routes/fileRoutes');

function createApp() {
  const app = express();

  // Don't advertise the framework.
  app.disable('x-powered-by');

  // Required for accurate req.ip / rate-limit / secure cookies behind a
  // reverse proxy (Render, Railway, Heroku, Nginx, Cloudflare, etc.).
  if (env.trustProxy) app.set('trust proxy', 1);

  // ---- Foundational middleware (order matters) ----

  // Security headers (HSTS, X-Frame-Options DENY, X-Content-Type-Options
  // nosniff, Referrer-Policy, etc.). CSP is off by default because this
  // service only returns JSON; if you decide to also serve HTML, enable it.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // gzip / deflate for JSON responses.
  app.use(compression());

  // Per-request id for correlation across logs.
  app.use(requestId);

  // CORS (strict, configurable allowlist). Preflights handled automatically.
  const corsMw = buildCors();
  app.use(corsMw);
  app.options('*', corsMw);

  // Access log. JSON in prod (one-line), dev-friendly in development.
  app.use(
    morgan(env.isProd ? 'combined' : 'dev', {
      skip: (req) => req.path === '/api/health',
    })
  );

  // JSON body parser with a small hard limit. Tight limit blunts JSON-bomb
  // / DoS attempts; multipart uploads have their own limit (see upload.js).
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));

  // Global rate limit for the API surface.
  app.use('/api', apiLimiter);

  // ---- Routes ----

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, name: 'comex-approval-backend', env: env.nodeEnv });
  });

  // Stricter limiter on login to slow brute-force attempts.
  app.use('/api/auth/login', loginLimiter);

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/files', fileRoutes);

  // ---- Catch-all 404 ----
  app.use((req, res, next) => next(new HttpError(404, 'Route not found')));

  // ---- Centralized error handler ----
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    // Multer / upload errors -> 400/413.
    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({
        error: err.message || 'Upload error',
        code: err.code,
        request_id: req.id,
      });
    }

    // Anything thrown by the strict CORS allowlist.
    if (err && /CORS/i.test(err.message || '')) {
      return res.status(403).json({
        error: 'Origin not allowed by CORS policy',
        request_id: req.id,
      });
    }

    const status = Number.isInteger(err.status) ? err.status : 500;

    // Log server errors with full stack; client errors get a single line.
    if (status >= 500) {
      logger.error('http.error', {
        reqId: req.id,
        method: req.method,
        path: req.originalUrl,
        status,
        msg: err.message,
        stack: err.stack,
      });
    } else {
      logger.warn('http.client_error', {
        reqId: req.id,
        method: req.method,
        path: req.originalUrl,
        status,
        msg: err.message,
      });
    }

    // NEVER leak stack traces, error names, or internal details to the
    // client. Only the curated message + request id.
    const message =
      status >= 500
        ? 'Internal server error'
        : err.message || 'Request failed';

    res.status(status).json({
      error: message,
      request_id: req.id,
      ...(err.details ? { details: err.details } : {}),
    });
  });

  return app;
}

module.exports = createApp;
