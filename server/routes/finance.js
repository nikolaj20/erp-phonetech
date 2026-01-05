// ============================================
// Finance Routes
// ============================================

const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/finance/stats - Get financial statistics
router.get('/stats', async (req, res) => {
    try {
        const stats = await db.getOne(`
            SELECT 
                COALESCE(SUM(amount) FILTER (WHERE type = 'SELL'), 0) as total_revenue,
                COALESCE(SUM(profit) FILTER (WHERE type = 'SELL'), 0) as total_profit,
                COALESCE(SUM(amount) FILTER (WHERE type = 'BUY'), 0) as total_spent,
                COUNT(*) FILTER (WHERE type = 'SELL') as sales_count,
                COUNT(*) FILTER (WHERE type = 'BUY') as purchases_count
            FROM transactions
        `);

        const avgStats = await db.getOne(`
            SELECT 
                COALESCE(AVG(amount) FILTER (WHERE type = 'SELL'), 0) as avg_sale_price,
                COALESCE(AVG(profit) FILTER (WHERE type = 'SELL'), 0) as avg_profit
            FROM transactions
        `);

        const inventoryValue = await db.getOne(`
            SELECT COALESCE(SUM(current_price), 0) as value FROM inventory WHERE status = 'available'
        `);

        res.json({
            ...stats,
            avg_sale_price: avgStats.avg_sale_price,
            avg_profit: avgStats.avg_profit,
            inventory_value: inventoryValue.value,
            margin: stats.total_revenue > 0 ? (stats.total_profit / stats.total_revenue * 100) : 0
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// GET /api/finance/revenue - Get revenue by period
router.get('/revenue', async (req, res) => {
    try {
        const revenue = await db.getOne(`
            SELECT 
                COALESCE(SUM(amount) FILTER (WHERE created_at >= CURRENT_DATE), 0) as today,
                COALESCE(SUM(amount) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE)), 0) as week,
                COALESCE(SUM(amount) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)), 0) as month,
                COALESCE(SUM(amount) FILTER (WHERE created_at >= date_trunc('year', CURRENT_DATE)), 0) as year
            FROM transactions WHERE type = 'SELL'
        `);
        res.json(revenue);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch revenue' });
    }
});

// GET /api/finance/transactions - Get all transactions
router.get('/transactions', async (req, res) => {
    try {
        const { type, limit = 100 } = req.query;
        let query = 'SELECT t.*, i.brand, i.model FROM transactions t LEFT JOIN inventory i ON t.item_id = i.id WHERE 1=1';
        const params = [];

        if (type) {
            params.push(type);
            query += ` AND t.type = $${params.length}`;
        }

        query += ` ORDER BY t.created_at DESC LIMIT ${parseInt(limit)}`;
        const transactions = await db.getAll(query, params);
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

// GET /api/finance/audit - Get audit log
router.get('/audit', async (req, res) => {
    try {
        const { entity_type, action, limit = 200 } = req.query;
        let query = 'SELECT a.*, u.name as user_name FROM audit_log a LEFT JOIN users u ON a.user_id = u.id WHERE 1=1';
        const params = [];

        if (entity_type) {
            params.push(entity_type);
            query += ` AND a.entity_type = $${params.length}`;
        }
        if (action) {
            params.push(action);
            query += ` AND a.action = $${params.length}`;
        }

        query += ` ORDER BY a.created_at DESC LIMIT ${parseInt(limit)}`;
        const logs = await db.getAll(query, params);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch audit log' });
    }
});

// GET /api/finance/audit/stats
router.get('/audit/stats', async (req, res) => {
    try {
        const stats = await db.getOne(`
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE entity_type = 'inventory') as inventory,
                COUNT(*) FILTER (WHERE entity_type = 'service') as service,
                COUNT(*) FILTER (WHERE entity_type = 'finance') as finance,
                COUNT(*) FILTER (WHERE entity_type = 'auth') as auth
            FROM audit_log
        `);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch audit stats' });
    }
});

module.exports = router;
