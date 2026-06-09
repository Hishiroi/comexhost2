'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');

const SIGN_OPTS = {
  expiresIn: env.jwt.expiresIn,
  issuer: env.jwt.issuer,
  audience: env.jwt.audience,
  algorithm: 'HS256',
};

const VERIFY_OPTS = {
  issuer: env.jwt.issuer,
  audience: env.jwt.audience,
  algorithms: ['HS256'],
};

function sign(payload) {
  return jwt.sign(payload, env.jwt.secret, SIGN_OPTS);
}

function verify(token) {
  return jwt.verify(token, env.jwt.secret, VERIFY_OPTS);
}

module.exports = { sign, verify };
