'use strict';

const { verify } = require('../utils/jwt');
const HttpError = require('../utils/httpError');
const { pool } = require('../config/db');

/**
 * authenticate - verifies the bearer token, loads the user from DB,
 * and attaches a sanitized user object to req.user.
 *
 * We intentionally re-load the user on every request so that:
 *   - deactivated users cannot keep using a still-valid token
 *   - role changes take effect immediately
 *   - a stolen token tied to a deleted account is rejected
 *   - a token whose `tv` (token_version) no longer matches the stored
 *     value is rejected (server-side logout / forced revocation)
 *
 * No protected route is reachable without this middleware (verified by
 * the routers themselves; see routes/*.js). The 401 response body is
 * intentionally generic to avoid leaking which step failed.
 */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.toLowerCase().startsWith('bearer ')) {
      throw new HttpError(401, 'Authentication required');
    }
    const token = header.slice(7).trim();
    if (!token) throw new HttpError(401, 'Authentication required');

    let payload;
    try {
      payload = verify(token);
    } catch (_) {
      throw new HttpError(401, 'Authentication required');
    }

    if (!payload || !payload.sub) {
      throw new HttpError(401, 'Authentication required');
    }

    const [rows] = await pool.query(
      `SELECT id, name, email, role_level, teacher_rank, is_active, token_version
         FROM users WHERE id = $1`,
      [payload.sub]
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      throw new HttpError(401, 'Authentication required');
    }
    if (Number(user.token_version) !== Number(payload.tv ?? 0)) {
      // Token was issued before the user logged out / had their session
      // revoked. Reject it even though the JWT signature is still valid.
      throw new HttpError(401, 'Authentication required');
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role_level: Number(user.role_level),
      teacher_rank: user.teacher_rank == null ? null : Number(user.teacher_rank),
      token_version: Number(user.token_version),
    };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticate };
