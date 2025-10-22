# Navigator2

Navigator2 is a peer-to-peer audio collaboration application designed for facilitator-led sessions such as remote meditation, hypnosis, or guided experiences. It enables real-time voice communication with role-based access control and secure room management.

## Overview

This application provides:
- **WebRTC-based peer-to-peer audio streaming** for low-latency voice communication
- **Role-based access control**: Facilitators (session hosts) and Explorers/Listeners (participants)
- **Password-protected rooms** for secure sessions
- **WebSocket signaling server** for connection coordination
- **JWT authentication** with pre-defined user management

## Architecture

Navigator2 consists of two main components:

1. **Backend (Signaling Server)**: Node.js + WebSocket server for room management, authentication, and WebRTC signaling
2. **Frontend (Client App)**: React + Vite application for the user interface and WebRTC peer connections

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher recommended)
- **npm** (comes with Node.js)
- A modern web browser with WebRTC support (Chrome, Firefox, Edge, Safari)

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Navigator2
```

### 2. Install Dependencies

Install dependencies for both the frontend and backend:

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..
```

### 3. Configure Environment Variables

The backend requires a `.env` file with configuration settings.

#### Create the Backend .env File

Copy the example environment file:

```bash
cp .env.example backend/.env
```

#### Edit backend/.env

Open `backend/.env` and configure the following:

```bash
# REQUIRED: Secret key for JWT token signing (change in production!)
NAVIGATOR_SECRET=your-secure-random-secret-here

# REQUIRED: Pre-defined users (registration is disabled)
# Format: JSON array with username, password, displayName (optional), email (optional)
NAVIGATOR_PRESET_USERS='[{"username":"admin","password":"admin123456","displayName":"Administrator"},{"username":"facilitator1","password":"password123","displayName":"Facilitator One"},{"username":"explorer1","password":"password123","displayName":"Explorer User"}]'

# OPTIONAL: Server port (default: 4000)
PORT=4000
```

**Important Notes:**
- **NAVIGATOR_SECRET**: Use a strong, random secret for production deployments
- **NAVIGATOR_PRESET_USERS**: Define all users here; registration is disabled for security
- Username requirements: at least 3 characters, alphanumeric with hyphens/underscores
- Password requirements: at least 8 characters

#### Example User Configuration

```json
[
  {
    "username": "admin",
    "password": "securePassword123",
    "displayName": "Administrator"
  },
  {
    "username": "facilitator1",
    "password": "password123",
    "displayName": "Session Facilitator",
    "email": "facilitator@example.com"
  },
  {
    "username": "explorer1",
    "password": "password123",
    "displayName": "Explorer User"
  }
]
```

## Running Locally (Development)

For local development and testing on your machine:

### 1. Start the Backend Server

In one terminal window:

```bash
npm run backend
```

This will:
- Build the TypeScript backend code
- Start the signaling server on port 4000 (or your configured PORT)

You should see: `Navigator backend listening on port 4000`

### 2. Start the Frontend Development Server

In another terminal window:

```bash
npm run dev
```

This will:
- Start the Vite development server
- Open the application at `http://localhost:5173` (default Vite port)

### 3. Access the Application

Open your browser and navigate to:
```
http://localhost:5173
```

### 4. Login and Create/Join a Room

1. **Login**: Use one of the usernames/passwords configured in your `.env` file
2. **Create a Room** (Facilitator): Click "Create Room" and optionally set a password
3. **Join a Room** (Explorer): Enter the Room ID and password (if set) to join

## Hosting for External Users

To make your Navigator2 instance accessible to remote users over the internet:

### Option 1: Cloud Deployment (Recommended)

Deploy both frontend and backend to a cloud provider:

#### Backend Deployment

1. **Choose a hosting provider**:
   - DigitalOcean App Platform
   - Heroku
   - AWS EC2/Elastic Beanstalk
   - Google Cloud Run
   - Railway.app

2. **Deploy steps** (example for Railway):
   ```bash
   # Install Railway CLI
   npm install -g @railway/cli

   # Login and initialize
   railway login
   railway init

   # Deploy backend
   cd backend
   railway up
   ```

3. **Set environment variables** on your hosting platform:
   - `NAVIGATOR_SECRET`: Your secure secret
   - `NAVIGATOR_PRESET_USERS`: Your user configuration JSON
   - `PORT`: Usually auto-configured by the platform

4. **Note your backend URL**: e.g., `https://your-app.railway.app`

#### Frontend Deployment

