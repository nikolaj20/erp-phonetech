# PhoneTech.sk ERP - Server

Backend API server for the PhoneTech.sk ERP system. Built with Node.js, Express, and PostgreSQL.

## Features

- **Authentication**: JWT-based authentication with role-based access control
- **Inventory Management**: Full CRUD for phones/devices with pricing and tracking
- **Parts Inventory**: Manage repair parts with stock levels
- **Service Tickets**: Create and track repair requests
- **Trade-In Requests**: Public form for device trade-ins
- **Financial Tracking**: Revenue, profit, and audit logs
- **Public API**: Track repairs and submit trade-ins without login

## API Endpoints

### Public (No Auth Required)
- `GET /api/public/track/:id` - Track repair status
- `POST /api/public/tradein` - Submit trade-in request
- `GET /api/public/tradein/:id` - Check trade-in status
- `GET /api/public/data` - Get form reference data

### Auth
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `GET /api/auth/users` - List users (master admin)
- `POST /api/auth/users` - Create user (master admin)
- `PUT /api/auth/users/:id` - Update user (master admin)
- `POST /api/auth/change-password` - Change own password

### Inventory
- `GET /api/inventory` - List all items
- `GET /api/inventory/stats` - Get statistics
- `GET /api/inventory/:id` - Get single item
- `POST /api/inventory` - Create item
- `PUT /api/inventory/:id` - Update item
- `POST /api/inventory/:id/sell` - Sell item
- `DELETE /api/inventory/:id` - Delete (master admin)

### Parts
- `GET /api/parts` - List all parts
- `GET /api/parts/stats` - Get statistics
- `POST /api/parts` - Add/update part
- `PUT /api/parts/:id` - Update part
- `POST /api/parts/bulk` - Bulk add from device

### Tickets
- `GET /api/tickets` - List all tickets
- `GET /api/tickets/stats` - Get statistics
- `GET /api/tickets/:id` - Get single ticket
- `POST /api/tickets` - Create ticket
- `PUT /api/tickets/:id/status` - Update status
- `POST /api/tickets/:id/notes` - Add note

### Trade-In
- `GET /api/tradein` - List requests
- `GET /api/tradein/stats` - Get statistics
- `GET /api/tradein/:id` - Get single request
- `PUT /api/tradein/:id/status` - Update status
- `PUT /api/tradein/:id/offer` - Send offer
- `POST /api/tradein/:id/notes` - Add note
- `POST /api/tradein/:id/to-inventory` - Add to inventory

### Finance
- `GET /api/finance/stats` - Financial statistics
- `GET /api/finance/revenue` - Revenue by period
- `GET /api/finance/transactions` - Transaction history
- `GET /api/finance/audit` - Audit log
- `GET /api/finance/audit/stats` - Audit statistics

---

## Deployment to Railway

### Step 1: Create Railway Account
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub

### Step 2: Create New Project
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Connect your GitHub account
4. Select this repository

### Step 3: Add PostgreSQL Database
1. In your Railway project, click "New"
2. Select "Database" → "Add PostgreSQL"
3. The `DATABASE_URL` environment variable will be automatically set

### Step 4: Set Environment Variables
In Railway project settings, add these variables:
```
JWT_SECRET=your-secure-random-string-here
NODE_ENV=production
```

### Step 5: Deploy
Railway will automatically deploy when you push to GitHub.

### Step 6: Get Your URL
Once deployed, Railway will provide a public URL like:
`https://your-app.railway.app`

---

## Local Development

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Setup
```bash
cd server
npm install
cp .env.example .env
# Edit .env with your database credentials
npm run dev
```

### Default Admin
On first run, a default admin is created:
- Username: `admin`
- Password: `admin123`

**Change this immediately after first login!**

---

## Database Schema

The database schema is automatically created on startup. Main tables:
- `users` - Admin users
- `inventory` - Device inventory
- `parts` - Repair parts
- `tickets` - Service tickets
- `ticket_history` - Status history
- `ticket_notes` - Ticket notes
- `tradein_requests` - Trade-in submissions
- `tradein_notes` - Trade-in notes
- `transactions` - Financial transactions
- `audit_log` - All system actions
- `counters` - ID generation

---

## Security Notes

1. Always use HTTPS in production
2. Set a strong `JWT_SECRET`
3. Change default admin password
4. Database is SSL-encrypted on Railway
5. All write operations are logged in audit_log

---

## Support

For issues, contact: support@phonetech.sk
