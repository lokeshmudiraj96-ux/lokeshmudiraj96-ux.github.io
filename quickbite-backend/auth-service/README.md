# Auth Service

Production-ready authentication microservice with OTP and email/password support.

## Features

- ✅ OTP-based authentication (phone)
- ✅ Email/password authentication
- ✅ JWT access + refresh tokens
- ✅ Password reset
- ✅ Role-based access control
- ✅ PostgreSQL database
- ✅ Redis caching
- ✅ Rate limiting ready
- ✅ AWS SNS integration for SMS

## API Endpoints

### Authentication
- `POST /api/auth/otp/request` - Request OTP
- `POST /api/auth/otp/verify` - Verify OTP and login/register
- `POST /api/auth/register` - Register with email/password
- `POST /api/auth/login` - Login with email/password
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout (revoke refresh token)
- `POST /api/auth/logout-all` - Logout from all devices

### User Management
- `GET /api/users/me` - Get current user profile
- `PUT /api/users/me` - Update profile
- `PUT /api/users/change-password` - Change password
- `DELETE /api/users/me` - Delete account

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Set up PostgreSQL database:**
   ```bash
   createdb auth_db
   npm run db:setup
   ```

4. **Run in development:**
   ```bash
   npm run dev
   ```

5. **Run in production:**
   ```bash
   npm start
   ```

## Environment Variables

See `.env.example` for all required variables.

## Database Schema

The service uses PostgreSQL with the following tables:
- `users` - User accounts
- `otps` - One-time passwords
- `refresh_tokens` - JWT refresh tokens
- `password_reset_tokens` - Password reset tokens

## AWS Deployment

Ready for deployment to:
- AWS Lambda (serverless)
- AWS ECS/Fargate (containerized)
- EC2 instances

## Next Steps

- Integrate SMS provider (AWS SNS/Twilio)
- Add rate limiting
- Add email verification
- Add social login (Google, Facebook)
