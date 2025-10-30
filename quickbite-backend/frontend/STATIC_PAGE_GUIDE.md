# Static Landing Page - Quick Start Guide

## Overview

The static HTML landing page (`src/pages/index.html`) is a production-ready, fully responsive marketing page that can be served independently or integrated into the React application.

## Features

- ✅ **Professional Design System** - CSS custom properties with consistent spacing, colors, and typography
- ✅ **Location Detection** - Browser geolocation + IP fallback with Nominatim integration
- ✅ **Restaurant Grid** - Mock data with filters, ratings, and delivery info
- ✅ **Responsive Design** - Mobile-first with breakpoints at 768px, 1024px, 1200px
- ✅ **Bottom Navigation** - Mobile-optimized navigation bar
- ✅ **Hero Section** - Gradient background with search functionality
- ✅ **Stats Section** - Key metrics display
- ✅ **Categories** - Food category cards with hover effects
- ✅ **Features Section** - Platform benefits showcase
- ✅ **Footer** - Comprehensive site links

## Serving the Static Page

### Option 1: Direct File Access (Development)

Simply open the file in a browser:
```
file:///C:/Users/DELL/source/repos/lokeshmudiraj96-ux.github.io/quickbite-backend/frontend/src/pages/index.html
```

### Option 2: HTTP Server (Recommended)

Using Python:
```powershell
cd quickbite-backend/frontend/src/pages
python -m http.server 8080
# Access at http://localhost:8080/index.html
```

Using Node.js `http-server`:
```powershell
npx http-server src/pages -p 8080
# Access at http://localhost:8080/index.html
```

Using live-server (with auto-reload):
```powershell
npx live-server src/pages --port=8080
```

### Option 3: Integration with React App

Add a route in the React app to serve the static page:

**Method A: IFrame Integration**
```javascript
// src/pages/StaticLanding.js
import React from 'react';

const StaticLanding = () => {
  return (
    <iframe
      src="/static/index.html"
      style={{ width: '100%', height: '100vh', border: 'none' }}
      title="QuickBite Landing Page"
    />
  );
};

export default StaticLanding;
```

**Method B: Copy to Public Folder**
```powershell
# Copy static page to public folder
Copy-Item src/pages/index.html public/landing.html
Copy-Item src/pages/location-detector.js public/location-detector.js

# Access at http://localhost:3000/landing.html
```

## Location Detection Component

The landing page includes a sophisticated location detection system:

### Features
- Browser geolocation API with permission handling
- IP-based location fallback using IP-API.com
- Address search with Nominatim (OpenStreetMap)
- Autocomplete suggestions
- Error handling and user feedback

### Usage
Click the "Select location" button in the header to:
1. **Use My Location** - Browser geolocation (requires HTTPS in production)
2. **Detect by IP** - Automatic location detection via IP address
3. **Search** - Type address or city for autocomplete suggestions

### Customization
Edit `location-detector.js` to:
- Change geocoding provider (currently Nominatim)
- Add Google Maps integration
- Customize UI feedback messages
- Add location persistence to localStorage

## Restaurant Grid

The page generates 12 mock restaurants with:
- Random ratings (4.0-5.0)
- Varied cuisines (North Indian, Chinese, Italian, etc.)
- Delivery time estimates (15-55 mins)
- Price ranges (₹200-1000 for two)
- Distance calculation (1-6 km)
- Promotional offers (random)

### Making It Dynamic

Replace mock data with API calls:

```javascript
// In the QuickBiteApp.loadRestaurants() method:
async loadRestaurants() {
  this.state.isLoading = true;
  try {
    const response = await fetch('http://localhost:3003/api/catalog/merchants?lat=12.9716&lng=77.5946');
    const data = await response.json();
    this.state.restaurants = data.merchants || [];
  } catch (error) {
    console.error('Failed to load restaurants:', error);
    this.state.restaurants = this.generateMockRestaurants(12); // Fallback
  } finally {
    this.state.isLoading = false;
  }
}
```

## Mobile Responsiveness

### Breakpoints
- **Mobile**: < 768px
  - Bottom navigation visible
  - Single column restaurant grid
  - Simplified header
  - Stacked search bar

- **Tablet**: 768px - 1024px
  - 2-column restaurant grid
  - Full header visible
  - Desktop navigation

- **Desktop**: > 1024px
  - 3-4 column restaurant grid
  - Full feature set
  - Hover effects enabled

### Testing Responsive Design
```javascript
// Chrome DevTools
// Right-click → Inspect → Toggle device toolbar
// Test on: iPhone 12, iPad, Desktop
```

## Deployment

### Static Hosting (GitHub Pages, Netlify, Vercel)

