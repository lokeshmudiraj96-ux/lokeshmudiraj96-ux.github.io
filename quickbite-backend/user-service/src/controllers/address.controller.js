const { UserAddress } = require('../models/user.model');
const Joi = require('joi');

class AddressController {
  // Validation schema
  static addressSchema = Joi.object({
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

  // Get all user addresses
  static async getAddresses(req, res) {
    try {
      const userId = req.user.id;
      const addresses = await UserAddress.getByUserId(userId);

      res.json({
        success: true,
        data: addresses
      });
    } catch (error) {
      console.error('Error getting addresses:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Add new address
  static async addAddress(req, res) {
    try {
      // Validate input
      const { error, value } = AddressController.addressSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.details.map(detail => detail.message)
        });
      }

      const userId = req.user.id;
      const addressData = { ...value, userId };

      const address = new UserAddress(addressData);
      const savedAddress = await address.save();

      res.status(201).json({
        success: true,
        message: 'Address added successfully',
        data: savedAddress
      });
    } catch (error) {
      console.error('Error adding address:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Update address
  static async updateAddress(req, res) {
    try {
      const addressId = req.params.id;
      const userId = req.user.id;

      // Validate input
      const { error, value } = AddressController.addressSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.details.map(detail => detail.message)
        });
      }

      // Check if address exists and belongs to user
      const existingAddresses = await UserAddress.getByUserId(userId);
      const existingAddress = existingAddresses.find(addr => addr.id === addressId);

      if (!existingAddress) {
        return res.status(404).json({
          success: false,
          message: 'Address not found'
        });
      }

      // Create updated address object
      const updatedAddressData = { 
        ...existingAddress, 
        ...value, 
        id: addressId, 
        userId 
      };

      const address = new UserAddress(updatedAddressData);
      
      // Delete existing address and create new one (simple approach)
      await this.deleteAddressById(addressId, userId);
      const savedAddress = await address.save();

      res.json({
        success: true,
        message: 'Address updated successfully',
        data: savedAddress
      });
    } catch (error) {
      console.error('Error updating address:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Set address as default
  static async setDefaultAddress(req, res) {
    try {
      const addressId = req.params.id;
      const userId = req.user.id;

      // Verify address belongs to user
      const addresses = await UserAddress.getByUserId(userId);
      const address = addresses.find(addr => addr.id === addressId);

      if (!address) {
        return res.status(404).json({
          success: false,
          message: 'Address not found'
        });
      }

      const updatedAddress = await UserAddress.setAsDefault(userId, addressId);

      res.json({
        success: true,
        message: 'Default address updated successfully',
        data: updatedAddress
      });
    } catch (error) {
      console.error('Error setting default address:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Delete address
  static async deleteAddress(req, res) {
    try {
      const addressId = req.params.id;
      const userId = req.user.id;

      // Verify address belongs to user
      const addresses = await UserAddress.getByUserId(userId);
      const address = addresses.find(addr => addr.id === addressId);

      if (!address) {
        return res.status(404).json({
          success: false,
          message: 'Address not found'
        });
      }

      // Check if it's the only address and default
      if (addresses.length === 1) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete the only address. Please add another address first.'
        });
      }

      await this.deleteAddressById(addressId, userId);

      // If deleted address was default, set first remaining address as default
      if (address.is_default) {
        const remainingAddresses = await UserAddress.getByUserId(userId);
        if (remainingAddresses.length > 0) {
          await UserAddress.setAsDefault(userId, remainingAddresses[0].id);
        }
      }

      res.json({
        success: true,
        message: 'Address deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting address:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Helper method to delete address by ID
  static async deleteAddressById(addressId, userId) {
    const { pool } = require('../config/database');
    
    const query = `
      UPDATE user_addresses 
      SET is_active = false, deleted_at = CURRENT_TIMESTAMP 
      WHERE id = $1 AND user_id = $2
    `;
    
    await pool.query(query, [addressId, userId]);
  }

  // Get default address
  static async getDefaultAddress(req, res) {
    try {
      const userId = req.user.id;
      const addresses = await UserAddress.getByUserId(userId);
      const defaultAddress = addresses.find(addr => addr.is_default);

      if (!defaultAddress) {
        return res.status(404).json({
          success: false,
          message: 'No default address found'
        });
      }

      res.json({
        success: true,
        data: defaultAddress
      });
    } catch (error) {
      console.error('Error getting default address:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Validate address coordinates (for delivery area check)
  static async validateAddress(req, res) {
    try {
      const { latitude, longitude, addressLine1, city, postalCode } = req.body;

      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          message: 'Latitude and longitude are required'
        });
      }

      // Here you would integrate with mapping services like Google Maps API
      // to validate the address and check delivery coverage
      
      // Mock validation - in real implementation, check against delivery zones
      const isInDeliveryArea = AddressController.checkDeliveryArea(latitude, longitude);
      
      const validation = {
        isValid: true,
        isInDeliveryArea,
        estimatedDeliveryTime: isInDeliveryArea ? '30-45 minutes' : 'Not available',
        deliveryFee: isInDeliveryArea ? 2500 : null, // ₹25 in paise
        suggestions: []
      };

      // Add suggestions if address seems incomplete
      if (!addressLine1 || !city || !postalCode) {
        validation.suggestions.push('Please provide complete address details');
      }

      res.json({
        success: true,
        data: validation
      });
    } catch (error) {
      console.error('Error validating address:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Mock delivery area check (replace with real logic)
  static checkDeliveryArea(latitude, longitude) {
    // Mock logic - check if coordinates are within major city bounds
    const cityBounds = {
      // Bangalore approximate bounds
      bangalore: {
        north: 13.1986,
        south: 12.7343,
        east: 77.8499,
        west: 77.4106
      },
      // Mumbai approximate bounds
      mumbai: {
        north: 19.2727,
        south: 18.8944,
        east: 72.9713,
        west: 72.7757
      }
      // Add more cities as needed
    };

    // Check against each city
    for (const [city, bounds] of Object.entries(cityBounds)) {
      if (
        latitude >= bounds.south &&
        latitude <= bounds.north &&
        longitude >= bounds.west &&
        longitude <= bounds.east
      ) {
        return true;
      }
    }

    return false;
  }
}

module.exports = AddressController;