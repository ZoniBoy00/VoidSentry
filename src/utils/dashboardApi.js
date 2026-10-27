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
 * The website sends the issue time of the user's session in X-Session-Issued;
 * sessions issued before the user's last "sign out everywhere" get 403. Each
 * user, and all users together, are rate limited (429).
 *
 * Routes:
 *   GET  /api/me                    whether the user is the bot owner
 *   POST /api/me/revoke             sign the user out of every dashboard session
 *   GET  /api/guilds?ids=1,2,3      which of these servers the user may open
 *   GET  /api/guilds/:id            settings, health and totals of one server
 *   GET  /api/guilds/:id/bans       ban history of one server (?page=, ?q=)
 *   GET  /api/guilds/:id/export     the newest 2,000 bans of one server, for a CSV download
 *   GET  /api/guilds/:id/stats      ban statistics of one server for the last 30 days
 *   GET  /api/guilds/:id/audit      recent settings changes made through the dashboard
 *   POST /api/guilds/:id/settings   change settings (see dashboardSettings.js)
 *   POST /api/guilds/:id/unban      lift a Discord ban ({userId}), with an audit entry
 *   GET  /api/admin/overview        every server and the global totals (owner only)
 *   GET  /api/admin/bans            ban history across all servers (owner only)
 *   GET  /api/admin/stats           ban statistics of all servers for the last 30 days (owner only)
 *   POST /api/admin/purge-user      delete a user's ban records everywhere (owner only)
 *   POST /api/admin/leave           make the bot leave a server ({guildId}) (owner only)
 *
 * @module utils/dashboardApi
 */

const { PermissionFlagsBits } = require('discord.js');

const CONFIG = require('../config');
const { summarizeBans } = require('./banStats');
const db = require('./db');
const guildSettings = require('./guildSettings');
const { applySettings, listChannelOptions, listRoleOptions } = require('./dashboardSettings');
const logger = require('./logger');
const { createRateLimiter } = require('./rateLimit');
const sessionRevocations = require('./sessionRevocations');

const SNOWFLAKE = /^\d{17,20}$/;
const MAX_IDS = 100;
const LOOKUP_BATCH = 10;
const PAGE_SIZE = 25;
const MAX_QUERY_LENGTH = 100;
const MAX_BODY_BYTES = 4096;
/**
 * Most bans one export returns, newest first, and how much of each message it
 * includes. Together they keep the answer to about 2 MB at worst, which crosses
 * the tunnel in time and fits the website host's response size limit.
 */
const EXPORT_LIMIT = 2000;
const EXPORT_MESSAGE_LENGTH = 500;
const STATS_DAYS = 30;

/**
 * Requests per minute. A server page makes three requests and a saved change
 * four, so a person clicking around stays far below the per-user limit.
 * Searches hit the database hardest and have their own, lower limit.
 */
const DEFAULT_LIMITS = { perUser: 120, searchesPerUser: 20, total: 1200, windowMs: 60 * 1000 };

/**
 * Lookups in flight, by server and user. Requests that arrive while one is
 * running share its answer; nothing is kept once it finishes, so a role that
 * was just removed is never served from an earlier answer.
 */
const pendingLookups = new Map();

/**
 * Whether the user has Administrator in the server right now. Asks Discord
 * every time: guild.members.fetch(id) alone returns a cached member without a
 * request, which would keep access alive after the role or membership is gone.
 * Any failure counts as "no".
 */
function isAdministrator(guild, userId) {
    const key = `${guild.id}:${userId}`;
    let lookup = pendingLookups.get(key);
    if (!lookup) {
        lookup = guild.members.fetch({ user: userId, force: true, cache: false })
            .then(member => Boolean(member?.permissions?.has(PermissionFlagsBits.Administrator)))
            .catch(() => false)
            .finally(() => pendingLookups.delete(key));
        pendingLookups.set(key, lookup);
    }
    return lookup;
}

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
    return (await isAdministrator(guild, userId)) ? guild : null;
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
        options: { channels: listChannelOptions(guild), roles: listRoleOptions(guild) },
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
 * @param {{limits?: Partial<typeof DEFAULT_LIMITS>}} [options] - Overridable for tests
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, url: URL) => Promise<void>}
 */
