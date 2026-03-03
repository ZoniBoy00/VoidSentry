const { EmbedBuilder } = require('discord.js');
const { COLORS, LOGO_URL, BRAND_LOGGING } = require('../utils/constants');
const { formatTimestamp } = require('../utils/helpers');

/**
 * Creates a detailed ban log embed with extensive user information.
 *
 * @param {import('discord.js').User} user - The banned user
 * @param {import('discord.js').GuildMember|null} member - The member object (may be null if already removed)
 * @param {string} reason - Ban reason
 * @param {string} channelId - ID of the channel where the violation occurred
 * @param {string} messageContent - The content of the violating message
 * @returns {EmbedBuilder}
 */
function createBanLogEmbed(user, member, reason, channelId, messageContent) {
    const accountCreated = user.createdAt;

    const embed = new EmbedBuilder()
        .setColor(COLORS.DANGER)
        .setTitle('🔨 Security Action: User Banned')
        .setAuthor({ name: BRAND_LOGGING, iconURL: LOGO_URL })
        .setThumbnail(user.displayAvatarURL({ size: 256, dynamic: true }))
        .addFields(
            {
                name: '👤 User',
                value: [
                    `**Tag:** ${user.tag}`,
                    `**ID:** \`${user.id}\``,
                    `**Mention:** <@${user.id}>`,
                ].join('\n'),
                inline: true,
            },
            {
                name: '📅 Account Created',
                value: formatTimestamp(accountCreated),
                inline: true,
            },
        );

    // Member-specific info (available only if still cached)
    if (member) {
        const joinedAt = member.joinedAt;

        embed.addFields(
            {
                name: '📥 Joined Server',
                value: joinedAt ? formatTimestamp(joinedAt) : 'Unknown',
                inline: true,
            },
            {
                name: '🏷️ Display Name',
                value: member.displayName || user.username,
                inline: true,
            },
        );

        // Roles (excluding @everyone)
        const roles = member.roles.cache
            .filter(r => r.id !== member.guild.id)
            .sort((a, b) => b.position - a.position)
            .map(r => `<@&${r.id}>`)
            .slice(0, 15); // Limit to 15 roles

        if (roles.length > 0) {
            embed.addFields({
                name: `🎭 Roles (${roles.length})`,
                value: roles.join(', '),
                inline: false,
            });
        }
    }

    // Violation details
    embed.addFields(
        {
            name: '⚠️ Violation Reason',
            value: reason,
            inline: false,
        },
        {
            name: '📍 Detected In',
            value: `<#${channelId}>`,
            inline: true,
        },
        {
            name: '🕐 Action Taken At',
            value: formatTimestamp(new Date()),
            inline: true,
        },
    );

    // Message content (truncated if needed)
    if (messageContent) {
        const sanitized = messageContent.length > 1000
            ? messageContent.substring(0, 1000) + '...'
            : messageContent;

        embed.addFields({
            name: '💬 Message Content',
            value: `\`\`\`${sanitized}\`\`\``,
            inline: false,
        });
    }

    // Account age warning
    const accountAgeMs = Date.now() - accountCreated.getTime();
    const accountAgeDays = Math.floor(accountAgeMs / (1000 * 60 * 60 * 24));

    if (accountAgeDays < 7) {
        embed.addFields({
            name: '🚩 Suspicious Flag',
            value: `⚠️ Account is only **${accountAgeDays} day${accountAgeDays !== 1 ? 's' : ''}** old!`,
            inline: false,
        });
    }

    embed
        .setTimestamp()
        .setFooter({ text: `${BRAND_LOGGING} • User messages from last 24h deleted`, iconURL: LOGO_URL });

    return embed;
}

module.exports = { createBanLogEmbed };
