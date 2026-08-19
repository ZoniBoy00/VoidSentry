/**
 * Slash command to look up ban information for a user.
 * 
 * Retrieves ban details from the server including ban reason,
 * account creation date, and flags suspicious accounts (< 7 days old).
 * 
 * @module commands/banInfo
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

const CONFIG = require('../config');
const { COLORS, LOGO_URL, BRAND_LOGGING } = require('../utils/constants');
const { createLogoAttachment, formatTimestamp, sanitizeEmbedText } = require('../utils/helpers');
const { hasAdminPermission } = require('../utils/permissions');
const logger = require('../utils/logger');

/** Regex to validate Discord snowflake IDs (17-19 digits) */
const DISCORD_ID_REGEX = /^\d{17,19}$/;

module.exports = {
    /** Command definition for Discord */
    data: new SlashCommandBuilder()
        .setName('ban-info')
        .setDescription('Look up ban information for a user by ID.')
        .addStringOption(opt => opt.setName('user_id').setDescription('Discord User ID').setRequired(true)),

    /**
     * Execute the ban-info command.
     * 
     * @param {import('discord.js').CommandInteraction} interaction - Discord interaction
     * @returns {Promise<void>}
     */
    async execute(interaction) {
        // Check permissions
        if (!hasAdminPermission(interaction.member)) {
            return interaction.reply({ content: '❌ No permission.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const userId = interaction.options.getString('user_id');

        // Validate input format
        if (!DISCORD_ID_REGEX.test(userId)) {
            return interaction.editReply({
                content: '❌ Invalid Discord ID format. Must be 17-19 digits.',
            });
        }

        const guild = interaction.guild;

        try {
            // Fetch ban info from server
            const banInfo = await guild.bans.fetch(userId).catch(() => null);

            if (!banInfo) {
                return interaction.editReply({
                    content: `ℹ️ User \`${userId}\` is **not banned** on this server.`,
                });
            }

            const user = banInfo.user;
            const accountAge = Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24));

            // Build ban info embed
            const embed = new EmbedBuilder()
                .setColor(COLORS.WARNING)
                .setTitle('🔍 Ban Information')
                .setAuthor({ name: BRAND_LOGGING, iconURL: LOGO_URL })
                .setThumbnail(user.displayAvatarURL({ size: 256, dynamic: true }))
                .addFields(
                    { name: '👤 User', value: `**Tag:** ${sanitizeEmbedText(user.tag, 100)}\n**ID:** \`${user.id}\``, inline: true },
                    { name: '📅 Created', value: formatTimestamp(user.createdAt), inline: true },
                    { name: '📋 Reason', value: sanitizeEmbedText(banInfo.reason || 'No reason', 1024), inline: false },
                )
                .setTimestamp()
                .setFooter({ text: BRAND_LOGGING, iconURL: LOGO_URL });

            if (accountAge < 7) {
                embed.addFields({ name: '🚩 Suspicious', value: `⚠️ Account only **${accountAge} days** old`, inline: false });
            }

            await interaction.editReply({ embeds: [embed], files: [createLogoAttachment()] });

        } catch (error) {
            logger.error('ban-info failed:', error);
            await interaction.editReply({ content: '❌ Failed to fetch ban info.' });
        }
    },
};