'use strict';

const rateLimit = require('express-rate-limit');
const env = require('../config/env');

/**
 * Generic API limiter (per IP). Returns 429 with a JSON body so clients
 * can react gracefully instead of seeing an empty body.
 */
const apiLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' },
});

/**
 * Stricter limiter for /api/auth/login to slow down brute-force /
 * credential-stuffing attacks. Counts successful AND failed attempts.
 */
const loginLimiter = rateLimit({
  windowMs: env.rateLimit.loginWindowMs,
  max: env.rateLimit.loginMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' },
});

module.exports = { apiLimiter, loginLimiter };
