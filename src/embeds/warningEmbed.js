const { EmbedBuilder } = require('discord.js');
const { COLORS, LOGO_URL, BRAND_SECURITY } = require('../utils/constants');

/**
 * Creates the warning embed displayed in trap channels.
 * @returns {EmbedBuilder}
 */
function createWarningEmbed() {
    return new EmbedBuilder()
        .setColor(COLORS.DANGER)
        .setTitle('🚨 WARNING: BOT DETECTION CHANNEL 🚨')
        .setAuthor({ name: `${BRAND_SECURITY}`, iconURL: LOGO_URL })
        .setDescription(
            'This channel is monitored exclusively for bot detection.\n' +
            '**Do NOT type anything in this chat.**\n\n' +
            'If you send a message here, for any reason, you will be permanently banned.\n\n' +
            'There are no appeals. No second chances.\n\n' +
            'This is not a joke and not a test.\n' +
            '**You have been warned.**'
        )
        .setTimestamp();
}

module.exports = { createWarningEmbed };
