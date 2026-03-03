const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    MessageFlags,
} = require('discord.js');

const CONFIG = require('../config');
const stats = require('../utils/stats');
const { COLORS, LOGO_URL, BRAND_NAME } = require('../utils/constants');
const { createLogoAttachment, formatTimestamp } = require('../utils/helpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Shows VoidSentry bot status, uptime, and ban statistics.'),

    async execute(interaction) {
        // Permission check: OWNER_ID or Administrator
        const isOwner = interaction.user.id === CONFIG.OWNER_ID;
        const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);

        if (!isOwner && !isAdmin) {
            return await interaction.reply({
                content: '❌ You do not have permission to use this command.',
                flags: [MessageFlags.Ephemeral],
            });
        }

        const summary = stats.getSummary();
        const client = interaction.client;

        const embed = new EmbedBuilder()
            .setColor(COLORS.INFO)
            .setTitle(`📊 ${BRAND_NAME} Status`)
            .setAuthor({ name: BRAND_NAME, iconURL: LOGO_URL })
            .setThumbnail(client.user.displayAvatarURL({ size: 128 }))
            .addFields(
                {
                    name: '⏱️ Uptime',
                    value: `\`${summary.uptime}\``,
                    inline: true,
                },
                {
                    name: '📡 Ping',
                    value: `\`${client.ws.ping}ms\``,
                    inline: true,
                },
                {
                    name: '🏠 Servers',
                    value: `\`${client.guilds.cache.size}\``,
                    inline: true,
                },
                {
                    name: '🔨 Total Bans',
                    value: `\`${summary.totalBans}\``,
                    inline: true,
                },
                {
                    name: '⚠️ Total Detections',
                    value: `\`${summary.totalDetections}\``,
                    inline: true,
                },
                {
                    name: '📨 DM Success Rate',
                    value: `\`${summary.dmSuccessRate}%\``,
                    inline: true,
                },
                {
                    name: '🪤 Monitored Channels',
                    value: `\`${CONFIG.BAN_CHANNEL_IDS.length}\` channel(s)`,
                    inline: true,
                },
                {
                    name: '📝 Log Channel',
                    value: CONFIG.LOG_CHANNEL_ID ? `<#${CONFIG.LOG_CHANNEL_ID}>` : 'Not configured',
                    inline: true,
                },
            );

        // Add recent bans if any
        if (summary.recentBans.length > 0) {
            const recentList = summary.recentBans
                .slice(0, 5)
                .map((ban, i) => `\`${i + 1}.\` **${ban.userTag}** — ${formatTimestamp(ban.timestamp)}`)
                .join('\n');

            embed.addFields({
                name: `📋 Recent Bans (Last ${Math.min(summary.recentBans.length, 5)})`,
                value: recentList,
                inline: false,
            });
        }

        if (summary.startedAt) {
            embed.addFields({
                name: '🚀 Started At',
                value: formatTimestamp(summary.startedAt),
                inline: false,
            });
        }

        embed
            .setTimestamp()
            .setFooter({ text: `${BRAND_NAME} v2.0`, iconURL: LOGO_URL });

        await interaction.reply({
            embeds: [embed],
            files: [createLogoAttachment()],
            flags: [MessageFlags.Ephemeral],
        });
    },
};
