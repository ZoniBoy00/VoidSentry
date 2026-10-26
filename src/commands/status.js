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
const db = require('../utils/db');
const guildSettings = require('../utils/guildSettings');
const logger = require('../utils/logger');
const { COLORS, LOGO_URL, BRAND_NAME } = require('../utils/constants');
const { createLogoAttachment, formatTimestamp, sanitizeEmbedText } = require('../utils/helpers');
const { VERSION } = require('../utils/constants');

module.exports = {
    /** Enforced by the interaction router: server-only, owner or administrator */
    adminOnly: true,

    /** Command definition for Discord */
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Shows VoidSentry bot status, uptime, and ban statistics.')
        .setDMPermission(false),

    /**
     * Execute the status command.
     * 
     * @param {import('discord.js').CommandInteraction} interaction - Discord interaction
     * @returns {Promise<void>}
     */
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const summary = stats.getSummary();
        const client = interaction.client;
        const guildId = interaction.guildId ?? null;
        const guildConfig = guildId ? guildSettings.getGuildConfig(guildId) : null;
        const trapCount = guildId ? guildSettings.listTrapChannels(guildId).length : CONFIG.BAN_CHANNEL_IDS.length;
        const logChannelId = guildConfig ? guildConfig.logChannelId : CONFIG.LOG_CHANNEL_ID;
        let storedBanCount = null;
        let recentBans = [];
        try {
            [storedBanCount, recentBans] = await Promise.all([
                db.getBanCount(guildId),
                db.getBans(5, 0, guildId),
            ]);
        } catch (error) {
            logger.error('Failed to load persistent ban history for /status.', error);
        }

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
                { name: guildId ? '🗄️ Bans on This Server' : '🗄️ Bans in Database', value: storedBanCount === null ? 'Unavailable' : `\`${storedBanCount}\``, inline: true },
                { name: '🔨 Bans This Run', value: `\`${summary.totalBans}\``, inline: true },
                { name: '⚠️ Detections This Run', value: `\`${summary.totalDetections}\``, inline: true },
                { name: '📨 DM Success This Run', value: `\`${summary.dmSuccessRate}%\``, inline: true },
                { name: '🪤 Channels', value: `\`${trapCount}\``, inline: true },
                { name: '📝 Log Channel', value: logChannelId ? `<#${logChannelId}>` : 'Not set', inline: true },
            );

        // Show persistent history rather than the process-local recent-ban cache.
        if (recentBans.length > 0) {
            embed.addFields({
                name: `📋 Latest Stored Bans (${recentBans.length})`,
                value: recentBans.map((ban, i) => `\`${i + 1}.\` **${sanitizeEmbedText(ban.user_tag, 100)}** — ${formatTimestamp(new Date(ban.created_at))}`).join('\n'),
                inline: false,
            });
        }

        // Add startup time
        if (summary.startedAt) {
            embed.addFields({ name: '🚀 Started', value: formatTimestamp(summary.startedAt), inline: false });
        }

        embed.setTimestamp().setFooter({ text: `${BRAND_NAME} v${VERSION}`, iconURL: LOGO_URL });

        await interaction.editReply({ embeds: [embed], files: [createLogoAttachment()] });
    },
};
