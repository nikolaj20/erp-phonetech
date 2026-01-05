// ============================================
// PhoneTech.sk ERP - Main Server
// ============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const db = require('./db');
const authMiddleware = require('./auth');

// Import routes
const authRoutes = require('./routes/auth');
const inventoryRoutes = require('./routes/inventory');
const partsRoutes = require('./routes/parts');
const ticketsRoutes = require('./routes/tickets');
const tradeinRoutes = require('./routes/tradein');
const financeRoutes = require('./routes/finance');
const publicRoutes = require('./routes/public');
const settingsRoutes = require('./routes/settings');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE
// ============================================

// Security headers
app.use(helmet({
    contentSecurityPolicy: false, // Allow inline scripts for now
    crossOriginEmbedderPolicy: false
}));

// CORS - allow requests from frontend
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting for login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts
    message: { error: 'Too many login attempts, please try again later' }
});

// General rate limiting
const generalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100 // 100 requests per minute
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', loginLimiter);

// ============================================
// STATIC FILES
// ============================================

// Serve static files from public folder
app.use(express.static(path.join(__dirname, '../public')));

// ============================================
// API ROUTES
// ============================================

// Public routes (no auth required)
app.use('/api/public', publicRoutes);

// Auth routes
app.use('/api/auth', authRoutes);

// Protected routes (require authentication)
app.use('/api/inventory', authMiddleware.authenticate, inventoryRoutes);
app.use('/api/parts', authMiddleware.authenticate, partsRoutes);
app.use('/api/tickets', authMiddleware.authenticate, ticketsRoutes);
app.use('/api/tradein', authMiddleware.authenticate, tradeinRoutes);
app.use('/api/finance', authMiddleware.authenticate, financeRoutes);
app.use('/api/settings', authMiddleware.authenticate, settingsRoutes);

// ============================================
// PAGE ROUTES
// ============================================

// Public pages
app.get('/track', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/track.html'));
});

app.get('/trade-in', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/trade-in.html'));
});

// Login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/login.html'));
});

// Admin panel (main app)
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin.html'));
});

app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// Root - landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error'
    });
});

// ============================================
// START SERVER
// ============================================

async function startServer() {
    try {
        // Initialize database
        await db.initialize();
        console.log('✅ Database initialized');

        // Start listening
        app.listen(PORT, () => {
            console.log(`
╔═══════════════════════════════════════════════════╗
║     PhoneTech.sk ERP Server                       ║
║     Running on http://localhost:${PORT}              ║
╠═══════════════════════════════════════════════════╣
║  Public pages:                                    ║
║    /           - Landing page                     ║
║    /track      - Service tracking (customers)    ║
║    /trade-in   - Trade-in form (customers)       ║
║                                                   ║
║  Admin panel:                                     ║
║    /login      - Login page                       ║
║    /admin      - Admin dashboard                  ║
╚═══════════════════════════════════════════════════╝
            `);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
