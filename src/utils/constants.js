/**
 * Constants and configuration values.
 * 
 * Contains colors, paths, branding, and other static values
 * used throughout the bot.
 * 
 * @module utils/constants
 */

const path = require('path');
const VERSION = require('../../package.json').version;

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

/** Where people ask for help. Self-hosted copies can point it at their own place with SUPPORT_URL. */
const SUPPORT_URL = process.env.SUPPORT_URL?.trim() || 'https://github.com/ZoniBoy00/VoidSentry/discussions';

/** The website's appeal form, named in the warning and the ban DM on servers that accept appeals. */
const APPEALS_URL = process.env.APPEALS_URL?.trim() || 'https://voidsentry.vercel.app/appeal';

/**
 * Link buttons under /help and /status. Self-hosted copies can point them elsewhere, or set the
 * variable to an empty value to leave that button out.
 */
function linkFromEnv(name, fallback) {
    const value = process.env[name];
    return value === undefined ? fallback : value.trim();
}
const WEBSITE_URL = linkFromEnv('WEBSITE_URL', 'https://voidsentry.vercel.app');
const TOPGG_URL = linkFromEnv('TOPGG_URL', 'https://top.gg/bot/1443959104442863628');

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
    SUPPORT_URL,
    APPEALS_URL,
    WEBSITE_URL,
    TOPGG_URL,
    VERSION,
    getBanReason,
};