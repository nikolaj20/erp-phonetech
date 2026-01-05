// ============================================
// Auth Routes - Login, Logout, User Management
// ============================================

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const db = require('../db');
const auth = require('../auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        // Find user
        const user = await db.getOne(
            'SELECT * FROM users WHERE username = $1 AND active = true',
            [username]
        );

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update last login
        await db.query(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
            [user.id]
        );

        // Generate token
        const token = auth.generateToken(user);

        // Audit log
        await db.audit(user.id, 'auth', user.id.toString(), 'login', `User ${user.username} logged in`);

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// GET /api/auth/me - Get current user
router.get('/me', auth.authenticate, async (req, res) => {
    try {
        const user = await db.getOne(
            'SELECT id, username, name, role, created_at, last_login FROM users WHERE id = $1',
            [req.user.id]
        );
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get user' });
    }
});

// GET /api/auth/users - List all users (master admin only)
router.get('/users', auth.authenticate, auth.requireMasterAdmin, async (req, res) => {
    try {
        const users = await db.getAll(
            'SELECT id, username, name, role, created_at, last_login, active FROM users ORDER BY created_at DESC'
        );
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// POST /api/auth/users - Create new user (master admin only)
router.post('/users', auth.authenticate, auth.requireMasterAdmin, async (req, res) => {
    try {
        const { username, password, name, role } = req.body;

        if (!username || !password || !name) {
            return res.status(400).json({ error: 'Username, password, and name required' });
        }

        // Check if username exists
        const existing = await db.getOne('SELECT id FROM users WHERE username = $1', [username]);
        if (existing) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user
        const user = await db.insert(
            `INSERT INTO users (username, password_hash, name, role)
             VALUES ($1, $2, $3, $4)
             RETURNING id, username, name, role, created_at`,
            [username, passwordHash, name, role || 'admin']
        );

        await db.audit(req.user.id, 'auth', user.id.toString(), 'create', `Created user ${username}`);

        res.status(201).json(user);
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// PUT /api/auth/users/:id - Update user (master admin only)
router.put('/users/:id', auth.authenticate, auth.requireMasterAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, role, active, password } = req.body;

        let query = 'UPDATE users SET name = $1, role = $2, active = $3';
        let params = [name, role, active];

        if (password) {
            const passwordHash = await bcrypt.hash(password, 10);
            query += ', password_hash = $4 WHERE id = $5 RETURNING id, username, name, role, active';
            params.push(passwordHash, id);
        } else {
            query += ' WHERE id = $4 RETURNING id, username, name, role, active';
            params.push(id);
        }

        const user = await db.insert(query, params);

        await db.audit(req.user.id, 'auth', id, 'update', `Updated user ${user.username}`);

        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// DELETE /api/auth/users/:id - Delete/deactivate user (master admin only)
router.delete('/users/:id', auth.authenticate, auth.requireMasterAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Prevent deleting yourself
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        // Check if user exists
        const user = await db.getOne('SELECT * FROM users WHERE id = $1', [id]);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Soft delete - just deactivate
        await db.query('UPDATE users SET active = false WHERE id = $1', [id]);

        await db.audit(req.user.id, 'auth', id, 'delete', `Deactivated user ${user.username}`);

        res.json({ message: 'User deactivated successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// POST /api/auth/change-password - Change own password
router.post('/change-password', auth.authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        // Get user with password hash
        const user = await db.getOne('SELECT * FROM users WHERE id = $1', [req.user.id]);

        // Verify current password
        const valid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!valid) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }

        // Hash new password
        const passwordHash = await bcrypt.hash(newPassword, 10);

        // Update password
        await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.user.id]);

        await db.audit(req.user.id, 'auth', req.user.id.toString(), 'update', 'Changed password');

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to change password' });
    }
});

module.exports = router;
