# Navigator2 Self-Hosting Guide

This guide will help you deploy Navigator2 on your own server using Docker and nginx as a reverse proxy.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [SSL/HTTPS Setup](#sslhttps-setup)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)
- [Maintenance](#maintenance)

## Prerequisites

Before you begin, ensure you have the following installed on your server:

- **Docker** (20.10 or higher): [Installation Guide](https://docs.docker.com/engine/install/)
- **Docker Compose** (2.0 or higher): Usually comes with Docker Desktop
- **Git**: To clone the repository
- (Optional) **Domain name**: For production deployment with SSL

Minimum server requirements:
- 2 CPU cores
- 2GB RAM
- 10GB disk space
- Ubuntu 20.04+ or similar Linux distribution

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/Navigator2.git
cd Navigator2
```

### 2. Configure Environment Variables

Copy the production environment template:

```bash
cp .env.production .env
```

Edit the `.env` file and update the following **required** variables:

```bash
# Generate a secure secret (run this command):
# openssl rand -hex 32
NAVIGATOR_SECRET=your-secure-random-string-here

# Update with your user credentials
NAVIGATOR_PRESET_USERS='[{"username":"admin","password":"your-secure-password","displayName":"Administrator"}]'

# For local testing, keep these as is:
VITE_SIGNALING_SERVER_URL=ws://localhost/signaling
VITE_SOCKET_SERVER_URL=http://localhost
```

### 3. Build and Start Services

```bash
docker-compose up -d
```

This will:
1. Build the backend Node.js application
2. Build the frontend React application
3. Start nginx as a reverse proxy
4. Set up networking between services

### 4. Verify Deployment

Check that all services are running:

```bash
docker-compose ps
```

You should see both `navigator-backend` and `navigator-frontend` with status "Up".

Test the health endpoint:

```bash
curl http://localhost/health
```

Access the application in your browser:
```
http://localhost
```

## Configuration

### Environment Variables

#### Backend Variables (Required)

| Variable | Description | Example |
|----------|-------------|---------|
| `NAVIGATOR_SECRET` | JWT signing secret (MUST be changed!) | `a1b2c3d4e5f6...` |
| `NAVIGATOR_PRESET_USERS` | JSON array of users | See below |
| `PORT` | Backend port (default: 4000) | `4000` |

#### NAVIGATOR_PRESET_USERS Format

```json
[
  {
    "username": "admin",
    "password": "SecurePassword123!",
    "displayName": "Administrator",
    "email": "admin@example.com"
  },
  {
    "username": "facilitator1",
    "password": "SecurePassword123!",
    "displayName": "Facilitator One"
  }
]
```

**Important**:
- Username: minimum 3 characters, alphanumeric with `-` and `_`
- Password: minimum 8 characters
- Use strong passwords in production!

#### Frontend Variables (for production with domain)

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_SIGNALING_SERVER_URL` | WebSocket signaling URL | `wss://yourdomain.com/signaling` |
| `VITE_SOCKET_SERVER_URL` | HTTP server URL | `https://yourdomain.com` |

### Port Configuration

By default, the application uses:
- **Port 80**: HTTP traffic (nginx)
- **Port 443**: HTTPS traffic (nginx, if SSL is configured)
- **Port 4000**: Backend (internal, not exposed to internet)

To change the exposed ports, edit `docker-compose.yml`:

```yaml
services:
  frontend:
    ports:
      - "8080:80"  # Map host port 8080 to container port 80
```

## SSL/HTTPS Setup

For production deployment, you should use HTTPS with SSL certificates.

### Option 1: Using Let's Encrypt (Recommended)

1. **Install Certbot** on your host machine:

```bash
sudo apt-get update
sudo apt-get install certbot
```

2. **Generate SSL certificates**:

```bash
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com
```

3. **Create SSL directory** in your Navigator2 folder:

```bash
mkdir -p ssl
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ssl/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ssl/key.pem
sudo chown $USER:$USER ssl/*.pem
```

4. **Update nginx configuration** (`nginx/nginx.conf`):

Add the following server block for HTTPS:

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # ... rest of your location blocks ...
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

5. **Update docker-compose.yml** to mount SSL certificates:

Uncomment the SSL volume mounts in `docker-compose.yml`:

```yaml
services:
  frontend:
    volumes:
      - ./ssl/cert.pem:/etc/nginx/ssl/cert.pem:ro
      - ./ssl/key.pem:/etc/nginx/ssl/key.pem:ro
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
```

6. **Update environment variables** for HTTPS:

Edit `.env`:

```bash
VITE_SIGNALING_SERVER_URL=wss://yourdomain.com/signaling
VITE_SOCKET_SERVER_URL=https://yourdomain.com
```

7. **Rebuild and restart**:

```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Option 2: Using Self-Signed Certificates (Development)

For testing HTTPS locally:

```bash
mkdir -p ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/key.pem \
  -out ssl/cert.pem \
  -subj "/CN=localhost"
```

Then follow steps 4-7 above, using `localhost` instead of your domain.

### Certificate Renewal

Let's Encrypt certificates expire after 90 days. Set up automatic renewal:

```bash
# Test renewal
sudo certbot renew --dry-run

# Add cron job for automatic renewal
sudo crontab -e

# Add this line to renew certificates twice daily
0 0,12 * * * certbot renew --quiet && docker-compose restart frontend
```

## Production Deployment

### 1. Server Setup

Update your server's firewall to allow HTTP/HTTPS traffic:

```bash
# Ubuntu/Debian with ufw
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Or with iptables
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
```

### 2. DNS Configuration

Point your domain to your server's IP address:

```
A Record: yourdomain.com → your.server.ip.address
A Record: www.yourdomain.com → your.server.ip.address
```

### 3. Production Environment

Ensure your `.env` file has:
- Strong, unique `NAVIGATOR_SECRET`
- Strong passwords for all users
- HTTPS URLs for `VITE_SIGNALING_SERVER_URL` and `VITE_SOCKET_SERVER_URL`

### 4. Build for Production

```bash
# Pull latest code
git pull origin main

# Rebuild with production settings
docker-compose build --no-cache

# Start services
docker-compose up -d
```

### 5. Enable Auto-Start on Reboot

```bash
# Docker services will restart automatically with docker-compose restart policy
# Ensure Docker starts on boot:
sudo systemctl enable docker
```

## Troubleshooting

### Services Won't Start

Check logs:
```bash
docker-compose logs -f
docker-compose logs backend
docker-compose logs frontend
```

### WebSocket Connection Failed

1. **Check if backend is reachable**:
```bash
curl http://localhost/health
```

2. **Verify WebSocket URL** in browser console (should match your domain)

3. **For HTTPS, ensure WSS protocol** (`wss://` not `ws://`)

4. **Check nginx WebSocket configuration** - ensure `Upgrade` and `Connection` headers are set

### Backend Health Check Failing

```bash
# Check backend logs
docker-compose logs backend

# Test health endpoint directly
docker-compose exec backend wget -O- http://localhost:4000/health
```

### Permission Denied Errors

If you see permission errors with SSL certificates:

```bash
sudo chown -R $USER:$USER ssl/
chmod 600 ssl/key.pem
chmod 644 ssl/cert.pem
```

### Port Already in Use

If port 80 or 443 is already in use:

```bash
# Find what's using the port
sudo lsof -i :80
sudo lsof -i :443

# Stop the conflicting service (e.g., Apache)
sudo systemctl stop apache2
sudo systemctl disable apache2
```

### Frontend Not Loading

1. **Check if static files were built**:
```bash
docker-compose exec frontend ls -la /usr/share/nginx/html
```

2. **Verify nginx is serving files**:
```bash
curl -I http://localhost/
```

3. **Rebuild frontend**:
```bash
docker-compose build --no-cache frontend
docker-compose up -d frontend
```

### Database of Users Not Working

The application uses in-memory user storage. Users are loaded from `NAVIGATOR_PRESET_USERS` on startup. If users aren't working:

1. **Verify .env file is loaded**:
```bash
docker-compose exec backend printenv | grep NAVIGATOR
```

2. **Check user JSON format** in `.env` (must be valid JSON)

3. **Restart backend**:
```bash
docker-compose restart backend
```

## Maintenance

### Viewing Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend

# Last 100 lines
docker-compose logs --tail=100
```

### Updating the Application

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Backing Up Configuration

```bash
# Backup environment and SSL certificates
tar -czf navigator-backup-$(date +%Y%m%d).tar.gz .env ssl/
```

### Monitoring Resources

```bash
# Check container resource usage
docker stats

# Check disk usage
docker system df
```

### Cleaning Up

```bash
# Remove stopped containers
docker-compose down

# Remove unused images and volumes
docker system prune -a
```

### Health Monitoring

Set up a monitoring service to check your `/health` endpoint:

```bash
# Example with curl in a cron job
*/5 * * * * curl -f http://localhost/health || docker-compose restart
```

## Security Best Practices

1. **Use strong, unique passwords** for all users
2. **Change the default NAVIGATOR_SECRET** to a cryptographically secure random string
3. **Always use HTTPS in production** (Let's Encrypt is free!)
4. **Keep Docker and system packages updated**:
   ```bash
   sudo apt-get update && sudo apt-get upgrade
   docker-compose pull
   ```
5. **Restrict SSH access** with key-based authentication
6. **Use a firewall** to only allow necessary ports
7. **Regular backups** of your configuration
8. **Monitor logs** for suspicious activity

## Support

For issues and questions:
- Check the [Troubleshooting](#troubleshooting) section
- Review Docker logs: `docker-compose logs`
- Check the main [README.md](README.md) for application documentation
- Open an issue on GitHub

## License

See [LICENSE](LICENSE) file for details.
