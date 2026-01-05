// ============================================
// Service Tickets Routes
// ============================================

const express = require('express');
const router = express.Router();
const db = require('../db');

const STATUSES = ['received', 'diagnostics', 'waiting_parts', 'repairing', 'testing', 'ready', 'scrapped'];

// GET /api/tickets - List all tickets
router.get('/', async (req, res) => {
    try {
        const { status, search } = req.query;
        let query = 'SELECT * FROM tickets WHERE 1=1';
        const params = [];

        if (status) {
            params.push(status);
            query += ` AND current_status = $${params.length}`;
        }
        if (search) {
            params.push(`%${search}%`);
            query += ` AND (id ILIKE $${params.length} OR customer_name ILIKE $${params.length} OR device_model ILIKE $${params.length})`;
        }

        query += ' ORDER BY created_at DESC';
        const tickets = await db.getAll(query, params);

        // Get history for each ticket
        for (let ticket of tickets) {
            ticket.history = await db.getAll(
                'SELECT * FROM ticket_history WHERE ticket_id = $1 ORDER BY created_at',
                [ticket.id]
            );
            ticket.notes = await db.getAll(
                'SELECT * FROM ticket_notes WHERE ticket_id = $1 ORDER BY created_at DESC',
                [ticket.id]
            );
        }

        res.json(tickets);
    } catch (error) {
        console.error('Error fetching tickets:', error);
        res.status(500).json({ error: 'Failed to fetch tickets' });
    }
});

// GET /api/tickets/stats
router.get('/stats', async (req, res) => {
    try {
        const stats = await db.getOne(`
            SELECT 
                COUNT(*) FILTER (WHERE current_status = 'received') as received,
                COUNT(*) FILTER (WHERE current_status = 'diagnostics') as diagnostics,
                COUNT(*) FILTER (WHERE current_status = 'waiting_parts') as waiting_parts,
                COUNT(*) FILTER (WHERE current_status = 'repairing') as repairing,
                COUNT(*) FILTER (WHERE current_status = 'testing') as testing,
                COUNT(*) FILTER (WHERE current_status = 'ready') as ready,
                COUNT(*) FILTER (WHERE current_status = 'scrapped') as scrapped,
                COUNT(*) FILTER (WHERE current_status NOT IN ('ready', 'scrapped')) as active
            FROM tickets
        `);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// GET /api/tickets/:id
router.get('/:id', async (req, res) => {
    try {
        const ticket = await db.getOne('SELECT * FROM tickets WHERE id = $1', [req.params.id]);
        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

        ticket.history = await db.getAll('SELECT * FROM ticket_history WHERE ticket_id = $1 ORDER BY created_at', [ticket.id]);
        ticket.notes = await db.getAll('SELECT * FROM ticket_notes WHERE ticket_id = $1 ORDER BY created_at DESC', [ticket.id]);

        res.json(ticket);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch ticket' });
    }
});

// POST /api/tickets - Create ticket
router.post('/', async (req, res) => {
    try {
        const { customer_name, customer_contact, device_type, device_brand, device_model, device_serial, linked_item_id, is_warranty_claim, issue_description, intake_condition } = req.body;

        const ticketId = await db.generateTicketId();

        const ticket = await db.insert(`
            INSERT INTO tickets (id, customer_name, customer_contact, device_type, device_brand, device_model, device_serial, linked_item_id, is_warranty_claim, issue_description, intake_condition, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `, [ticketId, customer_name, customer_contact, device_type, device_brand, device_model, device_serial, linked_item_id, is_warranty_claim || false, issue_description, intake_condition, req.user.id]);

        // Add initial history
        await db.query(`
            INSERT INTO ticket_history (ticket_id, status, note, created_by)
            VALUES ($1, 'received', 'Ticket created', $2)
        `, [ticketId, req.user.id]);

        await db.audit(req.user.id, 'service', ticketId, 'create', `Created ticket for ${device_brand} ${device_model}`);

        ticket.history = [{ status: 'received', note: 'Ticket created', created_at: new Date() }];
        ticket.notes = [];

        res.status(201).json(ticket);
    } catch (error) {
        console.error('Error creating ticket:', error);
        res.status(500).json({ error: 'Failed to create ticket' });
    }
});

// PUT /api/tickets/:id/status - Update status
router.put('/:id/status', async (req, res) => {
    try {
        const { status, note } = req.body;
        const ticket = await db.getOne('SELECT * FROM tickets WHERE id = $1', [req.params.id]);

        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
        if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

        await db.query('UPDATE tickets SET current_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, req.params.id]);

        await db.query(`
            INSERT INTO ticket_history (ticket_id, status, note, created_by)
            VALUES ($1, $2, $3, $4)
        `, [req.params.id, status, note || `Status changed to ${status}`, req.user.id]);

        await db.audit(req.user.id, 'service', req.params.id, 'status_change', `Status: ${ticket.current_status} → ${status}`);

        const updated = await db.getOne('SELECT * FROM tickets WHERE id = $1', [req.params.id]);
        updated.history = await db.getAll('SELECT * FROM ticket_history WHERE ticket_id = $1 ORDER BY created_at', [req.params.id]);

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// POST /api/tickets/:id/notes - Add note
router.post('/:id/notes', async (req, res) => {
    try {
        const { note } = req.body;
        await db.query(`
            INSERT INTO ticket_notes (ticket_id, note, created_by) VALUES ($1, $2, $3)
        `, [req.params.id, note, req.user.id]);

        await db.query('UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);

        const notes = await db.getAll('SELECT * FROM ticket_notes WHERE ticket_id = $1 ORDER BY created_at DESC', [req.params.id]);
        res.json(notes);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add note' });
    }
});

module.exports = router;
