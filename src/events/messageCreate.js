const { Events, PermissionFlagsBits } = require('discord.js');
const CONFIG = require('../config');
const { BAN_REASON } = require('../utils/constants');
const { createBanLogEmbed } = require('../embeds/banLogEmbed');
const { createBanNotificationEmbed } = require('../embeds/banNotificationEmbed');
const { createLogoAttachment, fetchChannel } = require('../utils/helpers');
const logger = require('../utils/logger');
const stats = require('../utils/stats');

module.exports = {
    name: Events.MessageCreate,
    once: false,

    async execute(message) {
        // 1. Validation: Ignore bots, DMs, and non-monitored channels
        if (message.author.bot || !message.guild || !CONFIG.BAN_CHANNEL_IDS.includes(message.channel.id)) {
            return;
        }

        const { author, guild, member, channel } = message;
        const messageContent = message.content || '[No text content]';

        try {
            logger.detection(`Violation in #${channel.name} (${channel.id}) by ${author.tag} (${author.id})`);

            // 2. Immediate Cleanup of the trigger message
            if (message.deletable) {
                await message.delete().catch(() => null);
            }

            // 3. Permission & Hierarchy Validation
            const botMember = guild.members.me;
            if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
                logger.error('Missing "Ban Members" permission!');
                return;
            }

            if (!member?.bannable) {
                logger.warn(`Cannot ban ${author.tag} — role hierarchy issue or member unavailable.`);
                return;
            }

            // 4. Cache member info BEFORE banning (so we have data for the log)
            const memberData = {
                displayName: member.displayName,
                joinedAt: member.joinedAt,
                roles: member.roles.cache.clone(),
                guild: member.guild,
            };

            // 5. Try to DM the user before banning (best effort)
            try {
                const dmEmbed = createBanNotificationEmbed(guild.name, BAN_REASON);
                await author.send({ embeds: [dmEmbed] });
                stats.recordDmSuccess();
                logger.info(`DM notification sent to ${author.tag} before ban.`);
            } catch {
                stats.recordDmFail();
                logger.warn(`Could not DM ${author.tag} — DMs likely disabled.`);
            }

            // 6. Execute Ban — delete messages from last 24 hours (86400 seconds)
            await guild.members.ban(author, {
                reason: BAN_REASON,
                deleteMessageSeconds: CONFIG.DELETE_MESSAGE_SECONDS,
            });

            // 7. Record stats
            stats.recordBan(author.id, author.tag, channel.id);
            logger.ban(`${author.tag} (${author.id}) removed for trap violation. 24h messages purged.`);

            // 8. Send detailed log to log channel
            if (CONFIG.LOG_CHANNEL_ID) {
                const logChannel = await fetchChannel(guild, CONFIG.LOG_CHANNEL_ID);
                if (logChannel) {
                    const memberProxy = {
                        displayName: memberData.displayName,
                        joinedAt: memberData.joinedAt,
                        roles: { cache: memberData.roles },
                        guild: memberData.guild,
                    };

                    const embed = createBanLogEmbed(author, memberProxy, BAN_REASON, channel.id, messageContent);
                    await logChannel.send({
                        embeds: [embed],
                        files: [createLogoAttachment()],
                    });

                    logger.info(`Ban log sent to #${logChannel.name}.`);
                } else {
                    logger.warn('Log channel not found or not text-based.');
                }
            }

        } catch (error) {
            logger.fatal('Security process failed!', error);
        }
    },
};
