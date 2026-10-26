/**
 * Settings changes made through the website dashboard.
 *
 * The same settings as /trap-settings, with the same limits, plus checks that
 * a slash command gets from Discord itself: a channel or role must belong to
 * this server. Every request is validated in full before anything is saved, and
 * each saved change is written to the audit log with the user who made it.
 *
 * @module utils/dashboardSettings
 */

const { ChannelType, PermissionFlagsBits } = require('discord.js');

const { createWarningEmbed } = require('../embeds/warningEmbed');
const { createLogoAttachment } = require('./helpers');
const db = require('./db');
const guildSettings = require('./guildSettings');
const logger = require('./logger');

const MAX_REASON_LENGTH = 500;
const MAX_PURGE_SECONDS = 604800;
const MAX_TRAP_CHANNELS = 10;
const MAX_EXEMPT_ROLES = 25;
const SNOWFLAKE = /^\d{17,20}$/;

const TEXT_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const FIELDS = ['logChannelId', 'banReason', 'deleteMessageSeconds', 'dryRun', 'addTrapChannel', 'removeTrapChannel', 'addExemptRole', 'removeExemptRole'];

/** Text channels the bot may post in, for the pickers in the dashboard. */
function listChannelOptions(guild) {
    return [...guild.channels.cache.values()]
        .filter(channel => TEXT_CHANNEL_TYPES.includes(channel.type))
        .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0))
        .map(channel => ({ id: channel.id, name: channel.name }));
}

/** Roles that can be exempted: not @everyone and not managed by an integration. */
function listRoleOptions(guild) {
    return [...guild.roles.cache.values()]
        .filter(role => role.id !== guild.id && !role.managed)
        .sort((a, b) => b.position - a.position)
        .map(role => ({ id: role.id, name: role.name }));
}

/** Default way to announce a new trap channel: post the warning, but do not clear the channel. */
async function postTrapWarning(channel) {
    await channel.send({ embeds: [createWarningEmbed()], files: [createLogoAttachment()] });
}

/**
 * Validate and apply a settings change.
 *
 * @param {import('discord.js').Guild} guild - Server being changed
 * @param {string} userId - Discord user making the change
 * @param {Object} body - Requested changes (any of FIELDS)
 * @param {{postWarning?: (channel: import('discord.js').GuildChannel) => Promise<void>}} [options] - Overridable for tests
 * @returns {Promise<{ok: true, changes: string[]} | {ok: false, error: string}>}
 */
