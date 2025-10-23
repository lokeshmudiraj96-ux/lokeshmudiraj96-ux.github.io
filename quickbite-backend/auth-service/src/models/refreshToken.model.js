const { getPool, sql } = require('../config/database');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

class RefreshToken {
  // Generate refresh token
  static async create(userId) {
    const pool = getPool();
    const token = jwt.sign(
      { id: userId, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
    );

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const query = `
      INSERT INTO refresh_tokens (user_id, token, expires_at)
      OUTPUT INSERTED.id, INSERTED.token, INSERTED.expires_at
      VALUES (@userId, @token, @expiresAt)
    `;
    
    const result = await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('token', sql.NVarChar, token)
      .input('expiresAt', sql.DateTime, expiresAt)
      .query(query);
    
    return result.recordset[0];
  }

  // Find valid refresh token
  static async findValid(token) {
    const pool = getPool();
    const query = `
      SELECT * FROM refresh_tokens 
      WHERE token = @token AND expires_at > GETDATE() AND is_revoked = 0
    `;
    const result = await pool.request()
      .input('token', sql.NVarChar, token)
      .query(query);
    return result.recordset[0];
  }

  // Revoke token
  static async revoke(token) {
    const pool = getPool();
    const query = 'UPDATE refresh_tokens SET is_revoked = 1 WHERE token = @token';
    await pool.request()
      .input('token', sql.NVarChar, token)
      .query(query);
  }

  // Revoke all tokens for a user
  static async revokeAllForUser(userId) {
    const pool = getPool();
    const query = 'UPDATE refresh_tokens SET is_revoked = 1 WHERE user_id = @userId';
    await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query(query);
  }

  // Clean up expired tokens
  static async cleanupExpired() {
    const pool = getPool();
    const query = 'DELETE FROM refresh_tokens WHERE expires_at < GETDATE()';
    await pool.request().query(query);
  }
}

module.exports = RefreshToken;
