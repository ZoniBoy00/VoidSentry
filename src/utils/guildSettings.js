/**
 * Per-server settings and trap channels.
 *
 * Settings live in MySQL and are mirrored in memory so the message handler
 * can check trap channels synchronously. Values that a server has not set fall
 * back to the global defaults from the environment configuration.
 *
 * @module utils/guildSettings
 */

const CONFIG = require('../config');
const db = require('./db');

/** channelId -> guildId */
const trapChannels = new Map();
/** guildId -> { logChannelId, banReason, deleteMessageSeconds, dryRun } */
const settings = new Map();
/** guildId -> Set of exempt role IDs */
const exemptRoles = new Map();

/** Load all stored settings into memory. Call after the database is ready. */
async function load() {
    const data = await db.loadGuildSettings();
    trapChannels.clear();
    settings.clear();
    exemptRoles.clear();
    for (const row of data.channels) trapChannels.set(row.channel_id, row.guild_id);
    for (const row of data.settings) {
        settings.set(row.guild_id, {
            logChannelId: row.log_channel_id,
            banReason: row.ban_reason,
            deleteMessageSeconds: row.delete_message_seconds,
            dryRun: row.dry_run === null || row.dry_run === undefined ? null : Boolean(row.dry_run),
        });
    }
    for (const row of data.exemptRoles || []) {
        if (!exemptRoles.has(row.guild_id)) exemptRoles.set(row.guild_id, new Set());
        exemptRoles.get(row.guild_id).add(row.role_id);
    }
}

/**
 * Whether a channel is a trap channel for the given server.
 * Channels from the BAN_CHANNEL_IDS environment variable are trap channels everywhere.
 *
 * @param {string} guildId - Server the message was sent in
 * @param {string} channelId - Channel the message was sent in
 * @returns {boolean}
 */
function isTrapChannel(guildId, channelId) {
    return CONFIG.BAN_CHANNEL_IDS.includes(channelId) || trapChannels.get(channelId) === guildId;
}

/**
 * Effective configuration for a server (stored values over global defaults).
 *
 * @param {string} guildId - Server ID
 * @returns {{logChannelId: string|null, banReason: string, deleteMessageSeconds: number, dryRun: boolean, exemptRoleIds: string[]}}
 */
function getGuildConfig(guildId) {
    const stored = settings.get(guildId) || {};
    return {
        logChannelId: stored.logChannelId || CONFIG.LOG_CHANNEL_ID,
        banReason: stored.banReason || CONFIG.BAN_REASON,
        deleteMessageSeconds: stored.deleteMessageSeconds ?? CONFIG.DELETE_MESSAGE_SECONDS,
        dryRun: Boolean(stored.dryRun),
        exemptRoleIds: [...(exemptRoles.get(guildId) || [])],
    };
}

/**
 * Trap channel IDs stored for a server.
 *
 * @param {string} guildId - Server ID
 * @returns {string[]}
 */
function listTrapChannels(guildId) {
    return [...trapChannels].filter(([, id]) => id === guildId).map(([channelId]) => channelId);
}

async function addTrapChannel(guildId, channelId) {
    await db.addTrapChannel(guildId, channelId);
    trapChannels.set(channelId, guildId);
}

async function removeTrapChannel(channelId) {
    await db.removeTrapChannel(channelId);
    trapChannels.delete(channelId);
}

async function addExemptRole(guildId, roleId) {
    await db.addExemptRole(guildId, roleId);
    if (!exemptRoles.has(guildId)) exemptRoles.set(guildId, new Set());
    exemptRoles.get(guildId).add(roleId);
}

async function removeExemptRole(guildId, roleId) {
    await db.removeExemptRole(guildId, roleId);
    exemptRoles.get(guildId)?.delete(roleId);
}

/** Forget a server's settings and trap channels (used when the bot leaves). */
async function removeGuild(guildId) {
    await db.removeGuildData(guildId);
    settings.delete(guildId);
    exemptRoles.delete(guildId);
    for (const channelId of listTrapChannels(guildId)) trapChannels.delete(channelId);
}

async function updateSetting(guildId, column, key, value) {
    await db.setGuildSetting(guildId, column, value);
    settings.set(guildId, { ...(settings.get(guildId) || {}), [key]: value });
}

const setLogChannel = (guildId, channelId) => updateSetting(guildId, 'log_channel_id', 'logChannelId', channelId);
const setBanReason = (guildId, reason) => updateSetting(guildId, 'ban_reason', 'banReason', reason);
const setDeleteMessageSeconds = (guildId, seconds) => updateSetting(guildId, 'delete_message_seconds', 'deleteMessageSeconds', seconds);
const setDryRun = (guildId, enabled) => updateSetting(guildId, 'dry_run', 'dryRun', enabled ? 1 : 0);

module.exports = {
    load,
    isTrapChannel,
    getGuildConfig,
    listTrapChannels,
    addTrapChannel,
    removeTrapChannel,
    addExemptRole,
    removeExemptRole,
    removeGuild,
    setLogChannel,
    setBanReason,
    setDeleteMessageSeconds,
    setDryRun,
};
