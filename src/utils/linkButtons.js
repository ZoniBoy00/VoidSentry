/**
 * A row of link buttons to the website, the top.gg page and support, shown
 * under /help and /status. Link buttons need no interaction handling.
 *
 * @module utils/linkButtons
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const { SUPPORT_URL, TOPGG_URL, WEBSITE_URL } = require('./constants');

/**
 * Build the row, leaving out any link that is not configured.
 *
 * @returns {ActionRowBuilder<ButtonBuilder>[]} One row, or none when every link is empty
 */
function createLinkRows() {
    const links = [
        ['Website', WEBSITE_URL, '🌐'],
        ['top.gg', TOPGG_URL, '⭐'],
        ['Support', SUPPORT_URL, '💬'],
    ].filter(([, url]) => /^https:\/\//.test(url || ''));
    if (links.length === 0) return [];

    const row = new ActionRowBuilder().addComponents(
        links.map(([label, url, emoji]) => new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel(label)
            .setEmoji(emoji)
            .setURL(url)),
    );
    return [row];
}

module.exports = { createLinkRows };
