// ============================================
// Public Routes - No authentication required
// ============================================

const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/public/track/:id - Track service ticket (public)
router.get('/track/:id', async (req, res) => {
    try {
        const ticket = await db.getOne(`
            SELECT id, device_brand, device_model, current_status, created_at 
            FROM tickets WHERE id = $1
        `, [req.params.id.toUpperCase()]);

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        const history = await db.getAll(`
            SELECT status, note, created_at FROM ticket_history WHERE ticket_id = $1 ORDER BY created_at
        `, [ticket.id]);

        // Status descriptions for customers
        const statusDescriptions = {
            received: 'Your device has been received and is awaiting diagnostics.',
            diagnostics: 'Our technicians are diagnosing the issue with your device.',
            waiting_parts: 'We are waiting for replacement parts to arrive.',
            repairing: 'Your device is currently being repaired.',
            testing: 'The repair is complete and we are testing your device.',
            ready: 'Your device is ready for pickup!',
            scrapped: 'Unfortunately, the device could not be repaired.'
        };

        res.json({
            id: ticket.id,
            device: `${ticket.device_brand} ${ticket.device_model}`,
            status: ticket.current_status,
            status_description: statusDescriptions[ticket.current_status] || '',
            created_at: ticket.created_at,
            history: history.map(h => ({
                status: h.status,
                timestamp: h.created_at
            }))
        });
    } catch (error) {
        console.error('Track error:', error);
        res.status(500).json({ error: 'Failed to track ticket' });
    }
});

// POST /api/public/tradein - Submit trade-in request (public)
router.post('/tradein', async (req, res) => {
    try {
        const {
            name, id_number, email, phone, iban, address,
            device_type, model, imei, condition, details,
            delivery_method, photos
        } = req.body;

        // Validate required fields
        if (!name || !id_number || !email || !phone || !device_type || !model || !condition || !delivery_method) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const tradeinId = await db.generateTradeinId();

        const request = await db.insert(`
            INSERT INTO tradein_requests (
                id, customer_name, customer_id_number, customer_email, customer_phone, 
                customer_iban, customer_address, device_type, device_model, device_imei, 
                device_condition, device_details, delivery_method, photos
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING id, created_at
        `, [
            tradeinId, name, id_number, email, phone,
            iban, address, device_type, model, imei,
            condition, details, delivery_method, photos || []
        ]);

        await db.audit(null, 'tradein', tradeinId, 'create', `Public trade-in request: ${model}`);

        res.status(201).json({
            success: true,
            reference: request.id,
            message: 'Trade-in request submitted successfully. We will contact you within 24-48 hours.'
        });
    } catch (error) {
        console.error('Trade-in submit error:', error);
        res.status(500).json({ error: 'Failed to submit trade-in request' });
    }
});

// GET /api/public/tradein/:id - Check trade-in status (public)
router.get('/tradein/:id', async (req, res) => {
    try {
        const request = await db.getOne(`
            SELECT id, status, offer_amount, created_at, device_model 
            FROM tradein_requests WHERE id = $1
        `, [req.params.id.toUpperCase()]);

        if (!request) {
            return res.status(404).json({ error: 'Trade-in request not found' });
        }

        const statusLabels = {
            pending: 'Under Review',
            quoted: 'Quote Sent',
            accepted: 'Quote Accepted',
            received: 'Device Received',
            completed: 'Completed',
            rejected: 'Rejected'
        };

        res.json({
            id: request.id,
            device: request.device_model,
            status: request.status,
            status_label: statusLabels[request.status] || request.status,
            offer_amount: request.offer_amount > 0 ? request.offer_amount : null,
            created_at: request.created_at
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch trade-in status' });
    }
});

// GET /api/public/data - Get reference data for forms
router.get('/data', async (req, res) => {
    // Return device types and other static data for public forms
    res.json({
        device_types: [
            { id: 'iphone', name: 'iPhone' },
            { id: 'ipad', name: 'iPad' },
            { id: 'macbook', name: 'MacBook' },
            { id: 'android', name: 'Android Phone' },
            { id: 'tablet', name: 'Android Tablet' },
            { id: 'laptop', name: 'Other Laptop' },
            { id: 'console', name: 'Game Console' },
            { id: 'other', name: 'Other' }
        ],
        conditions: [
            { id: 'excellent', name: 'Excellent - Like new' },
            { id: 'good', name: 'Good - Minor scratches' },
            { id: 'fair', name: 'Fair - Visible wear' },
            { id: 'poor', name: 'Poor - Significant damage' },
            { id: 'broken', name: 'Broken / Not working' }
        ],
        delivery_methods: [
            { id: 'in_person', name: 'In Person - Visit our store' },
            { id: 'shipping', name: 'Ship to Us - We send a prepaid label' }
        ]
    });
});

module.exports = router;
