'use strict';

const ROLES = Object.freeze({
  TEACHER: 1,
  COORDINATOR: 2,
  MASTER: 3,
  ADMIN: 4,
});

const ROLE_NAMES = Object.freeze({
  1: 'teacher',
  2: 'coordinator',
  3: 'master',
  4: 'admin',
});

function roleName(level) {
  return ROLE_NAMES[level] || 'unknown';
}

function isValidRole(level) {
  return [1, 2, 3, 4].includes(Number(level));
}

module.exports = { ROLES, ROLE_NAMES, roleName, isValidRole };
