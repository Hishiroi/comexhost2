'use strict';

const { pool } = require('../config/db');
const HttpError = require('../utils/httpError');
const { ROLES, roleName } = require('../utils/roles');
const {
  STATUS,
  nextWorkflowState,
  DOCUMENT_TYPE,
} = require('../utils/status');
const { stopsFromRow } = require('../utils/customStops');
const { requireString, optionalString, requireId } = require('../utils/validate');
const logger = require('../utils/logger');

/**
 * Returns true if the given user is currently allowed to *act* on the file
 * (i.e. add comments / revisions / forward / finalize / resolve).
 *
 * Acting permission is based on the file's current_level matching the
 * reviewer's role_level. Teachers cannot act on their own files (they
 * become read-only once submitted). Admin can always act/oversee.
 */
function canActOnFile(user, file) {
  const level = Number(user.role_level);
  const cur = Number(file.current_level);

  if (level === ROLES.ADMIN) return true;
  if (level === ROLES.TEACHER) return false;
  return cur === level;
}

async function loadFileForAction(user, fileId) {
  const [rows] = await pool.query(
    `SELECT id, uploaded_by, current_level, status
       FROM files WHERE id = $1`,
    [fileId]
  );
  const file = rows[0];
  if (!file) throw new HttpError(404, 'File not found');
  if (!canActOnFile(user, file)) {
    throw new HttpError(403, 'You are not allowed to act on this file right now');
  }
  return file;
}

/**
 * For marking a revision resolved: the reviewer must currently hold the file
 * (current_level matches their role). Principal = level 4.
 */
async function loadFileForResolve(user, fileId) {
  const [rows] = await pool.query(
    `SELECT id, uploaded_by, current_level, status
       FROM files WHERE id = $1`,
    [fileId]
  );
  const file = rows[0];
  if (!file) throw new HttpError(404, 'File not found');
  const level = Number(user.role_level);
  const cur = Number(file.current_level);
  if (level === ROLES.TEACHER) {
    throw new HttpError(403, 'Teachers resolve revisions by uploading a corrected PDF');
  }
  if (level === ROLES.ADMIN) {
    if (cur !== ROLES.ADMIN) {
      throw new HttpError(403, 'You are not allowed to resolve revisions for this file right now');
    }
  } else if (cur !== level) {
    throw new HttpError(403, 'You are not allowed to resolve revisions for this file right now');
  }
  return file;
}

/**
 * Counts revision comments still unresolved *for the given user's own*
 * requests only. Only the reviewer who created a revision can resolve it.
 */
