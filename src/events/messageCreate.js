/**
 * Message create event handler.
 * 
 * Core security logic: Monitors configured trap channels and detects
 * any message sent by users. Immediately bans the violator and logs the action.
 * 
 * Detection flow:
 * 1. Filter: Ignore bots, DMs, and non-monitored channels
 * 2. Delete: Remove the trigger message
 * 3. Validate: Check bot permissions and member bannability
 * 4. Cache: Store member data before banning
 * 5. Notify: Send DM notification (best-effort)
 * 6. Ban: Execute ban with message purge
 * 7. Store: Save ban to database
 * 8. Log: Send detailed ban log to log channel
 * 
 * @module events/messageCreate
 */

const { Events, PermissionFlagsBits } = require('discord.js');

const CONFIG = require('../config');
const { createBanLogEmbed } = require('../embeds/banLogEmbed');
const { createBanNotificationEmbed } = require('../embeds/banNotificationEmbed');
const { createLogoAttachment } = require('../utils/helpers');
const logger = require('../utils/logger');
const stats = require('../utils/stats');
const db = require('../utils/db');

// Log channel caching to avoid repeated API calls
let logChannelCache = null;
let logChannelFetchAttempted = false;

/**
 * Get cached log channel or fetch from API.
 * 
 * @param {import('discord.js').Client} client - Discord client
 * @param {import('discord.js').Guild} guild - Guild to fetch channel from
 * @returns {Promise<import('discord.js').TextChannel|null>}
 */
async function getLogChannel(client, guild) {
    if (!CONFIG.LOG_CHANNEL_ID) return null;
    
    if (logChannelCache) return logChannelCache;
    if (logChannelFetchAttempted) return null;

    logChannelFetchAttempted = true;
    
    try {
        const channel = await guild.channels.fetch(CONFIG.LOG_CHANNEL_ID);
        if (channel?.isTextBased()) {
            logChannelCache = channel;
            return channel;
        }
    } catch (err) {
        logger.warn(`Failed to fetch log channel: ${err.message}`);
    }
    return null;
}

module.exports = {
    /** Event name for Discord.js */
    name: Events.MessageCreate,
    /** Execute on every message, not just once */
    once: false,

    /**
     * Handle message create event.
     * 
     * @param {import('discord.js').Client} client - Discord client instance
     * @param {import('discord.js').Message} message - Discord message
     */
    async execute(client, message) {
        // Filter: Ignore bots, DMs, and non-monitored channels
        if (message.author.bot || !message.guild || !CONFIG.BAN_CHANNEL_IDS.includes(message.channel.id)) {
            return;
        }

        const { author, guild, member, channel } = message;
        const messageContent = message.content || '[No text content]';

        try {
            logger.detection(`Violation in #${channel.name} (${channel.id}) by ${author.tag} (${author.id})`);

            // Delete the trigger message immediately
            if (message.deletable) {
                await message.delete().catch(() => {});
            }

            // Validate bot has required permissions
            const botMember = guild.members.me;
            if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
                logger.error('Missing "Ban Members" permission!');
                return;
            }

            // Check if member can be banned (role hierarchy)
            if (!member?.bannable) {
                logger.warn(`Cannot ban ${author.tag} — role hierarchy issue or member unavailable.`);
                return;
            }

            // Cache member data before banning (some data unavailable after ban)
            const memberData = member ? {
                displayName: member.displayName,
                joinedAt: member.joinedAt,
                roles: member.roles.cache.clone(),
                guild: member.guild,
            } : null;

            // Send DM notification in background (best-effort, don't await)
            author.send({ embeds: [createBanNotificationEmbed(guild.name, CONFIG.BAN_REASON)] })
                .then(() => {
                    stats.recordDmSuccess();
                    logger.info(`DM notification sent to ${author.tag}.`);
                })
                .catch(() => {
                    stats.recordDmFail();
                });

            // Execute ban with message purge
            await guild.members.ban(author, {
                reason: CONFIG.BAN_REASON,
                deleteMessageSeconds: CONFIG.DELETE_MESSAGE_SECONDS,
            });

            // Record statistics
            stats.recordBan(author.id, author.tag, channel.id);
            logger.ban(`${author.tag} (${author.id}) removed for trap violation. 24h messages purged.`);

            // Store ban in database
            try {
                await db.addBan({
                    userId: author.id,
                    userTag: author.tag,
                    guildId: guild.id,
                    guildName: guild.name,
                    channelId: channel.id,
                    channelName: channel.name,
                    messageContent: messageContent.substring(0, 500),
                    reason: CONFIG.BAN_REASON,
                });
                logger.debug(`Ban stored in database for user ${author.id}`);
            } catch (dbErr) {
                logger.error(`Failed to store ban in database: ${dbErr.message}`);
            }

            // Send detailed log to log channel
            if (CONFIG.LOG_CHANNEL_ID) {
                const logChannel = await getLogChannel(client, guild);
                if (logChannel) {
                    const memberProxy = memberData ? {
                        displayName: memberData.displayName,
                        joinedAt: memberData.joinedAt,
                        roles: { cache: memberData.roles },
                        guild: memberData.guild,
                    } : null;

                    const embed = createBanLogEmbed(author, memberProxy, CONFIG.BAN_REASON, channel.id, messageContent);
                    await logChannel.send({
                        embeds: [embed],
                        files: [createLogoAttachment()],
                    });
                }
            }

        } catch (error) {
            logger.fatal('Security process failed!', error);
        }
    },
};