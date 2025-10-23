# Hybrid Setup: Static Landing + React App

## Structure

```
frontend/
├── public/
│   ├── index.html              # React app entry point
│   ├── pages/
│   │   └── index.html          # Your static landing page
│   └── manifest.json
├── src/
│   ├── components/
│   │   ├── LandingPage.js      # Redirects to /pages/index.html
│   │   ├── Login.js            # React login form
│   │   ├── Register.js         # React registration form
│   │   └── Profile.js          # User profile dashboard
│   ├── context/
│   │   └── AuthContext.js      # Authentication state
│   ├── App.js                  # Main routing
│   └── index.js                # React entry point
```

## How It Works

### Route Configuration:
- `/` → Your static landing page (`/pages/index.html`)
- `/login` → React Login component
- `/register` → React Register component
- `/profile` → React Profile (protected route)
- `/dashboard` → Redirects to /profile

### Integration Steps:

#### 1. Update Your Static HTML Login Buttons

In `public/pages/index.html`, find login/signup buttons and change them to:

```html
<!-- Example login button -->
<a href="/login" class="btn btn-primary">Sign In</a>

<!-- Example signup button -->
<a href="/register" class="btn btn-primary">Get Started</a>
```

#### 2. Or Add JavaScript Redirects

Add this script at the end of `public/pages/index.html`:

```html
<script>
  // Redirect to React app for auth flows
  document.addEventListener('DOMContentLoaded', () => {
    const loginBtns = document.querySelectorAll('.login-btn, #loginBtn, [data-action="login"]');
    const signupBtns = document.querySelectorAll('.signup-btn, #signupBtn, [data-action="signup"]');
    
    loginBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = '/login';
      });
    });
    
    signupBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = '/register';
      });
    });
  });
</script>
```

#### 3. Start the App

```powershell
cd C:\Users\DELL\source\repos\lokeshmudiraj96-ux.github.io\quickbite-backend\frontend
npm start
```

When prompted about port 3000 being in use, type `y` to use another port.

## User Flow:

1. **Landing** → User visits `/` → Sees your static landing page
2. **Browse** → User explores stores, menu (static HTML)
3. **Login** → User clicks "Sign In" → Goes to `/login` (React)
4. **Auth** → User logs in → Gets JWT tokens
5. **Dashboard** → Redirected to `/profile` (React)
6. **Order** → User places orders (will integrate with backend APIs)

## Benefits:

✅ Beautiful static landing page (SEO-friendly, fast load)
✅ React app for authentication (secure, state management)
✅ Easy to add more React features (cart, checkout, order tracking)
✅ Both work together seamlessly

## Next Steps:

1. **Test locally** - Run `npm start` in frontend directory
2. **Update static HTML** - Add login/signup button links
3. **Connect to backend** - Auth service should be running on port 3001
4. **Deploy** - Deploy static HTML + React build to GitHub Pages or AWS
