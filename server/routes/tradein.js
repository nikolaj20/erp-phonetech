// ============================================
// Trade-In Requests Routes
// ============================================

const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/tradein - List all requests
router.get('/', async (req, res) => {
    try {
        const { status, search } = req.query;
        let query = 'SELECT * FROM tradein_requests WHERE 1=1';
        const params = [];

        if (status) {
            params.push(status);
            query += ` AND status = $${params.length}`;
        }
        if (search) {
            params.push(`%${search}%`);
            query += ` AND (id ILIKE $${params.length} OR customer_name ILIKE $${params.length} OR device_model ILIKE $${params.length})`;
        }

        query += ' ORDER BY created_at DESC';
        const requests = await db.getAll(query, params);

        for (let req of requests) {
            req.notes = await db.getAll('SELECT * FROM tradein_notes WHERE tradein_id = $1 ORDER BY created_at DESC', [req.id]);
        }

        res.json(requests);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});

// GET /api/tradein/stats
router.get('/stats', async (req, res) => {
    try {
        const stats = await db.getOne(`
            SELECT 
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'quoted') as quoted,
                COUNT(*) FILTER (WHERE status = 'accepted') as accepted,
                COUNT(*) FILTER (WHERE status = 'received') as received,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'rejected') as rejected
            FROM tradein_requests
        `);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// GET /api/tradein/:id
router.get('/:id', async (req, res) => {
    try {
        const request = await db.getOne('SELECT * FROM tradein_requests WHERE id = $1', [req.params.id]);
        if (!request) return res.status(404).json({ error: 'Request not found' });

        request.notes = await db.getAll('SELECT * FROM tradein_notes WHERE tradein_id = $1 ORDER BY created_at DESC', [req.params.id]);
        res.json(request);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch request' });
    }
});

// PUT /api/tradein/:id/status - Update status
router.put('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        await db.query('UPDATE tradein_requests SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, req.params.id]);

        await db.audit(req.user.id, 'tradein', req.params.id, 'status_change', `Status changed to ${status}`);

        const updated = await db.getOne('SELECT * FROM tradein_requests WHERE id = $1', [req.params.id]);
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// PUT /api/tradein/:id/offer - Send offer
router.put('/:id/offer', async (req, res) => {
    try {
        const { offer_amount } = req.body;
        await db.query(`
            UPDATE tradein_requests SET offer_amount = $1, status = 'quoted', updated_at = CURRENT_TIMESTAMP WHERE id = $2
        `, [offer_amount, req.params.id]);

        await db.audit(req.user.id, 'tradein', req.params.id, 'update', `Quote sent: €${offer_amount}`);

        const updated = await db.getOne('SELECT * FROM tradein_requests WHERE id = $1', [req.params.id]);
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to send offer' });
    }
});

// POST /api/tradein/:id/notes - Add note
router.post('/:id/notes', async (req, res) => {
    try {
        const { note } = req.body;
        await db.query('INSERT INTO tradein_notes (tradein_id, note, created_by) VALUES ($1, $2, $3)', [req.params.id, note, req.user.id]);

        const notes = await db.getAll('SELECT * FROM tradein_notes WHERE tradein_id = $1 ORDER BY created_at DESC', [req.params.id]);
        res.json(notes);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add note' });
    }
});

// POST /api/tradein/:id/to-inventory - Add to inventory
router.post('/:id/to-inventory', async (req, res) => {
    try {
        const request = await db.getOne('SELECT * FROM tradein_requests WHERE id = $1', [req.params.id]);
        if (!request) return res.status(404).json({ error: 'Request not found' });

        // Create inventory item
        const serial = request.device_imei || `TRD-${Date.now()}`;
        const conditionGrade = { excellent: 'A', good: 'B', fair: 'C', poor: 'D', broken: 'D' };

        const item = await db.insert(`
            INSERT INTO inventory (type, brand, model, serial, source, seller, buy_price, base_sell_price, current_price, visual_grade, specs, created_by)
            VALUES ($1, 'Trade-In', $2, $3, 'trade-in', $4, $5, $6, $6, $7, $8, $9)
            RETURNING *
        `, [request.device_type, request.device_model, serial, request.customer_name, request.offer_amount, request.offer_amount * 1.3, conditionGrade[request.device_condition] || 'C', request.device_details, req.user.id]);

        // Create transaction
        await db.query(`
            INSERT INTO transactions (type, amount, item_id, description, created_by)
            VALUES ('BUY', $1, $2, $3, $4)
        `, [request.offer_amount, item.id, `Trade-in: ${request.device_model} from ${request.customer_name}`, req.user.id]);

        // Update trade-in status
        await db.query(`UPDATE tradein_requests SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [req.params.id]);
        await db.query(`INSERT INTO tradein_notes (tradein_id, note, created_by) VALUES ($1, $2, $3)`, [req.params.id, `Added to inventory as item #${item.id}`, req.user.id]);

        await db.audit(req.user.id, 'tradein', req.params.id, 'complete', `Added to inventory as ${item.id}`);

        res.json({ item, message: 'Added to inventory' });
    } catch (error) {
        console.error('Error adding to inventory:', error);
        res.status(500).json({ error: 'Failed to add to inventory' });
    }
});

module.exports = router;
