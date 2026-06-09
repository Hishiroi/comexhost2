'use strict';

const express = require('express');
const { login, me, logout } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.post('/login', asyncHandler(login));
router.get('/me', authenticate, asyncHandler(me));
router.post('/logout', authenticate, asyncHandler(logout));

module.exports = router;
