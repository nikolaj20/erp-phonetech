// ============================================
// PhoneTech.sk ERP - Database Module
// ============================================

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Database connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ============================================
// SCHEMA DEFINITION
// ============================================

const schema = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    active BOOLEAN DEFAULT true
);

-- Inventory table
CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    serial VARCHAR(100) UNIQUE NOT NULL,
    source VARCHAR(50),
    seller VARCHAR(100),
    buy_price DECIMAL(10,2) NOT NULL,
    base_sell_price DECIMAL(10,2) NOT NULL,
    current_price DECIMAL(10,2) NOT NULL,
    sold_price DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'available',
    visual_grade CHAR(1),
    specs TEXT,
    warranty_months INTEGER DEFAULT 0,
    warranty_expires TIMESTAMP,
    sold_date TIMESTAMP,
    sold_to VARCHAR(100),
    price_override_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
);

-- Parts inventory table
CREATE TABLE IF NOT EXISTS parts (
    id SERIAL PRIMARY KEY,
    device_type VARCHAR(50) NOT NULL,
    device_id VARCHAR(50) NOT NULL,
    part_type_id VARCHAR(50) NOT NULL,
    quality VARCHAR(50) NOT NULL,
    color VARCHAR(50),
    quantity INTEGER DEFAULT 0,
    cost_price DECIMAL(10,2) DEFAULT 0,
    sell_price DECIMAL(10,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Service tickets table
CREATE TABLE IF NOT EXISTS tickets (
    id VARCHAR(20) PRIMARY KEY,
    customer_name VARCHAR(100) NOT NULL,
    customer_contact VARCHAR(100) NOT NULL,
    device_type VARCHAR(50) NOT NULL,
    device_brand VARCHAR(100) NOT NULL,
    device_model VARCHAR(100) NOT NULL,
    device_serial VARCHAR(100),
    linked_item_id INTEGER REFERENCES inventory(id),
    is_warranty_claim BOOLEAN DEFAULT false,
    issue_description TEXT NOT NULL,
    intake_condition TEXT,
    current_status VARCHAR(30) DEFAULT 'received',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
);

-- Ticket status history
CREATE TABLE IF NOT EXISTS ticket_history (
    id SERIAL PRIMARY KEY,
    ticket_id VARCHAR(20) REFERENCES tickets(id),
    status VARCHAR(30) NOT NULL,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
);

-- Ticket notes
CREATE TABLE IF NOT EXISTS ticket_notes (
    id SERIAL PRIMARY KEY,
    ticket_id VARCHAR(20) REFERENCES tickets(id),
    note TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
);

-- Trade-in requests table
CREATE TABLE IF NOT EXISTS tradein_requests (
    id VARCHAR(20) PRIMARY KEY,
    customer_name VARCHAR(100) NOT NULL,
    customer_id_number VARCHAR(50) NOT NULL,
    customer_email VARCHAR(100) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    customer_iban VARCHAR(50),
    customer_address TEXT,
    device_type VARCHAR(50) NOT NULL,
    device_model VARCHAR(100) NOT NULL,
    device_imei VARCHAR(50),
    device_condition VARCHAR(30) NOT NULL,
    device_details TEXT,
    delivery_method VARCHAR(30) NOT NULL,
    photos TEXT[], -- Array of base64 or URLs
    status VARCHAR(30) DEFAULT 'pending',
    offer_amount DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trade-in notes
CREATE TABLE IF NOT EXISTS tradein_notes (
    id SERIAL PRIMARY KEY,
    tradein_id VARCHAR(20) REFERENCES tradein_requests(id),
    note TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    type VARCHAR(20) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    profit DECIMAL(10,2) DEFAULT 0,
    item_id INTEGER REFERENCES inventory(id),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(50),
    action VARCHAR(50) NOT NULL,
    message TEXT,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Counters table
CREATE TABLE IF NOT EXISTS counters (
    name VARCHAR(50) PRIMARY KEY,
    value INTEGER DEFAULT 0
);

-- Settings table for company info and preferences
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES users(id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status);
CREATE INDEX IF NOT EXISTS idx_inventory_serial ON inventory(serial);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(current_status);
CREATE INDEX IF NOT EXISTS idx_tradein_status ON tradein_requests(status);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_parts_device ON parts(device_id, part_type_id);
`;

// ============================================
// DATABASE FUNCTIONS
// ============================================

const db = {
    // Initialize database
    async initialize() {
        try {
            // Run schema
            await pool.query(schema);
            
            // Initialize counters
            await pool.query(`
                INSERT INTO counters (name, value) VALUES ('ticket_counter', 0)
                ON CONFLICT (name) DO NOTHING
            `);
            await pool.query(`
                INSERT INTO counters (name, value) VALUES ('tradein_counter', 0)
                ON CONFLICT (name) DO NOTHING
            `);
            
            // Create default master admin if no users exist
            const userCheck = await pool.query('SELECT COUNT(*) FROM users');
            if (parseInt(userCheck.rows[0].count) === 0) {
                const passwordHash = await bcrypt.hash('admin123', 10);
                await pool.query(`
                    INSERT INTO users (username, password_hash, name, role)
                    VALUES ('admin', $1, 'Master Administrator', 'master_admin')
                `, [passwordHash]);
                console.log('✅ Default admin user created (username: admin, password: admin123)');
            }
            
            return true;
        } catch (error) {
            console.error('Database initialization error:', error);
            throw error;
        }
    },
    
    // Query helper
    async query(text, params) {
        const start = Date.now();
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        if (process.env.NODE_ENV !== 'production') {
            console.log('Query:', { text: text.substring(0, 100), duration: `${duration}ms`, rows: res.rowCount });
        }
        return res;
    },
    
    // Get single row
    async getOne(text, params) {
        const res = await this.query(text, params);
        return res.rows[0] || null;
    },
    
    // Get all rows
    async getAll(text, params) {
        const res = await this.query(text, params);
        return res.rows;
    },
    
    // Insert and return
    async insert(text, params) {
        const res = await this.query(text, params);
        return res.rows[0];
    },
    
    // Get next counter value
    async getNextCounter(name) {
        const res = await this.query(`
            UPDATE counters SET value = value + 1 WHERE name = $1 RETURNING value
        `, [name]);
        return res.rows[0].value;
    },
    
    // Generate ticket ID
    async generateTicketId() {
        const num = await this.getNextCounter('ticket_counter');
        return `SRV-${String(num).padStart(4, '0')}`;
    },
    
    // Generate trade-in ID
    async generateTradeinId() {
        const num = await this.getNextCounter('tradein_counter');
        return `TRD-${String(num).padStart(4, '0')}`;
    },
    
    // Audit log helper
    async audit(userId, entityType, entityId, action, message, details = {}) {
        await this.query(`
            INSERT INTO audit_log (user_id, entity_type, entity_id, action, message, details)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [userId, entityType, entityId, action, message, JSON.stringify(details)]);
    }
};

module.exports = db;
