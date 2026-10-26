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

let pool = null;
let initPromise = null;

/**
 * Initialize the MySQL connection pool.
 * Creates the database and table if they don't exist.
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
            await candidate.query(`
        CREATE TABLE IF NOT EXISTS bans (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(20) NOT NULL,
            user_tag VARCHAR(100) NOT NULL,
            guild_id VARCHAR(20) NOT NULL,
            guild_name VARCHAR(100) NOT NULL,
            channel_id VARCHAR(20) NOT NULL,
            channel_name VARCHAR(100) NOT NULL,
            message_content TEXT,
            reason VARCHAR(500) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_user_id (user_id),
            INDEX idx_guild_id (guild_id),
            INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            await candidate.query(`
        CREATE TABLE IF NOT EXISTS guild_settings (
            guild_id VARCHAR(20) NOT NULL PRIMARY KEY,
            log_channel_id VARCHAR(20) NULL,
            ban_reason VARCHAR(500) NULL,
            delete_message_seconds INT NULL,
            dry_run TINYINT(1) NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            await candidate.query(`
        CREATE TABLE IF NOT EXISTS trap_channels (
            channel_id VARCHAR(20) NOT NULL PRIMARY KEY,
            guild_id VARCHAR(20) NOT NULL,
            INDEX idx_trap_guild_id (guild_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            await candidate.query(`
        CREATE TABLE IF NOT EXISTS exempt_roles (
            guild_id VARCHAR(20) NOT NULL,
            role_id VARCHAR(20) NOT NULL,
            PRIMARY KEY (guild_id, role_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
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
    const [settings] = await db.query(`SELECT guild_id, log_channel_id, ban_reason, delete_message_seconds, dry_run FROM guild_settings`);
    const [channels] = await db.query(`SELECT channel_id, guild_id FROM trap_channels`);
    const [exemptRoles] = await db.query(`SELECT guild_id, role_id FROM exempt_roles`);
    return { settings, channels, exemptRoles };
}

const GUILD_SETTING_COLUMNS = new Set(['log_channel_id', 'ban_reason', 'delete_message_seconds', 'dry_run']);

/**
 * Set (or clear with null) one per-server setting.
 *
 * @param {string} guildId - Server ID
 * @param {'log_channel_id'|'ban_reason'|'delete_message_seconds'|'dry_run'} column - Setting column
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
    getBanCount,
    getGuildStats,
    getUniqueUserCount,
    loadGuildSettings,
    setGuildSetting,
    addTrapChannel,
    removeTrapChannel,
    removeGuildData,
    addExemptRole,
    removeExemptRole,
    purgeOldMessageContent,
    closePool,
};