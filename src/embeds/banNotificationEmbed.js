/**
 * Ban notification embed for DM to banned user.
 * 
 * Sends a notification to the user before they are banned.
 * This is a best-effort notification that fails silently if the user
 * has DMs disabled.
 * 
 * @module embeds/banNotificationEmbed
 */

const { EmbedBuilder } = require('discord.js');
const { COLORS, LOGO_URL, BRAND_SECURITY } = require('../utils/constants');

/**
 * Creates an embed to send to the user before banning.
 * 
 * @param {string} guildName - Name of the server where ban occurred
 * @param {string} reason - Ban reason
 * @returns {import('discord.js').EmbedBuilder} Notification embed
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