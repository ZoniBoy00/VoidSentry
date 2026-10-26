/**
 * Message create event handler.
 *
 * Core security logic: Monitors configured trap channels and detects
 * any message sent by users. Immediately bans the violator and logs the action.
 *
 * Detection flow:
 * 1. Filter: Ignore bots, DMs, and non-monitored channels
 * 2. Exempt: Skip administrators and exempt roles (their message is just removed)
 * 3. Validate: Check bot permissions and member bannability; report failures to the log channel
 * 4. Dry run: If enabled for the server, report what would happen and stop
 * 5. Notify: Send the DM before the ban (best-effort, short timeout), since a banned
 *    user usually shares no server with the bot anymore
 * 6. Ban: Execute ban with message purge
 * 7. Delete: Remove any surviving trigger message after a successful ban
 * 8. Store and log: Save the ban and post the log embed
 *
 * @module events/messageCreate
 */

const { Events, PermissionFlagsBits } = require('discord.js');

const { createBanLogEmbed } = require('../embeds/banLogEmbed');
const { createBanNotificationEmbed } = require('../embeds/banNotificationEmbed');
const { alertGuildOwner } = require('../utils/ownerAlerts');
const { createUnbanRow } = require('../utils/unbanButton');
const { createLogoAttachment, sanitizeEmbedText } = require('../utils/helpers');
const { buildMessageEvidence } = require('../utils/messageEvidence');
const logger = require('../utils/logger');
const stats = require('../utils/stats');
const db = require('../utils/db');
const guildSettings = require('../utils/guildSettings');
const presence = require('../utils/presence');

/** How long to wait for the pre-ban DM before banning anyway. */
const DM_TIMEOUT_MS = 3000;

// Log channel caching to avoid repeated API calls
const logChannelCache = new Map();
const logChannelFetchAttempts = new Map();
const activeViolations = new Set();

/**
 * Get cached log channel or fetch from API.
 *
 * @param {import('discord.js').Client} client - Discord client
 * @param {import('discord.js').Guild} guild - Guild to fetch channel from
 * @param {string|null} logChannelId - Log channel configured for the guild
 * @returns {Promise<import('discord.js').TextChannel|null>}
 */
async function getLogChannel(client, guild, logChannelId) {
    if (!logChannelId) return null;

    const guildKey = guild.id;
    const cached = logChannelCache.get(guildKey);
    if (cached?.id === logChannelId) return cached;
    const lastAttempt = logChannelFetchAttempts.get(guildKey) || 0;
    if (Date.now() - lastAttempt < 30000) return null;

    logChannelFetchAttempts.set(guildKey, Date.now());

    try {
        const channel = await guild.channels.fetch(logChannelId);
        if (channel?.isTextBased()) {
            logChannelCache.set(guildKey, channel);
            return channel;
        }
    } catch (err) {
        logger.warn(`Failed to fetch log channel: ${err.message}`);
    }
    return null;
}

/**
 * Post a plain-text notice to the server log channel (best-effort).
 * Used for problems an administrator should see, such as a missed ban.
 *
 * @param {import('discord.js').Client} client - Discord client
 * @param {import('discord.js').Guild} guild - Guild the event happened in
 * @param {string|null} logChannelId - Log channel configured for the guild
 * @param {string} content - Message to send
 */
async function notifyLogChannel(client, guild, logChannelId, content) {
    try {
        const logChannel = await getLogChannel(client, guild, logChannelId);
        if (logChannel) {
            await logChannel.send({ content: content.slice(0, 2000), allowedMentions: { parse: [] } });
        }
    } catch (err) {
        logger.warn(`Failed to post notice to log channel: ${err?.message || err}`);
    }
}

/**
 * Whether a member is exempt from trap bans: administrators and exempt roles.
 *
 * @param {import('discord.js').GuildMember|null} member - Member who sent the message
 * @param {string[]} exemptRoleIds - Exempt role IDs for the server
 * @returns {boolean}
 */
function isExempt(member, exemptRoleIds) {
    if (!member) return false;
    if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
    return exemptRoleIds.some(roleId => member.roles?.cache?.has?.(roleId));
}

/**
 * Send the ban notice DM, giving up after DM_TIMEOUT_MS. Never throws.
 *
 * @param {import('discord.js').User} author - User to notify
 * @param {import('discord.js').Guild} guild - Guild they are being banned from
 * @param {string} reason - Ban reason
 */