async function unresolvedRevisionCountForUser(conn, fileId, userId) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS n
       FROM comments
      WHERE file_id = $1
        AND action = 'revision'
        AND resolved_at IS NULL
        AND user_id = $2`,
    [fileId, userId]
  );
  return Number(rows[0].n) || 0;
}

/**
 * POST /api/files/:id/comments
 * body: { body: string, action?: 'comment' | 'revision' }
 */
async function addComment(req, res, next) {
  try {
    const id = requireId(req.params.id);
    const body = requireString(req.body && req.body.body, 'body', { min: 1, max: 4000 });
    const action = req.body && req.body.action === 'revision' ? 'revision' : 'comment';

    const file = await loadFileForAction(req.user, id);

    const [result] = await pool.query(
      `INSERT INTO comments (file_id, user_id, role_level, action, body)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [file.id, req.user.id, req.user.role_level, action, body]
    );

    const commentId = result[0].id;

    logger.info('comments.add', {
      reqId: req.id,
      actor: req.user.id,
      fileId: file.id,
      action,
    });

    res.status(201).json({
      comment: {
        id: commentId,
        file_id: file.id,
        user: { id: req.user.id, name: req.user.name, email: req.user.email },
        role_level: req.user.role_level,
        role: roleName(req.user.role_level),
        action,
        body,
        resolved_at: null,
        resolved_by: null,
        created_at: new Date(),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/files/:id/comments/:commentId/resolve
 *
 * Marks a `revision` comment as resolved. Only the user who created
 * the revision may resolve it.
 */
async function resolveComment(req, res, next) {
  try {
    const fileId = requireId(req.params.id);
    const commentId = requireId(req.params.commentId);

    const file = await loadFileForResolve(req.user, fileId);

    const [rows] = await pool.query(
      `SELECT id, file_id, action, user_id, resolved_at
         FROM comments
        WHERE id = $1 AND file_id = $2`,
      [commentId, file.id]
    );
    const comment = rows[0];
    if (!comment) throw new HttpError(404, 'Comment not found');
    if (comment.action !== 'revision') {
      throw new HttpError(400, 'Only revisions can be resolved');
    }
    if (comment.resolved_at) {
      throw new HttpError(409, 'Comment is already resolved');
    }

    if (Number(comment.user_id) !== Number(req.user.id)) {
      throw new HttpError(
        403,
        'Only the reviewer who requested this revision can mark it resolved'
      );
    }

    await pool.query(
      `UPDATE comments
          SET resolved_at = CURRENT_TIMESTAMP,
              resolved_by = $1
        WHERE id = $2`,
      [req.user.id, comment.id]
    );

    logger.info('comments.resolve', {
      reqId: req.id,
      actor: req.user.id,
      fileId: file.id,
      commentId: comment.id,
    });

    res.json({
      ok: true,
      comment: {
        id: comment.id,
        resolved_at: new Date(),
        resolved_by: { id: req.user.id, name: req.user.name },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/files/:id/forward
 * body: { body?: string }
 *
 * Coordinator / Master forward. Principal (Admin) does not forward examinations
 * — they finalize. Forwarding is blocked while the actor has their **own**
 * unresolved revision requests.
 */
async function forwardFile(req, res, next) {
  try {
    const id = requireId(req.params.id);
    const note = optionalString(req.body && req.body.body, 'body', { max: 2000 }) || 'Forwarded';

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.query(
        `SELECT id, uploaded_by, current_level, status, document_type, custom_route, custom_stops
           FROM files WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const file = rows[0];
      if (!file) throw new HttpError(404, 'File not found');
      if (!canActOnFile(req.user, file)) {
        throw new HttpError(403, 'You are not allowed to forward this file');
      }

      const actorRole = Number(req.user.role_level);
      const dtype = file.document_type || DOCUMENT_TYPE.DLP;

      if (actorRole === ROLES.ADMIN) {
        throw new HttpError(
          400,
          dtype === DOCUMENT_TYPE.DLP
            ? 'Use Finalize to approve this DLP document when it is ready.'
            : dtype === DOCUMENT_TYPE.EXAMINATION
              ? 'Finalize this examination when it is ready; it is not forwarded from the Principal.'
              : 'Use the workflow action appropriate for this document type.'
        );
      } else if (Number(file.current_level) !== actorRole) {
        throw new HttpError(400, 'File is not at your level');
      }

      const pending = await unresolvedRevisionCountForUser(
        conn,
        file.id,
        req.user.id
      );
      if (pending > 0) {
        throw new HttpError(
          409,
          'Cannot forward: resolve your own open revision requests on this document first.'
        );
      }

      const next = nextWorkflowState(
        req.user.role_level,
        dtype,
        file.status,
        dtype === DOCUMENT_TYPE.CUSTOM
          ? {
              customStops: stopsFromRow(file),
              customRoute: file.custom_route,
            }
          : undefined
      );
      if (!next) {
        if (dtype === DOCUMENT_TYPE.CUSTOM) {
          const stops = stopsFromRow(file);
          const lastIdx = stops.indexOf(Number(actorRole));
          if (
            lastIdx === stops.length - 1 &&
            Number(actorRole) === ROLES.ADMIN
          ) {
            throw new HttpError(
              400,
              'Use Finalize to approve this document when it is ready.'
            );
          }
        }
        throw new HttpError(400, 'No next state from this role');
      }

      await conn.query(
        `UPDATE files SET current_level = $1, status = $2 WHERE id = $3`,
        [next.current_level, next.status, file.id]
      );

      await conn.query(
        `INSERT INTO comments (file_id, user_id, role_level, action, body)
         VALUES ($1, $2, $3, 'forward', $4)`,
        [file.id, req.user.id, req.user.role_level, note]
      );

      await conn.commit();

      logger.info('files.forward', {
        reqId: req.id,
        actor: req.user.id,
        fileId: file.id,
        to: next.current_level,
      });

      res.json({
        ok: true,
        file: { id: file.id, status: next.status, current_level: next.current_level },
      });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/files/:id/finalize  (Admin only)
 * body: { body?: string }
 */
async function finalizeFile(req, res, next) {
  try {
    if (Number(req.user.role_level) !== ROLES.ADMIN) {
      throw new HttpError(403, 'Only the Principal/Admin can finalize');
    }
    const id = requireId(req.params.id);
    const note = optionalString(req.body && req.body.body, 'body', { max: 2000 }) || 'Finalized';

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.query(
        `SELECT id, current_level, status, document_type, custom_route, custom_stops FROM files WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const file = rows[0];
      if (!file) throw new HttpError(404, 'File not found');
      if (file.status === STATUS.FINALIZED) {
        throw new HttpError(409, 'File is already finalized');
      }

      const dtype = String(file.document_type || DOCUMENT_TYPE.DLP);
      const pending = await unresolvedRevisionCountForUser(
        conn,
        file.id,
        req.user.id
      );
      if (pending > 0) {
        throw new HttpError(
          409,
          'Cannot finalize: resolve your own open revision requests on this document first.'
        );
      }

      if (dtype === DOCUMENT_TYPE.EXAMINATION) {
        if (
          file.status !== STATUS.EXAM_PRINCIPAL ||
          Number(file.current_level) !== ROLES.ADMIN
        ) {
          throw new HttpError(
            400,
            'Examination papers are finalized here only after Coordinator and Master reviews (document must be exam_principal at your desk).'
          );
        }
      } else if (dtype === DOCUMENT_TYPE.CUSTOM) {
        const stops = stopsFromRow(file);
        const last = stops[stops.length - 1];
        if (last !== ROLES.ADMIN) {
          throw new HttpError(
            400,
            'This custom workflow is completed by forwarding at the last reviewer, not by Finalize here.'
          );
        }
        if (
          file.status !== STATUS.UPLOADED ||
          Number(file.current_level) !== ROLES.ADMIN
        ) {
          throw new HttpError(
            400,
            'This custom document is not awaiting Principal-only final approval.'
          );
        }
      } else if (file.status !== STATUS.REVIEWED_BY_MASTER) {
        throw new HttpError(
          400,
          'This document is not awaiting final Principal approval (DLP flow).'
        );
      }
      if (Number(file.current_level) !== ROLES.ADMIN) {
        throw new HttpError(
          400,
          'This document is not currently with the Principal for final approval.'
        );
      }

      await conn.query(
        `UPDATE files SET current_level = $1, status = $2 WHERE id = $3`,
        [ROLES.ADMIN, STATUS.FINALIZED, file.id]
      );

      await conn.query(
        `INSERT INTO comments (file_id, user_id, role_level, action, body)
         VALUES ($1, $2, $3, 'finalize', $4)`,
        [file.id, req.user.id, req.user.role_level, note]
      );

      await conn.commit();

      logger.info('files.finalize', {
        reqId: req.id,
        actor: req.user.id,
        fileId: file.id,
      });

      res.json({
        ok: true,
        file: { id: file.id, status: STATUS.FINALIZED, current_level: ROLES.ADMIN },
      });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
}

module.exports = { addComment, resolveComment, forwardFile, finalizeFile };
