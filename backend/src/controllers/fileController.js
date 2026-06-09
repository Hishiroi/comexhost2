'use strict';

const crypto = require('crypto');
const { pool } = require('../config/db');
const supabase = require('../config/supabase');
const env = require('../config/env');
const HttpError = require('../utils/httpError');
const { ROLES, roleName } = require('../utils/roles');
const { STATUS } = require('../utils/status');
const {
  requireString,
  optionalString,
  requireId,
} = require('../utils/validate');
const logger = require('../utils/logger');

/**
 * Returns a SQL fragment + params describing which files the given role
 * is allowed to see. Enforced at the DB query level so a misbehaving
 * frontend cannot escalate visibility.
 *
 *   Teacher (1)     -> only files they uploaded
 *   Coordinator (2) -> files routed at level >= 2
 *   Master (3)      -> files routed at level >= 3
 *   Admin (4)       -> all files
 */
function visibilityClause(user, startIndex = 1) {
  switch (Number(user.role_level)) {
    case ROLES.TEACHER:
      return { sql: `f.uploaded_by = $${startIndex}`, params: [user.id] };
    case ROLES.COORDINATOR:
      return { sql: `f.current_level >= $${startIndex}`, params: [ROLES.COORDINATOR] };
    case ROLES.MASTER:
      return { sql: `f.current_level >= $${startIndex}`, params: [ROLES.MASTER] };
    case ROLES.ADMIN:
      return { sql: '1=1', params: [] };
    default:
      return { sql: '1=0', params: [] };
  }
}

