const path = require('path');

// Color palette
const COLORS = {
    DANGER: 0xFF0000,
    DARK: 0x2C2F33,
    SUCCESS: 0x00FF7F,
    WARNING: 0xFFA500,
    INFO: 0x5865F2,
};

// Paths
const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');
const LOGO_PATH = path.join(ASSETS_DIR, 'logo.png');
const LOGO_ATTACHMENT_NAME = 'logo.png';
const LOGO_URL = `attachment://${LOGO_ATTACHMENT_NAME}`;

// Branding
const BRAND_NAME = 'VoidSentry';
const BRAND_SECURITY = `${BRAND_NAME} Security`;
const BRAND_LOGGING = `${BRAND_NAME} Logging`;

// Ban reasons
const BAN_REASON = 'Security Breach: Sent a message in a Bot Detection Channel.';

module.exports = {
    COLORS,
    ASSETS_DIR,
    LOGO_PATH,
    LOGO_ATTACHMENT_NAME,
    LOGO_URL,
    BRAND_NAME,
    BRAND_SECURITY,
    BRAND_LOGGING,
    BAN_REASON,
};