async function applySettings(guild, userId, body, { postWarning = postTrapWarning } = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Send a JSON object.' };
    const keys = Object.keys(body);
    if (keys.length === 0) return { ok: false, error: 'Nothing to change.' };
    const unknown = keys.find(key => !FIELDS.includes(key));
    if (unknown) return { ok: false, error: `Unknown setting: ${unknown.slice(0, 40)}` };

    const config = guildSettings.getGuildConfig(guild.id);
    const traps = guildSettings.listTrapChannels(guild.id);
    const me = guild.members.me;

    const textChannel = id => {
        const channel = typeof id === 'string' && SNOWFLAKE.test(id) ? guild.channels.cache.get(id) : null;
        return channel && TEXT_CHANNEL_TYPES.includes(channel.type) ? channel : null;
    };
    const canPost = channel =>
        Boolean(channel.permissionsFor?.(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]));

    /** Steps to run once everything has been validated. */
    const steps = [];
    const fail = error => ({ ok: false, error });

    // The channel that will be the log channel once this request is applied.
    let effectiveLog = config.logChannelId;

    if ('logChannelId' in body) {
        if (body.logChannelId === null) {
            effectiveLog = null;
            steps.push({ detail: 'log channel reset to the default', run: () => guildSettings.setLogChannel(guild.id, null) });
        } else {
            const channel = textChannel(body.logChannelId);
            if (!channel) return fail('Choose a text channel of this server for the log.');
            if (traps.includes(channel.id) || body.addTrapChannel === channel.id) return fail('A trap channel cannot also be the log channel.');
            if (!canPost(channel)) return fail('VoidSentry cannot see or write in that channel. Give it access first.');
            effectiveLog = channel.id;
            steps.push({ detail: `log channel set to #${channel.name} (${channel.id})`, run: () => guildSettings.setLogChannel(guild.id, channel.id) });
        }
    }

    if ('banReason' in body) {
        if (body.banReason !== null && typeof body.banReason !== 'string') return fail('The ban reason must be text.');
        const reason = body.banReason?.trim() || null;
        if (reason && reason.length > MAX_REASON_LENGTH) return fail(`The ban reason can be at most ${MAX_REASON_LENGTH} characters.`);
        steps.push({ detail: reason ? 'ban reason changed' : 'ban reason reset to the default', run: () => guildSettings.setBanReason(guild.id, reason) });
    }

    if ('deleteMessageSeconds' in body) {
        const seconds = body.deleteMessageSeconds;
        if (seconds !== null && (!Number.isInteger(seconds) || seconds < 0 || seconds > MAX_PURGE_SECONDS)) {
            return fail(`Message deletion must be between 0 and ${MAX_PURGE_SECONDS} seconds.`);
        }
        steps.push({
            detail: seconds === null ? 'message deletion reset to the default' : `message deletion on ban set to ${seconds} seconds`,
            run: () => guildSettings.setDeleteMessageSeconds(guild.id, seconds),
        });
    }

    if ('dryRun' in body) {
        if (typeof body.dryRun !== 'boolean') return fail('Dry-run must be on or off.');
        steps.push({ detail: `dry-run ${body.dryRun ? 'turned on' : 'turned off'}`, run: () => guildSettings.setDryRun(guild.id, body.dryRun) });
    }

    if ('addTrapChannel' in body) {
        const channel = textChannel(body.addTrapChannel);
        if (!channel) return fail('Choose a text channel of this server for the trap.');
        if (traps.includes(channel.id)) return fail('That channel is already a trap channel.');
        if (traps.length >= MAX_TRAP_CHANNELS) return fail(`A server can have at most ${MAX_TRAP_CHANNELS} trap channels.`);
        if (effectiveLog === channel.id) return fail('The log channel cannot also be a trap channel.');
        if (!canPost(channel)) return fail('VoidSentry cannot see or write in that channel. Give it access first.');
        steps.push({
            detail: `trap channel added: #${channel.name} (${channel.id})`,
            run: async () => {
                await guildSettings.addTrapChannel(guild.id, channel.id);
                // The channel is a trap from now on; the warning is a courtesy and must not undo that.
                await postWarning(channel).catch(error => logger.warn(`Could not post the trap warning in ${channel.id}: ${error?.message || error}`));
            },
        });
    }

    if ('removeTrapChannel' in body) {
        const id = body.removeTrapChannel;
        if (typeof id !== 'string' || !traps.includes(id)) return fail('That channel is not a trap channel.');
        steps.push({ detail: `trap channel removed: ${guild.channels.cache.get(id)?.name ? '#' + guild.channels.cache.get(id).name + ' ' : ''}(${id})`, run: () => guildSettings.removeTrapChannel(id) });
    }

    if ('addExemptRole' in body) {
        const id = body.addExemptRole;
        const role = typeof id === 'string' && SNOWFLAKE.test(id) ? guild.roles.cache.get(id) : null;
        if (!role || role.id === guild.id) return fail('Choose a role of this server.');
        if (config.exemptRoleIds.includes(role.id)) return fail('That role is already exempt.');
        if (config.exemptRoleIds.length >= MAX_EXEMPT_ROLES) return fail(`A server can have at most ${MAX_EXEMPT_ROLES} exempt roles.`);
        steps.push({ detail: `exempt role added: ${role.name} (${role.id})`, run: () => guildSettings.addExemptRole(guild.id, role.id) });
    }

    if ('removeExemptRole' in body) {
        const id = body.removeExemptRole;
        if (typeof id !== 'string' || !config.exemptRoleIds.includes(id)) return fail('That role is not exempt.');
        steps.push({ detail: `exempt role removed: ${guild.roles.cache.get(id)?.name ?? 'deleted role'} (${id})`, run: () => guildSettings.removeExemptRole(guild.id, id) });
    }

    const changes = [];
    for (const step of steps) {
        await step.run();
        changes.push(step.detail);
        // A missing audit entry must not hide that the change happened.
        await db.addAudit({ guildId: guild.id, userId, detail: step.detail })
            .catch(error => logger.error('Could not write the audit log entry.', error));
    }
    logger.info(`Dashboard: ${userId} changed settings of ${guild.name} (${guild.id}): ${changes.join('; ')}`);
    return { ok: true, changes };
}

module.exports = { applySettings, listChannelOptions, listRoleOptions, MAX_REASON_LENGTH, MAX_PURGE_SECONDS };
