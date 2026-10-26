/**
 * Slash command to stop posting ban logs for this server.
 *
 * Clears the server's log channel. If a global LOG_CHANNEL_ID default is
 * configured and belongs to this server, it applies again.
 *
 * @module commands/removeLogChannel
 */

const { SlashCommandBuilder, MessageFlags } = require('discord.js');

const guildSettings = require('../utils/guildSettings');
const logger = require('../utils/logger');

module.exports = {
    /** Enforced by the interaction router: server-only, owner or administrator */
    adminOnly: true,

    /** Command definition for Discord */
    data: new SlashCommandBuilder()
        .setName('remove-logchannel')
        .setDescription('Stop posting ban logs for this server.')
        .setDMPermission(false),

    /**
     * Execute the remove-logchannel command.
     *
     * @param {import('discord.js').CommandInteraction} interaction - Discord interaction
     * @returns {Promise<void>}
     */
    async execute(interaction) {
        try {
            await guildSettings.setLogChannel(interaction.guild.id, null);
        } catch (error) {
            logger.error(`Failed to clear log channel for guild ${interaction.guild.id}.`, error);
            return interaction.reply({ content: '❌ Failed to clear the log channel. Please try again.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.reply({
            content: '✅ Log channel removed. Bans are still carried out, but no log is posted.',
            flags: [MessageFlags.Ephemeral],
        });
    },
};
