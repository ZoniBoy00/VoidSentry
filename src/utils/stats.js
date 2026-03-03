/**
 * In-memory statistics tracker for VoidSentry.
 * Tracks bans, detections, and uptime.
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

    start() {
        this.startedAt = new Date();
    }

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

    recordDetection() {
        this.totalDetections++;
    }

    recordDmSuccess() {
        this.dmSuccessCount++;
    }

    recordDmFail() {
        this.dmFailCount++;
    }

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

    getSummary() {
        return {
            uptime: this.getUptime(),
            startedAt: this.startedAt,
            totalBans: this.totalBans,
            totalDetections: this.totalDetections,
            recentBans: this.recentBans.slice(0, 10),
            dmSuccessRate: this.dmSuccessCount + this.dmFailCount > 0
                ? Math.round((this.dmSuccessCount / (this.dmSuccessCount + this.dmFailCount)) * 100)
                : 0,
        };
    }
}

// Singleton instance
const stats = new Stats();
module.exports = stats;
