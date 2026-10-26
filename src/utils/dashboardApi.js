/**
 * Read-only API for the website dashboard.
 *
 * The dashboard's server calls this with the shared bearer token and names the
 * Discord user it acts for in the X-Discord-User header. The bot does not trust
 * the website's view of that user's rights: for every server it looks the member
 * up itself and only answers if they are the owner or have Administrator, the
 * same rule the slash commands use.
 *
 * The bot owner (OWNER_ID) may open every server and use the /api/admin routes.
 *
 * Routes:
 *   GET  /api/me                    whether the user is the bot owner
 *   GET  /api/guilds?ids=1,2,3      which of these servers the user may open
 *   GET  /api/guilds/:id            settings, health and totals of one server
 *   GET  /api/guilds/:id/bans       ban history of one server (?page=, ?q=)
 *   GET  /api/admin/overview        every server and the global totals (owner only)
 *   GET  /api/admin/bans            ban history across all servers (owner only)
 *   POST /api/admin/purge-user      delete a user's ban records everywhere (owner only)
 *
 * @module utils/dashboardApi
 */

const { PermissionFlagsBits } = require('discord.js');

const CONFIG = require('../config');
const db = require('./db');
const guildSettings = require('./guildSettings');
const logger = require('./logger');

const SNOWFLAKE = /^\d{17,20}$/;
const MAX_IDS = 100;
const PAGE_SIZE = 25;
const MAX_QUERY_LENGTH = 100;
const MAX_BODY_BYTES = 1024;

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
    if (guild.ownerId === userId || userId === CONFIG.OWNER_ID) return guild;

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

/** Serialise a ban row for the API. */
function banJson(row) {
    return {
        id: row.id,
        userId: row.user_id,
        userTag: row.user_tag,
        guildId: row.guild_id,
        guildName: row.guild_name,
        channelName: row.channel_name,
        reason: row.reason,
        messageContent: row.message_content,
        createdAt: new Date(row.created_at).toISOString(),
    };
}

/** Parse query parameters shared by the ban list routes. */
function pagingFrom(url) {
    return {
        page: Math.max(1, Math.min(10000, Number.parseInt(url.searchParams.get('page'), 10) || 1)),
        query: (url.searchParams.get('q') || '').slice(0, MAX_QUERY_LENGTH),
    };
}

/** Read a small JSON request body; null if it is too large or not JSON. */
function readJson(req) {
    return new Promise(resolve => {
        let size = 0;
        const chunks = [];
        req.on('data', chunk => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                resolve(null);
                req.destroy();
            } else {
                chunks.push(chunk);
            }
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
                resolve(null);
            }
        });
        req.on('error', () => resolve(null));
    });
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

        const userId = String(req.headers['x-discord-user'] || '');
        if (!SNOWFLAKE.test(userId)) return send(400, { error: 'missing or invalid X-Discord-User' });

        try {
            const parts = url.pathname.split('/').filter(Boolean); // ['api', 'guilds', id?, 'bans'?]
            const isBotOwner = userId === CONFIG.OWNER_ID;

            if (parts[1] === 'admin') {
                // Same answer as for a route that does not exist.
                if (!isBotOwner) return send(404, { error: 'not found' });

                if (req.method === 'GET' && parts.length === 3 && parts[2] === 'overview') {
                    const counts = await db.getBanCountsByGuild();
                    const [totalBans, uniqueUsers] = await Promise.all([db.getBanCount(), db.getUniqueUserCount()]);
                    const servers = [...client.guilds.cache.values()]
                        .map(guild => ({
                            id: guild.id,
                            name: guild.name,
                            icon: guild.iconURL?.({ size: 128, extension: 'png' }) ?? null,
                            memberCount: guild.memberCount ?? null,
                            bans: counts.get(guild.id) ?? 0,
                        }))
                        .sort((a, b) => b.bans - a.bans || a.name.localeCompare(b.name));
                    return send(200, {
                        servers,
                        totals: { bans: Number(totalBans), uniqueUsers: Number(uniqueUsers) },
                        uptimeSeconds: Math.floor(process.uptime()),
                    });
                }

                if (req.method === 'GET' && parts.length === 3 && parts[2] === 'bans') {
                    const { page, query } = pagingFrom(url);
                    const { total, rows } = await db.searchBans(null, { query, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
                    return send(200, { total, page, pageSize: PAGE_SIZE, bans: rows.map(banJson) });
                }

                if (req.method === 'POST' && parts.length === 3 && parts[2] === 'purge-user') {
                    const body = await readJson(req);
                    const target = String(body?.userId ?? '');
                    if (!SNOWFLAKE.test(target)) return send(400, { error: 'invalid userId' });
                    const deleted = await db.deleteBansByUser(target);
                    logger.info(`Dashboard: owner ${userId} deleted ${deleted} ban record(s) of ${target}.`);
                    return send(200, { deleted: Number(deleted) });
                }

                return send(404, { error: 'not found' });
            }

            if (req.method !== 'GET') return send(405, { error: 'method not allowed' });

            if (parts.length === 2 && parts[1] === 'me') return send(200, { isOwner: isBotOwner });

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
                    const { page, query } = pagingFrom(url);
                    const { total, rows } = await db.searchBans(guild.id, { query, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
                    return send(200, {
                        total,
                        page,
                        pageSize: PAGE_SIZE,
                        bans: rows.map(banJson),
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
