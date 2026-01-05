// ============================================
// PhoneTech.sk ERP - Authentication Middleware
// ============================================

const jwt = require('jsonwebtoken');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'phonetech-secret-key-change-in-production';

const auth = {
    // Generate JWT token
    generateToken(user) {
        return jwt.sign(
            {
                id: user.id,
                username: user.username,
                role: user.role,
                name: user.name
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
    },

    // Verify JWT token
    verifyToken(token) {
        try {
            return jwt.verify(token, JWT_SECRET);
        } catch (error) {
            return null;
        }
    },

    // Authentication middleware
    authenticate(req, res, next) {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = auth.verifyToken(token);

        if (!decoded) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        req.user = decoded;
        next();
    },

    // Require master admin role
    requireMasterAdmin(req, res, next) {
        if (req.user.role !== 'master_admin') {
            return res.status(403).json({ error: 'Access denied. Master admin required.' });
        }
        next();
    },

    // Require any admin role
    requireAdmin(req, res, next) {
        if (!['master_admin', 'admin'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied. Admin required.' });
        }
        next();
    }
};

module.exports = auth;
