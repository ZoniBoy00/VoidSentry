/**
 * Message create event handler.
 * 
 * Core security logic: Monitors configured trap channels and detects
 * any message sent by users. Immediately bans the violator and logs the action.
 * 
 * Detection flow:
 * 1. Filter: Ignore bots, DMs, and non-monitored channels
 * 2. Validate: Check bot permissions and member bannability
 * 3. Cache: Store member data before banning
 * 4. Ban: Execute ban with message purge
 * 5. Delete: Remove any surviving trigger message after a successful ban
 * 6. Notify and log: Send the DM only after the ban succeeds, then store and log it
 * 
 * @module events/messageCreate
 */

const { Events, PermissionFlagsBits } = require('discord.js');

const CONFIG = require('../config');
const { createBanLogEmbed } = require('../embeds/banLogEmbed');
const { createBanNotificationEmbed } = require('../embeds/banNotificationEmbed');
const { createLogoAttachment } = require('../utils/helpers');
const { buildMessageEvidence } = require('../utils/messageEvidence');
const logger = require('../utils/logger');
const stats = require('../utils/stats');
const db = require('../utils/db');

// Log channel caching to avoid repeated API calls
const logChannelCache = new Map();
const logChannelFetchAttempts = new Map();
const activeViolations = new Set();

/**
 * Get cached log channel or fetch from API.
 * 
 * @param {import('discord.js').Client} client - Discord client
 * @param {import('discord.js').Guild} guild - Guild to fetch channel from
 * @returns {Promise<import('discord.js').TextChannel|null>}
 */
async function getLogChannel(client, guild) {
    if (!CONFIG.LOG_CHANNEL_ID) return null;
    
    const guildKey = guild.id;
    if (logChannelCache.has(guildKey)) return logChannelCache.get(guildKey);
    const lastAttempt = logChannelFetchAttempts.get(guildKey) || 0;
    if (Date.now() - lastAttempt < 30000) return null;

    logChannelFetchAttempts.set(guildKey, Date.now());
    
    try {
        const channel = await guild.channels.fetch(CONFIG.LOG_CHANNEL_ID);
        if (channel?.isTextBased()) {
            logChannelCache.set(guildKey, channel);
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
        const violationKey = `${guild.id}:${author.id}`;
        if (activeViolations.has(violationKey)) return;
        activeViolations.add(violationKey);
        const messageContent = buildMessageEvidence(message);
        let banSucceeded = false;

        try {
            logger.detection(`Violation in #${channel.name} (${channel.id}) by ${author.tag} (${author.id})`);

            // Validate first so a failed ban does not silently erase the evidence.
            const botMember = guild.members.me;
            if (!botMember?.permissions?.has(PermissionFlagsBits.BanMembers)) {
                logger.error(`Cannot ban ${author.tag} (${author.id}) in #${channel.name}: missing Ban Members permission. Message was left intact.`);
                return;
            }

            // Check if member can be banned (role hierarchy)
            if (!member?.bannable) {
                logger.error(`Cannot ban ${author.tag} (${author.id}) in #${channel.name}: role hierarchy issue or member unavailable. Message was left intact.`);
                return;
            }

            // Cache member data before banning (some data unavailable after ban)
            const memberData = member ? {
                displayName: member.displayName,
                joinedAt: member.joinedAt,
                roles: member.roles.cache.clone(),
                guild: member.guild,
            } : null;

            // Execute ban with message purge
            await guild.members.ban(author, {
                reason: CONFIG.BAN_REASON,
                deleteMessageSeconds: CONFIG.DELETE_MESSAGE_SECONDS,
            });
            banSucceeded = true;

            // The ban API may already have purged the message. If it remains (for
            // example, when message purging is disabled), remove it only now.
            if (message.deletable) {
                try {
                    await message.delete();
                } catch (deleteError) {
                    const code = deleteError?.code ?? deleteError?.rawError?.code;
                    if (String(code) !== '10008') {
                        logger.warn(`Ban succeeded, but trigger-message deletion failed for ${author.tag} (${author.id}): ${deleteError?.message || deleteError}`);
                    }
                }
            }

            // Notify only after the ban succeeds; a failed ban must not send a false notice.
            try {
                author.send({ embeds: [createBanNotificationEmbed(guild.name, CONFIG.BAN_REASON)] })
                    .then(() => {
                        stats.recordDmSuccess();
                        logger.info(`DM notification sent to ${author.tag}.`);
                    })
                    .catch(() => {
                        stats.recordDmFail();
                    });
            } catch (dmError) {
                stats.recordDmFail();
                logger.warn(`Failed to send ban notification to ${author.tag}: ${dmError?.message || dmError}`);
            }

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
                        allowedMentions: { parse: [] },
                    });
                }
            }

        } catch (error) {
            if (banSucceeded) {
                logger.error(`Ban succeeded for ${author.tag} (${author.id}), but a follow-up logging step failed.`, error);
            } else {
                logger.error(`Security action failed for ${author.tag} (${author.id}) in #${channel.name}; no trigger-message deletion was requested.`, error);
            }
        } finally {
            activeViolations.delete(violationKey);
        }
    },
};