// ============================================
// Settings Routes - Company Info & Preferences
// ============================================

const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../auth');

// GET /api/settings - Get all settings
// Note: auth.authenticate is already applied at app.use level in index.js
router.get('/', async (req, res) => {
    try {
        const settings = await db.getAll('SELECT key, value, updated_at FROM settings');
        
        // Convert to object format
        const settingsObj = {};
        settings.forEach(s => {
            try {
                settingsObj[s.key] = JSON.parse(s.value);
            } catch {
                settingsObj[s.key] = s.value;
            }
        });
        
        res.json(settingsObj);
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ error: 'Failed to get settings' });
    }
});

// GET /api/settings/:key - Get specific setting
router.get('/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const setting = await db.getOne('SELECT value FROM settings WHERE key = $1', [key]);
        
        if (!setting) {
            return res.json({ value: null });
        }
        
        try {
            res.json({ value: JSON.parse(setting.value) });
        } catch {
            res.json({ value: setting.value });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to get setting' });
    }
});

// PUT /api/settings - Update multiple settings (admin only)
router.put('/', auth.requireAdmin, async (req, res) => {
    try {
        const settings = req.body;
        
        for (const [key, value] of Object.entries(settings)) {
            const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
            
            await db.query(`
                INSERT INTO settings (key, value, updated_at, updated_by)
                VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
                ON CONFLICT (key) DO UPDATE SET
                    value = EXCLUDED.value,
                    updated_at = CURRENT_TIMESTAMP,
                    updated_by = EXCLUDED.updated_by
            `, [key, valueStr, req.user.id]);
        }
        
        await db.audit(req.user.id, 'settings', null, 'update', 'Settings updated', { keys: Object.keys(settings) });
        
        res.json({ message: 'Settings updated successfully' });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// PUT /api/settings/:key - Update single setting (admin only)
router.put('/:key', auth.requireAdmin, async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        
        const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
        
        await db.query(`
            INSERT INTO settings (key, value, updated_at, updated_by)
            VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
            ON CONFLICT (key) DO UPDATE SET
                value = EXCLUDED.value,
                updated_at = CURRENT_TIMESTAMP,
                updated_by = EXCLUDED.updated_by
        `, [key, valueStr, req.user.id]);
        
        await db.audit(req.user.id, 'settings', key, 'update', `Setting ${key} updated`);
        
        res.json({ message: 'Setting updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update setting' });
    }
});

// DELETE /api/settings/:key - Delete setting (master admin only)
router.delete('/:key', auth.requireMasterAdmin, async (req, res) => {
    try {
        const { key } = req.params;
        
        await db.query('DELETE FROM settings WHERE key = $1', [key]);
        
        await db.audit(req.user.id, 'settings', key, 'delete', `Setting ${key} deleted`);
        
        res.json({ message: 'Setting deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete setting' });
    }
});

// POST /api/settings/initialize - Initialize default settings
router.post('/initialize', auth.requireAdmin, async (req, res) => {
    try {
        const defaults = {
            company_name: 'PhoneTech.sk',
            company_email: '',
            company_phone: '',
            company_address: '',
            notify_tradein_quote: true,
            notify_repair_status: true,
            notify_ready_pickup: true
        };
        
        for (const [key, value] of Object.entries(defaults)) {
            const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
            
            // Only insert if not exists
            await db.query(`
                INSERT INTO settings (key, value, updated_by)
                VALUES ($1, $2, $3)
                ON CONFLICT (key) DO NOTHING
            `, [key, valueStr, req.user.id]);
        }
        
        res.json({ message: 'Default settings initialized' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to initialize settings' });
    }
});

module.exports = router;
