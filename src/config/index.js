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
    TOKEN: process.env.DISCORD_TOKEN,
    
    /** Discord application ID */
    CLIENT_ID: process.env.CLIENT_ID,
    
    /** Bot owner's user ID (for admin commands) */
    OWNER_ID: process.env.OWNER_ID?.replace(/['"]/g, '').split(/\s+/)[0],
    
    /** Optional: Guild ID for development (faster command updates) */
    GUILD_ID: process.env.GUILD_ID,
    
    /** Array of channel IDs that trigger ban on message */
    BAN_CHANNEL_IDS: process.env.BAN_CHANNEL_IDS
        ? process.env.BAN_CHANNEL_IDS.split(',').map(id => id.trim()).filter(Boolean)
        : [],
    
    /** Channel ID for ban log embeds */
    LOG_CHANNEL_ID: process.env.LOG_CHANNEL_ID?.trim() || null,
    
    /** Bot status text (shown in Discord user presence) */
    STATUS_TEXT: process.env.STATUS_TEXT || 'Watching for breaches...',
    
    /** How many seconds of messages to delete when banning (default: 24 hours) */
    DELETE_MESSAGE_SECONDS: parseInt(process.env.DELETE_MESSAGE_SECONDS, 10) || 86400,
    
    /** Ban reason shown in audit log */
    BAN_REASON: process.env.BAN_REASON || 'Security Breach: Sent a message in a Bot Detection Channel.',
    
    /** MySQL database configuration */
    DB: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'voidsentry',
    },
};

/** Required configuration keys */
const requiredKeys = ['TOKEN', 'CLIENT_ID', 'OWNER_ID', 'BAN_CHANNEL_IDS'];

/** Validate required fields */
const missingKeys = requiredKeys.filter(key => {
    const val = CONFIG[key];
    if (Array.isArray(val)) return val.length === 0;
    return !val;
});

if (missingKeys.length > 0) {
    console.error(`\x1b[41m\x1b[37m FATAL \x1b[0m Missing required: ${missingKeys.join(', ')}`);
    console.error('Please check your .env file and ensure all required values are set.');
    process.exit(1);
}

module.exports = CONFIG;