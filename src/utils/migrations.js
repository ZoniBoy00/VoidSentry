/**
 * Versioned database migrations.
 *
 * Each migration runs once, in order, and is recorded in `schema_migrations`.
 * Never edit a migration that has shipped: add a new one at the end. Statements
 * of the first migration use IF NOT EXISTS so that databases created before
 * migrations existed are adopted without changes.
 *
 * @module utils/migrations
 */

const logger = require('./logger');

const TABLE_OPTIONS = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

/** @type {{version: number, name: string, statements: string[]}[]} */
const MIGRATIONS = [
    {
        version: 1,
        name: 'initial schema',
        statements: [
            `CREATE TABLE IF NOT EXISTS bans (
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
            ) ${TABLE_OPTIONS}`,
            `CREATE TABLE IF NOT EXISTS guild_settings (
                guild_id VARCHAR(20) NOT NULL PRIMARY KEY,
                log_channel_id VARCHAR(20) NULL,
                ban_reason VARCHAR(500) NULL,
                delete_message_seconds INT NULL,
                dry_run TINYINT(1) NULL
            ) ${TABLE_OPTIONS}`,
            `CREATE TABLE IF NOT EXISTS trap_channels (
                channel_id VARCHAR(20) NOT NULL PRIMARY KEY,
                guild_id VARCHAR(20) NOT NULL,
                INDEX idx_trap_guild_id (guild_id)
            ) ${TABLE_OPTIONS}`,
            `CREATE TABLE IF NOT EXISTS exempt_roles (
                guild_id VARCHAR(20) NOT NULL,
                role_id VARCHAR(20) NOT NULL,
                PRIMARY KEY (guild_id, role_id)
            ) ${TABLE_OPTIONS}`,
        ],
    },
    {
        version: 2,
        name: 'dashboard settings audit log',
        statements: [
            `CREATE TABLE IF NOT EXISTS audit_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(20) NOT NULL,
                user_id VARCHAR(20) NOT NULL,
                detail VARCHAR(300) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_audit_guild (guild_id, created_at)
            ) ${TABLE_OPTIONS}`,
        ],
    },
];

/**
 * Apply every migration that has not run yet.
 *
 * @param {import('mysql2/promise').Pool} pool - Connected pool
 * @returns {Promise<number[]>} Versions applied by this call
 */
async function runMigrations(pool) {
    await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version INT NOT NULL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ${TABLE_OPTIONS}`);

    const [rows] = await pool.query('SELECT version FROM schema_migrations');
    const done = new Set(rows.map(row => row.version));
    const applied = [];

    for (const migration of MIGRATIONS) {
        if (done.has(migration.version)) continue;
        for (const statement of migration.statements) await pool.query(statement);
        await pool.query('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [migration.version, migration.name]);
        logger.system(`Database migration ${migration.version} applied: ${migration.name}`);
        applied.push(migration.version);
    }

    return applied;
}

module.exports = { MIGRATIONS, runMigrations };
