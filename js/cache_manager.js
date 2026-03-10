/**
 * ============================================================
 *  IT TICKETING PLATFORM — Cache Manager
 *  File: js/cache_manager.js
 *  Purpose: Handle browser localStorage with expiration.
 * ============================================================
 */

const CACHE_MANAGER = {
    /**
     * Store data in localStorage with an expiry time
     * @param {string} key - The cache key
     * @param {any} data - The data to store
     * @param {number} expiryMinutes - Expiry time in minutes (default: 15)
     */
    set: function (key, data, expiryMinutes = 15) {
        const now = new Date();
        const item = {
            data: data,
            expiry: now.getTime() + (expiryMinutes * 60 * 1000)
        };
        localStorage.setItem(key, JSON.stringify(item));
    },

    /**
     * Retrieve data from localStorage, checking for expiry
     * @param {string} key - The cache key
     * @returns {any|null} - The cached data or null if not found/expired
     */
    get: function (key) {
        const itemStr = localStorage.getItem(key);
        if (!itemStr) return null;

        try {
            const item = JSON.parse(itemStr);
            const now = new Date();

            // Check if expired
            if (now.getTime() > item.expiry) {
                localStorage.removeItem(key);
                return null;
            }
            return item.data;
        } catch (e) {
            console.error("Cache parsing error for key: " + key, e);
            return null;
        }
    },

    /**
     * Manually remove a cache item
     * @param {string} key - The cache key
     */
    remove: function (key) {
        localStorage.removeItem(key);
    },

    /**
     * Clear all ticketing related cache
     */
    clearAll: function () {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.includes('cache_data') || key.includes('Tickets')) {
                localStorage.removeItem(key);
            }
        });
    }
};
