const { pool } = require('../config/database');
const { getRedisClient } = require('../config/redis');

class OTP {
  // Generate and store OTP
  static async create(phone, purpose = 'login') {
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store in PostgreSQL
    const query = `
      INSERT INTO otps (phone, otp_code, purpose, expires_at)
      VALUES ($1, $2, $3, $4)
      RETURNING id, phone, otp_code, expires_at
    `;
    const result = await pool.query(query, [phone, otpCode, purpose, expiresAt]);

    // Also cache in Redis for faster verification
    const redis = getRedisClient();
    const redisKey = `otp:${phone}:${purpose}`;
    await redis.setEx(redisKey, 600, otpCode); // 10 minutes TTL

    return result.rows[0];
  }

  // Verify OTP
  static async verify(phone, otpCode, purpose = 'login') {
    // First check Redis (faster)
    const redis = getRedisClient();
    const redisKey = `otp:${phone}:${purpose}`;
    const cachedOTP = await redis.get(redisKey);

    if (cachedOTP && cachedOTP === otpCode) {
      // Mark as used in database
      const query = `
        UPDATE otps 
        SET is_used = true 
        WHERE phone = $1 AND otp_code = $2 AND purpose = $3 AND is_used = false
      `;
      await pool.query(query, [phone, otpCode, purpose]);
      
      // Delete from Redis
      await redis.del(redisKey);
      return true;
    }

    // Fallback to database check
    const query = `
      SELECT * FROM otps 
      WHERE phone = $1 AND otp_code = $2 AND purpose = $3 
      AND expires_at > NOW() AND is_used = false
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    const result = await pool.query(query, [phone, otpCode, purpose]);

    if (result.rows.length > 0) {
      // Mark as used
      const updateQuery = 'UPDATE otps SET is_used = true WHERE id = $1';
      await pool.query(updateQuery, [result.rows[0].id]);
      
      // Delete from Redis
      await redis.del(redisKey);
      return true;
    }

    return false;
  }

  // Clean up expired OTPs (run periodically)
  static async cleanupExpired() {
    const query = 'DELETE FROM otps WHERE expires_at < NOW()';
    await pool.query(query);
  }
}

module.exports = OTP;
