/**
 * Lifting a ban, the one way every path does it.
 *
 * /unban, the Unban button in the log, the dashboard and approved appeals all
 * call liftBan, so each of them treats an already lifted ban the same way and
 * writes the same kind of audit entry.
 *
 * @module utils/unban
 */

const { recordAudit } = require('./audit');

/** Discord's error code for "this user is not banned". */
const UNKNOWN_BAN = 10026;

/**
 * Lift a Discord ban and record who did it.
 *
 * @param {import('discord.js').Guild} guild - Server to unban in
 * @param {string} userId - Banned user
 * @param {{actorId: string, reason: string, detail: string|null}} options -
 *   Who lifted it, the reason shown in Discord's audit log and the entry for the change log
 *   (null when the caller writes one entry for several unbans itself)
 * @returns {Promise<'unbanned'|'not-banned'>} 'not-banned' when someone already lifted it (nothing is recorded then)
 * @throws When Discord refuses for another reason, such as a missing Ban Members permission
 */
async function liftBan(guild, userId, { actorId, reason, detail }) {
    try {
        await guild.members.unban(userId, reason);
    } catch (error) {
        if (error?.code === UNKNOWN_BAN) return 'not-banned';
        throw error;
    }
    if (detail) await recordAudit(guild.id, actorId, detail);
    return 'unbanned';
}

module.exports = { liftBan, UNKNOWN_BAN };
