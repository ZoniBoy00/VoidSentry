/**
 * MySQL database connection and ban storage.
 * 
 * Provides connection pooling and CRUD operations for ban records
 * stored in a MySQL database.
 * 
 * @module utils/db
 */

const mysql = require('mysql2/promise');
const CONFIG = require('../config');
const { runMigrations } = require('./migrations');

let pool = null;
let initPromise = null;

/**
 * Initialize the MySQL connection pool.
 * Brings the schema up to date with the versioned migrations.
 * 
 * @returns {Promise<mysql.Pool>}
 */
async function initDatabase() {
    if (pool) return pool;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        const candidate = mysql.createPool({
            host: CONFIG.DB.host,
            port: CONFIG.DB.port,
            user: CONFIG.DB.user,
            password: CONFIG.DB.password,
            database: CONFIG.DB.database,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            connectTimeout: 10000,
            enableKeepAlive: true,
            keepAliveInitialDelay: 0,
        });

        try {
            await candidate.query('SELECT 1');
            await runMigrations(candidate);
            pool = candidate;
            return pool;
        } catch (error) {
            await candidate.end().catch(() => {});
            throw error;
        } finally {
            initPromise = null;
        }
    })();

    return initPromise;
}

/**
 * Get the database pool.
 * Initializes if not already initialized.
 * 
 * @returns {Promise<mysql.Pool>}
 */
async function getPool() {
    if (!pool) {
        await initDatabase();
    }
    return pool;
}

/**
 * Add a new ban record to the database.
 * 
 * @param {Object} ban - Ban record to add
 * @returns {Promise<number>} Inserted row ID
 */
async function addBan(ban) {
    const db = await getPool();
    
    const [result] = await db.query(
        `INSERT INTO bans (user_id, user_tag, guild_id, guild_name, channel_id, channel_name, message_content, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            ban.userId,
            ban.userTag,
            ban.guildId,
            ban.guildName,
            ban.channelId,
            ban.channelName,
            ban.messageContent,
            ban.reason,
        ]
    );
    
    return result.insertId;
}

/**
 * Find bans by user ID.
 *
 * @param {string} userId - Discord user ID to search for
 * @param {string|null} guildId - Restrict to one server (null = all servers)
 * @returns {Promise<Object[]>} Array of matching ban records
 */
async function findBansByUserId(userId, guildId = null) {
    const db = await getPool();
    const params = [userId];
    let where = 'user_id = ?';
    if (guildId) {
        where += ' AND guild_id = ?';
        params.push(guildId);
    }

    const [rows] = await db.query(
        `SELECT * FROM bans WHERE ${where} ORDER BY created_at DESC LIMIT 50`,
        params
    );

    return rows;
}

/**
 * Get recent bans with pagination.
 *
 * @param {number} limit - Maximum number of records to return
 * @param {number} offset - Number of records to skip
 * @param {string|null} guildId - Restrict to one server (null = all servers)
 * @returns {Promise<Object[]>} Paginated array of ban records
 */
async function getBans(limit = 50, offset = 0, guildId = null) {
    const db = await getPool();
    const params = [];
    let where = '';
    if (guildId) {
        where = 'WHERE guild_id = ?';
        params.push(guildId);
    }
    params.push(limit, offset);

    const [rows] = await db.query(
        `SELECT id, user_id, user_tag, guild_id, guild_name, channel_id, channel_name, reason, created_at
         FROM bans ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        params
    );

    return rows;
}

/**
 * Search bans for the dashboard, newest first.
 *
 * @param {string|null} guildId - Server to search in (null = all servers, for the bot owner)
 * @param {{query?: string, limit?: number, offset?: number}} [options] - Optional user ID or name fragment, and paging
 * @returns {Promise<{total: number, rows: Object[]}>}
 */
