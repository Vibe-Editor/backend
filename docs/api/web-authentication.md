# Web Authentication Setup

This document explains how to use the new web-specific Google authentication endpoints that work with your frontend application.

## New Endpoints

### 1. Web Google Login Initiation

- **URL**: `GET /auth/web-google`
- **Purpose**: Initiates Google OAuth flow for web applications
- **Usage**: Redirect users to this endpoint to start authentication

### 2. Web Google Callback

- **URL**: `GET /auth/web-google-redirect`
- **Purpose**: Handles the Google OAuth callback and redirects to frontend
- **Behavior**:
  - On success: Redirects to `${FRONTEND_URL}/auth/callback?token=JWT_TOKEN&user=USER_DATA`
  - On error: Redirects to `${FRONTEND_URL}/auth/error?message=ERROR_MESSAGE`

## Environment Variables Required

Add these to your `.env` file:

```env
# Backend URL (used for Google OAuth callback URL)
BACKEND_URL=https://your-backend-domain.com

# Frontend URL (where users will be redirected after authentication)
FRONTEND_URL=https://testingui-fza5haf8d-naval1525s-projects.vercel.app
```

## Google Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to APIs & Services > Credentials
3. Edit your OAuth 2.0 Client ID
4. Add these authorized redirect URIs:
   - `http://localhost:8080/auth/google-redirect` (for mobile app - existing)
   - `https://your-backend-domain.com/auth/web-google-redirect` (for web app - new)

## Frontend Integration

### Option 1: Direct Redirect

```javascript
// Redirect user to start authentication
window.location.href = 'https://your-backend-domain.com/auth/web-google';
```

### Option 2: Popup Window

```javascript
// Open authentication in popup
const authWindow = window.open(
  'https://your-backend-domain.com/auth/web-google',
  'auth',
  'width=500,height=600',
);

// Listen for the callback
window.addEventListener('message', (event) => {
  if (event.origin === 'https://your-backend-domain.com') {
    // Handle authentication result
    const { token, user } = event.data;
    authWindow.close();
  }
});
```

### Frontend Callback Handling

Create these routes in your frontend:

#### Success Callback: `/auth/callback`

```javascript
// Extract token and user from URL parameters
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');
const user = JSON.parse(decodeURIComponent(urlParams.get('user')));

// Store token in localStorage or your preferred storage
localStorage.setItem('authToken', token);
localStorage.setItem('user', JSON.stringify(user));

// Redirect to dashboard or desired page
window.location.href = '/dashboard';
```

#### Error Callback: `/auth/error`

```javascript
// Extract error message from URL parameters
const urlParams = new URLSearchParams(window.location.search);
const errorMessage = urlParams.get('message');

// Display error to user
alert('Authentication failed: ' + errorMessage);

// Redirect to login page
window.location.href = '/login';
```

## Benefits of This Approach

1. **No Breaking Changes**: Your existing mobile app authentication (`/auth/google` and `/auth/google-redirect`) continues to work unchanged
2. **Web-Friendly**: New endpoints redirect to your frontend instead of returning JSON
3. **Flexible**: You can customize the frontend redirect URLs via environment variables
4. **Secure**: Uses the same authentication logic and JWT tokens

## Testing

1. Set up your environment variables
2. Update your Google OAuth configuration
3. Deploy your backend with the new endpoints
4. Test the flow:
   - Navigate to `https://your-backend-domain.com/auth/web-google`
   - Complete Google authentication
   - Verify you're redirected to your frontend with token and user data

## Migration Notes

- The original endpoints (`/auth/google` and `/auth/google-redirect`) are unchanged
- Mobile apps will continue to work without any changes
- Web applications should use the new `/auth/web-google` endpoint
- Make sure to update your Google OAuth redirect URIs to include the new web callback URL
