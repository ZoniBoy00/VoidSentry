/**
 * Slash command to initialize a trap channel.
 * 
 * Clears the channel of existing messages and posts a warning embed
 * to notify users that sending messages will result in an instant ban.
 * 
 * @module commands/setupTrap
 */

const { SlashCommandBuilder, MessageFlags } = require('discord.js');

const CONFIG = require('../config');
const { createWarningEmbed } = require('../embeds/warningEmbed');
const { createLogoAttachment } = require('../utils/helpers');
const { hasAdminPermission } = require('../utils/permissions');
const logger = require('../utils/logger');

module.exports = {
    /** Command definition for Discord */
    data: new SlashCommandBuilder()
        .setName('setup-trap')
        .setDescription('Initializes the trap: Clears channel and posts warning.'),

    /**
     * Execute the setup-trap command.
     * 
     * @param {import('discord.js').CommandInteraction} interaction - Discord interaction
     * @returns {Promise<void>}
     */
    async execute(interaction) {
        // Check permissions (owner or administrator)
        if (!hasAdminPermission(interaction.member)) {
            return interaction.reply({
                content: '❌ You do not have permission to use this command.',
                flags: [MessageFlags.Ephemeral],
            });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const channel = interaction.channel;
        if (!channel?.isTextBased() || typeof channel.bulkDelete !== 'function') {
            return interaction.editReply({ content: '❌ This command can only be used in a text channel.' });
        }

        // Warn if channel is not in the monitored list
        if (!CONFIG.BAN_CHANNEL_IDS.includes(channel.id)) {
            logger.warn(`setup-trap used in non-monitored channel #${channel.name} (${channel.id})`);
            return interaction.editReply({
                content: '⚠️ This channel is not in the `BAN_CHANNEL_IDS` list. Setup will proceed, but I won\'t auto-ban here until added.',
            });
        }

        // Clear up to 50 recent messages; Discord does not bulk-delete messages older than 14 days.
        const fetched = await channel.messages.fetch({ limit: 50 }).catch(() => null);
        if (fetched?.size > 0) {
            await channel.bulkDelete(fetched, true).catch(() => {});
            logger.info(`Cleared ${fetched.size} messages from #${channel.name}`);
        }

        // Send warning embed
        await channel.send({
            embeds: [createWarningEmbed()],
            files: [createLogoAttachment()],
        });

        logger.info(`Trap channel #${channel.name} initialized.`);
        await interaction.editReply({ content: '✅ Trap channel has been initialized.' });
    },
};