async function searchBans(guildId, { query = '', limit = 25, offset = 0 } = {}) {
    const db = await getPool();
    const params = [];
    let where = '1 = 1';
    if (guildId) {
        where = 'guild_id = ?';
        params.push(guildId);
    }
    const text = query.trim();
    if (text) {
        // Escape LIKE wildcards so the search text is matched literally.
        const escaped = text.replace(/[\\%_]/g, '\\$&');
        where += ' AND (user_id = ? OR user_tag LIKE ?)';
        params.push(text, `%${escaped}%`);
    }

    const [[{ count }]] = await db.query(`SELECT COUNT(*) AS count FROM bans WHERE ${where}`, params);
    const [rows] = await db.query(
        `SELECT id, user_id, user_tag, guild_id, guild_name, channel_id, channel_name, message_content, reason, created_at
         FROM bans WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    return { total: Number(count), rows };
}

/**
 * Timestamps and trap channels of the newest bans from the last N days, for statistics.
 *
 * @param {string|null} guildId - Restrict to one server (null = all servers)
 * @param {number} days - Window size in days
 * @param {number} limit - Most rows to read
 * @returns {Promise<{rows: Object[], truncated: boolean}>} `truncated` when there were more than `limit`
 */
async function getBanActivity(guildId, days = 30, limit = 50000) {
    const db = await getPool();
    const params = [days];
    let where = 'created_at >= (NOW() - INTERVAL ? DAY)';
    if (guildId) {
        where += ' AND guild_id = ?';
        params.push(guildId);
    }

    const [rows] = await db.query(
        `SELECT created_at, guild_id, channel_name FROM bans WHERE ${where} ORDER BY created_at DESC LIMIT ?`,
        [...params, limit + 1]
    );
    return { rows: rows.slice(0, limit), truncated: rows.length > limit };
}

/**
 * Users VoidSentry banned on a server in the last N hours, newest first, one
 * row per user (their newest ban).
 *
 * @param {string} guildId - Server
 * @param {number} hours - Window size in hours
 * @param {number} limit - Most users to return
 * @returns {Promise<{user_id: string, user_tag: string, created_at: Date}[]>}
 */
async function getRecentBannedUsers(guildId, hours, limit) {
    const db = await getPool();
    const [rows] = await db.query(
        `SELECT user_id, MAX(user_tag) AS user_tag, MAX(created_at) AS created_at FROM bans
         WHERE guild_id = ? AND created_at >= (NOW() - INTERVAL ? HOUR)
         GROUP BY user_id ORDER BY MAX(created_at) DESC LIMIT ?`,
        [guildId, hours, limit]
    );
    return rows;
}

/**
 * Number of stored bans per server.
 *
 * @returns {Promise<Map<string, number>>} Server ID to ban count
 */
async function getBanCountsByGuild() {
    const db = await getPool();
    const [rows] = await db.query('SELECT guild_id, COUNT(*) AS count FROM bans GROUP BY guild_id');
    return new Map(rows.map(row => [row.guild_id, Number(row.count)]));
}

/**
 * Get total count of stored bans.
 *
 * @param {string|null} guildId - Restrict to one server (null = all servers)
 * @returns {Promise<number>} Total number of ban records
 */
async function getBanCount(guildId = null) {
    const db = await getPool();

    const [rows] = guildId
        ? await db.query(`SELECT COUNT(*) as count FROM bans WHERE guild_id = ?`, [guildId])
        : await db.query(`SELECT COUNT(*) as count FROM bans`);
    return rows[0].count;
}

/**
 * Get the number of bans in the last N days (all servers).
 * 
 * @param {number} days - Window size in days
 * @returns {Promise<number>}
 */
async function getBanCountSince(days) {
    const db = await getPool();
    const [rows] = await db.query(
        `SELECT COUNT(*) as count FROM bans WHERE created_at >= (NOW() - INTERVAL ? DAY)`,
        [days]
    );
    return rows[0].count;
}

/**
 * Get ban statistics grouped by guild.
 *
 * @returns {Promise<Object[]>} Array of guild stats
 */
async function getGuildStats() {
    const db = await getPool();

    const [rows] = await db.query(
        `SELECT guild_name, COUNT(*) as count
         FROM bans
         GROUP BY guild_id, guild_name
         ORDER BY count DESC
         LIMIT 10`
    );

    return rows;
}

/**
 * Get unique user count.
 *
 * @param {string|null} guildId - Restrict to one server (null = all servers)
 * @returns {Promise<number>} Number of unique banned users
 */
async function getUniqueUserCount(guildId = null) {
    const db = await getPool();

    const [rows] = guildId
        ? await db.query(`SELECT COUNT(DISTINCT user_id) as count FROM bans WHERE guild_id = ?`, [guildId])
        : await db.query(`SELECT COUNT(DISTINCT user_id) as count FROM bans`);
    return rows[0].count;
}

/**
 * Load every per-server setting and trap channel.
 *
 * @returns {Promise<{settings: Object[], channels: Object[], exemptRoles: Object[]}>}
 */
async function loadGuildSettings() {
    const db = await getPool();
    const [settings] = await db.query(`SELECT guild_id, log_channel_id, ban_reason, delete_message_seconds, dry_run, appeals_enabled, appeal_cooldown_days FROM guild_settings`);
    const [channels] = await db.query(`SELECT channel_id, guild_id FROM trap_channels`);
    const [exemptRoles] = await db.query(`SELECT guild_id, role_id FROM exempt_roles`);
    return { settings, channels, exemptRoles };
}

const GUILD_SETTING_COLUMNS = new Set(['log_channel_id', 'ban_reason', 'delete_message_seconds', 'dry_run', 'appeals_enabled', 'appeal_cooldown_days']);

/**
 * Set (or clear with null) one per-server setting.
 *
 * @param {string} guildId - Server ID
 * @param {'log_channel_id'|'ban_reason'|'delete_message_seconds'|'dry_run'|'appeals_enabled'|'appeal_cooldown_days'} column - Setting column
 * @param {string|number|null} value - New value, or null to fall back to the global default
 */
async function setGuildSetting(guildId, column, value) {
    if (!GUILD_SETTING_COLUMNS.has(column)) throw new Error(`Unknown guild setting: ${column}`);
    const db = await getPool();
    await db.query(
        `INSERT INTO guild_settings (guild_id, ${column}) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE ${column} = VALUES(${column})`,
        [guildId, value]
    );
}

/**
 * Register a trap channel for a server.
 *
 * @param {string} guildId - Server ID
 * @param {string} channelId - Channel ID
 */
async function addTrapChannel(guildId, channelId) {
    const db = await getPool();
    await db.query(
        `INSERT INTO trap_channels (channel_id, guild_id) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE guild_id = VALUES(guild_id)`,
        [channelId, guildId]
    );
}

/**
 * Remove a trap channel.
 *
 * @param {string} channelId - Channel ID
 */
async function removeTrapChannel(channelId) {
    const db = await getPool();
    await db.query(`DELETE FROM trap_channels WHERE channel_id = ?`, [channelId]);
}

/**
 * Delete a server's settings and trap channels (ban history is kept).
 *
 * @param {string} guildId - Server ID
 */
async function removeGuildData(guildId) {
    const db = await getPool();
    await db.query(`DELETE FROM trap_channels WHERE guild_id = ?`, [guildId]);
    await db.query(`DELETE FROM exempt_roles WHERE guild_id = ?`, [guildId]);
    await db.query(`DELETE FROM guild_settings WHERE guild_id = ?`, [guildId]);
    await db.query(`DELETE FROM audit_log WHERE guild_id = ?`, [guildId]);
    // Nobody could decide them any more.
    await db.query(`DELETE FROM appeals WHERE guild_id = ?`, [guildId]);
    await db.query(`DELETE FROM appeal_blocks WHERE guild_id = ?`, [guildId]);
}

/**
 * Record a settings change made through the dashboard.
 *
 * @param {{guildId: string, userId: string, detail: string}} entry - Who changed what, where
 */
async function addAudit({ guildId, userId, detail }) {
    const db = await getPool();
    await db.query('INSERT INTO audit_log (guild_id, user_id, detail) VALUES (?, ?, ?)', [guildId, userId, detail.slice(0, 300)]);
}

/**
 * Most recent settings changes of a server, newest first.
 *
 * @param {string} guildId - Server ID
 * @param {number} [limit] - Maximum number of entries
 * @returns {Promise<Object[]>}
 */
async function getAudit(guildId, limit = 25) {
    const db = await getPool();
    const [rows] = await db.query(
        'SELECT id, user_id, detail, created_at FROM audit_log WHERE guild_id = ? ORDER BY created_at DESC, id DESC LIMIT ?',
        [guildId, limit]
    );
    return rows;
}

/**
 * Every stored dashboard session revocation.
 *
 * @returns {Promise<{user_id: string, revoked_before: number}[]>}
 */
async function loadSessionRevocations() {
    const db = await getPool();
    const [rows] = await db.query('SELECT user_id, revoked_before FROM session_revocations');
    return rows;
}

/**
 * Refuse a user's dashboard sessions issued before the given time.
 *
 * @param {string} userId - Discord user ID
 * @param {number} revokedBefore - Unix time in seconds
 */
async function setSessionRevocation(userId, revokedBefore) {
    const db = await getPool();
    await db.query(
        'INSERT INTO session_revocations (user_id, revoked_before) VALUES (?, ?) ON DUPLICATE KEY UPDATE revoked_before = VALUES(revoked_before)',
        [userId, revokedBefore]
    );
}

/**
 * Exempt a role from trap bans on a server.
 * 
 * @param {string} guildId - Server ID
 * @param {string} roleId - Role ID
 */
async function addExemptRole(guildId, roleId) {
    const db = await getPool();
    await db.query(`INSERT IGNORE INTO exempt_roles (guild_id, role_id) VALUES (?, ?)`, [guildId, roleId]);
}

/**
 * Remove a role exemption.
 * 
 * @param {string} guildId - Server ID
 * @param {string} roleId - Role ID
 */
async function removeExemptRole(guildId, roleId) {
    const db = await getPool();
    await db.query(`DELETE FROM exempt_roles WHERE guild_id = ? AND role_id = ?`, [guildId, roleId]);
}

/**
 * Delete every ban record of a user on all servers (data deletion request).
 * 
 * @param {string} userId - Discord user ID
 * @returns {Promise<number>} Number of records deleted
 */
async function deleteBansByUser(userId) {
    const db = await getPool();
    const [result] = await db.query(`DELETE FROM bans WHERE user_id = ?`, [userId]);
    return result.affectedRows;
}

/**
 * Clear captured message content from bans older than the retention period.
 * The ban record itself is kept.
 * 
 * @param {number} days - Retention period in days (0 = disabled)
 * @returns {Promise<number>} Number of rows cleared
 */
async function purgeOldMessageContent(days) {
    if (!days) return 0;
    const db = await getPool();
    const [result] = await db.query(
        `UPDATE bans SET message_content = NULL
         WHERE message_content IS NOT NULL AND created_at < (NOW() - INTERVAL ? DAY)`,
        [days]
    );
    return result.affectedRows;
}

/** Columns of an appeal as the API and the bot use them. */
const APPEAL_COLUMNS = 'id, guild_id, user_id, user_tag, text, status, reply, decided_by, created_at, decided_at';

/**
 * Store a new, open ban appeal.
 *
 * @param {{guildId: string, userId: string, userTag: string, text: string}} appeal - Who appeals where, and what they wrote
 * @returns {Promise<number>} The appeal's ID
 */
async function addAppeal({ guildId, userId, userTag, text }) {
    const db = await getPool();
    const [result] = await db.query(
        'INSERT INTO appeals (guild_id, user_id, user_tag, text) VALUES (?, ?, ?, ?)',
        [guildId, userId, userTag.slice(0, 100), text.slice(0, 1000)]
    );
    return result.insertId;
}

/**
 * One appeal by ID.
 *
 * @param {number} id - Appeal ID
 * @returns {Promise<Object|null>}
 */
async function getAppeal(id) {
    const db = await getPool();
    const [rows] = await db.query(`SELECT ${APPEAL_COLUMNS} FROM appeals WHERE id = ?`, [id]);
    return rows[0] ?? null;
}

/**
 * Every appeal a user made, newest first.
 *
 * @param {string} userId - Discord user ID
 * @returns {Promise<Object[]>}
 */
async function getAppealsByUser(userId) {
    const db = await getPool();
    const [rows] = await db.query(
        `SELECT ${APPEAL_COLUMNS} FROM appeals WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`,
        [userId]
    );
    return rows;
}

/**
 * A server's open appeals (oldest first, so the longest waiting comes first) or decided ones (newest first).
 *
 * @param {string} guildId - Server ID
 * @param {'open'|'decided'} which - Which appeals
 * @param {number} [limit] - Most rows to return
 * @returns {Promise<Object[]>}
 */
async function getGuildAppeals(guildId, which, limit = 50) {
    const db = await getPool();
    const [rows] = which === 'open'
        ? await db.query(`SELECT ${APPEAL_COLUMNS} FROM appeals WHERE guild_id = ? AND status = 'open' ORDER BY created_at ASC, id ASC LIMIT ?`, [guildId, limit])
        : await db.query(`SELECT ${APPEAL_COLUMNS} FROM appeals WHERE guild_id = ? AND status <> 'open' ORDER BY decided_at DESC, id DESC LIMIT ?`, [guildId, limit]);
    return rows;
}

/**
 * Number of open appeals on a server.
 *
 * @param {string} guildId - Server ID
 * @returns {Promise<number>}
 */
async function countOpenAppeals(guildId) {
    const db = await getPool();
    const [rows] = await db.query("SELECT COUNT(*) AS count FROM appeals WHERE guild_id = ? AND status = 'open'", [guildId]);
    return Number(rows[0].count);
}

/**
 * Decide an open appeal. Only one decision can win: an appeal that was already
 * decided is left alone and false is returned.
 *
 * @param {number} id - Appeal ID
 * @param {{status: 'approved'|'denied', reply: string|null, decidedBy: string}} decision
 * @returns {Promise<boolean>} Whether this call decided it
 */
async function decideAppeal(id, { status, reply, decidedBy }) {
    const db = await getPool();
    const [result] = await db.query(
        "UPDATE appeals SET status = ?, reply = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'open'",
        [status, reply ? reply.slice(0, 500) : null, decidedBy, id]
    );
    return result.affectedRows === 1;
}

/**
 * Put a decided appeal back to open, when the decision could not be carried out
 * (for example the unban failed).
 *
 * @param {number} id - Appeal ID
 */
async function reopenAppeal(id) {
    const db = await getPool();
    await db.query("UPDATE appeals SET status = 'open', reply = NULL, decided_by = NULL, decided_at = NULL WHERE id = ?", [id]);
}

/**
 * Whether a user may no longer appeal on a server.
 *
 * @param {string} guildId - Server ID
 * @param {string} userId - Discord user ID
 * @returns {Promise<boolean>}
 */
async function isAppealBlocked(guildId, userId) {
    const db = await getPool();
    const [rows] = await db.query('SELECT 1 FROM appeal_blocks WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
    return rows.length > 0;
}

/**
 * Stop a user from appealing on a server.
 *
 * @param {string} guildId - Server ID
 * @param {string} userId - Discord user ID
 * @param {string} blockedBy - Who blocked them
 */
async function addAppealBlock(guildId, userId, blockedBy) {
    const db = await getPool();
    await db.query('INSERT IGNORE INTO appeal_blocks (guild_id, user_id, blocked_by) VALUES (?, ?, ?)', [guildId, userId, blockedBy]);
}

/**
 * Let a blocked user appeal again.
 *
 * @param {string} guildId - Server ID
 * @param {string} userId - Discord user ID
 * @returns {Promise<boolean>} Whether they were blocked
 */
async function removeAppealBlock(guildId, userId) {
    const db = await getPool();
    const [result] = await db.query('DELETE FROM appeal_blocks WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
    return result.affectedRows > 0;
}

/**
 * Users blocked from appealing on a server, newest first.
 *
 * @param {string} guildId - Server ID
 * @returns {Promise<Object[]>}
 */
async function getAppealBlocks(guildId) {
    const db = await getPool();
    const [rows] = await db.query(
        'SELECT user_id, blocked_by, created_at FROM appeal_blocks WHERE guild_id = ? ORDER BY created_at DESC LIMIT 100',
        [guildId]
    );
    return rows;
}

/**
 * Delete a user's appeals and appeal blocks everywhere (data deletion request).
 *
 * @param {string} userId - Discord user ID
 * @returns {Promise<number>} Number of appeals deleted
 */
async function deleteAppealsByUser(userId) {
    const db = await getPool();
    const [result] = await db.query('DELETE FROM appeals WHERE user_id = ?', [userId]);
    await db.query('DELETE FROM appeal_blocks WHERE user_id = ?', [userId]);
    return result.affectedRows;
}

/**
 * Delete appeals decided more than N days ago. Open appeals are kept.
 *
 * @param {number} days - Retention period in days
 * @returns {Promise<number>} Number of appeals deleted
 */
async function purgeDecidedAppeals(days) {
    const db = await getPool();
    const [result] = await db.query(
        "DELETE FROM appeals WHERE status <> 'open' AND decided_at < (NOW() - INTERVAL ? DAY)",
        [days]
    );
    return result.affectedRows;
}

/**
 * Close the database connection pool.
 */
async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}

module.exports = {
    initDatabase,
    getPool,
    addBan,
    findBansByUserId,
    getBans,
    searchBans,
    getBanActivity,
    getRecentBannedUsers,
    getBanCountsByGuild,
    getBanCount,
    getBanCountSince,
    getGuildStats,
    getUniqueUserCount,
    loadGuildSettings,
    setGuildSetting,
    addTrapChannel,
    removeTrapChannel,
    removeGuildData,
    addAudit,
    getAudit,
    loadSessionRevocations,
    setSessionRevocation,
    addExemptRole,
    removeExemptRole,
    purgeOldMessageContent,
    deleteBansByUser,
    addAppeal,
    getAppeal,
    getAppealsByUser,
    getGuildAppeals,
    countOpenAppeals,
    decideAppeal,
    reopenAppeal,
    isAppealBlocked,
    addAppealBlock,
    removeAppealBlock,
    getAppealBlocks,
    deleteAppealsByUser,
    purgeDecidedAppeals,
    closePool,
};