1. **Update frontend configuration** to point to your backend:

   Create `src/config/environment.ts` (if not exists):
   ```typescript
   export const API_URL = 'https://your-backend-url.com';
   export const WS_URL = 'wss://your-backend-url.com/signaling';
   ```

2. **Build the frontend**:
   ```bash
   npm run build
   ```

3. **Deploy the `dist` folder** to:
   - Netlify
   - Vercel
   - GitHub Pages
   - Cloudflare Pages
   - AWS S3 + CloudFront

   Example for Netlify:
   ```bash
   # Install Netlify CLI
   npm install -g netlify-cli

   # Deploy
   netlify deploy --prod --dir=dist
   ```

### Option 2: Self-Hosted on Your Own Server

If you have a server with a public IP address:

#### 1. Server Requirements

- Ubuntu/Debian Linux (recommended) or similar OS
- Node.js v18+ installed
- A domain name (optional but recommended)
- Open ports 80, 443, and 4000 (or your chosen backend port)

#### 2. Install and Configure

```bash
# SSH into your server
ssh user@your-server-ip

# Clone the repository
git clone <repository-url>
cd Navigator2

# Install dependencies
npm install
cd backend && npm install && cd ..

# Configure environment variables
cp .env.example backend/.env
nano backend/.env  # Edit with your settings
```

#### 3. Run with Process Manager (PM2)

```bash
# Install PM2 globally
npm install -g pm2

# Start backend
cd backend
pm2 start npm --name "navigator-backend" -- start
cd ..

# Build frontend
npm run build

# Serve frontend with a static server
pm2 start npx --name "navigator-frontend" -- serve dist -p 3000
```

#### 4. Set Up Reverse Proxy (Nginx)

