const { UserConnection, User } = require('../models/user.model');
const Joi = require('joi');

class SocialController {
  // Send connection request
  static async sendConnectionRequest(req, res) {
    try {
      const requesterId = req.user.id;
      const { addresseeId, connectionType = 'FRIEND', notes } = req.body;

      // Validate input
      const schema = Joi.object({
        addresseeId: Joi.string().required(),
        connectionType: Joi.string().valid('FRIEND', 'FAMILY', 'COLLEAGUE', 'NEIGHBOR').default('FRIEND'),
        notes: Joi.string().max(500).allow('')
      });

      const { error } = schema.validate({ addresseeId, connectionType, notes });
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.details.map(detail => detail.message)
        });
      }

      // Check if trying to connect to self
      if (requesterId === addresseeId) {
        return res.status(400).json({
          success: false,
          message: 'Cannot send connection request to yourself'
        });
      }

      // Check if addressee exists
      const addressee = await User.findById(addresseeId);
      if (!addressee) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if connection already exists
      const existingConnections = await UserConnection.getConnections(requesterId, 'ACCEPTED');
      const existingConnection = existingConnections.find(
        conn => conn.friend_id === addresseeId
      );

      if (existingConnection) {
        return res.status(409).json({
          success: false,
          message: 'Connection already exists'
        });
      }

      // Check for pending requests (both directions)
      const pendingConnections = await UserConnection.getConnections(requesterId, 'PENDING');
      const pendingRequest = pendingConnections.find(
        conn => conn.friend_id === addresseeId
      );

      if (pendingRequest) {
        return res.status(409).json({
          success: false,
          message: 'Connection request already sent'
        });
      }

      // Create connection request
      const connection = new UserConnection({
        requesterId,
        addresseeId,
        connectionType,
        status: 'PENDING',
        notes
      });

      const savedConnection = await connection.save();

      // Get requester info for response
      const requester = await User.findById(requesterId);

      res.status(201).json({
        success: true,
        message: 'Connection request sent successfully',
        data: {
          connectionId: savedConnection.id,
          requesterName: `${requester.firstName} ${requester.lastName}`,
          connectionType
        }
      });
    } catch (error) {
      console.error('Error sending connection request:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get pending connection requests
  static async getPendingRequests(req, res) {
    try {
      const userId = req.user.id;
      const { type = 'received' } = req.query; // 'received' or 'sent'

      let connections;
      if (type === 'sent') {
        // Requests sent by this user
        connections = await UserConnection.getConnections(userId, 'PENDING');
      } else {
        // Requests received by this user
        const { pool } = require('../config/database');
        const query = `
          SELECT 
            uc.*,
            u.first_name || ' ' || u.last_name as requester_name,
            u.profile_image_url as requester_profile_image,
            u.bio as requester_bio,
            u.social_score as requester_social_score
          FROM user_connections uc
          JOIN users u ON u.id = uc.requester_id
          WHERE uc.addressee_id = $1 AND uc.status = 'PENDING'
          ORDER BY uc.created_at DESC
        `;

        const result = await pool.query(query, [userId]);
        connections = result.rows;
      }

      res.json({
        success: true,
        data: connections
      });
    } catch (error) {
      console.error('Error getting pending requests:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Respond to connection request
  static async respondToRequest(req, res) {
    try {
      const connectionId = req.params.id;
      const userId = req.user.id;
      const { action } = req.body; // 'ACCEPT' or 'REJECT'

      if (!['ACCEPT', 'REJECT'].includes(action)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid action. Must be ACCEPT or REJECT'
        });
      }

      const status = action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';
      const updatedConnection = await UserConnection.updateConnectionStatus(
        connectionId, 
        status, 
        userId
      );

      if (!updatedConnection) {
        return res.status(404).json({
          success: false,
          message: 'Connection request not found'
        });
      }

      // If accepted, create reciprocal connection and update social scores
      if (status === 'ACCEPTED') {
        await this.handleConnectionAcceptance(updatedConnection);
      }

      res.json({
        success: true,
        message: `Connection request ${action.toLowerCase()}ed successfully`,
        data: updatedConnection
      });
    } catch (error) {
      console.error('Error responding to connection request:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get user connections/friends
  static async getConnections(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20, search = '' } = req.query;

      let connections = await UserConnection.getConnections(userId, 'ACCEPTED');

      // Apply search filter if provided
      if (search.trim()) {
        connections = connections.filter(conn => 
          conn.friend_name.toLowerCase().includes(search.toLowerCase())
        );
      }

      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + parseInt(limit);
      const paginatedConnections = connections.slice(startIndex, endIndex);

      res.json({
        success: true,
        data: {
          connections: paginatedConnections,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: connections.length,
            totalPages: Math.ceil(connections.length / limit)
          }
        }
      });
    } catch (error) {
      console.error('Error getting connections:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Remove connection
  static async removeConnection(req, res) {
    try {
      const connectionId = req.params.id;
      const userId = req.user.id;

      const { pool } = require('../config/database');

      // Verify connection exists and user is part of it
      const checkQuery = `
        SELECT * FROM user_connections 
        WHERE id = $1 AND (requester_id = $2 OR addressee_id = $2) AND status = 'ACCEPTED'
      `;
      const connection = await pool.query(checkQuery, [connectionId, userId]);

      if (connection.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Connection not found'
        });
      }

      // Delete the connection
      const deleteQuery = `
        DELETE FROM user_connections 
        WHERE id = $1 OR (
          requester_id = $2 AND addressee_id = $3
        ) OR (
          requester_id = $3 AND addressee_id = $2
        )
      `;

      const connData = connection.rows[0];
      const friendId = connData.requester_id === userId ? connData.addressee_id : connData.requester_id;

      await pool.query(deleteQuery, [connectionId, userId, friendId]);

      // Update social scores
      await this.updateSocialScores([userId, friendId]);

      res.json({
        success: true,
        message: 'Connection removed successfully'
      });
    } catch (error) {
      console.error('Error removing connection:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get mutual connections
  static async getMutualConnections(req, res) {
    try {
      const userId = req.user.id;
      const { friendId } = req.params;

      if (userId === friendId) {
        return res.status(400).json({
          success: false,
          message: 'Cannot get mutual connections with yourself'
        });
      }

      const { pool } = require('../config/database');
      
      const query = `
        SELECT DISTINCT
          u.id,
          u.first_name || ' ' || u.last_name as name,
          u.profile_image_url,
          u.social_score
        FROM user_connections uc1
        JOIN user_connections uc2 ON (
          (uc1.requester_id = uc2.requester_id OR uc1.requester_id = uc2.addressee_id OR
           uc1.addressee_id = uc2.requester_id OR uc1.addressee_id = uc2.addressee_id)
          AND uc1.id != uc2.id
        )
        JOIN users u ON (
          u.id = CASE 
            WHEN uc1.requester_id = $1 THEN uc1.addressee_id 
            ELSE uc1.requester_id 
          END
          AND
          u.id = CASE 
            WHEN uc2.requester_id = $2 THEN uc2.addressee_id 
            ELSE uc2.requester_id 
          END
        )
        WHERE (uc1.requester_id = $1 OR uc1.addressee_id = $1)
        AND (uc2.requester_id = $2 OR uc2.addressee_id = $2)
        AND uc1.status = 'ACCEPTED' 
        AND uc2.status = 'ACCEPTED'
        AND u.id NOT IN ($1, $2)
        ORDER BY u.social_score DESC
        LIMIT 20
      `;

      const result = await pool.query(query, [userId, friendId]);

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error getting mutual connections:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get connection suggestions
  static async getConnectionSuggestions(req, res) {
    try {
      const userId = req.user.id;
      const { limit = 10 } = req.query;

      const { pool } = require('../config/database');

      // Get suggestions based on mutual connections, location, preferences
      const query = `
        WITH user_connections AS (
          SELECT CASE 
            WHEN requester_id = $1 THEN addressee_id 
            ELSE requester_id 
          END as friend_id
          FROM user_connections 
          WHERE (requester_id = $1 OR addressee_id = $1) 
          AND status = 'ACCEPTED'
        ),
        mutual_connections AS (
          SELECT 
            u.id,
            u.first_name || ' ' || u.last_name as name,
            u.profile_image_url,
            u.bio,
            u.social_score,
            COUNT(uc.friend_id) as mutual_count,
            'MUTUAL_CONNECTIONS' as suggestion_reason
          FROM users u
          JOIN user_connections uc2 ON (uc2.requester_id = u.id OR uc2.addressee_id = u.id)
          JOIN user_connections uc ON (
            (uc2.requester_id = uc.friend_id OR uc2.addressee_id = uc.friend_id)
            AND uc2.status = 'ACCEPTED' AND uc.status = 'ACCEPTED'
          )
          WHERE u.id != $1 
          AND u.id NOT IN (SELECT friend_id FROM user_connections)
          AND u.account_status = 'ACTIVE'
          GROUP BY u.id, u.first_name, u.last_name, u.profile_image_url, u.bio, u.social_score
          HAVING COUNT(uc.friend_id) > 0
        )
        SELECT * FROM mutual_connections
        ORDER BY mutual_count DESC, social_score DESC
        LIMIT $2
      `;

      const result = await pool.query(query, [userId, parseInt(limit)]);

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error getting connection suggestions:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Helper method to handle connection acceptance
  static async handleConnectionAcceptance(connection) {
    try {
      const { pool } = require('../config/database');

      // Update social scores for both users
      await this.updateSocialScores([connection.requester_id, connection.addressee_id]);

      // Create activity records
      await this.createConnectionActivity(connection.requester_id, connection.addressee_id);

    } catch (error) {
      console.error('Error handling connection acceptance:', error);
      throw error;
    }
  }

  // Helper method to update social scores
  static async updateSocialScores(userIds) {
    try {
      const { pool } = require('../config/database');

      for (const userId of userIds) {
        // Calculate new social score based on connections, activity, etc.
        const scoreQuery = `
          UPDATE users SET 
            social_score = (
              SELECT COALESCE(
                (following_count * 0.3) + 
                (followers_count * 0.5) + 
                (successful_referrals * 0.2), 
                0
              )
              FROM users WHERE id = $1
            )
          WHERE id = $1
        `;
        
        await pool.query(scoreQuery, [userId]);
      }
    } catch (error) {
      console.error('Error updating social scores:', error);
    }
  }

  // Helper method to create connection activity
  static async createConnectionActivity(requesterId, addresseeId) {
    try {
      const { pool } = require('../config/database');

      // Create activity for both users
      const activities = [
        {
          userId: requesterId,
          activityType: 'NEW_CONNECTION',
          metadata: { friendId: addresseeId }
        },
        {
          userId: addresseeId,
          activityType: 'NEW_CONNECTION', 
          metadata: { friendId: requesterId }
        }
      ];

      for (const activity of activities) {
        const query = `
          INSERT INTO user_activities (
            id, user_id, activity_type, metadata
          ) VALUES ($1, $2, $3, $4)
        `;

        const { v4: uuidv4 } = require('uuid');
        await pool.query(query, [
          uuidv4(),
          activity.userId,
          activity.activityType,
          JSON.stringify(activity.metadata)
        ]);
      }
    } catch (error) {
      console.error('Error creating connection activity:', error);
    }
  }

  // Block/Unblock user
  static async blockUser(req, res) {
    try {
      const userId = req.user.id;
      const { targetUserId } = req.params;
      const { action } = req.body; // 'BLOCK' or 'UNBLOCK'

      if (!['BLOCK', 'UNBLOCK'].includes(action)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid action. Must be BLOCK or UNBLOCK'
        });
      }

      const { pool } = require('../config/database');

      if (action === 'BLOCK') {
        // Remove any existing connection
        await pool.query(
          'DELETE FROM user_connections WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)',
          [userId, targetUserId]
        );

        // Add to blocked users (you might want to create a separate blocked_users table)
        await pool.query(
          `INSERT INTO user_blocked (id, blocker_id, blocked_id) 
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [require('uuid').v4(), userId, targetUserId]
        );
      } else {
        // Remove from blocked users
        await pool.query(
          'DELETE FROM user_blocked WHERE blocker_id = $1 AND blocked_id = $2',
          [userId, targetUserId]
        );
      }

      res.json({
        success: true,
        message: `User ${action.toLowerCase()}ed successfully`
      });
    } catch (error) {
      console.error(`Error ${action.toLowerCase()}ing user:`, error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = SocialController;