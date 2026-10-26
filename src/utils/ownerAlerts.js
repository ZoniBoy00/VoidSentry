/**
 * Direct messages to a server owner about problems only they can fix.
 *
 * A failed ban is reported in the log channel, but a server without one (or
 * with one the bot cannot write to) would otherwise never find out. Each kind of
 * problem is sent at most once per server per day so a trap that keeps being
 * hit cannot turn into DM spam.
 *
 * @module utils/ownerAlerts
 */

const logger = require('./logger');

/** Minimum time between two alerts of the same kind for the same server. */
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** `${guildId}:${kind}` -> time of the last alert */
const lastSent = new Map();

/** Problems the bot can report, with the advice that goes with them. */
const ALERTS = {
    'missing-permission': 'I tried to ban someone who wrote in a trap channel, but I do not have the **Ban Members** permission. Give my role that permission, then the next violation will be handled.',
    hierarchy: 'I tried to ban someone who wrote in a trap channel, but my role is not above theirs. In **Server Settings → Roles**, drag the VoidSentry role above the roles of the members it should be able to ban.',
    'ban-failed': 'I tried to ban someone who wrote in a trap channel, but Discord rejected the request. Check that my role has **Ban Members** and is high enough in the role list.',
};

/**
 * Tell a server's owner about a problem, unless they were told recently.
 * Never throws: owners can have DMs closed and that must not affect the bot.
 *
 * @param {import('discord.js').Guild} guild - Server the problem happened in
 * @param {keyof ALERTS} kind - Which problem it is
 * @returns {Promise<boolean>} True if a message was sent
 */
async function alertGuildOwner(guild, kind) {
    const advice = ALERTS[kind];
    if (!advice) return false;

    const key = `${guild.id}:${kind}`;
    const now = Date.now();
    if (now - (lastSent.get(key) || 0) < COOLDOWN_MS) return false;
    lastSent.set(key, now);

    try {
        const owner = await guild.fetchOwner();
        await owner.send({
            content: `⚠️ **VoidSentry in ${guild.name}**\n${advice}\n\nThis notice is sent at most once a day. To also get these in a channel, run \`/add-logchannel\`.`,
            allowedMentions: { parse: [] },
        });
        return true;
    } catch (error) {
        logger.debug(`Could not notify the owner of ${guild.id}: ${error?.message || error}`);
        return false;
    }
}

/** Forget cooldowns. Used by tests. */
function resetOwnerAlerts() {
    lastSent.clear();
}

module.exports = { alertGuildOwner, resetOwnerAlerts, COOLDOWN_MS };
