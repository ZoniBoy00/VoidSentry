const { AttachmentBuilder } = require('discord.js');
const { LOGO_PATH } = require('./constants');

/**
 * Creates a new AttachmentBuilder for the VoidSentry logo.
 * Each embed message needs its own attachment instance.
 */
function createLogoAttachment() {
    return new AttachmentBuilder(LOGO_PATH);
}

/**
 * Formats a Date into a Discord timestamp string.
 * @param {Date} date
 * @param {'t'|'T'|'d'|'D'|'f'|'F'|'R'} style - Discord timestamp style
 * @returns {string}
 */
function discordTimestamp(date, style = 'f') {
    const unix = Math.floor(date.getTime() / 1000);
    return `<t:${unix}:${style}>`;
}

/**
 * Formats a Date into both full and relative Discord timestamps.
 * @param {Date} date
 * @returns {string}
 */
function formatTimestamp(date) {
    return `${discordTimestamp(date, 'f')} (${discordTimestamp(date, 'R')})`;
}

/**
 * Safely fetches a channel from a guild. Returns null on failure.
 * @param {import('discord.js').Guild} guild
 * @param {string} channelId
 * @returns {Promise<import('discord.js').TextChannel|null>}
 */
async function fetchChannel(guild, channelId) {
    try {
        const channel = await guild.channels.fetch(channelId);
        return channel?.isTextBased() ? channel : null;
    } catch {
        return null;
    }
}

module.exports = {
    createLogoAttachment,
    discordTimestamp,
    formatTimestamp,
    fetchChannel,
};
