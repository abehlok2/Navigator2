# Tailscale + Nginx Setup Guide for WSL Servers

This guide explains how to expose your Navigator2 application running in WSL (Windows Subsystem for Linux) to the public internet using Tailscale VPN tunneling and Nginx reverse proxy.

## Architecture Overview

```
┌─────────────────────────┐
│   Public Internet       │
│   (Users)               │
└──────────┬──────────────┘
           │
           │ HTTPS/HTTP
           ▼
┌──────────────────────────┐
│  Public Server           │
│  (Nginx Reverse Proxy)   │
│  Port 80/443             │
└──────────┬───────────────┘
           │
           │ Tailscale VPN Tunnel
           │ (Encrypted)
           ▼
┌──────────────────────────┐
│  WSL Environment         │
│  ┌────────────────────┐  │
│  │ Backend (Node.js)  │  │
│  │ Port 4000          │  │
│  └────────────────────┘  │
│  ┌────────────────────┐  │
│  │ Frontend (Optional)│  │
│  │ Port 5173/80       │  │
│  └────────────────────┘  │
└──────────────────────────┘
```

## Why Tailscale?

- **Secure**: End-to-end encrypted VPN tunnel
- **Easy**: No port forwarding or firewall configuration
- **Fast**: Direct peer-to-peer connections when possible
- **Reliable**: Automatic failover and reconnection
- **Free**: For personal use (up to 100 devices)

## Prerequisites

