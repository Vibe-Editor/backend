#### Authentication

- `GET /auth/google` - Initiate Google OAuth login flow
  - Redirects user to Google's authentication page
  - No parameters required

- `GET /auth/google-redirect` - Google OAuth callback endpoint
  - Handles OAuth callback from Google
  - Creates/finds user in database
  - Returns JWT token and user info
  - **Response:**

  ```json
  {
    "success": true,
    "message": "Authentication successful",
    "redirect_url": "myapp://auth-callback?token=...",
    "user": {
      "id": number,
      "email": string,
      "name": string,
      "avatar": string
    },
    "access_token": "jwt-token-here"
  }
  ```

- `GET /auth/status` - Check authentication status (🔒 Protected)
  - Requires: `Authorization: Bearer <jwt-token>` header
  - Returns current user information
  - **Response:**
  ```json
  {
    "success": true,
    "user": { "id": 1, "email": "user@example.com", "name": "User" },
    "message": "User is authenticated"
  }
  ```

#### Users

- `GET /users/profile` - Get current user profile (🔒 Protected)
  - **Requires**: JWT Authentication
  - **Returns**: Current user's profile information

- `GET /users/:id` - Get user by ID (🔒 Protected)
  - **Requires**: JWT Authentication
  - **Returns**: User information by ID

- `GET /users/email/:email` - Get user by email address (🔒 Protected)
  - **Requires**: JWT Authentication
  - **Returns**: User information by email