function shapeFile(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    original_name: row.original_name,
    mime_type: row.mime_type,
    size_bytes: Number(row.size_bytes),
    current_level: row.current_level,
    current_role: roleName(row.current_level),
    status: row.status,
    uploaded_by: {
      id: row.uploaded_by,
      name: row.uploader_name,
      email: row.uploader_email,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const FILE_SELECT = `
  SELECT f.id, f.title, f.description, f.original_name, f.stored_name,
         f.mime_type, f.size_bytes, f.current_level, f.status,
         f.uploaded_by, f.created_at, f.updated_at,
         u.name  AS uploader_name,
         u.email AS uploader_email
    FROM files f
    JOIN users u ON u.id = f.uploaded_by
`;

/**
 * POST /api/files (Teacher only) - multipart/form-data
 * fields: title (string, required), description (string, optional), file (PDF)
 */
async function uploadFile(req, res, next) {
  try {
    if (!req.file || !req.file.buffer) throw new HttpError(400, 'PDF file is required');

    let title;
    let description;
    try {
      title = requireString(req.body && req.body.title, 'title', { min: 2, max: 255 });
      description = optionalString(req.body && req.body.description, 'description', {
        max: 4000,
      });
    } catch (e) {
      throw e;
    }

    const random = crypto.randomBytes(16).toString('hex');
    const storedName = `${Date.now()}_${random}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from('files')
      .upload(storedName, req.file.buffer, {
        contentType: 'application/pdf',
      });

    if (uploadError) {
      logger.error('supabase.upload.error', uploadError);
      throw new HttpError(500, 'Failed to upload file to storage');
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.query(
        `INSERT INTO files
          (uploaded_by, title, description, original_name, stored_name,
           mime_type, size_bytes, current_level, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          req.user.id,
          title,
          description,
          req.file.originalname.slice(0, 255),
          storedName,
          'application/pdf',
          req.file.size,
          ROLES.COORDINATOR,
          STATUS.UPLOADED,
        ]
      );

      const fileId = result[0].id;

      await conn.commit();

      const [rows] = await pool.query(
        `${FILE_SELECT} WHERE f.id = $1`,
        [fileId]
      );

      logger.info('files.upload', {
        reqId: req.id,
        actor: req.user.id,
        fileId: fileId,
        size: req.file.size,
      });

      res.status(201).json({ file: shapeFile(rows[0]) });
    } catch (e) {
      await conn.rollback();
      // Clean up Supabase file if DB insert fails
      await supabase.storage.from('files').remove([storedName]);
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/files
 * Optional filters: ?status=&current_level=&mine=1
 */
async function listFiles(req, res, next) {
  try {
    const where = [];
    const params = [];

    const vis = visibilityClause(req.user, params.length + 1);
    where.push(vis.sql);
    params.push(...vis.params);

    if (req.query.status) {
      const allowed = Object.values(STATUS);
      const status = String(req.query.status);
      if (!allowed.includes(status)) {
        throw new HttpError(400, 'Invalid status filter');
      }
      params.push(status);
      where.push(`f.status = $${params.length}`);
    }
    if (req.query.current_level) {
      const lvl = Number(req.query.current_level);
      if (![1, 2, 3, 4].includes(lvl)) {
        throw new HttpError(400, 'Invalid current_level filter');
      }
      params.push(lvl);
      where.push(`f.current_level = $${params.length}`);
    }
    if (req.query.mine === '1') {
      params.push(req.user.id);
      where.push(`f.uploaded_by = $${params.length}`);
    }
    // ?history=1 returns files that have already moved past the
    // requesting reviewer's stage, OR are finalized. Used by the
    // Coordinator/Master "History" tab. Teachers and Admin get the
    // unfiltered list because they don't have a "stage" of their own.
    if (req.query.history === '1') {
      const lvl = Number(req.user.role_level);
      if (lvl === ROLES.COORDINATOR || lvl === ROLES.MASTER) {
        params.push(lvl, STATUS.FINALIZED);
        where.push(`(f.current_level > $${params.length - 1} OR f.status = $${params.length})`);
      }
    }

    const sql = `${FILE_SELECT}
      WHERE ${where.join(' AND ')}
      ORDER BY f.updated_at DESC, f.id DESC
      LIMIT 500`;
    const [rows] = await pool.query(sql, params);

    res.json({ files: rows.map(shapeFile) });
  } catch (err) {
    next(err);
  }
}

/**
 * Loads a file row and verifies the requesting user can view it.
 * Throws 404 if not found, 403 if not visible.
 */
async function loadVisibleFile(user, fileId) {
  const [rows] = await pool.query(`${FILE_SELECT} WHERE f.id = $1`, [
    fileId,
  ]);
  const row = rows[0];
  if (!row) throw new HttpError(404, 'File not found');

  const level = Number(user.role_level);
  if (level === ROLES.TEACHER && row.uploaded_by !== user.id) {
    throw new HttpError(403, 'Forbidden');
  }
  if (level === ROLES.COORDINATOR && row.current_level < ROLES.COORDINATOR) {
    throw new HttpError(403, 'Forbidden');
  }
  if (level === ROLES.MASTER && row.current_level < ROLES.MASTER) {
    throw new HttpError(403, 'Forbidden');
  }
  return row;
}

/**
 * GET /api/files/:id - returns metadata + comments timeline.
 */
async function getFile(req, res, next) {
  try {
    const id = requireId(req.params.id);
    const row = await loadVisibleFile(req.user, id);

    const [comments] = await pool.query(
      `SELECT c.id, c.file_id, c.user_id, c.role_level, c.action, c.body,
              c.resolved_at, c.resolved_by, c.created_at,
              u.name  AS user_name,
              u.email AS user_email,
              ru.id   AS resolver_id,
              ru.name AS resolver_name
         FROM comments c
         JOIN users u ON u.id = c.user_id
         LEFT JOIN users ru ON ru.id = c.resolved_by
        WHERE c.file_id = $1
        ORDER BY c.created_at ASC, c.id ASC`,
      [id]
    );

    res.json({
      file: shapeFile(row),
      comments: comments.map((c) => ({
        id: c.id,
        file_id: c.file_id,
        action: c.action,
        body: c.body,
        role_level: c.role_level,
        role: roleName(c.role_level),
        user: { id: c.user_id, name: c.user_name, email: c.user_email },
        resolved_at: c.resolved_at,
        resolved_by: c.resolver_id
          ? { id: c.resolver_id, name: c.resolver_name }
          : null,
        created_at: c.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/files/:id/download - streams the stored PDF.
 *
 * Fetches the file from Supabase Storage and streams it back.
 */
async function downloadFile(req, res, next) {
  try {
    const id = requireId(req.params.id);
    const row = await loadVisibleFile(req.user, id);

    const { data, error } = await supabase.storage
      .from('files')
      .download(row.stored_name);

    if (error || !data) {
      logger.error('supabase.download.error', error);
      throw new HttpError(410, 'Stored file is missing or cannot be accessed');
    }

    const safeName = encodeURIComponent(row.original_name).slice(0, 240);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    
    // Read the blob into a buffer and send
    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/files/:id/reupload (Teacher only) - multipart/form-data
 * field: file (PDF)
 *
 * Replaces the stored PDF for a file the teacher already owns, while
 * keeping the same row id (so the "transaction" stays the same). The
 * workflow is reset back to the Coordinator stage so reviewers see
 * the new version, and any open revision requests are auto-resolved
 * (re-uploading IS the response to the revision). The previous PDF
 * is deleted from storage.
 */
async function reuploadFile(req, res, next) {
  try {
    if (!req.file || !req.file.buffer) throw new HttpError(400, 'PDF file is required');

    const id = requireId(req.params.id);

    const conn = await pool.getConnection();
    let oldStored = null;
    let newStored = null;
    
    try {
      await conn.beginTransaction();

      const [rows] = await conn.query(
        `SELECT id, uploaded_by, stored_name, status
           FROM files WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const file = rows[0];
      if (!file) {
        throw new HttpError(404, 'File not found');
      }
      // Only the original uploader (Teacher) may re-upload, and only
      // when there is at least one open revision request - re-upload
      // is the teacher's response to a "Mark for revision" action.
      if (Number(req.user.role_level) !== ROLES.TEACHER ||
          file.uploaded_by !== req.user.id) {
        throw new HttpError(403, 'You are not allowed to re-upload this file');
      }
      if (file.status === STATUS.FINALIZED) {
        throw new HttpError(409, 'This document is already finalized');
      }

      const [openRevs] = await conn.query(
        `SELECT COUNT(*) AS n
           FROM comments
          WHERE file_id = $1
            AND action = 'revision'
            AND resolved_at IS NULL`,
        [file.id]
      );
      if (Number(openRevs[0].n) === 0) {
        throw new HttpError(
          409,
          'Re-upload is only allowed when a reviewer has marked the document for revision.'
        );
      }

      oldStored = file.stored_name;

      const random = crypto.randomBytes(16).toString('hex');
      newStored = `${Date.now()}_${random}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from('files')
        .upload(newStored, req.file.buffer, {
          contentType: 'application/pdf',
        });

      if (uploadError) {
        logger.error('supabase.reupload.error', uploadError);
        throw new HttpError(500, 'Failed to upload new file to storage');
      }

      await conn.query(
        `UPDATE files
            SET original_name = $1,
                stored_name   = $2,
                mime_type     = 'application/pdf',
                size_bytes    = $3,
                current_level = $4,
                status        = $5
          WHERE id = $6`,
        [
          req.file.originalname.slice(0, 255),
          newStored,
          req.file.size,
          ROLES.COORDINATOR,
          STATUS.UPLOADED,
          file.id,
        ]
      );

      await conn.query(
        `INSERT INTO comments (file_id, user_id, role_level, action, body)
         VALUES ($1, $2, $3, 'comment', $4)`,
        [
          file.id,
          req.user.id,
          ROLES.TEACHER,
          `Teacher re-uploaded a revised version (${req.file.originalname.slice(0, 200)}).`,
        ]
      );

      await conn.commit();

      // Best-effort: drop the previous PDF from storage now that the row
      // points at the new file. Failure here is non-fatal.
      if (oldStored) {
        await supabase.storage.from('files').remove([oldStored]);
      }

      const [updated] = await pool.query(
        `${FILE_SELECT} WHERE f.id = $1`,
        [file.id]
      );

      logger.info('files.reupload', {
        reqId: req.id,
        actor: req.user.id,
        fileId: file.id,
        size: req.file.size,
      });

      res.json({ file: shapeFile(updated[0]) });
    } catch (e) {
      await conn.rollback();
      // If the new upload was saved to Supabase but the DB transaction
      // failed, drop the orphan file so storage doesn't leak.
      if (newStored) {
        await supabase.storage.from('files').remove([newStored]);
      }
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadFile,
  listFiles,
  getFile,
  downloadFile,
  reuploadFile,
  loadVisibleFile,
  shapeFile,
};
