'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { ROLES } = require('../utils/roles');
const {
  createUser,
  listUsers,
  getUser,
  getMyProfile,
  updateMyProfile,
  setUserActive,
  updateUser,
  deleteUser,
} = require('../controllers/userController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.use(authenticate);

router.get('/me/profile', asyncHandler(getMyProfile));
router.patch('/me/profile', asyncHandler(updateMyProfile));

router.use(requireRole(ROLES.ADMIN));

router.post('/', asyncHandler(createUser));
router.get('/', asyncHandler(listUsers));

router.patch('/:id/active', asyncHandler(setUserActive));
router.delete('/:id', asyncHandler(deleteUser));
router.patch('/:id', asyncHandler(updateUser));
router.get('/:id', asyncHandler(getUser));

module.exports = router;
