/**
 * Guild delete event handler.
 *
 * Removes a server's trap channels and settings when the bot leaves or is
 * removed. Ban history is kept.
 *
 * @module events/guildDelete
 */

const { Events } = require('discord.js');

const logger = require('../utils/logger');
const guildSettings = require('../utils/guildSettings');

module.exports = {
    /** Event name for Discord.js */
    name: Events.GuildDelete,
    once: false,

    /**
     * @param {import('discord.js').Client} client - Discord client instance
     * @param {import('discord.js').Guild} guild - Guild the bot left
     */
    async execute(client, guild) {
        // An unavailable guild is a Discord outage, not a removal.
        if (guild.available === false) return;
        try {
            await guildSettings.removeGuild(guild.id);
            logger.info(`Left guild ${guild.name ?? guild.id}; its trap settings were removed.`);
        } catch (error) {
            logger.error(`Failed to clean up settings for guild ${guild.id}.`, error);
        }
    },
};
