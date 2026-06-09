'use strict';

const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');
const HttpError = require('../utils/httpError');

const storage = multer.memoryStorage();

function pdfOnlyFilter(req, file, cb) {
  const isPdfMime = file.mimetype === 'application/pdf';
  const isPdfExt = file.originalname.toLowerCase().endsWith('.pdf');
  if (!isPdfMime || !isPdfExt) {
    return cb(new HttpError(400, 'Only PDF files are allowed'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter: pdfOnlyFilter,
  limits: {
    fileSize: env.uploads.maxBytes,
    files: 1,
    fields: 20,
    fieldSize: 64 * 1024,
  },
});

/**
 * Verify that the uploaded file actually starts with the PDF magic
 * header `%PDF-`. Multer trusts the client-supplied MIME type, so
 * without this check an attacker could upload an HTML/JS payload
 * disguised as a PDF.
 *
 * If verification fails we return 400.
 */
function verifyPdfMagic(req, res, next) {
  if (!req.file) return next();

  if (!req.file.buffer || req.file.buffer.length < 5) {
    return next(new HttpError(400, 'Uploaded file is empty or too small'));
  }

  const magic = req.file.buffer.subarray(0, 5).toString('utf8');
  if (magic !== '%PDF-') {
    return next(new HttpError(400, 'Uploaded file is not a valid PDF'));
  }
  
  next();
}

module.exports = { upload, verifyPdfMagic };
