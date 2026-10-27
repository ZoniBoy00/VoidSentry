/**
 * Audit log entries for changes made with slash commands and buttons.
 *
 * The dashboard writes its own entries (see dashboardSettings.js); this adds the
 * same kind of entry for everything else, so a server's history is complete.
 * Entries are shown on the dashboard; without it they are only in the database.
 *
 * @module utils/audit
 */

const db = require('./db');
const logger = require('./logger');

/**
 * Record a change. Never rejects: a missing audit entry must not undo or hide a
 * change that was already saved. Commands do not wait for it, so the database
 * write never delays their answer to Discord.
 *
 * @param {string} guildId - Server ID
 * @param {string} userId - Discord user who made the change
 * @param {string} detail - What changed, ending with how (e.g. "(with /trap-settings)")
 * @returns {Promise<void>}
 */
async function recordAudit(guildId, userId, detail) {
    await db.addAudit({ guildId, userId, detail })
        .catch(error => logger.error('Could not write the audit log entry.', error));
}

module.exports = { recordAudit };
