// ============================================
// Parts Inventory Routes
// ============================================

const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/parts - List all parts
router.get('/', async (req, res) => {
    try {
        const { device_id, device_type, category } = req.query;
        let query = 'SELECT * FROM parts WHERE 1=1';
        const params = [];

        if (device_id) {
            params.push(device_id);
            query += ` AND device_id = $${params.length}`;
        }
        if (device_type) {
            params.push(device_type);
            query += ` AND device_type = $${params.length}`;
        }

        query += ' ORDER BY device_id, part_type_id';
        const parts = await db.getAll(query, params);
        res.json(parts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch parts' });
    }
});

// GET /api/parts/stats
router.get('/stats', async (req, res) => {
    try {
        const stats = await db.getOne(`
            SELECT 
                COUNT(*) as total_types,
                COUNT(*) FILTER (WHERE quantity > 0) as in_stock,
                COUNT(*) FILTER (WHERE quantity = 0) as out_of_stock,
                COALESCE(SUM(quantity * cost_price), 0) as total_value
            FROM parts
        `);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// POST /api/parts - Add or update part
router.post('/', async (req, res) => {
    try {
        const { device_type, device_id, part_type_id, quality, color, quantity, cost_price, sell_price, notes } = req.body;

        // Check if part exists
        const existing = await db.getOne(
            'SELECT * FROM parts WHERE device_id = $1 AND part_type_id = $2 AND quality = $3 AND COALESCE(color, \'\') = COALESCE($4, \'\')',
            [device_id, part_type_id, quality, color || '']
        );

        let part;
        if (existing) {
            // Update existing
            part = await db.insert(`
                UPDATE parts SET 
                    quantity = quantity + $1,
                    cost_price = $2,
                    sell_price = $3,
                    notes = COALESCE($4, notes),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $5
                RETURNING *
            `, [quantity, cost_price, sell_price, notes, existing.id]);
        } else {
            // Create new
            part = await db.insert(`
                INSERT INTO parts (device_type, device_id, part_type_id, quality, color, quantity, cost_price, sell_price, notes)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
            `, [device_type || 'phone', device_id, part_type_id, quality, color, quantity, cost_price, sell_price, notes]);
        }

        await db.audit(req.user.id, 'parts', part.id.toString(), existing ? 'update' : 'create', `Part stock updated: ${device_id} - ${part_type_id}`);

        res.json(part);
    } catch (error) {
        console.error('Error adding part:', error);
        res.status(500).json({ error: 'Failed to add part' });
    }
});

// PUT /api/parts/:id - Update part
router.put('/:id', async (req, res) => {
    try {
        const { quantity, cost_price, sell_price } = req.body;
        const part = await db.insert(`
            UPDATE parts SET quantity = $1, cost_price = $2, sell_price = $3, updated_at = CURRENT_TIMESTAMP
            WHERE id = $4 RETURNING *
        `, [quantity, cost_price, sell_price, req.params.id]);

        await db.audit(req.user.id, 'parts', req.params.id, 'update', 'Updated part');
        res.json(part);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update part' });
    }
});

// POST /api/parts/bulk - Bulk add parts from device
router.post('/bulk', async (req, res) => {
    try {
        const { device_type, device_id, quality, parts, purchase_price, supplier } = req.body;
        const pricePerPart = purchase_price / parts.length;
        let added = 0;

        for (const partId of parts) {
            const existing = await db.getOne(
                'SELECT * FROM parts WHERE device_id = $1 AND part_type_id = $2 AND quality = $3',
                [device_id, partId, quality]
            );

            if (existing) {
                await db.query(`
                    UPDATE parts SET quantity = quantity + 1, cost_price = $1, sell_price = $2, notes = $3, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $4
                `, [pricePerPart, pricePerPart * 1.5, supplier ? `From ${supplier}` : existing.notes, existing.id]);
            } else {
                await db.query(`
                    INSERT INTO parts (device_type, device_id, part_type_id, quality, quantity, cost_price, sell_price, notes)
                    VALUES ($1, $2, $3, $4, 1, $5, $6, $7)
                `, [device_type, device_id, partId, quality, pricePerPart, pricePerPart * 1.5, supplier ? `From ${supplier}` : '']);
            }
            added++;
        }

        await db.audit(req.user.id, 'parts', null, 'bulk_create', `Bulk added ${added} parts from ${device_id}`);
        res.json({ message: `Added ${added} parts`, added });
    } catch (error) {
        console.error('Bulk add error:', error);
        res.status(500).json({ error: 'Failed to bulk add parts' });
    }
});

module.exports = router;
