const { EmbedBuilder } = require('discord.js');
const { COLORS, LOGO_URL, BRAND_SECURITY } = require('../utils/constants');

/**
 * Creates an embed to DM to the user before banning them.
 * This is a best-effort notification — it will silently fail if the user has DMs disabled.
 *
 * @param {string} guildName - Name of the server
 * @param {string} reason - Ban reason
 * @returns {EmbedBuilder}
 */
function createBanNotificationEmbed(guildName, reason) {
    return new EmbedBuilder()
        .setColor(COLORS.DANGER)
        .setTitle('🔨 You Have Been Banned')
        .setAuthor({ name: BRAND_SECURITY, iconURL: LOGO_URL })
        .setDescription(
            `You have been **permanently banned** from **${guildName}**.\n\n` +
            'This action was taken automatically by the security system and cannot be appealed.'
        )
        .addFields(
            {
                name: '📋 Reason',
                value: reason,
                inline: false,
            },
            {
                name: '⚠️ Note',
                value: 'All messages you sent in the last 24 hours have been removed.',
                inline: false,
            },
        )
        .setTimestamp()
        .setFooter({ text: `${BRAND_SECURITY} • Automated Action` });
}

module.exports = { createBanNotificationEmbed };
