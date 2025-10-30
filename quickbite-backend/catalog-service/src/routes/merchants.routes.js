const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/merchants.controller');

// LLR-CAT-001, 004, 005, 006: Discover merchants with filters and pagination
router.get('/merchants', ctrl.discoverMerchants);

// LLR-CAT-002: Fetch single merchant
router.get('/merchants/:id', ctrl.getMerchantById);

// LLR-CAT-003: Fetch merchant menu
router.get('/merchants/:id/menu', ctrl.getMerchantMenu);

module.exports = router;
