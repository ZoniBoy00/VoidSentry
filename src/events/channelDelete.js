/**
 * Channel delete event handler.
 *
 * Drops a deleted channel from the trap channel list.
 *
 * @module events/channelDelete
 */

const { Events } = require('discord.js');

const logger = require('../utils/logger');
const guildSettings = require('../utils/guildSettings');

module.exports = {
    /** Event name for Discord.js */
    name: Events.ChannelDelete,
    once: false,

    /**
     * @param {import('discord.js').Client} client - Discord client instance
     * @param {import('discord.js').GuildChannel} channel - Deleted channel
     */
    async execute(client, channel) {
        if (!channel.guild || !guildSettings.listTrapChannels(channel.guild.id).includes(channel.id)) return;
        try {
            await guildSettings.removeTrapChannel(channel.id);
            logger.info(`Trap channel ${channel.id} was deleted and has been unregistered.`);
        } catch (error) {
            logger.error(`Failed to unregister deleted trap channel ${channel.id}.`, error);
        }
    },
};
