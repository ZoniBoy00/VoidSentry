const { Events, ActivityType } = require('discord.js');
const CONFIG = require('../config');
const { deployCommands } = require('../utils/deploy');
const logger = require('../utils/logger');
const stats = require('../utils/stats');

module.exports = {
    name: Events.ClientReady,
    once: true,

    async execute(client) {
        stats.start();

        logger.system(`Logged in as ${client.user.tag}`);

        // Set presence (DND + custom status)
        client.user.setPresence({
            activities: [{ name: CONFIG.STATUS_TEXT, type: ActivityType.Watching }],
            status: 'dnd',
        });

        client.user.setStatus('dnd');

        // Deploy slash commands
        await deployCommands();

        logger.system(`Monitoring ${CONFIG.BAN_CHANNEL_IDS.length} trap channel(s).`);
        logger.info('VoidSentry is ready and operational.');
    },
};
