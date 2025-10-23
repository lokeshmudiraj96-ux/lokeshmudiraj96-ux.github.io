-- Auth Service Database Schema - SQL Server T-SQL

-- Users table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users')
BEGIN
  CREATE TABLE users (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    name NVARCHAR(255) NOT NULL,
    email NVARCHAR(255) UNIQUE NOT NULL,
    phone NVARCHAR(20) UNIQUE NOT NULL,
    password_hash NVARCHAR(255),
    role NVARCHAR(50) DEFAULT 'customer' CHECK (role IN ('customer', 'staff', 'admin', 'super_admin')),
    store_id UNIQUEIDENTIFIER NULL,
    is_verified BIT DEFAULT 0,
    is_active BIT DEFAULT 1,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
  );
END
GO

-- OTP table for phone verification
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'otps')
BEGIN
  CREATE TABLE otps (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    phone NVARCHAR(20) NOT NULL,
    otp_code NVARCHAR(6) NOT NULL,
    purpose NVARCHAR(50) NOT NULL CHECK (purpose IN ('login', 'registration', 'password_reset')),
    expires_at DATETIME2 NOT NULL,
    is_used BIT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETDATE()
  );
END
GO

-- Refresh tokens table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'refresh_tokens')
BEGIN
  CREATE TABLE refresh_tokens (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    user_id UNIQUEIDENTIFIER NOT NULL,
    token NVARCHAR(500) NOT NULL UNIQUE,
    expires_at DATETIME2 NOT NULL,
    is_revoked BIT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETDATE(),
    CONSTRAINT FK_refresh_tokens_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
END
GO

-- Password reset tokens
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'password_reset_tokens')
BEGIN
  CREATE TABLE password_reset_tokens (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    user_id UNIQUEIDENTIFIER NOT NULL,
    token NVARCHAR(500) NOT NULL UNIQUE,
    expires_at DATETIME2 NOT NULL,
    is_used BIT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETDATE(),
    CONSTRAINT FK_password_reset_tokens_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
END
GO

-- Indexes for performance
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_users_email')
  CREATE INDEX idx_users_email ON users(email);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_users_phone')
  CREATE INDEX idx_users_phone ON users(phone);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_otps_phone')
  CREATE INDEX idx_otps_phone ON otps(phone);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_refresh_tokens_user_id')
  CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_refresh_tokens_token')
  CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
GO

-- Trigger to update updated_at timestamp
IF OBJECT_ID('tr_users_update_timestamp', 'TR') IS NOT NULL
  DROP TRIGGER tr_users_update_timestamp;
GO

CREATE TRIGGER tr_users_update_timestamp
ON users
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE users
  SET updated_at = GETDATE()
  FROM users u
  INNER JOIN inserted i ON u.id = i.id;
END
GO