async function sendBanNotice(author, guild, reason) {
    let timer;
    try {
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('DM timed out')), DM_TIMEOUT_MS);
        });
        await Promise.race([
            author.send({ embeds: [createBanNotificationEmbed(guild.name, reason)] }),
            timeout,
        ]);
        stats.recordDmSuccess();
        logger.info(`DM notification sent to ${author.tag}.`);
    } catch (dmError) {
        stats.recordDmFail();
        logger.debug(`Could not DM ${author.tag}: ${dmError?.message || dmError}`);
    } finally {
        clearTimeout(timer);
    }
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
        if (message.author.bot || !message.guild || !guildSettings.isTrapChannel(message.guild.id, message.channel.id)) {
            return;
        }

        const { author, guild, member, channel } = message;
        const guildConfig = guildSettings.getGuildConfig(guild.id);
        const violationKey = `${guild.id}:${author.id}`;
        if (activeViolations.has(violationKey)) return;
        activeViolations.add(violationKey);
        const messageContent = buildMessageEvidence(message);
        let banSucceeded = false;
        const tag = sanitizeEmbedText(author.tag, 100);

        try {
            logger.detection(`Violation in #${channel.name} (${channel.id}) by ${author.tag} (${author.id})`);

            // Administrators and exempt roles are never banned; just keep the trap clean.
            if (isExempt(member, guildConfig.exemptRoleIds)) {
                logger.info(`${author.tag} (${author.id}) is exempt in ${guild.name}; message removed, no ban.`);
                if (message.deletable) await message.delete().catch(() => {});
                return;
            }

            // Validate first so a failed ban does not silently erase the evidence.
            const botMember = guild.members.me;
            if (!botMember?.permissions?.has(PermissionFlagsBits.BanMembers)) {
                logger.error(`Cannot ban ${author.tag} (${author.id}) in #${channel.name}: missing Ban Members permission. Message was left intact.`);
                await notifyLogChannel(client, guild, guildConfig.logChannelId,
                    `⚠️ **Ban failed:** ${tag} (\`${author.id}\`) wrote in <#${channel.id}>, but I lack the **Ban Members** permission. The message was left intact.`);
                await alertGuildOwner(guild, 'missing-permission');
                return;
            }

            // Check if member can be banned (role hierarchy)
            if (!member?.bannable) {
                logger.error(`Cannot ban ${author.tag} (${author.id}) in #${channel.name}: role hierarchy issue or member unavailable. Message was left intact.`);
                await notifyLogChannel(client, guild, guildConfig.logChannelId,
                    `⚠️ **Ban failed:** ${tag} (\`${author.id}\`) wrote in <#${channel.id}>, but they cannot be banned (my role is not above theirs, or they are no longer a member). The message was left intact.`);
                // A server owner cannot be banned by anyone, so there is nothing for them to fix.
                if (author.id !== guild.ownerId) await alertGuildOwner(guild, 'hierarchy');
                return;
            }

            // Dry run: report only.
            if (guildConfig.dryRun) {
                logger.info(`Dry run: would have banned ${author.tag} (${author.id}) in ${guild.name}.`);
                await notifyLogChannel(client, guild, guildConfig.logChannelId,
                    `🧪 **Dry run:** would have banned ${tag} (\`${author.id}\`) for writing in <#${channel.id}>. No action was taken.`);
                return;
            }

            // Cache member data before banning (some data unavailable after ban)
            const memberData = member ? {
                displayName: member.displayName,
                joinedAt: member.joinedAt,
                roles: member.roles.cache.clone(),
                guild: member.guild,
            } : null;

            // Notify before the ban: afterwards the user typically shares no server with the bot.
            await sendBanNotice(author, guild, guildConfig.banReason);

            // Execute ban with message purge
            await guild.members.ban(author, {
                reason: guildConfig.banReason,
                deleteMessageSeconds: guildConfig.deleteMessageSeconds,
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

            // Record statistics
            stats.recordBan(author.id, author.tag, channel.id);
            presence.recordBan();
            logger.ban(`${author.tag} (${author.id}) removed for trap violation. Messages purged.`);

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
                    reason: guildConfig.banReason,
                });
                logger.debug(`Ban stored in database for user ${author.id}`);
            } catch (dbErr) {
                logger.error(`Failed to store ban in database: ${dbErr.message}`);
            }

            // Send detailed log to log channel
            if (guildConfig.logChannelId) {
                const logChannel = await getLogChannel(client, guild, guildConfig.logChannelId);
                if (logChannel) {
                    const memberProxy = memberData ? {
                        displayName: memberData.displayName,
                        joinedAt: memberData.joinedAt,
                        roles: { cache: memberData.roles },
                        guild: memberData.guild,
                    } : null;

                    const embed = createBanLogEmbed(author, memberProxy, guildConfig.banReason, channel.id, messageContent);
                    await logChannel.send({
                        embeds: [embed],
                        files: [createLogoAttachment()],
                        components: [createUnbanRow(author.id)],
                        allowedMentions: { parse: [] },
                    });
                }
            }

        } catch (error) {
            if (banSucceeded) {
                logger.error(`Ban succeeded for ${author.tag} (${author.id}), but a follow-up logging step failed.`, error);
            } else {
                logger.error(`Security action failed for ${author.tag} (${author.id}) in #${channel.name}; no trigger-message deletion was requested.`, error);
                await notifyLogChannel(client, guild, guildConfig.logChannelId,
                    `⚠️ **Ban failed:** ${tag} (\`${author.id}\`) wrote in <#${channel.id}>, but the ban request failed. Check my permissions.`);
                await alertGuildOwner(guild, 'ban-failed');
            }
        } finally {
            activeViolations.delete(violationKey);
        }
    },
};
