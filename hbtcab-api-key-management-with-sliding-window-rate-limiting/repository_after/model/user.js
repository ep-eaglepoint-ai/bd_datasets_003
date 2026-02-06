const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

class User {
  static async findById(id) {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  static async findByEmail(email) {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0] || null;
  }

  static async create({ email, passwordHash, tier = 'free' }) {
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, tier) VALUES ($1, $2, $3) RETURNING *',
      [email, passwordHash, tier]
    );
    return result.rows[0];
  }

  static async updateTier(id, tier) {
    const validTiers = ['free', 'pro', 'enterprise'];
    if (!validTiers.includes(tier)) {
      throw new Error('Invalid tier');
    }
    
    const result = await pool.query(
      'UPDATE users SET tier = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [tier, id]
    );
    return result.rows[0];
  }

  static getTierLimits(tier) {
    const limits = {
      free: { requestsPerHour: 100 },
      pro: { requestsPerHour: 1000 },
      enterprise: { requestsPerHour: 10000 },
    };
    return limits[tier] || limits.free;
  }
}

module.exports = User;
