const { pool } = require('../config/database');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

class RefreshToken {
  // Generate refresh token
  static async create(userId) {
    const token = jwt.sign(
      { id: userId, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
    );

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const query = `
      INSERT INTO refresh_tokens (user_id, token, expires_at)
      VALUES ($1, $2, $3)
      RETURNING id, token, expires_at
    `;
    
    const result = await pool.query(query, [userId, token, expiresAt]);
    return result.rows[0];
  }

  // Find valid refresh token
  static async findValid(token) {
    const query = `
      SELECT * FROM refresh_tokens 
      WHERE token = $1 AND expires_at > NOW() AND is_revoked = false
    `;
    const result = await pool.query(query, [token]);
    return result.rows[0];
  }

  // Revoke token
  static async revoke(token) {
    const query = 'UPDATE refresh_tokens SET is_revoked = true WHERE token = $1';
    await pool.query(query, [token]);
  }

  // Revoke all tokens for a user
  static async revokeAllForUser(userId) {
    const query = 'UPDATE refresh_tokens SET is_revoked = true WHERE user_id = $1';
    await pool.query(query, [userId]);
  }

  // Clean up expired tokens
  static async cleanupExpired() {
    const query = 'DELETE FROM refresh_tokens WHERE expires_at < NOW()';
    await pool.query(query);
  }
}

module.exports = RefreshToken;
