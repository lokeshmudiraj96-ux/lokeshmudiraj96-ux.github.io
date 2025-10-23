const { getPool, sql } = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  // Create new user
  static async create({ name, email, phone, password, role = 'customer', storeId = null }) {
    const passwordHash = await bcrypt.hash(password, 10);
    const pool = getPool();
    
    const query = `
      INSERT INTO users (name, email, phone, password_hash, role, store_id)
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.email, INSERTED.phone, INSERTED.role, INSERTED.store_id, INSERTED.is_verified, INSERTED.created_at
      VALUES (@name, @email, @phone, @passwordHash, @role, @storeId)
    `;
    
    const result = await pool.request()
      .input('name', sql.NVarChar, name)
      .input('email', sql.NVarChar, email)
      .input('phone', sql.NVarChar, phone)
      .input('passwordHash', sql.NVarChar, passwordHash)
      .input('role', sql.NVarChar, role)
      .input('storeId', sql.UniqueIdentifier, storeId)
      .query(query);
    
    return result.recordset[0];
  }

  // Find user by email
  static async findByEmail(email) {
    const pool = getPool();
    const query = 'SELECT * FROM users WHERE email = @email AND is_active = 1';
    const result = await pool.request()
      .input('email', sql.NVarChar, email)
      .query(query);
    return result.recordset[0];
  }

  // Find user by phone
  static async findByPhone(phone) {
    const pool = getPool();
    const query = 'SELECT * FROM users WHERE phone = @phone AND is_active = 1';
    const result = await pool.request()
      .input('phone', sql.NVarChar, phone)
      .query(query);
    return result.recordset[0];
  }

  // Find user by ID
  static async findById(id) {
    const pool = getPool();
    const query = 'SELECT id, name, email, phone, role, store_id, is_verified, created_at FROM users WHERE id = @id AND is_active = 1';
    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query(query);
    return result.recordset[0];
  }

  // Verify password
  static async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  // Update user
  static async update(id, updates) {
    const pool = getPool();
    const fields = [];

    Object.keys(updates).forEach((key) => {
      if (updates[key] !== undefined) {
        fields.push(`${key} = @${key}`);
      }
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    const query = `
      UPDATE users 
      SET ${fields.join(', ')}
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.email, INSERTED.phone, INSERTED.role, INSERTED.store_id, INSERTED.is_verified, INSERTED.created_at
      WHERE id = @id
    `;

    const request = pool.request().input('id', sql.UniqueIdentifier, id);
    Object.keys(updates).forEach((key) => {
      if (updates[key] !== undefined) {
        request.input(key, updates[key]);
      }
    });

    const result = await request.query(query);
    return result.recordset[0];
  }

  // Mark user as verified
  static async markAsVerified(id) {
    const pool = getPool();
    const query = 'UPDATE users SET is_verified = 1 OUTPUT INSERTED.* WHERE id = @id';
    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query(query);
    return result.recordset[0];
  }

  // Update password
  static async updatePassword(id, newPassword) {
    const pool = getPool();
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const query = 'UPDATE users SET password_hash = @passwordHash WHERE id = @id';
    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .input('passwordHash', sql.NVarChar, passwordHash)
      .query(query);
  }

  // Soft delete user
  static async deactivate(id) {
    const pool = getPool();
    const query = 'UPDATE users SET is_active = 0 WHERE id = @id';
    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query(query);
  }
}

module.exports = User;
