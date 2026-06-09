'use strict';

const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { sign } = require('../utils/jwt');
const { roleName } = require('../utils/roles');
const { requireEmail } = require('../utils/validate');
const HttpError = require('../utils/httpError');
const logger = require('../utils/logger');

/**
 * POST /api/auth/login
 * body: { email, password }
 *
 * The backend identifies the role automatically from stored user data.
 * Returns a JWT (with the user's current token_version embedded as `tv`)
 * plus the user profile so the frontend can route to the proper
 * dashboard.
 *
 * Failures intentionally return the same generic message regardless
 * of whether the email exists or the password is wrong, to prevent
 * user enumeration.
 */
async function login(req, res, next) {
  try {
    const { email: rawEmail, password } = req.body || {};
    if (!rawEmail || !password) {
      throw new HttpError(400, 'Email and password are required');
    }

    let email;
    try {
      email = requireEmail(rawEmail);
    } catch (_) {
      throw new HttpError(401, 'Invalid email or password');
    }

    const [rows] = await pool.query(
      `SELECT id, name, email, password_hash, role_level, teacher_rank, is_active, token_version
         FROM users WHERE email = $1`,
      [email]
    );
    const user = rows[0];

    // Constant-ish work even when the user does not exist, to make
    // timing-based enumeration harder.
    const hash = user
      ? user.password_hash
      : '$2a$10$CwTycUXWue0Thq9StjUM0uJ8E/HzS1RrM3l9pGq2H7v8mLkdwf3.S';
    const passwordOk = await bcrypt.compare(String(password), hash);

    if (!user || !user.is_active || !passwordOk) {
      logger.warn('auth.login.failed', { reqId: req.id, email, ip: req.ip });
      throw new HttpError(401, 'Invalid email or password');
    }

    const token = sign({
      sub: user.id,
      role: user.role_level,
      tv: Number(user.token_version),
    });
    const role = roleName(user.role_level);

    logger.info('auth.login.success', { reqId: req.id, userId: user.id, role });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role_level: user.role_level,
        teacher_rank: user.teacher_rank == null ? null : Number(user.teacher_rank),
        role,
      },
      redirect: redirectFor(user.role_level),
    });
  } catch (err) {
    next(err);
  }
}

function redirectFor(level) {
  switch (Number(level)) {
    case 1: return '/teacher/home';
    case 2: return '/coard/dashboard';
    case 3: return '/master/dashboard';
    case 4: return '/admin/dashboard';
    default: return '/';
  }
}

/**
 * GET /api/auth/me - returns the authenticated user (no password info).
 * The frontend calls this on app startup to revalidate a stored JWT
 * after a page refresh: a 200 means "session still valid", anything
 * else triggers a clean logout in the client.
 */
async function me(req, res) {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role_level: req.user.role_level,
      teacher_rank: req.user.teacher_rank == null ? null : Number(req.user.teacher_rank),
      role: roleName(req.user.role_level),
    },
  });
}

/**
 * POST /api/auth/logout - server-side session termination.
 *
 * We bump the user's token_version, which immediately invalidates every
 * JWT that was issued before this moment (including the one used by the
 * caller). The next request from any of those tokens will be rejected
 * by the auth middleware with 401.
 */
async function logout(req, res, next) {
  try {
    await pool.query(
      `UPDATE users SET token_version = token_version + 1 WHERE id = $1`,
      [req.user.id]
    );
    logger.info('auth.logout', { reqId: req.id, userId: req.user.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, me, logout };
