/**
 * Client ready event handler.
 * 
 * Executed once when the bot successfully connects to Discord.
 * Initializes stats, database, sets presence, and logs startup information.
 * 
 * @module events/ready
 */

const { Events } = require('discord.js');

const CONFIG = require('../config');
const logger = require('../utils/logger');
const stats = require('../utils/stats');
const db = require('../utils/db');
const guildSettings = require('../utils/guildSettings');
const presence = require('../utils/presence');
const sessionRevocations = require('../utils/sessionRevocations');
const { startStatsServer } = require('../utils/statsServer');
const { DECIDED_RETENTION_DAYS } = require('../utils/appeals');

const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Once a day: clear old captured message content (see MESSAGE_RETENTION_DAYS)
 * and delete appeals decided more than DECIDED_RETENTION_DAYS ago.
 */
function scheduleRetention() {
    const run = () => {
        if (CONFIG.MESSAGE_RETENTION_DAYS) {
            db.purgeOldMessageContent(CONFIG.MESSAGE_RETENTION_DAYS)
                .then(count => { if (count > 0) logger.info(`Cleared message content from ${count} old ban record(s).`); })
                .catch(err => logger.error('Failed to clear old message content.', err));
        }
        db.purgeDecidedAppeals(DECIDED_RETENTION_DAYS)
            .then(count => { if (count > 0) logger.info(`Deleted ${count} appeal(s) decided over ${DECIDED_RETENTION_DAYS} days ago.`); })
            .catch(err => logger.error('Failed to delete old appeals.', err));
    };
    run();
    setInterval(run, RETENTION_INTERVAL_MS).unref();
}

module.exports = {
    /** Event name for Discord.js */
    name: Events.ClientReady,
    /** Only execute once, not on reconnections */
    once: true,

    /**
     * Handle client ready event.
     * 
     * @param {import('discord.js').Client} client - Discord client instance
     */
    async execute(client) {
        // Initialize statistics tracking
        stats.start();

        logger.system(`Logged in as ${client.user.tag} (${client.user.id})`);

        // Initialize database connection
        try {
            await db.initDatabase();
            logger.system('Database connection established');
            await guildSettings.load();
            // Only the dashboard API uses session revocations.
            if (CONFIG.DASHBOARD_API && CONFIG.STATS_TOKEN) await sessionRevocations.load();
            scheduleRetention();
        } catch (err) {
            logger.fatal('Failed to initialize database. Shutting down:', err);
            await db.closePool().catch(() => {});
            client.destroy();
            process.exitCode = 1;
            return;
        }

        // Rotating presence: status text, server count, total bans
        await presence.start(client);

        // Optional public stats endpoint for the website
        if (CONFIG.STATS_PORT) {
            try {
                await startStatsServer(client, {
                    port: CONFIG.STATS_PORT,
                    host: CONFIG.STATS_HOST,
                    token: CONFIG.STATS_TOKEN,
                    previousToken: CONFIG.STATS_TOKEN_PREVIOUS,
                    dashboard: CONFIG.DASHBOARD_API,
                });
            } catch (err) {
                logger.error(`Could not start the stats endpoint on port ${CONFIG.STATS_PORT}.`, err);
            }
        }

        logger.system(`Serving ${client.guilds.cache.size} server(s); ${CONFIG.BAN_CHANNEL_IDS.length} global trap channel(s) configured.`);
        logger.info('VoidSentry is ready and operational.');
    },
};