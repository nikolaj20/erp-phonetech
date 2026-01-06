// ============================================
// UTILITIES MODULE
// ============================================
const Utils = {
    generateId(prefix = '') {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        return prefix ? `${prefix}-${timestamp}${random}` : `${timestamp}${random}`;
    },
    
    generateTicketId() {
        const state = State.get();
        const nextNum = (state.counters?.ticketCounter || 0) + 1;
        State.update({ counters: { ...state.counters, ticketCounter: nextNum } });
        return `SRV-${String(nextNum).padStart(4, '0')}`;
    },
    
    formatCurrency(amount) {
        return new Intl.NumberFormat('de-DE', {
            style: 'currency',
            currency: 'EUR'
        }).format(amount || 0);
    },
    
    formatDate(date, includeTime = false) {
        const d = new Date(date);
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        if (includeTime) {
            options.hour = '2-digit';
            options.minute = '2-digit';
        }
        return d.toLocaleDateString('en-US', options);
    },
    
    formatRelativeTime(date) {
        const now = new Date();
        const d = new Date(date);
        const diffMs = now - d;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return Utils.formatDate(date);
    },
    
    daysBetween(date1, date2 = new Date()) {
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        const diffTime = Math.abs(d2 - d1);
        return Math.floor(diffTime / (1000 * 60 * 60 * 24));
    },
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },
    
    getStorageSize() {
        let total = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                total += localStorage[key].length * 2;
            }
        }
        return total;
    },
    
    formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }
};

// ============================================
// TOAST NOTIFICATIONS
// ============================================
const Toast = {
    show(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        
        const colors = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            warning: 'bg-yellow-500',
            info: 'bg-blue-500'
        };
        
        const icons = {
            success: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>',
            error: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>',
            warning: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>',
            info: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>'
        };
        
        toast.className = `${colors[type]} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 toast-enter max-w-sm`;
        toast.innerHTML = `
            <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                ${icons[type]}
            </svg>
            <span class="flex-1">${Utils.escapeHtml(message)}</span>
            <button onclick="this.parentElement.remove()" class="text-white/80 hover:text-white">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.remove('toast-enter');
            toast.classList.add('toast-exit');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },
    
    success(message) { this.show(message, 'success'); },
    error(message) { this.show(message, 'error', 5000); },
    warning(message) { this.show(message, 'warning', 4000); },
    info(message) { this.show(message, 'info'); }
};

// ============================================
// MODAL SYSTEM
// ============================================
const Modal = {
    container: null,
    
    init() {
        this.container = document.getElementById('modal-container');
        this.container.addEventListener('click', (e) => {
            if (e.target === this.container.firstElementChild) {
                this.close();
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.container.classList.contains('hidden')) {
                this.close();
            }
        });
    },
    
    show(templateId) {
        const template = document.getElementById(templateId);
        if (!template) {
            console.error(`Template ${templateId} not found`);
            return;
        }
        this.container.innerHTML = template.innerHTML;
        this.container.classList.remove('hidden');
    },
    
    close() {
        this.container.classList.add('hidden');
        this.container.innerHTML = '';
    }
};
