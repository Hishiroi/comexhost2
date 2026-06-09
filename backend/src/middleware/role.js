'use strict';

const HttpError = require('../utils/httpError');
const { isValidRole } = require('../utils/roles');

/**
 * requireRole(...allowed) - returns a middleware that allows the request
 * only if req.user.role_level matches one of the provided role levels.
 *
 * Examples:
 *   requireRole(4)            -> Admin only
 *   requireRole(2, 3, 4)      -> Coordinator, Master or Admin
 *
 * RBAC is enforced server-side on EVERY request - the frontend cannot
 * bypass these checks by changing routes or local state. A user logged
 * in as a Teacher (level 1) is structurally unable to call any endpoint
 * gated to higher levels: this middleware returns 403 before the
 * controller ever runs.
 */
function requireRole(...allowed) {
  if (!allowed.length || allowed.some((r) => !isValidRole(r))) {
    throw new Error('requireRole: invalid role list ' + JSON.stringify(allowed));
  }
  const allowedSet = new Set(allowed.map(Number));

  return function roleGate(req, res, next) {
    if (!req.user) return next(new HttpError(401, 'Authentication required'));
    if (!allowedSet.has(Number(req.user.role_level))) {
      return next(new HttpError(403, 'Forbidden: insufficient role'));
    }
    next();
  };
}

module.exports = { requireRole };
