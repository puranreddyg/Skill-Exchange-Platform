const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('render.com') 
       ? { rejectUnauthorized: false } 
       : false
});

const initDB = async () => {
  try {
    console.log('Connecting to PostgreSQL database...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          credits INTEGER DEFAULT 5
      );

      CREATE TABLE IF NOT EXISTS skills (
          id VARCHAR(50) PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          category VARCHAR(255) NOT NULL,
          description TEXT,
          level VARCHAR(50),
          teacher_id VARCHAR(50) REFERENCES users(id),
          teacher_name VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          credits_per_hour INTEGER DEFAULT 1,
          completion_rate NUMERIC DEFAULT 0.90,
          subject_authority NUMERIC DEFAULT 1,
          sentiment_score NUMERIC DEFAULT 4.0,
          teaching_style VARCHAR(100) DEFAULT 'hands-on',
          is_available BOOLEAN DEFAULT true
      );

      CREATE TABLE IF NOT EXISTS sessions (
          id VARCHAR(50) PRIMARY KEY,
          skill_id VARCHAR(50) REFERENCES skills(id),
          skill_title VARCHAR(255),
          teacher_id VARCHAR(50) REFERENCES users(id),
          teacher_name VARCHAR(255),
          learner_id VARCHAR(50) REFERENCES users(id),
          learner_name VARCHAR(255),
          status VARCHAR(50) DEFAULT 'active',
          escrow_amount INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          meeting_link VARCHAR(255)
      );

      CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          session_id VARCHAR(50) REFERENCES sessions(id),
          sender_id VARCHAR(50) REFERENCES users(id),
          sender_name VARCHAR(255),
          text TEXT,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS admin_disputes (
          id VARCHAR(50) PRIMARY KEY,
          session_id VARCHAR(50) REFERENCES sessions(id),
          dispute_reason TEXT,
          fault VARCHAR(50),
          reasoning TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS reviews (
          id VARCHAR(50) PRIMARY KEY,
          session_id VARCHAR(50) REFERENCES sessions(id),
          teacher_id VARCHAR(50) REFERENCES users(id),
          learner_id VARCHAR(50) REFERENCES users(id),
          rating INTEGER DEFAULT 5,
          text TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database tables successfully initialized!');
  } catch (error) {
    console.error('Failed to initialize database tables:', error);
  }
};

module.exports = {
  query: (text, params) => pool.query(text, params),
  initDB,
  pool
};
