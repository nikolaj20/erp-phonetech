// ============================================
// Inventory Routes - CRUD for inventory items
// ============================================

const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/inventory - List all items
router.get('/', async (req, res) => {
    try {
        const { status, search } = req.query;
        let query = 'SELECT * FROM inventory WHERE 1=1';
        const params = [];

        if (status) {
            params.push(status);
            query += ` AND status = $${params.length}`;
        }

        if (search) {
            params.push(`%${search}%`);
            query += ` AND (brand ILIKE $${params.length} OR model ILIKE $${params.length} OR serial ILIKE $${params.length})`;
        }

        query += ' ORDER BY created_at DESC';

        const items = await db.getAll(query, params);
        res.json(items);
    } catch (error) {
        console.error('Error fetching inventory:', error);
        res.status(500).json({ error: 'Failed to fetch inventory' });
    }
});

// GET /api/inventory/stats - Get inventory statistics
router.get('/stats', async (req, res) => {
    try {
        const stats = await db.getOne(`
            SELECT 
                COUNT(*) FILTER (WHERE status = 'available') as available,
                COUNT(*) FILTER (WHERE status = 'sold') as sold,
                COUNT(*) FILTER (WHERE status = 'reserved') as reserved,
                COALESCE(SUM(current_price) FILTER (WHERE status = 'available'), 0) as total_value,
                COALESCE(SUM(buy_price) FILTER (WHERE status = 'available'), 0) as total_cost
            FROM inventory
        `);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// GET /api/inventory/:id - Get single item
router.get('/:id', async (req, res) => {
    try {
        const item = await db.getOne('SELECT * FROM inventory WHERE id = $1', [req.params.id]);
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        res.json(item);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch item' });
    }
});

// POST /api/inventory - Create new item
router.post('/', async (req, res) => {
    try {
        const { type, brand, model, serial, source, seller, buy_price, base_sell_price, visual_grade, specs } = req.body;

        // Check for duplicate serial
        const existing = await db.getOne('SELECT id FROM inventory WHERE serial = $1', [serial]);
        if (existing) {
            return res.status(400).json({ error: 'Item with this serial already exists' });
        }

        const item = await db.insert(`
            INSERT INTO inventory (type, brand, model, serial, source, seller, buy_price, base_sell_price, current_price, visual_grade, specs, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10, $11)
            RETURNING *
        `, [type, brand, model, serial, source, seller, buy_price, base_sell_price, visual_grade, specs, req.user.id]);

        // Create BUY transaction
        await db.query(`
            INSERT INTO transactions (type, amount, item_id, description, created_by)
            VALUES ('BUY', $1, $2, $3, $4)
        `, [buy_price, item.id, `Purchased ${brand} ${model}`, req.user.id]);

        await db.audit(req.user.id, 'inventory', item.id.toString(), 'create', `Added ${brand} ${model} to inventory`, { serial, buy_price });

        res.status(201).json(item);
    } catch (error) {
        console.error('Error creating item:', error);
        res.status(500).json({ error: 'Failed to create item' });
    }
});

// PUT /api/inventory/:id - Update item
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { current_price, price_override_reason, status, specs } = req.body;

        const item = await db.insert(`
            UPDATE inventory 
            SET current_price = COALESCE($1, current_price),
                price_override_reason = COALESCE($2, price_override_reason),
                status = COALESCE($3, status),
                specs = COALESCE($4, specs),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $5
            RETURNING *
        `, [current_price, price_override_reason, status, specs, id]);

        await db.audit(req.user.id, 'inventory', id, 'update', 'Updated inventory item', { current_price, status });

        res.json(item);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update item' });
    }
});

// POST /api/inventory/:id/sell - Sell an item
router.post('/:id/sell', async (req, res) => {
    try {
        const { id } = req.params;
        const { sell_price, warranty_months, customer } = req.body;

        // Get current item
        const current = await db.getOne('SELECT * FROM inventory WHERE id = $1', [id]);
        if (!current || current.status !== 'available') {
            return res.status(400).json({ error: 'Item not available for sale' });
        }

        const warrantyExpires = warranty_months > 0
            ? new Date(Date.now() + warranty_months * 30 * 24 * 60 * 60 * 1000)
            : null;

        const profit = parseFloat(sell_price) - parseFloat(current.buy_price);

        // Update item
        const item = await db.insert(`
            UPDATE inventory 
            SET status = 'sold',
                sold_price = $1,
                warranty_months = $2,
                warranty_expires = $3,
                sold_date = CURRENT_TIMESTAMP,
                sold_to = $4,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $5
            RETURNING *
        `, [sell_price, warranty_months, warrantyExpires, customer, id]);

        // Create SELL transaction
        await db.query(`
            INSERT INTO transactions (type, amount, profit, item_id, description, created_by)
            VALUES ('SELL', $1, $2, $3, $4, $5)
        `, [sell_price, profit, id, `Sold ${current.brand} ${current.model}`, req.user.id]);

        await db.audit(req.user.id, 'inventory', id, 'sell', `Sold ${current.brand} ${current.model} for ${sell_price}`, { sell_price, profit, customer });

        res.json(item);
    } catch (error) {
        console.error('Error selling item:', error);
        res.status(500).json({ error: 'Failed to sell item' });
    }
});

// DELETE /api/inventory/:id - Delete item (master admin only)
router.delete('/:id', async (req, res) => {
    try {
        if (req.user.role !== 'master_admin') {
            return res.status(403).json({ error: 'Only master admin can delete items' });
        }

        const item = await db.getOne('SELECT * FROM inventory WHERE id = $1', [req.params.id]);
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }

        await db.query('DELETE FROM inventory WHERE id = $1', [req.params.id]);

        await db.audit(req.user.id, 'inventory', req.params.id, 'delete', `Deleted ${item.brand} ${item.model}`);

        res.json({ message: 'Item deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete item' });
    }
});

module.exports = router;
