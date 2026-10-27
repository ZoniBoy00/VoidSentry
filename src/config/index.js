/**
 * Configuration loader and validator.
 * 
 * Loads environment variables from .env and validates required fields.
 * Exits with fatal error if required configuration is missing.
 * 
 * @module config
 * @see .env.example for available options
 */

require('dotenv').config();

const DISCORD_ID_REGEX = /^\d{17,19}$/;

function requiredEnv(name) {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
}

function boundedInteger(name, fallback, min, max) {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(`${name} must be an integer between ${min} and ${max}`);
    }
    return value;
}

function optionalBoolean(name, fallback) {
    const raw = process.env[name]?.trim().toLowerCase();
    if (!raw) return fallback;
    if (['true', '1', 'yes', 'on'].includes(raw)) return true;
    if (['false', '0', 'no', 'off'].includes(raw)) return false;
    throw new Error(`${name} must be true or false`);
}

function requiredDiscordId(name) {
    const value = requiredEnv(name);
    if (!DISCORD_ID_REGEX.test(value)) throw new Error(`${name} must be a valid Discord ID`);
    return value;
}

function optionalDiscordIdList(name) {
    const raw = process.env[name]?.trim();
    if (!raw) return [];
    const values = raw.split(',').map(value => value.trim()).filter(Boolean);
    if (values.some(value => !DISCORD_ID_REGEX.test(value))) {
        throw new Error(`${name} must contain valid comma-separated Discord IDs`);
    }
    return [...new Set(values)];
}

const dbHost = requiredEnv('DB_HOST');
const dbPort = boundedInteger('DB_PORT', 3306, 1, 65535);
const dbUser = requiredEnv('DB_USER');
const dbPassword = requiredEnv('DB_PASSWORD');
const dbName = requiredEnv('DB_NAME');
if (!/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error('DB_NAME contains unsupported characters');

/**
 * Application configuration object.
 * 
 * @typedef {Object} Config
 * @property {string} TOKEN - Discord bot token
 * @property {string} CLIENT_ID - Discord application/client ID
 * @property {string} OWNER_ID - Bot owner's Discord user ID
 * @property {string|null} GUILD_ID - Optional guild ID for development
 * @property {string[]} BAN_CHANNEL_IDS - Optional global trap channel IDs (per-server channels are stored in the database via /setup-trap)
 * @property {string|null} LOG_CHANNEL_ID - Default log channel ID (per-server override via /trap-settings)
 * @property {string} STATUS_TEXT - Bot presence status text
 * @property {number} DELETE_MESSAGE_SECONDS - Seconds of messages to delete on ban
 * @property {number} MESSAGE_RETENTION_DAYS - Days to keep captured message content (0 = forever)
 * @property {string} BAN_REASON - Reason shown in ban audit log
 * @property {number} STATS_PORT - Port for the public stats endpoint (0 = disabled)
 * @property {string} STATS_HOST - Interface the stats endpoint listens on
 * @property {string|null} STATS_TOKEN - Optional bearer token required by the stats endpoint
 * @property {string|null} STATS_TOKEN_PREVIOUS - Previous token, accepted during a rotation
 * @property {boolean} DASHBOARD_API - Serve the website dashboard's API (only when STATS_TOKEN is set)
 * @property {Object} DB - MySQL database configuration
 */

/** Build configuration from environment variables */
const CONFIG = {
    /** Discord bot authentication token */
    TOKEN: requiredEnv('DISCORD_TOKEN'),
    
    /** Discord application ID */
    CLIENT_ID: requiredDiscordId('CLIENT_ID'),
    
    /** Bot owner's user ID (for admin commands) */
    OWNER_ID: requiredDiscordId('OWNER_ID'),
    
    /** Optional: Guild ID for development (faster command updates) */
    GUILD_ID: process.env.GUILD_ID?.trim() || null,
    
    /** Optional global trap channel IDs; per-server channels are managed with /setup-trap */
    BAN_CHANNEL_IDS: optionalDiscordIdList('BAN_CHANNEL_IDS'),
    
    /** Channel ID for ban log embeds */
    LOG_CHANNEL_ID: process.env.LOG_CHANNEL_ID?.trim() || null,
    
    /** Bot status text (shown in Discord user presence) */
    STATUS_TEXT: process.env.STATUS_TEXT || 'Watching for breaches...',
    
    /** How many seconds of messages to delete when banning (default: 24 hours) */
    DELETE_MESSAGE_SECONDS: boundedInteger('DELETE_MESSAGE_SECONDS', 86400, 0, 604800),
    
    /** Days to keep captured message content in the ban history (0 = keep forever) */
    MESSAGE_RETENTION_DAYS: boundedInteger('MESSAGE_RETENTION_DAYS', 90, 0, 3650),

    /** Ban reason shown in audit log */
    BAN_REASON: (process.env.BAN_REASON?.trim() || 'Security Breach: Sent a message in a Bot Detection Channel.').slice(0, 500),
    
    /** Port of the read-only stats endpoint used by the website (0 = disabled) */
    STATS_PORT: boundedInteger('STATS_PORT', 0, 0, 65535),

    /** Interface for the stats endpoint (localhost unless you deliberately expose it) */
    STATS_HOST: process.env.STATS_HOST?.trim() || '127.0.0.1',

    /** If set, the stats endpoint requires "Authorization: Bearer <token>" */
    STATS_TOKEN: process.env.STATS_TOKEN?.trim() || null,

    /** Old token still accepted while a new STATS_TOKEN is being rolled out; remove once the website uses the new one */
    STATS_TOKEN_PREVIOUS: process.env.STATS_TOKEN_PREVIOUS?.trim() || null,

    /**
     * Serve the API behind the hosted website dashboard under /api/ (needs STATS_TOKEN).
     * Self-hosted bots that do not use that dashboard can set it to false; every
     * feature is also available with slash commands.
     */
    DASHBOARD_API: optionalBoolean('DASHBOARD_API', true),

    /** MySQL database configuration */
    DB: {
        host: dbHost,
        port: dbPort,
        user: dbUser,
        password: dbPassword,
        database: dbName,
    },
};

/** Required configuration keys */
module.exports = CONFIG;