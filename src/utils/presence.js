/**
 * Rotating bot presence.
 *
 * Cycles the "Watching ..." status between the configured STATUS_TEXT, the
 * number of servers and the total number of bans. The ban total is read from
 * the database periodically and bumped locally on every new ban.
 *
 * @module utils/presence
 */

const { ActivityType } = require('discord.js');

const CONFIG = require('../config');
const db = require('./db');
const logger = require('./logger');

/** How often the status text changes. */
const ROTATE_MS = 30 * 1000;
/** How often the ban total is re-read from the database. */
const REFRESH_MS = 5 * 60 * 1000;

let totalBans = null;
let index = 0;

const plural = (count, word) => `${count.toLocaleString('en-US')} ${word}${count === 1 ? '' : 's'}`;

/**
 * Status lines to rotate through.
 *
 * @param {import('discord.js').Client} client - Discord client
 * @returns {string[]}
 */
function buildActivities(client) {
    const items = [CONFIG.STATUS_TEXT, `${plural(client.guilds.cache.size, 'server')}`];
    if (totalBans !== null) items.push(`${totalBans.toLocaleString('en-US')} ${totalBans === 1 ? 'user' : 'users'} banned`);
    return items;
}

/** Show the next status line. */
function rotate(client) {
    const items = buildActivities(client);
    index = (index + 1) % items.length;
    client.user.setPresence({
        activities: [{ name: items[index], type: ActivityType.Watching }],
        status: 'dnd',
    });
}

async function refreshBans() {
    try {
        totalBans = Number(await db.getBanCount());
    } catch (err) {
        logger.warn(`Could not refresh ban total for presence: ${err.message}`);
    }
}

/** Count a ban immediately instead of waiting for the next database refresh. */
function recordBan() {
    if (totalBans !== null) totalBans += 1;
}

/**
 * Start the rotating presence. Call once the client is ready and the database is up.
 *
 * @param {import('discord.js').Client} client - Discord client
 */
async function start(client) {
    await refreshBans();
    index = -1;
    rotate(client);
    setInterval(() => rotate(client), ROTATE_MS).unref();
    setInterval(refreshBans, REFRESH_MS).unref();
}

module.exports = { start, recordBan, buildActivities };
