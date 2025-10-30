const { getPool, sql } = require('../config/database');
const { getRedisClient } = require('../config/redis');

// In-memory storage for dev mode when database is not available
const inMemoryOTPs = new Map();

class OTP {
  // Generate and store OTP
  static async create(phone, purpose = 'login') {
    const pool = getPool();
    
    // DEV MODE: Use in-memory storage if no database
    if (!pool) {
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      
      const key = `${phone}:${purpose}`;
      inMemoryOTPs.set(key, { otpCode, expiresAt, isUsed: false });
      
      // Print OTP to console for testing
      console.log(`\n🔐 OTP for ${phone}: ${otpCode} (expires in 5 minutes)\n`);
      
      return { phone, otp_code: otpCode, expires_at: expiresAt };
    }
    // PRODUCTION MODE: Use SQL Server
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes per LLR-AUTH-005

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

    // Also cache in Redis for faster verification (if available)
    try {
      const redis = getRedisClient();
      const redisKey = `otp:${phone}:${purpose}`;
      await redis.setEx(redisKey, 300, otpCode); // 5 minutes TTL
    } catch (err) {
      console.warn('Redis not available for OTP caching');
    }

    return result.recordset[0];
  }

  // Verify OTP
  static async verify(phone, otpCode, purpose = 'login') {
    const pool = getPool();
    
    // DEV MODE: Use in-memory storage if no database
    if (!pool) {
      const key = `${phone}:${purpose}`;
      const stored = inMemoryOTPs.get(key);
      
      if (!stored) {
        return { status: 'INVALID' };
      }
      
      if (stored.isUsed) {
        return { status: 'INVALID' };
      }
      
      if (new Date(stored.expiresAt).getTime() <= Date.now()) {
        return { status: 'EXPIRED' };
      }
      
      if (stored.otpCode !== otpCode) {
        return { status: 'INVALID' };
      }
      
      // Mark as used
      stored.isUsed = true;
      return { status: 'VALID' };
    }
    
    // PRODUCTION MODE: First check Redis (faster)
    let cachedOTP;
    try {
      const redis = getRedisClient();
      const redisKey = `otp:${phone}:${purpose}`;
      cachedOTP = await redis.get(redisKey);
    } catch (err) {
      console.warn('Redis not available for OTP verification');
    }

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
      try {
        const redis = getRedisClient();
        const redisKey = `otp:${phone}:${purpose}`;
        await redis.del(redisKey);
      } catch (err) {
        // Redis not available
      }
      return { status: 'VALID' };
    }

    // Fallback to database check: fetch the latest matching OTP and inspect state
    const query = `
      SELECT TOP 1 * FROM otps 
      WHERE phone = @phone AND otp_code = @otpCode AND purpose = @purpose 
      ORDER BY created_at DESC
    `;
    const result = await pool.request()
      .input('phone', sql.NVarChar, phone)
      .input('otpCode', sql.NVarChar, otpCode)
      .input('purpose', sql.NVarChar, purpose)
      .query(query);

    if (result.recordset.length === 0) {
      return { status: 'INVALID' };
    }

    const row = result.recordset[0];
    if (row.is_used) {
      return { status: 'INVALID' };
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return { status: 'EXPIRED' };
    }

    // Mark as used if still valid
    const updateQuery = 'UPDATE otps SET is_used = 1 WHERE id = @id';
    await pool.request().input('id', sql.UniqueIdentifier, row.id).query(updateQuery);
    
    try {
      const redis = getRedisClient();
      const redisKey = `otp:${phone}:${purpose}`;
      await redis.del(redisKey);
    } catch (err) {
      // Redis not available
    }
    return { status: 'VALID' };
  }

  // Clean up expired OTPs (run periodically)
  static async cleanupExpired() {
    const pool = getPool();
    const query = 'DELETE FROM otps WHERE expires_at < GETDATE()';
    await pool.request().query(query);
  }
}

module.exports = OTP;
