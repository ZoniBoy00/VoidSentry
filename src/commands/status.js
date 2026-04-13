/**
 * Slash command to display bot status and statistics.
 * 
 * Shows uptime, ping, server count, ban statistics, and recent bans.
 * Only accessible to the bot owner or server administrators.
 * 
 * @module commands/status
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

const CONFIG = require('../config');
const stats = require('../utils/stats');
const { COLORS, LOGO_URL, BRAND_NAME } = require('../utils/constants');
const { createLogoAttachment, formatTimestamp } = require('../utils/helpers');
const { hasAdminPermission } = require('../utils/permissions');

module.exports = {
    /** Command definition for Discord */
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Shows VoidSentry bot status, uptime, and ban statistics.'),

    /**
     * Execute the status command.
     * 
     * @param {import('discord.js').CommandInteraction} interaction - Discord interaction
     * @returns {Promise<void>}
     */
    async execute(interaction) {
        // Check permissions
        if (!hasAdminPermission(interaction.member)) {
            return interaction.reply({
                content: '❌ You do not have permission to use this command.',
                flags: [MessageFlags.Ephemeral],
            });
        }

        const summary = stats.getSummary();
        const client = interaction.client;

        // Build status embed
        const embed = new EmbedBuilder()
            .setColor(COLORS.INFO)
            .setTitle(`📊 ${BRAND_NAME} Status`)
            .setAuthor({ name: BRAND_NAME, iconURL: LOGO_URL })
            .setThumbnail(client.user.displayAvatarURL({ size: 128 }))
            .addFields(
                { name: '⏱️ Uptime', value: `\`${summary.uptime}\``, inline: true },
                { name: '📡 Ping', value: `\`${client.ws.ping}ms\``, inline: true },
                { name: '🏠 Servers', value: `\`${client.guilds.cache.size}\``, inline: true },
                { name: '🔨 Total Bans', value: `\`${summary.totalBans}\``, inline: true },
                { name: '⚠️ Detections', value: `\`${summary.totalDetections}\``, inline: true },
                { name: '📨 DM Success', value: `\`${summary.dmSuccessRate}%\``, inline: true },
                { name: '🪤 Channels', value: `\`${CONFIG.BAN_CHANNEL_IDS.length}\``, inline: true },
                { name: '📝 Log Channel', value: CONFIG.LOG_CHANNEL_ID ? `<#${CONFIG.LOG_CHANNEL_ID}>` : 'Not set', inline: true },
            );

        // Add recent bans if available
        if (summary.recentBans.length > 0) {
            embed.addFields({
                name: `📋 Recent Bans (${Math.min(summary.recentBans.length, 5)})`,
                value: summary.recentBans.slice(0, 5).map((b, i) => `\`${i + 1}.\` **${b.userTag}** — ${formatTimestamp(b.timestamp)}`).join('\n'),
                inline: false,
            });
        }

        // Add startup time
        if (summary.startedAt) {
            embed.addFields({ name: '🚀 Started', value: formatTimestamp(summary.startedAt), inline: false });
        }

        embed.setTimestamp().setFooter({ text: `${BRAND_NAME} v2.0`, iconURL: LOGO_URL });

        await interaction.reply({ embeds: [embed], files: [createLogoAttachment()], flags: [MessageFlags.Ephemeral] });
    },
};