/**
 * Constants and configuration values.
 * 
 * Contains colors, paths, branding, and other static values
 * used throughout the bot.
 * 
 * @module utils/constants
 */

const path = require('path');

/** Discord embed color palette */
const COLORS = {
    DANGER: 0xFF0000,   // Red for bans/errors
    DARK: 0x2C2F33,     // Dark gray
    SUCCESS: 0x00FF7F,  // Green for success
    WARNING: 0xFFA500,  // Orange for warnings
    INFO: 0x5865F2,     // Blurple for info
};

/** Asset paths */
const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');
const LOGO_PATH = path.join(ASSETS_DIR, 'logo.png');
const LOGO_ATTACHMENT_NAME = 'logo.png';
const LOGO_URL = `attachment://${LOGO_ATTACHMENT_NAME}`;

/** Branding strings */
const BRAND_NAME = 'VoidSentry';
const BRAND_SECURITY = `${BRAND_NAME} Security`;
const BRAND_LOGGING = `${BRAND_NAME} Logging`;

/**
 * Get ban reason from config.
 * Loaded dynamically from environment at runtime.
 * 
 * @returns {string} Ban reason from config
 */
function getBanReason() {
    const CONFIG = require('../config');
    return CONFIG.BAN_REASON;
}

module.exports = {
    COLORS,
    ASSETS_DIR,
    LOGO_PATH,
    LOGO_ATTACHMENT_NAME,
    LOGO_URL,
    BRAND_NAME,
    BRAND_SECURITY,
    BRAND_LOGGING,
    getBanReason,
};