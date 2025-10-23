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
    
    pool = await sql.connect(config);
    console.log('✅ SQL Server connected');
    
    // Test connection
    await pool.request().query('SELECT GETDATE()');
    console.log('✅ Database connection successful');
    
    return pool;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
};

const getPool = () => {
  if (!pool) {
    throw new Error('Database not connected. Call connectDB() first.');
  }
  return pool;
};

module.exports = { sql, connectDB, getPool };