function createDashboardApi(client, { limits = {} } = {}) {
    const { perUser, searchesPerUser, total, windowMs } = { ...DEFAULT_LIMITS, ...limits };
    const userLimiter = createRateLimiter({ limit: perUser, windowMs });
    const searchLimiter = createRateLimiter({ limit: searchesPerUser, windowMs });
    const totalLimiter = createRateLimiter({ limit: total, windowMs });

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

        // Checked before every route, the owner's included. A missing header counts as issued at 0.
        const issuedAt = Number.parseInt(String(req.headers['x-session-issued'] || '0'), 10) || 0;
        if (sessionRevocations.isRevoked(userId, issuedAt)) return send(403, { error: 'session revoked' });

        // Routing and rate limiting read the same parsed path, so /export, /export/ and /export// are one route.
        const parts = url.pathname.split('/').filter(Boolean); // ['api', 'guilds', id?, 'bans'?]

        // An export reads a whole ban history, so it counts against the search limit too.
        const isSearch = Boolean(url.searchParams.get('q')) || ['export', 'stats'].includes(parts[parts.length - 1]);
        // Every limiter counts the request, so one that is already over does not hide the others.
        const allowed = [userLimiter.hit(userId), !isSearch || searchLimiter.hit(userId), totalLimiter.hit('all')];
        if (allowed.includes(false)) return send(429, { error: 'too many requests' });

        try {
            const isBotOwner = userId === CONFIG.OWNER_ID;

            if (req.method === 'POST' && parts.length === 3 && parts[1] === 'me' && parts[2] === 'revoke') {
                await sessionRevocations.revokeAll(userId);
                logger.info(`Dashboard: ${userId} signed out of every session.`);
                return send(200, { ok: true });
            }

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

                if (req.method === 'GET' && parts.length === 3 && parts[2] === 'stats') {
                    const { rows, truncated } = await db.getBanActivity(null, STATS_DAYS);
                    const perGuild = new Map();
                    for (const row of rows) perGuild.set(row.guild_id, (perGuild.get(row.guild_id) ?? 0) + 1);
                    const busiest = [...perGuild]
                        .map(([id, count]) => ({ id, name: client.guilds.cache.get(id)?.name ?? null, count }))
                        .sort((a, b) => b.count - a.count)
                        .slice(0, 5);
                    return send(200, { ...summarizeBans(rows, { days: STATS_DAYS, truncated }), servers: busiest });
                }

                if (req.method === 'POST' && parts.length === 3 && parts[2] === 'leave') {
                    const body = await readJson(req);
                    const target = String(body?.guildId ?? '');
                    if (!SNOWFLAKE.test(target)) return send(422, { ok: false, error: 'Invalid server ID.' });
                    const guild = client.guilds.cache.get(target);
                    if (!guild) return send(422, { ok: false, error: 'The bot is not in that server.' });
                    try {
                        await guild.leave();
                    } catch (error) {
                        logger.error(`Failed to leave guild ${target} from the dashboard.`, error);
                        return send(422, { ok: false, error: 'Could not leave the server.' });
                    }
                    logger.info(`Dashboard: owner ${userId} made the bot leave ${guild.name} (${guild.id}).`);
                    return send(200, { ok: true });
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

            const isGuildWrite = req.method === 'POST' && parts[1] === 'guilds' && (parts[3] === 'settings' || parts[3] === 'unban');
            if (req.method !== 'GET' && !isGuildWrite) return send(405, { error: 'method not allowed' });

            if (parts.length === 2 && parts[1] === 'me') return send(200, { isOwner: isBotOwner });

            if (parts.length === 2 && parts[1] === 'guilds') {
                const ids = [...new Set((url.searchParams.get('ids') || '').split(',').filter(id => SNOWFLAKE.test(id)))].slice(0, MAX_IDS);
                // Each check asks Discord, so they run a few at a time rather than all at once.
                const checked = [];
                for (let i = 0; i < ids.length; i += LOOKUP_BATCH) {
                    checked.push(...await Promise.all(ids.slice(i, i + LOOKUP_BATCH).map(id => manageableGuild(client, id, userId))));
                }
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

                if (parts[3] === 'settings' && req.method === 'POST') {
                    const result = await applySettings(guild, userId, await readJson(req));
                    return send(result.ok ? 200 : 422, result);
                }

                if (parts[3] === 'unban' && req.method === 'POST') {
                    const body = await readJson(req);
                    const target = String(body?.userId ?? '');
                    if (!SNOWFLAKE.test(target)) return send(422, { ok: false, error: 'Invalid user ID.' });
                    try {
                        await guild.members.unban(target, `Unbanned by dashboard user ${userId} via VoidSentry`);
                    } catch (error) {
                        // 10026 = Unknown Ban: already lifted, which is the state the user wanted.
                        if (error?.code !== 10026) {
                            logger.error(`Failed to unban ${target} in guild ${guild.id} from the dashboard.`, error);
                            return send(422, { ok: false, error: 'Could not unban. Check that VoidSentry has the Ban Members permission.' });
                        }
                    }
                    const detail = `user ${target} unbanned`;
                    await db.addAudit({ guildId: guild.id, userId, detail })
                        .catch(error => logger.error('Could not write the audit log entry.', error));
                    logger.info(`Dashboard: ${userId} unbanned ${target} in ${guild.name} (${guild.id}).`);
                    return send(200, { ok: true });
                }

                if (parts[3] === 'audit') {
                    const rows = await db.getAudit(guild.id);
                    return send(200, {
                        entries: rows.map(row => ({
                            id: row.id,
                            userId: row.user_id,
                            detail: row.detail,
                            createdAt: new Date(row.created_at).toISOString(),
                        })),
                    });
                }

                if (parts[3] === 'stats') {
                    const { rows, truncated } = await db.getBanActivity(guild.id, STATS_DAYS);
                    return send(200, summarizeBans(rows, { days: STATS_DAYS, truncated }));
                }

                if (parts[3] === 'export') {
                    const { total, rows } = await db.searchBans(guild.id, { limit: EXPORT_LIMIT });
                    const bans = rows.map(banJson).map(ban => ({
                        ...ban,
                        messageContent: ban.messageContent?.slice(0, EXPORT_MESSAGE_LENGTH) ?? null,
                    }));
                    return send(200, { total, truncated: total > rows.length, bans });
                }

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
