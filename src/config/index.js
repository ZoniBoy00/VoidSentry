require('dotenv').config();

const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN,
    CLIENT_ID: process.env.CLIENT_ID,
    OWNER_ID: process.env.OWNER_ID?.replace(/['"]/g, '').split(/\s+/)[0],
    BAN_CHANNEL_IDS: process.env.BAN_CHANNEL_IDS
        ? process.env.BAN_CHANNEL_IDS.split(',').map(id => id.trim())
        : [],
    LOG_CHANNEL_ID: process.env.LOG_CHANNEL_ID,
    STATUS_TEXT: process.env.STATUS_TEXT || 'Watching for breaches...',
    DELETE_MESSAGE_SECONDS: 86400, // 24 hours
};

// Validate required environment variables
const requiredKeys = ['TOKEN', 'CLIENT_ID', 'OWNER_ID', 'BAN_CHANNEL_IDS', 'LOG_CHANNEL_ID'];
const missingKeys = requiredKeys.filter(key => {
    const val = CONFIG[key];
    if (Array.isArray(val)) return val.length === 0;
    return !val;
});

if (missingKeys.length > 0) {
    console.error(`\x1b[41m\x1b[37m FATAL \x1b[0m Missing or empty environment variables: ${missingKeys.join(', ')}`);
    console.error('Please check your .env file and ensure all required values are set.');
    process.exit(1);
}

module.exports = CONFIG;
