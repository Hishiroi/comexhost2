'use strict';

const crypto = require('crypto');

/**
 * Attach a stable request id to every request for log correlation.
 * Uses an incoming X-Request-Id if present (e.g. from an upstream proxy),
 * otherwise generates one.
 */
function requestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && /^[A-Za-z0-9_\-]{8,128}$/.test(incoming)
      ? incoming
      : crypto.randomBytes(12).toString('hex');
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}

module.exports = { requestId };
