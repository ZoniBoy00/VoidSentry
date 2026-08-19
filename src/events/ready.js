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
        } catch (err) {
            logger.fatal('Failed to initialize database. Shutting down:', err);
            await db.closePool().catch(() => {});
            client.destroy();
            process.exitCode = 1;
            return;
        }

        // Set bot presence (status text and dnd status)
        client.user.setPresence({
            activities: [{ name: CONFIG.STATUS_TEXT, type: 3 }], // ActivityType.Watching = 3
            status: 'dnd',
        });

        logger.system(`Monitoring ${CONFIG.BAN_CHANNEL_IDS.length} trap channel(s).`);
        logger.info('VoidSentry is ready and operational.');
    },
};