# QuickBite Frontend

React-based frontend for the QuickBite ordering platform with Material-UI.

## Features

- ✅ Email/Password Authentication
- ✅ OTP-based Authentication (Phone)
- ✅ User Profile Management
- ✅ Protected Routes
- ✅ JWT Token Management (Access + Refresh)
- ✅ Responsive Design (Material-UI)
- ✅ Context API for State Management

## Tech Stack

- React 18
- Material-UI (MUI)
- React Router v6
- Axios for API calls
- Context API for auth state

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set your API URL:
   ```
   REACT_APP_API_URL=http://localhost:3001/api
   ```

3. **Run development server:**
   ```bash
   npm start
   ```
   App will open at `http://localhost:3000`

4. **Build for production:**
   ```bash
   npm run build
   ```

## Pages

- `/login` - Login page (email/password or OTP)
- `/register` - Registration page (email/password or OTP)
- `/profile` - User profile (protected)
- `/` - Redirects to profile

## Authentication Flow

### Email/Password
1. User enters email and password
2. Backend validates credentials
3. Returns access token + refresh token
4. Tokens stored in localStorage
5. Access token used for API requests

### OTP
1. User enters phone number
2. Backend sends OTP via SMS
3. User enters OTP
4. Backend verifies OTP
5. Returns access token + refresh token

## Deployment

### GitHub Pages
```bash
npm run build
# Deploy build/ folder to GitHub Pages
```

### AWS S3 + CloudFront
```bash
npm run build
aws s3 sync build/ s3://your-bucket-name
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

## Environment Variables

- `REACT_APP_API_URL` - Backend API URL (default: http://localhost:3001/api)

## Next Steps

- Add store browsing page
- Add menu/catalog page
- Add cart functionality
- Add checkout page
- Add order tracking
- Add real-time updates (Socket.io)
