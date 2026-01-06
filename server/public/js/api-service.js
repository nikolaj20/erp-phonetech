// ============================================
// API SERVICE - Handles all server communication
// ============================================
const ApiService = {
    token: null,
    
    init() {
        this.token = sessionStorage.getItem('auth_token');
    },
    
    setToken(token) {
        this.token = token;
        sessionStorage.setItem('auth_token', token);
    },
    
    clearToken() {
        this.token = null;
        sessionStorage.removeItem('auth_token');
    },
    
    getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    },
    
    async request(endpoint, options = {}) {
        const url = `${API_URL}${endpoint}`;
        const config = {
            ...options,
            headers: { ...this.getHeaders(), ...options.headers }
        };
        
        try {
            const response = await fetch(url, config);
            
            if (response.status === 401) {
                this.clearToken();
                Auth.logout();
                throw new Error('Session expired. Please login again.');
            }
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: 'Request failed' }));
                throw new Error(error.error || 'Request failed');
            }
            
            return await response.json();
        } catch (error) {
            if (error.message === 'Failed to fetch') {
                console.warn('Network error - using local fallback');
                return null;
            }
            throw error;
        }
    },
    
    async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    },
    
    async post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },
    
    async put(endpoint, data) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },
    
    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }
};

// ============================================
// MULTI-DEVICE SYNC MODULE
// ============================================
const SyncManager = {
    channel: null,
    lastSyncTimestamp: 0,
    syncInterval: null,
    SYNC_INTERVAL_MS: 5000,
    VERSION_KEY: 'repairflow_data_version',
    isSyncing: false,
    pendingChanges: [],
    
    init() {
        if ('BroadcastChannel' in window) {
            this.channel = new BroadcastChannel('repairflow_sync');
            this.channel.onmessage = (event) => this.handleSyncMessage(event);
        }
        
        window.addEventListener('storage', (event) => {
            if (event.key === 'repairflow_erp_data' || event.key === this.VERSION_KEY) {
                this.handleStorageChange(event);
            }
        });
        
        this.startPeriodicSync();
        
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.checkForUpdates();
            }
        });
        
        if (!localStorage.getItem(this.VERSION_KEY)) {
            localStorage.setItem(this.VERSION_KEY, Date.now().toString());
        }
        this.lastSyncTimestamp = parseInt(localStorage.getItem(this.VERSION_KEY)) || 0;
        
        console.log('📡 SyncManager initialized');
    },
    
    broadcastChange(action, data = {}) {
        const version = Date.now();
        localStorage.setItem(this.VERSION_KEY, version.toString());
        this.lastSyncTimestamp = version;
        
        if (this.channel) {
            this.channel.postMessage({
                action,
                version,
                data,
                timestamp: new Date().toISOString()
            });
        }
    },
    
    handleSyncMessage(event) {
        const { action, version, data } = event.data;
        
        if (version > this.lastSyncTimestamp) {
            console.log('📥 Sync received from another tab:', action);
            this.lastSyncTimestamp = version;
            App.refresh();
            Toast.info('Data updated from another tab');
        }
    },
    
    handleStorageChange(event) {
        if (event.key === this.VERSION_KEY) {
            const newVersion = parseInt(event.newValue) || 0;
            if (newVersion > this.lastSyncTimestamp) {
                console.log('📥 Storage sync detected');
                this.lastSyncTimestamp = newVersion;
                App.refresh();
                Toast.info('Data synchronized');
            }
        }
    },
    
    startPeriodicSync() {
        if (USE_API) {
            setTimeout(() => this.pullFromServer(), 1000);
            this.syncInterval = setInterval(() => {
                this.pullFromServer();
            }, this.SYNC_INTERVAL_MS);
        }
    },
    
    async checkForUpdates() {
        const currentVersion = parseInt(localStorage.getItem(this.VERSION_KEY)) || 0;
        if (currentVersion > this.lastSyncTimestamp) {
            console.log('📥 Updates detected on tab focus');
            this.lastSyncTimestamp = currentVersion;
            App.refresh();
        }
        
        if (USE_API && ApiService.token) {
            await this.pullFromServer();
        }
    },
    
    async pullFromServer() {
        if (!USE_API || !ApiService.token || this.isSyncing) return;
        
        this.isSyncing = true;
        try {
            const inventory = await ApiService.get('/api/inventory');
            if (inventory && Array.isArray(inventory)) {
                const localInventory = inventory.map(item => ({
                    id: item.id.toString(),
                    type: item.type,
                    brand: item.brand,
                    model: item.model,
                    serial: item.serial,
                    source: item.source,
                    seller: item.seller || '',
                    buy: parseFloat(item.buy_price),
                    base_sell_price: parseFloat(item.base_sell_price),
                    current_price: parseFloat(item.current_price),
                    sell: item.sold_price ? parseFloat(item.sold_price) : null,
                    status: item.status,
                    visual: item.visual_grade,
                    specs: item.specs || '',
                    date: item.created_at,
                    warranty_months: item.warranty_months || 0,
                    warranty_expires: item.warranty_expires,
                    sold_date: item.sold_date,
                    sold_to: item.sold_to,
                    price_override: item.price_override_reason ? { reason: item.price_override_reason } : null
                }));
                
                const state = State.get();
                if (JSON.stringify(state.inventory) !== JSON.stringify(localInventory)) {
                    state.inventory = localInventory;
                    State._state = state;
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
                    this.broadcastChange('inventory_sync');
                    console.log('📥 Inventory synced from server:', localInventory.length, 'items');
                }
            }
        } catch (error) {
            console.warn('Failed to pull from server:', error.message);
        } finally {
            this.isSyncing = false;
        }
    },
    
    async pushToServer(action, itemData) {
        if (!USE_API || !ApiService.token) return null;
        
        try {
            let result;
            switch (action) {
                case 'add':
                    result = await ApiService.post('/api/inventory', {
                        type: itemData.type,
                        brand: itemData.brand,
                        model: itemData.model,
                        serial: itemData.serial,
                        source: itemData.source,
                        seller: itemData.seller,
                        buy_price: itemData.buy,
                        base_sell_price: itemData.base_sell_price,
                        current_price: itemData.current_price || itemData.base_sell_price,
                        visual_grade: itemData.visual,
                        specs: itemData.specs,
                        status: 'available'
                    });
                    console.log('📤 Inventory item pushed to server:', result?.id);
                    break;
                    
                case 'update':
                    result = await ApiService.put(`/api/inventory/${itemData.id}`, {
                        current_price: itemData.current_price,
                        status: itemData.status,
                        sold_price: itemData.sell,
                        sold_date: itemData.sold_date,
                        sold_to: itemData.sold_to,
                        warranty_months: itemData.warranty_months,
                        warranty_expires: itemData.warranty_expires,
                        price_override_reason: itemData.price_override?.reason
                    });
                    console.log('📤 Inventory item updated on server:', itemData.id);
                    break;
                    
                case 'sell':
                    result = await ApiService.post(`/api/inventory/${itemData.id}/sell`, {
                        sold_price: itemData.sell,
                        sold_to: itemData.sold_to,
                        warranty_months: itemData.warranty_months
                    });
                    console.log('📤 Item sold synced to server:', itemData.id);
                    break;
            }
            
            return result;
        } catch (error) {
            console.warn('Failed to push to server:', error.message);
            this.pendingChanges.push({ action, itemData, timestamp: Date.now() });
            return null;
        }
    },
    
    async retryPendingChanges() {
        if (this.pendingChanges.length === 0) return;
        
        const changes = [...this.pendingChanges];
        this.pendingChanges = [];
        
        for (const change of changes) {
            await this.pushToServer(change.action, change.itemData);
        }
    },
    
    destroy() {
        if (this.channel) {
            this.channel.close();
        }
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
    }
};
