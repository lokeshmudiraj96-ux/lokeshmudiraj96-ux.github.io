const sql = require('mssql');

const config = {
  connectionString: process.env.DATABASE_URL,
  options: {
    encrypt: true,
    enableArithAbort: true,
    trustServerCertificate: false
  },
  pool: {
    max: 20,
    min: 0,
    idleTimeoutMillis: 30000
  },
  connectionTimeout: 15000,
  requestTimeout: 15000
};

let pool;

const connectDB = async () => {
  try {
    if (pool) {
      return pool;
    }
    
    // Skip DB connection if DATABASE_URL not configured (dev mode)
    if (!process.env.DATABASE_URL) {
      console.log('⚠️ DATABASE_URL not set - running without database (in-memory mode for dev)');
      return null;
    }
    
    pool = await sql.connect(config);
    console.log('✅ SQL Server connected');
    
    // Test connection
    await pool.request().query('SELECT GETDATE()');
    console.log('✅ Database connection successful');
    
    return pool;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      console.log('⚠️ Continuing without database in dev mode');
      return null;
    }
  }
};

const getPool = () => {
  if (!pool && process.env.NODE_ENV === 'production') {
    throw new Error('Database not connected. Call connectDB() first.');
  }
  return pool; // Returns null in dev mode if not connected
};

module.exports = { sql, connectDB, getPool };
