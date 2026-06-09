'use strict';

const HttpError = require('./httpError');
const { ROLES } = require('./roles');
const { CUSTOM_ROUTE } = require('./status');

/**
 * Legacy `custom_route` → ordered role_levels (Coordinator=2, Master=3, Principal=4).
 */
function legacyStopsFromRoute(route) {
  const r = String(route || '');
  if (r === CUSTOM_ROUTE.MASTER_ONLY || r === 'master_only') return [ROLES.MASTER];
  if (r === CUSTOM_ROUTE.PRINCIPAL_ONLY || r === 'principal_only') return [ROLES.ADMIN];
  if (r === CUSTOM_ROUTE.BOTH || r === 'both') return [ROLES.MASTER, ROLES.ADMIN];
  return [ROLES.MASTER, ROLES.ADMIN];
}

/**
 * Normalize upload payload → sorted unique [2–4].
 */
function parseAndNormalizeCustomStops(body) {
  const raw = body && body.custom_stops;
  if (raw == null || raw === '') {
    throw new HttpError(
      400,
      'custom_stops is required (JSON array of role levels: 2 Coordinator, 3 Master, 4 Principal)'
    );
  }
  let arr;
  try {
    arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new HttpError(400, 'custom_stops must be valid JSON');
  }
  return normalizeStopsArray(arr);
}

function normalizeStopsArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new HttpError(
      400,
      'custom_stops must be a non-empty array (pick 1–3 reviewers)'
    );
  }
  if (arr.length > 3) {
    throw new HttpError(400, 'custom_stops may include at most three roles');
  }
  const allowed = new Set([ROLES.COORDINATOR, ROLES.MASTER, ROLES.ADMIN]);
  const nums = arr.map((x) => Number(x));
  for (const n of nums) {
    if (!allowed.has(n)) {
      throw new HttpError(
        400,
        'Each custom_stops value must be 2 (Coordinator), 3 (Master), or 4 (Principal)'
      );
    }
  }
  const unique = [...new Set(nums)].sort((a, b) => a - b);
  if (unique.length !== nums.length) {
    throw new HttpError(400, 'custom_stops roles must be unique');
  }
  return unique;
}

/**
 * Stops from DB row (JSON column or legacy custom_route).
 */
function stopsFromRow(row) {
  if (row.custom_stops != null) {
    try {
      const val = row.custom_stops;
      let arr;
      if (typeof val === 'string') arr = JSON.parse(val);
      else if (Array.isArray(val)) arr = val;
      else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(val)) {
        arr = JSON.parse(val.toString('utf8'));
      } else {
        return legacyStopsFromRoute(row.custom_route);
      }
      if (Array.isArray(arr) && arr.length > 0) {
        const allowed = new Set([2, 3, 4]);
        const nums = [...new Set(arr.map((x) => Number(x)).filter((n) => allowed.has(n)))].sort(
          (a, b) => a - b
        );
        if (nums.length > 0) return nums;
      }
    } catch {
      // fall through to legacy
    }
  }
  return legacyStopsFromRoute(row.custom_route);
}

module.exports = {
  legacyStopsFromRoute,
  parseAndNormalizeCustomStops,
  normalizeStopsArray,
  stopsFromRow,
};
