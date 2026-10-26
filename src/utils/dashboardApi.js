/**
 * Read-only API for the website dashboard.
 *
 * The dashboard's server calls this with the shared bearer token and names the
 * Discord user it acts for in the X-Discord-User header. The bot does not trust
 * the website's view of that user's rights: for every server it looks the member
 * up itself and only answers if they are the owner or have Administrator, the
 * same rule the slash commands use.
 *
 * Routes (all GET):
 *   /api/guilds?ids=1,2,3       which of these servers the user may open
 *   /api/guilds/:id             settings, health and totals of one server
 *   /api/guilds/:id/bans        ban history of one server (?page=, ?q=)
 *
 * @module utils/dashboardApi
 */

const { PermissionFlagsBits } = require('discord.js');

const db = require('./db');
const guildSettings = require('./guildSettings');
const logger = require('./logger');

const SNOWFLAKE = /^\d{17,20}$/;
const MAX_IDS = 100;
const PAGE_SIZE = 25;
const MAX_QUERY_LENGTH = 100;

/**
 * The server if the user may manage it through the dashboard, otherwise null.
 *
 * @param {import('discord.js').Client} client - Discord client
 * @param {string} guildId - Server ID
 * @param {string} userId - Discord user the request acts for
 * @returns {Promise<import('discord.js').Guild|null>}
 */
async function manageableGuild(client, guildId, userId) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return null;
    if (guild.ownerId === userId) return guild;

    const member = await guild.members.fetch(userId).catch(() => null);
    return member?.permissions?.has(PermissionFlagsBits.Administrator) ? guild : null;
}

/** `{id, name}` for a channel or role, falling back to the ID if it no longer exists. */
function named(collection, id) {
    return { id, name: collection.get(id)?.name ?? null };
}

/**
 * Settings, health and totals for one server.
 *
 * @param {import('discord.js').Guild} guild - Server to describe
 * @returns {Promise<Object>}
 */
async function describeGuild(guild) {
    const config = guildSettings.getGuildConfig(guild.id);
    const trapChannelIds = guildSettings.listTrapChannels(guild.id);
    const [bans, uniqueUsers] = await Promise.all([db.getBanCount(guild.id), db.getUniqueUserCount(guild.id)]);

    return {
        guild: {
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL?.({ size: 128, extension: 'png' }) ?? null,
            memberCount: guild.memberCount ?? null,
        },
        config: {
            logChannel: config.logChannelId ? named(guild.channels.cache, config.logChannelId) : null,
            banReason: config.banReason,
            deleteMessageSeconds: config.deleteMessageSeconds,
            dryRun: config.dryRun,
            trapChannels: trapChannelIds.map(id => named(guild.channels.cache, id)),
            exemptRoles: config.exemptRoleIds.map(id => named(guild.roles.cache, id)),
        },
        health: {
            canBan: Boolean(guild.members.me?.permissions?.has(PermissionFlagsBits.BanMembers)),
            hasLogChannel: Boolean(config.logChannelId),
            hasTrapChannel: trapChannelIds.length > 0,
        },
        totals: { bans: Number(bans), uniqueUsers: Number(uniqueUsers) },
    };
}

/**
 * Create the request handler for /api/* paths.
 *
 * @param {import('discord.js').Client} client - Discord client
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, url: URL) => Promise<void>}
 */
function createDashboardApi(client) {
    return async function handle(req, res, url) {
        const send = (status, body) => {
            res.writeHead(status, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff',
            });
            res.end(JSON.stringify(body));
        };

        if (req.method !== 'GET') return send(405, { error: 'method not allowed' });

        const userId = String(req.headers['x-discord-user'] || '');
        if (!SNOWFLAKE.test(userId)) return send(400, { error: 'missing or invalid X-Discord-User' });

        try {
            const parts = url.pathname.split('/').filter(Boolean); // ['api', 'guilds', id?, 'bans'?]

            if (parts.length === 2 && parts[1] === 'guilds') {
                const ids = [...new Set((url.searchParams.get('ids') || '').split(',').filter(id => SNOWFLAKE.test(id)))].slice(0, MAX_IDS);
                const checked = await Promise.all(ids.map(id => manageableGuild(client, id, userId)));
                return send(200, {
                    guilds: checked.filter(Boolean).map(guild => ({
                        id: guild.id,
                        name: guild.name,
                        icon: guild.iconURL?.({ size: 128, extension: 'png' }) ?? null,
                    })),
                });
            }

            if (parts[1] === 'guilds' && SNOWFLAKE.test(parts[2] || '') && parts.length <= 4) {
                // The same answer whether the server does not exist or the user may not open it.
                const guild = await manageableGuild(client, parts[2], userId);
                if (!guild) return send(404, { error: 'not found' });

                if (parts.length === 3) return send(200, await describeGuild(guild));

                if (parts[3] === 'bans') {
                    const page = Math.max(1, Math.min(10000, Number.parseInt(url.searchParams.get('page'), 10) || 1));
                    const query = (url.searchParams.get('q') || '').slice(0, MAX_QUERY_LENGTH);
                    const { total, rows } = await db.searchBans(guild.id, { query, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
                    return send(200, {
                        total,
                        page,
                        pageSize: PAGE_SIZE,
                        bans: rows.map(row => ({
                            id: row.id,
                            userId: row.user_id,
                            userTag: row.user_tag,
                            channelName: row.channel_name,
                            reason: row.reason,
                            messageContent: row.message_content,
                            createdAt: new Date(row.created_at).toISOString(),
                        })),
                    });
                }
            }

            send(404, { error: 'not found' });
        } catch (error) {
            logger.error('Dashboard API request failed.', error);
            send(503, { error: 'unavailable' });
        }
    };
}

module.exports = { createDashboardApi, manageableGuild, PAGE_SIZE };
