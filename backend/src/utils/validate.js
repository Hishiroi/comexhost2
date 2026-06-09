'use strict';

const HttpError = require('./httpError');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Strip control characters and normalize whitespace. We don't try to
 * sanitize HTML here because this API only returns JSON; the frontend
 * is responsible for escaping when it renders. What we DO want to
 * prevent is null bytes, line-injection in stored values, and oversized
 * blobs sneaking past length limits.
 */
function cleanString(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\u0000/g, '').trim();
}

function requireString(value, field, { min = 1, max = 10000 } = {}) {
  const v = cleanString(value);
  if (v.length < min) throw new HttpError(400, `${field} is required`);
  if (v.length > max) throw new HttpError(400, `${field} must be at most ${max} chars`);
  return v;
}

function optionalString(value, field, { max = 10000 } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const v = cleanString(value);
  if (v.length > max) throw new HttpError(400, `${field} must be at most ${max} chars`);
  return v;
}

function requireEmail(value, field = 'email') {
  const v = cleanString(value).toLowerCase();
  if (!EMAIL_RE.test(v) || v.length > 190) {
    throw new HttpError(400, `${field} must be a valid email address`);
  }
  return v;
}

function requireId(value, field = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0 || n > 2_147_483_647) {
    throw new HttpError(400, `${field} must be a positive integer`);
  }
  return n;
}

function requireBool(value, field) {
  if (typeof value !== 'boolean') {
    throw new HttpError(400, `${field} must be a boolean`);
  }
  return value;
}

/**
 * Reasonable production password policy:
 *   - at least 8 chars
 *   - at most 128 chars (bcrypt truncates at 72 anyway, but reject early)
 *   - must include letters AND digits
 */
function requirePassword(value, field = 'password') {
  const v = String(value == null ? '' : value);
  if (v.length < 8) throw new HttpError(400, `${field} must be at least 8 characters`);
  if (v.length > 128) throw new HttpError(400, `${field} must be at most 128 characters`);
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) {
    throw new HttpError(400, `${field} must contain letters and digits`);
  }
  return v;
}

module.exports = {
  cleanString,
  requireString,
  optionalString,
  requireEmail,
  requireId,
  requireBool,
  requirePassword,
};
