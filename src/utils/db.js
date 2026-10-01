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
 * @returns {Promise<Object[]>} Array of matching ban records
 */
async function findBansByUserId(userId) {
    const db = await getPool();
    
    const [rows] = await db.query(
        `SELECT * FROM bans WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
        [userId]
    );
    
    return rows;
}

/**
 * Get recent bans with pagination.
 * 
 * @param {number} limit - Maximum number of records to return
 * @param {number} offset - Number of records to skip
 * @returns {Promise<Object[]>} Paginated array of ban records
 */
async function getBans(limit = 50, offset = 0) {
    const db = await getPool();
    
    const [rows] = await db.query(
        `SELECT id, user_id, user_tag, guild_id, guild_name, channel_id, channel_name, reason, created_at
         FROM bans ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [limit, offset]
    );
    
    return rows;
}

/**
 * Get total count of stored bans.
 * 
 * @returns {Promise<number>} Total number of ban records
 */
async function getBanCount() {
    const db = await getPool();
    
    const [rows] = await db.query(`SELECT COUNT(*) as count FROM bans`);
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
         GROUP BY guild_name 
         ORDER BY count DESC 
         LIMIT 10`
    );
    
    return rows;
}

/**
 * Get unique user count.
 * 
 * @returns {Promise<number>} Number of unique banned users
 */
async function getUniqueUserCount() {
    const db = await getPool();
    
    const [rows] = await db.query(`SELECT COUNT(DISTINCT user_id) as count FROM bans`);
    return rows[0].count;
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
    closePool,
};