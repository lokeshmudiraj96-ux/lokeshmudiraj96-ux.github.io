const express = require('express');
const router = express.Router();
const AddressController = require('../controllers/address.controller');
const { authenticateToken, validateRequest } = require('../middleware');
const Joi = require('joi');

// Validation schemas
const addressSchema = Joi.object({
  addressType: Joi.string().valid('HOME', 'WORK', 'OTHER').default('OTHER'),
  addressLabel: Joi.string().max(100),
  addressLine1: Joi.string().required().max(255),
  addressLine2: Joi.string().max(255).allow(''),
  city: Joi.string().required().max(100),
  state: Joi.string().required().max(100),
  postalCode: Joi.string().required().max(20),
  country: Joi.string().max(100).default('India'),
  latitude: Joi.number().min(-90).max(90),
  longitude: Joi.number().min(-180).max(180),
  deliveryInstructions: Joi.string().max(500).allow(''),
  landmark: Joi.string().max(200).allow(''),
  isDefault: Joi.boolean().default(false)
});

const validateAddressSchema = Joi.object({
  latitude: Joi.number().required().min(-90).max(90),
  longitude: Joi.number().required().min(-180).max(180),
  addressLine1: Joi.string().required(),
  city: Joi.string().required(),
  postalCode: Joi.string().required()
});

// Routes

// GET /api/addresses - Get all user addresses
router.get('/', authenticateToken, AddressController.getAddresses);

// POST /api/addresses - Add new address
router.post('/', 
  authenticateToken,
  validateRequest(addressSchema),
  AddressController.addAddress
);

// PUT /api/addresses/:id - Update address
router.put('/:id', 
  authenticateToken,
  validateRequest(addressSchema),
  AddressController.updateAddress
);

// PUT /api/addresses/:id/default - Set address as default
router.put('/:id/default', 
  authenticateToken,
  AddressController.setDefaultAddress
);

// DELETE /api/addresses/:id - Delete address
router.delete('/:id', 
  authenticateToken,
  AddressController.deleteAddress
);

// GET /api/addresses/default - Get default address
router.get('/default', 
  authenticateToken,
  AddressController.getDefaultAddress
);

// POST /api/addresses/validate - Validate address coordinates
router.post('/validate', 
  authenticateToken,
  validateRequest(validateAddressSchema),
  AddressController.validateAddress
);

module.exports = router;