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

function requiredDiscordId(name) {
    const value = requiredEnv(name);
    if (!DISCORD_ID_REGEX.test(value)) throw new Error(`${name} must be a valid Discord ID`);
    return value;
}

function requiredDiscordIdList(name) {
    const values = requiredEnv(name).split(',').map(value => value.trim()).filter(Boolean);
    if (values.length === 0 || values.some(value => !DISCORD_ID_REGEX.test(value))) {
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
 * @property {string[]} BAN_CHANNEL_IDS - Array of trap channel IDs
 * @property {string|null} LOG_CHANNEL_ID - Log channel ID for ban logs
 * @property {string} STATUS_TEXT - Bot presence status text
 * @property {number} DELETE_MESSAGE_SECONDS - Seconds of messages to delete on ban
 * @property {string} BAN_REASON - Reason shown in ban audit log
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
    
    /** Array of channel IDs that trigger ban on message */
    BAN_CHANNEL_IDS: requiredDiscordIdList('BAN_CHANNEL_IDS'),
    
    /** Channel ID for ban log embeds */
    LOG_CHANNEL_ID: process.env.LOG_CHANNEL_ID?.trim() || null,
    
    /** Bot status text (shown in Discord user presence) */
    STATUS_TEXT: process.env.STATUS_TEXT || 'Watching for breaches...',
    
    /** How many seconds of messages to delete when banning (default: 24 hours) */
    DELETE_MESSAGE_SECONDS: boundedInteger('DELETE_MESSAGE_SECONDS', 86400, 0, 604800),
    
    /** Ban reason shown in audit log */
    BAN_REASON: (process.env.BAN_REASON?.trim() || 'Security Breach: Sent a message in a Bot Detection Channel.').slice(0, 500),
    
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