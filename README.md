# Navigator2
Remake of Navigator

## Configuration

### Authentication

Navigator2 uses username-based authentication with pre-defined users only. User registration is disabled.

#### Setting Up Users

Users must be defined in the backend `.env` file using the `NAVIGATOR_PRESET_USERS` environment variable. See `.env.example` for the format.

Requirements:
- **Username**: At least 3 characters, alphanumeric with hyphens and underscores allowed
- **Password**: At least 8 characters
- **Email**: Optional
- **Display Name**: Optional

Example:
```bash
NAVIGATOR_PRESET_USERS='[{"username":"admin","password":"password123","displayName":"Admin User"}]'
```

#### JWT Secret

Set a secure secret for JWT token signing:
```bash
NAVIGATOR_SECRET=your-secure-secret-here
```