```powershell
# GitHub Pages
# 1. Copy to root or docs folder
Copy-Item src/pages/index.html ./index.html
git add index.html
git commit -m "Add landing page"
git push

# 2. Enable GitHub Pages in repo settings
# Access at https://lokeshmudiraj96-ux.github.io/
```

### Azure Static Web Apps

```yaml
# staticwebapp.config.json
{
  "routes": [
    {
      "route": "/",
      "serve": "/index.html"
    }
  ]
}
```

### Custom Domain

Update CORS in backend services:
```javascript
// In each service's server.js
app.use(cors({ 
  origin: ['http://localhost:3000', 'https://yourdomain.com'],
  credentials: true 
}));
```

## Performance Optimization

### Images
The page uses Unsplash placeholder images. For production:

```javascript
// Replace with optimized images
const optimizedImage = `https://your-cdn.com/restaurants/${restaurant.id}.webp`;
```

### Lazy Loading
Images already use `loading="lazy"` attribute for better performance.

### PWA Support
The page includes Service Worker registration:

```javascript
// Create sw.js in public/
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('quickbite-v1').then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
        '/location-detector.js'
      ]);
    })
  );
});
```

## SEO Optimization

Add to `<head>`:
```html
<!-- Open Graph -->
<meta property="og:title" content="QuickBite - Food Delivery Platform" />
<meta property="og:description" content="Order from 50,000+ restaurants. Fast delivery to your doorstep." />
<meta property="og:image" content="https://your-domain.com/og-image.jpg" />
<meta property="og:url" content="https://your-domain.com" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="QuickBite - Food Delivery" />
<meta name="twitter:description" content="Order food online from top restaurants" />

<!-- Favicon -->
<link rel="icon" type="image/png" href="/favicon.png" />
```

## Analytics Integration

Add Google Analytics:
```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

## Accessibility

The page includes:
- ✅ Semantic HTML5 elements
- ✅ ARIA labels on interactive elements
- ✅ Keyboard navigation support
- ✅ Color contrast ratios meeting WCAG AA

### Testing Accessibility
- Use Chrome Lighthouse audit
- Test with screen readers (NVDA, JAWS)
- Keyboard-only navigation test

## Customization Guide

### Colors
Edit CSS variables in `<style>`:
```css
:root {
  --primary-500: #fc8019; /* Your brand color */
  --success: #48c479;
  --gray-900: #212121;
}
```

### Typography
```css
:root {
  --font-family: 'Your Font', -apple-system, BlinkMacSystemFont, sans-serif;
  --text-base: 1rem;
}
```

### Logo
Replace the icon with your logo:
```html
<a href="#" class="logo">
  <img src="/logo.svg" alt="QuickBite" class="logo-icon" />
  QuickBite
</a>
```

## Integration with Backend

### Connect to Real Catalog API

Update the fetch calls:
```javascript
// Load real merchant data
const CATALOG_API = 'http://localhost:3003/api/catalog';

async loadRestaurants() {
  const location = this.state.location;
  const url = `${CATALOG_API}/merchants?lat=${location.lat}&lng=${location.lng}&limit=20`;
  
  const response = await fetch(url);
  const data = await response.json();
  this.state.restaurants = data.merchants;
  this.renderRestaurants();
}
```

### Add Authentication

```javascript
// Store token from login
localStorage.setItem('quickbite_token', token);

// Include in API requests
const headers = {
  'Authorization': `Bearer ${localStorage.getItem('quickbite_token')}`
};
```

## Troubleshooting

### Location Detection Not Working
- **HTTPS Required**: Browser geolocation requires HTTPS (except localhost)
- **Permissions**: User must grant location permission
- **Fallback**: IP-based detection works without permissions

### Images Not Loading
- **CORS**: Unsplash images work cross-origin
- **Ad Blockers**: May block external images
- **Fallback**: Use placeholder divs with background colors

### Performance Issues
- **Too Many Images**: Use lazy loading (already implemented)
- **Large Files**: Optimize images (use WebP, compress)
- **Slow API**: Add loading skeletons and error states

## Next Steps

1. **Test the static page**:
   ```powershell
   npx live-server src/pages --port=8080
   ```

2. **Customize branding** (colors, logo, content)

3. **Connect to real APIs** (replace mock data)

4. **Deploy to GitHub Pages** or hosting platform

5. **Add analytics** and SEO metadata

6. **Test responsive design** on multiple devices

7. **Set up custom domain** and SSL certificate

## Resources

- **Design System**: All CSS variables in `:root`
- **Icons**: Font Awesome CDN (already included)
- **Location API**: Nominatim OpenStreetMap
- **Images**: Unsplash (replace with your CDN)

---

**Access the page now:**
```powershell
npx live-server src/pages --port=8080
```

Then open: http://localhost:8080/index.html
