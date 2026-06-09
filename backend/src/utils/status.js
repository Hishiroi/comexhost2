'use strict';

const { ROLES } = require('./roles');

const CUSTOM_ROUTE = Object.freeze({
  MASTER_ONLY: 'master_only',
  PRINCIPAL_ONLY: 'principal_only',
  BOTH: 'both',
});

const DOCUMENT_TYPE = Object.freeze({
  DLP: 'dlp',
  EXAMINATION: 'examination',
  CUSTOM: 'custom',
});

const STATUS = Object.freeze({
  UPLOADED: 'uploaded',
  REVIEWED_BY_COORDINATOR: 'reviewed_by_coordinator',
  REVIEWED_BY_MASTER: 'reviewed_by_master',
  FINALIZED: 'finalized',
  RETURNED: 'returned',
  /** Examination: with Principal (after Master review). */
  EXAM_PRINCIPAL: 'exam_principal',
  /** Examination: with Master (after Coordinator review). */
  EXAM_MASTER: 'exam_master',
});

/**
 * Given the reviewer role and document type, return the next
 * (status, current_level) after a successful forward.
 *
 * DLP: Master → Principal (Principal finalizes); Coordinator is not in this path.
 * Examination: Coordinator → Master → Principal (Principal finalizes).
 *
 * Custom: `custom_stops` JSON array [2,3,...] = Coordinator → Master → …
 * Forward moves to the next stop; the last stop uses Forward to complete unless
 * it is Principal (4), who must Finalize instead.
 */
function nextWorkflowState(
  reviewerRole,
  documentType,
  fileStatus,
  opts
) {
  const dtype = documentType || DOCUMENT_TYPE.DLP;
  const role = Number(reviewerRole);
  const customStops =
    opts && Array.isArray(opts.customStops) ? opts.customStops : null;
  const legacyRoute = typeof opts === 'string' ? opts : opts && opts.customRoute;

  if (dtype === DOCUMENT_TYPE.EXAMINATION) {
    switch (role) {
      case ROLES.COORDINATOR:
        if (fileStatus !== STATUS.UPLOADED) return null;
        return { status: STATUS.EXAM_MASTER, current_level: ROLES.MASTER };
      case ROLES.MASTER:
        if (fileStatus !== STATUS.EXAM_MASTER) return null;
        return { status: STATUS.EXAM_PRINCIPAL, current_level: ROLES.ADMIN };
      case ROLES.ADMIN:
        return null;
      default:
        return null;
    }
  }

  if (dtype === DOCUMENT_TYPE.CUSTOM) {
    let stops = customStops;
    if (!stops || stops.length === 0) {
      const r = String(legacyRoute || '');
      if (r === CUSTOM_ROUTE.MASTER_ONLY) stops = [ROLES.MASTER];
      else if (r === CUSTOM_ROUTE.PRINCIPAL_ONLY) stops = [ROLES.ADMIN];
      else if (r === CUSTOM_ROUTE.BOTH) stops = [ROLES.MASTER, ROLES.ADMIN];
      else stops = [ROLES.MASTER, ROLES.ADMIN];
    }
    const i = stops.indexOf(role);
    if (i === -1) return null;
    if (i === stops.length - 1) {
      if (role === ROLES.ADMIN) return null;
      return { status: STATUS.FINALIZED, current_level: ROLES.ADMIN };
    }
    return { status: STATUS.UPLOADED, current_level: stops[i + 1] };
  }

  // DLP only — never through Coordinator (Teacher → Master → Principal).
  switch (role) {
    case ROLES.COORDINATOR:
      return null;
    case ROLES.MASTER:
      return { status: STATUS.REVIEWED_BY_MASTER, current_level: ROLES.ADMIN };
    default:
      return null;
  }
}

module.exports = {
  STATUS,
  DOCUMENT_TYPE,
  CUSTOM_ROUTE,
  nextWorkflowState,
};
