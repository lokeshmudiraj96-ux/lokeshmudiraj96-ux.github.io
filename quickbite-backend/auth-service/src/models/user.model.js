const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  // Create new user
  static async create({ name, email, phone, password, role = 'customer', storeId = null }) {
    const passwordHash = await bcrypt.hash(password, 10);
    
    const query = `
      INSERT INTO users (name, email, phone, password_hash, role, store_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, email, phone, role, store_id, is_verified, created_at
    `;
    
    const values = [name, email, phone, passwordHash, role, storeId];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Find user by email
  static async findByEmail(email) {
    const query = 'SELECT * FROM users WHERE email = $1 AND is_active = true';
    const result = await pool.query(query, [email]);
    return result.rows[0];
  }

  // Find user by phone
  static async findByPhone(phone) {
    const query = 'SELECT * FROM users WHERE phone = $1 AND is_active = true';
    const result = await pool.query(query, [phone]);
    return result.rows[0];
  }

  // Find user by ID
  static async findById(id) {
    const query = 'SELECT id, name, email, phone, role, store_id, is_verified, created_at FROM users WHERE id = $1 AND is_active = true';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Verify password
  static async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  // Update user
  static async update(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach((key) => {
      if (updates[key] !== undefined) {
        fields.push(`${key} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);
    const query = `
      UPDATE users 
      SET ${fields.join(', ')} 
      WHERE id = $${paramCount}
      RETURNING id, name, email, phone, role, store_id, is_verified, created_at
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Mark user as verified
  static async markAsVerified(id) {
    const query = 'UPDATE users SET is_verified = true WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Update password
  static async updatePassword(id, newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const query = 'UPDATE users SET password_hash = $1 WHERE id = $2';
    await pool.query(query, [passwordHash, id]);
  }

  // Soft delete user
  static async deactivate(id) {
    const query = 'UPDATE users SET is_active = false WHERE id = $1';
    await pool.query(query, [id]);
  }
}

module.exports = User;