Create an Nginx configuration (`/etc/nginx/sites-available/navigator`):

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /auth {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket signaling
    location /signaling {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Enable the site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/navigator /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 5. Enable HTTPS with Let's Encrypt

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

#### 6. Configure Firewall

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 4000/tcp
sudo ufw enable
```

### Option 3: Local Network Hosting

To host on your local network and allow devices on the same network to connect:

#### 1. Find Your Local IP Address

**Linux/Mac:**
```bash
ip addr show  # or ifconfig
```

**Windows:**
```cmd
ipconfig
```

Look for your local IP (usually starts with `192.168.x.x` or `10.x.x.x`)

#### 2. Update Frontend Configuration

Edit your frontend code to use your local IP instead of localhost.

In `src/config/environment.ts` or similar:
```typescript
export const API_URL = 'http://192.168.1.100:4000';
export const WS_URL = 'ws://192.168.1.100:4000/signaling';
```

#### 3. Start Both Servers

```bash
# Terminal 1: Backend
npm run backend

# Terminal 2: Frontend
npm run dev -- --host
```

The `--host` flag allows Vite to be accessible from other devices on the network.

#### 4. Access from Other Devices

On other devices on the same network, navigate to:
```
http://192.168.1.100:5173
```
(Replace with your actual local IP)

### Port Forwarding for Internet Access

To make a local server accessible from the internet:

1. **Configure your router** to forward external port 80/443 to your server's local IP
2. **Find your public IP**: Visit https://whatismyipaddress.com
3. **Set up Dynamic DNS** (if your ISP assigns dynamic IPs):
   - Use services like No-IP, DuckDNS, or DynDNS
   - Configure your router to update the DDNS service

**Security Warning**: Exposing a local server to the internet has security risks. Ensure you:
- Use strong passwords in `NAVIGATOR_PRESET_USERS`
- Use HTTPS (via reverse proxy with Let's Encrypt)
- Keep your system and dependencies updated
- Consider using a VPN instead for trusted user access

## Joining Other Hosted Rooms

If someone else is hosting a Navigator2 instance:

### 1. Get Connection Details

Ask the host for:
- **Frontend URL**: The website address (e.g., `https://navigator.example.com`)
- **Login credentials**: A username and password (must be pre-configured by the host)
- **Room ID**: Provided by the facilitator after they create a room
- **Room password**: If the room is password-protected

### 2. Access the Application

Navigate to the provided frontend URL in your web browser.

### 3. Login

Enter your provided username and password on the login page.

### 4. Join the Room

1. On the home page, locate the "Join Room" section
2. Enter the **Room ID** provided by the facilitator
3. Enter the **Room Password** (if required)
4. Select your role:
   - **Explorer**: Active participant with microphone access
   - **Listener**: Passive participant (listen-only mode)
5. Click **Join Room**

### 5. Grant Permissions

When prompted by your browser:
- **Allow microphone access** (required for Explorer role)
- **Allow notifications** (optional, for session updates)

### 6. Session Controls

Once in the session:
- Your connection status is displayed in the top-right corner
- You can see all participants in the session
- Use **Leave Room** to exit the session when finished

## User Roles Explained

### Facilitator
- Creates and owns the room
- Has full control over the session
- Can see all participants
- Automatically assigned when creating a room

### Explorer
- Active participant with microphone access
- Can speak and listen in the session
- Selected when joining a room

### Listener
- Passive participant (listen-only)
- Can hear the session but cannot speak
- Selected when joining a room

## Troubleshooting

### Backend Won't Start

**Problem**: Error about `NAVIGATOR_PRESET_USERS`

**Solution**: Ensure your `backend/.env` file has valid JSON in the `NAVIGATOR_PRESET_USERS` variable. Check for:
- Proper JSON formatting (no trailing commas)
- All strings in double quotes
- Passwords are at least 8 characters
- Usernames are at least 3 characters

### Cannot Connect to WebSocket

**Problem**: "Connection failed" or WebSocket errors

**Solutions**:
1. Ensure backend is running (`npm run backend`)
2. Check backend is listening on the expected port
3. If hosting remotely, ensure WebSocket port is open in firewall
4. For HTTPS sites, ensure WebSocket uses WSS (secure WebSocket)

### Microphone Not Working

**Problem**: No audio transmission

**Solutions**:
1. Check browser permissions (allow microphone access)
2. Test microphone in browser settings
3. Try a different browser (Chrome/Firefox recommended)
4. Ensure you joined as "Explorer" not "Listener"

### Cannot Join Room

**Problem**: "Room not found" error

**Solutions**:
1. Verify the Room ID is correct (case-sensitive)
2. Ensure the facilitator has created the room and it's still active
3. Check that you're connected to the correct backend server

**Problem**: "Invalid room password" error

**Solution**: Verify the password with the facilitator (case-sensitive)

### Poor Audio Quality

**Solutions**:
1. Check your internet connection speed
2. Close bandwidth-intensive applications
3. Try moving closer to your WiFi router
4. Use wired ethernet instead of WiFi if possible

### Users Cannot Access My Hosted Instance

**Solutions**:
1. Verify firewall/security group rules allow traffic on required ports
2. Ensure backend server is running and accessible
3. Check that frontend is configured with correct backend URL
4. For self-hosted: verify port forwarding is configured correctly
5. Test from outside your network using a mobile device on cellular data

## Project Structure

```
Navigator2/
├── backend/              # Node.js signaling server
│   ├── src/
│   │   ├── index.ts     # Main server file
│   │   ├── users.ts     # User management
│   │   ├── rooms.ts     # Room management
│   │   ├── tokens.ts    # JWT token handling
│   │   └── health.ts    # Health check endpoint
│   └── package.json
├── src/                  # React frontend
│   ├── components/      # UI components
│   ├── features/        # WebRTC and feature logic
│   ├── pages/          # Application pages
│   ├── state/          # State management (Zustand)
│   ├── types/          # TypeScript definitions
│   └── App.tsx         # Main application component
├── .env.example         # Environment variables template
└── package.json         # Frontend dependencies
```

## Development

### Running Tests

```bash
# Frontend
npm test

# Backend
cd backend
npm test
```

### Building for Production

```bash
# Build frontend
npm run build

# Build backend
cd backend
npm run build
```

### Code Style

This project uses TypeScript for type safety. Ensure your code:
- Passes TypeScript compilation (`npm run build`)
- Follows existing code patterns
- Includes proper error handling

## Security Considerations

- **User registration is disabled**: Only pre-defined users can access the system
- **JWT authentication**: All API and WebSocket connections require valid tokens
- **Password-protected rooms**: Facilitators can set room passwords
- **HTTPS required for production**: Use SSL/TLS certificates for secure communication
- **Regular updates**: Keep Node.js and npm dependencies updated

## Advanced Configuration

### Custom Backend Port

Edit `backend/.env`:
```bash
PORT=8080
```

Update frontend configuration to match.

### WebRTC Configuration

For restrictive networks, you may need to configure TURN servers for WebRTC relay.

Edit the WebRTC configuration in `src/features/webrtc/` to add TURN servers:

```typescript
const rtcConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:your-turn-server.com:3478',
      username: 'user',
      credential: 'pass'
    }
  ]
};
```

## Support and Documentation

- **Backend API Documentation**: See `backend/API.md`
- **WebSocket Messages**: See `backend/MESSAGES.md`
- **Implementation Details**: See `Implementation_Plan.md`

## License

[Add your license information here]

## Contributing

[Add contribution guidelines here]
