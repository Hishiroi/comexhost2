'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { upload, verifyPdfMagic } = require('../middleware/upload');
const { ROLES } = require('../utils/roles');
const {
  uploadFile,
  listFiles,
  getFile,
  downloadFile,
  reuploadFile,
} = require('../controllers/fileController');
const {
  addComment,
  resolveComment,
  forwardFile,
  finalizeFile,
} = require('../controllers/commentController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Every /api/files route requires a valid JWT. Anonymous traffic is
// rejected with 401 before any handler runs.
router.use(authenticate);

// Teacher-only upload (PDF + magic-byte verification)
router.post(
  '/',
  requireRole(ROLES.TEACHER),
  upload.single('file'),
  verifyPdfMagic,
  asyncHandler(uploadFile)
);

// Teacher-only re-upload: replaces the PDF on an existing file row
// when a reviewer has flagged it for revision. Same id, same
// transaction; the PDF blob and workflow stage are reset.
router.post(
  '/:id/reupload',
  requireRole(ROLES.TEACHER),
  upload.single('file'),
  verifyPdfMagic,
  asyncHandler(reuploadFile)
);

// Listing/viewing/downloading is filtered by visibility in the controller.
router.get('/', asyncHandler(listFiles));
router.get('/:id', asyncHandler(getFile));
router.get('/:id/download', asyncHandler(downloadFile));

// Comments / revisions: Coordinator, Master, Admin only.
router.post(
  '/:id/comments',
  requireRole(ROLES.COORDINATOR, ROLES.MASTER, ROLES.ADMIN),
  asyncHandler(addComment)
);

// Mark a revision as resolved. Only the reviewer who created it may resolve.
router.post(
  '/:id/comments/:commentId/resolve',
  requireRole(ROLES.COORDINATOR, ROLES.MASTER, ROLES.ADMIN),
  asyncHandler(resolveComment)
);

// Forwarding: Coordinator, Master, and Principal (Principal only forwards examinations to Master).
router.post(
  '/:id/forward',
  requireRole(ROLES.COORDINATOR, ROLES.MASTER, ROLES.ADMIN),
  asyncHandler(forwardFile)
);

// Finalize: Admin only.
router.post(
  '/:id/finalize',
  requireRole(ROLES.ADMIN),
  asyncHandler(finalizeFile)
);

module.exports = router;
