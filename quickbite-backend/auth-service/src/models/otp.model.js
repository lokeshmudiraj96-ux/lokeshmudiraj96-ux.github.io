const { getPool, sql } = require('../config/database');
const { getRedisClient } = require('../config/redis');

class OTP {
  // Generate and store OTP
  static async create(phone, purpose = 'login') {
    const pool = getPool();
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store in SQL Server
    const query = `
      INSERT INTO otps (phone, otp_code, purpose, expires_at)
      OUTPUT INSERTED.id, INSERTED.phone, INSERTED.otp_code, INSERTED.expires_at
      VALUES (@phone, @otpCode, @purpose, @expiresAt)
    `;
    const result = await pool.request()
      .input('phone', sql.NVarChar, phone)
      .input('otpCode', sql.NVarChar, otpCode)
      .input('purpose', sql.NVarChar, purpose)
      .input('expiresAt', sql.DateTime, expiresAt)
      .query(query);

    // Also cache in Redis for faster verification
    const redis = getRedisClient();
    const redisKey = `otp:${phone}:${purpose}`;
    await redis.setEx(redisKey, 600, otpCode); // 10 minutes TTL

    return result.recordset[0];
  }

  // Verify OTP
  static async verify(phone, otpCode, purpose = 'login') {
    const pool = getPool();
    
    // First check Redis (faster)
    const redis = getRedisClient();
    const redisKey = `otp:${phone}:${purpose}`;
    const cachedOTP = await redis.get(redisKey);

    if (cachedOTP && cachedOTP === otpCode) {
      // Mark as used in database
      const query = `
        UPDATE otps 
        SET is_used = 1 
        WHERE phone = @phone AND otp_code = @otpCode AND purpose = @purpose AND is_used = 0
      `;
      await pool.request()
        .input('phone', sql.NVarChar, phone)
        .input('otpCode', sql.NVarChar, otpCode)
        .input('purpose', sql.NVarChar, purpose)
        .query(query);
      
      // Delete from Redis
      await redis.del(redisKey);
      return true;
    }

    // Fallback to database check
    const query = `
      SELECT TOP 1 * FROM otps 
      WHERE phone = @phone AND otp_code = @otpCode AND purpose = @purpose 
      AND expires_at > GETDATE() AND is_used = 0
      ORDER BY created_at DESC
    `;
    const result = await pool.request()
      .input('phone', sql.NVarChar, phone)
      .input('otpCode', sql.NVarChar, otpCode)
      .input('purpose', sql.NVarChar, purpose)
      .query(query);

    if (result.recordset.length > 0) {
      // Mark as used
      const updateQuery = 'UPDATE otps SET is_used = 1 WHERE id = @id';
      await pool.request()
        .input('id', sql.UniqueIdentifier, result.recordset[0].id)
        .query(updateQuery);
      
      // Delete from Redis
      await redis.del(redisKey);
      return true;
    }

    return false;
  }

  // Clean up expired OTPs (run periodically)
  static async cleanupExpired() {
    const pool = getPool();
    const query = 'DELETE FROM otps WHERE expires_at < GETDATE()';
    await pool.request().query(query);
  }
}

module.exports = OTP;