- WSL2 running on Windows
- A public-facing server (VPS, cloud instance, or home server with public IP)
- Domain name (optional but recommended)
- Tailscale account (free at https://tailscale.com)

## Step 1: Install Tailscale in WSL

### 1.1 Install Tailscale in WSL

Open your WSL terminal and run:

```bash
# Download and install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Start Tailscale service
sudo tailscale up

# Optional: Enable MagicDNS for easier hostname resolution
sudo tailscale up --accept-dns
```

### 1.2 Authenticate and Connect

The `tailscale up` command will provide a URL. Open it in your browser to authenticate and connect your WSL instance to your Tailnet.

### 1.3 Get Your WSL Tailscale IP

```bash
# Get IPv4 address
tailscale ip -4

# Example output: 100.123.45.67
```

**Save this IP address** - you'll need it for the nginx configuration.

### 1.4 Set a Hostname (Optional but Recommended)

```bash
# Give your WSL machine a friendly name
sudo tailscale up --hostname=navigator-wsl
```

## Step 2: Start Your Navigator2 Services in WSL

### Option A: Using Docker (Recommended)

```bash
cd /path/to/Navigator2

# Build and start services
docker-compose up -d

# Verify services are running
docker-compose ps
curl http://localhost:4000/health
```

### Option B: Running Natively

```bash
# Start backend
cd backend
npm install
npm run build
npm start  # Runs on port 4000

# Start frontend (in another terminal)
cd ..
npm install
npm run dev  # Runs on port 5173
```

### 2.1 Verify Services Are Accessible via Tailscale

From another machine on your Tailnet:

```bash
# Test backend health check
curl http://100.123.45.67:4000/health

# Test frontend (if running dev server)
curl http://100.123.45.67:5173
```

## Step 3: Install Tailscale on Public Server

On your public-facing server (the one running nginx):

```bash
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Connect to Tailnet
sudo tailscale up

# Verify connection
tailscale status
```

You should see your WSL machine in the list:

```
100.123.45.67   navigator-wsl        user@      linux   active
```

## Step 4: Configure Nginx on Public Server

### 4.1 Copy the Tailscale Nginx Configuration

Copy the `nginx-tailscale.conf` file to your server:

```bash
# On your local machine
scp nginx/nginx-tailscale.conf user@your-server:/etc/nginx/nginx.conf

# Or manually copy the contents
```

### 4.2 Update Configuration Variables

Edit `/etc/nginx/nginx.conf` and replace these placeholders:

#### Replace `100.x.x.x` with your WSL Tailscale IP:

```nginx
upstream wsl_backend {
    server 100.123.45.67:4000;  # Replace with your WSL IP
}

upstream wsl_frontend {
    server 100.123.45.67:5173;  # Replace with your WSL IP
}
```

#### Replace `YOUR_DOMAIN` with your actual domain:

```nginx
server {
    listen 80;
    server_name navigator.example.com;  # Your domain
    # ...
}
```

#### Optional: Use MagicDNS Hostname Instead of IP

If you enabled MagicDNS, you can use hostnames:

```nginx
upstream wsl_backend {
    server navigator-wsl.tailnet-name.ts.net:4000;
}
```

To find your tailnet name:

```bash
tailscale status --json | grep -o '"MagicDNSSuffix":"[^"]*"'
```

### 4.3 Test Nginx Configuration

```bash
# Test configuration syntax
sudo nginx -t

# If successful, you'll see:
# nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### 4.4 Start/Reload Nginx

```bash
# If nginx is not running
sudo systemctl start nginx

# If nginx is already running
sudo systemctl reload nginx

# Enable nginx to start on boot
sudo systemctl enable nginx
```

## Step 5: Configure Frontend Environment Variables

Update your frontend to use the public server URL:

### 5.1 Update `.env.production` in WSL

```bash
# On your WSL machine
cd /path/to/Navigator2

# Edit .env.production
cat > .env.production << EOF
VITE_SIGNALING_SERVER_URL=ws://navigator.example.com/signaling
VITE_SOCKET_SERVER_URL=http://navigator.example.com
EOF
```

### 5.2 Rebuild Frontend (if serving static files from nginx)

```bash
# Build frontend with production environment
npm run build

# Copy built files to public server
scp -r dist/* user@your-server:/usr/share/nginx/html/
```

## Step 6: Set Up Firewall (Public Server)

Ensure your public server allows HTTP/HTTPS traffic:

```bash
# Ubuntu/Debian with ufw
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# CentOS/RHEL with firewalld
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

## Step 7: Test the Setup

### 7.1 Test from Public Internet

Open your browser and navigate to:

- `http://your-domain.com` - Should show the frontend
- `http://your-domain.com/health` - Should return health status
- `http://your-domain.com/api/` - Should proxy to backend API

### 7.2 Test WebSocket Connection

Open browser console on the frontend and check:

```javascript
// Should successfully connect
new WebSocket('ws://your-domain.com/signaling')
```

### 7.3 Verify Tailscale Tunnel

On the public server, check nginx logs to confirm traffic is flowing:

```bash
# Watch access logs
sudo tail -f /var/log/nginx/access.log

# Watch error logs
sudo tail -f /var/log/nginx/error.log
```

## Step 8: Set Up HTTPS (Recommended)

### Option A: Let's Encrypt with Certbot

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d navigator.example.com

# Test auto-renewal
sudo certbot renew --dry-run
```

### Option B: Tailscale HTTPS Certificates

Tailscale can provision HTTPS certificates for your Tailnet:

```bash
# On public server
sudo tailscale cert your-server.tailnet-name.ts.net
```

Then update nginx configuration to use the certificates:

```nginx
ssl_certificate /var/lib/tailscale/certs/your-server.tailnet-name.ts.net.crt;
ssl_certificate_key /var/lib/tailscale/certs/your-server.tailnet-name.ts.net.key;
```

## Troubleshooting

### Issue: Cannot connect to WSL backend from public server

**Solution:**

1. Verify Tailscale is running in WSL:
   ```bash
   sudo tailscale status
   ```

2. Check if backend is accessible via Tailscale:
   ```bash
   # From public server
   curl http://100.123.45.67:4000/health
   ```

3. Ensure WSL firewall allows connections:
   ```bash
   # In WSL
   sudo ufw allow from 100.0.0.0/8 to any port 4000
   ```

### Issue: WebSocket connections fail

**Solution:**

1. Check nginx error logs:
   ```bash
   sudo tail -f /var/log/nginx/error.log
   ```

2. Verify WebSocket upgrade headers are set correctly in nginx config

3. Test WebSocket directly from public server:
   ```bash
   wscat -c ws://100.123.45.67:4000/signaling
   ```

### Issue: Tailscale connection drops

**Solution:**

1. Enable IP forwarding (if using subnet routes):
   ```bash
   echo 'net.ipv4.ip_forward = 1' | sudo tee -a /etc/sysctl.conf
   sudo sysctl -p
   ```

2. Keep Tailscale connection alive:
   ```bash
   sudo tailscale up --accept-routes --advertise-exit-node
   ```

3. Check Tailscale logs:
   ```bash
   sudo journalctl -u tailscaled -f
   ```

### Issue: High latency through Tailscale

**Solution:**

1. Check if using direct connection:
   ```bash
   tailscale ping 100.123.45.67
   ```

2. Enable DERP map for better routing:
   ```bash
   sudo tailscale up --accept-routes
   ```

3. Consider placing nginx on the same machine as backend (in WSL)

### Issue: WSL services not accessible after Windows restart

**Solution:**

Create a startup script to auto-start Tailscale and services:

```bash
# Create startup script
cat > ~/start-navigator.sh << 'EOF'
#!/bin/bash
sudo tailscale up
cd /path/to/Navigator2
docker-compose up -d
EOF

chmod +x ~/start-navigator.sh

# Add to Windows Task Scheduler to run on login
```

## Security Considerations

1. **Tailscale ACLs**: Restrict which devices can access your WSL backend:
   ```json
   // In Tailscale admin console > Access Controls
   {
     "acls": [
       {
         "action": "accept",
         "src": ["tag:webserver"],
         "dst": ["tag:backend:4000"]
       }
     ]
   }
   ```

2. **Nginx Rate Limiting**: Add rate limiting to prevent abuse:
   ```nginx
   limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

   location /api/ {
       limit_req zone=api burst=20;
       # ... rest of config
   }
   ```

3. **Backend Authentication**: Ensure JWT tokens are properly validated

4. **HTTPS Only**: Always use HTTPS in production

## Monitoring

### Monitor Tailscale Connection

```bash
# Check connection status
tailscale status

# Monitor traffic
sudo tailscale netcheck

# View logs
sudo journalctl -u tailscaled -f
```

### Monitor Nginx Performance

```bash
# Install monitoring tools
sudo apt install nginx-module-vts

# Or use logs
sudo tail -f /var/log/nginx/access.log | grep -E "GET|POST"
```

### Monitor Backend Health

Set up a cron job to check backend health:

```bash
# Add to crontab
*/5 * * * * curl -f http://100.123.45.67:4000/health || echo "Backend down!" | mail -s "Backend Alert" you@example.com
```

## Alternative: Tailscale Funnel (Beta)

Tailscale Funnel allows you to expose services directly without nginx:

```bash
# In WSL
cd /path/to/Navigator2
sudo tailscale funnel 4000
```

This creates a public HTTPS endpoint like `https://navigator-wsl.tailnet-name.ts.net`

**Note**: Funnel is currently in beta and has limitations.

## Resources

- [Tailscale Documentation](https://tailscale.com/kb/)
- [Nginx Reverse Proxy Guide](https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/)
- [Tailscale ACL Documentation](https://tailscale.com/kb/1018/acls)
- [Let's Encrypt Certbot](https://certbot.eff.org/)

## Support

For issues related to:
- **Navigator2 Application**: See main README.md
- **Tailscale**: https://tailscale.com/contact/support
- **Nginx**: https://nginx.org/en/docs/

---

**Last Updated**: 2025-10-27
