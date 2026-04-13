/**
 * In-memory statistics tracker.
 * 
 * Tracks bans, detections, DM success rate, and uptime.
 * Uses singleton pattern to maintain stats across the bot lifetime.
 * 
 * @module utils/stats
 */

/**
 * Statistics class for tracking bot metrics.
 */
class Stats {
    constructor() {
        this.startedAt = null;
        this.totalBans = 0;
        this.totalDetections = 0;
        this.recentBans = []; // Last 50 bans with details
        this.dmSuccessCount = 0;
        this.dmFailCount = 0;
    }

    /**
     * Initialize statistics on bot startup.
     */
    start() {
        this.startedAt = new Date();
    }

    /**
     * Record a ban event.
     * 
     * @param {string} userId - Banned user's ID
     * @param {string} userTag - Banned user's tag
     * @param {string} channelId - Channel where violation occurred
     */
    recordBan(userId, userTag, channelId) {
        this.totalBans++;
        this.totalDetections++;

        this.recentBans.unshift({
            userId,
            userTag,
            channelId,
            timestamp: new Date(),
        });

        // Keep only last 50 entries
        if (this.recentBans.length > 50) {
            this.recentBans.pop();
        }
    }

    /**
     * Record a detection without ban (unused in current implementation).
     */
    recordDetection() {
        this.totalDetections++;
    }

    /**
     * Record successful DM notification.
     */
    recordDmSuccess() {
        this.dmSuccessCount++;
    }

    /**
     * Record failed DM notification.
     */
    recordDmFail() {
        this.dmFailCount++;
    }

    /**
     * Get formatted uptime string.
     * 
     * @returns {string} Formatted uptime (e.g., "2d 3h 45m 30s")
     */
    getUptime() {
        if (!this.startedAt) return 'Not started';
        
        const ms = Date.now() - this.startedAt.getTime();
        const seconds = Math.floor(ms / 1000) % 60;
        const minutes = Math.floor(ms / (1000 * 60)) % 60;
        const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;
        const days = Math.floor(ms / (1000 * 60 * 60 * 24));

        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        parts.push(`${seconds}s`);

        return parts.join(' ');
    }

    /**
     * Get summary of all statistics.
     * 
     * @returns {Object} Statistics summary
     */
    getSummary() {
        const totalDms = this.dmSuccessCount + this.dmFailCount;
        return {
            uptime: this.getUptime(),
            startedAt: this.startedAt,
            totalBans: this.totalBans,
            totalDetections: this.totalDetections,
            recentBans: this.recentBans.slice(0, 10),
            dmSuccessRate: totalDms > 0
                ? Math.round((this.dmSuccessCount / totalDms) * 100)
                : 0,
        };
    }
}

// Singleton instance
const stats = new Stats();
module.exports = stats;