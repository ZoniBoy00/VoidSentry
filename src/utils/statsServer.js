/**
 * Read-only HTTP endpoint for the project website.
 *
 * /stats serves aggregate numbers (servers, bans, members) as JSON so the site
 * can show live stats; nothing user-specific is exposed. When a token is set,
 * /api/* also serves the dashboard API (see dashboardApi.js). Disabled
 * unless STATS_PORT is set; by default it only listens on localhost, so put
 * a tunnel or reverse proxy in front of it to make it reachable.
 *
 * @module utils/statsServer
 */

const http = require('node:http');
const crypto = require('node:crypto');

const db = require('./db');
const { createDashboardApi } = require('./dashboardApi');
const logger = require('./logger');

/** How long a computed answer is reused, so the database is not queried per request. */
const CACHE_MS = 30 * 1000;
/** Window for the "recent bans" number. */
const RECENT_DAYS = 7;

/**
 * Compare a presented token with the expected one without leaking timing.
 *
 * @param {string} presented - Value from the Authorization header
 * @param {string} expected - Configured token
 * @returns {boolean}
 */
function tokenMatches(presented, expected) {
    const a = crypto.createHash('sha256').update(presented).digest();
    const b = crypto.createHash('sha256').update(expected).digest();
    return crypto.timingSafeEqual(a, b);
}

/** Shortest token that is hard to guess; the token is the only thing protecting the dashboard API. */
const MIN_TOKEN_LENGTH = 32;

/**
 * Whether a configured token is too short to be safe.
 *
 * @param {string|null|undefined} token - Configured token
 * @returns {boolean}
 */
function isWeakToken(token) {
    return Boolean(token) && token.length < MIN_TOKEN_LENGTH;
}

/**
 * Build the stats payload.
 *
 * @param {import('discord.js').Client} client - Discord client
 * @returns {Promise<Object>}
 */
async function collect(client) {
    const [totalBans, uniqueUsers, recentBans] = await Promise.all([
        db.getBanCount(),
        db.getUniqueUserCount(),
        db.getBanCountSince(RECENT_DAYS),
    ]);

    return {
        servers: client.guilds.cache.size,
        members: client.guilds.cache.reduce((sum, guild) => sum + (guild.memberCount || 0), 0),
        totalBans: Number(totalBans),
        uniqueUsers: Number(uniqueUsers),
        recentBans: Number(recentBans),
        recentDays: RECENT_DAYS,
        uptimeSeconds: Math.floor(process.uptime()),
        updatedAt: new Date().toISOString(),
    };
}

/**
 * Create (but do not start) the stats HTTP server.
 *
 * @param {import('discord.js').Client} client - Discord client
 * @param {{token?: string|null, previousToken?: string|null, dashboard?: boolean, limits?: Object}} [options] -
 *   Optional bearer token required for requests, the token it replaces (still accepted during a rotation),
 *   whether to serve the dashboard API, and its rate limits
 * @returns {import('node:http').Server}
 */
function createStatsServer(client, { token = null, previousToken = null, dashboard = true, limits } = {}) {
    let cached = null;
    let cachedAt = 0;
    let inflight = null;
    const dashboardApi = dashboard ? createDashboardApi(client, { limits }) : null;

    async function getPayload() {
        if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
        if (!inflight) {
            inflight = collect(client)
                .then(payload => {
                    cached = payload;
                    cachedAt = Date.now();
                    return payload;
                })
                .finally(() => { inflight = null; });
        }
        return inflight;
    }

    const server = http.createServer(async (req, res) => {
        const send = (status, body) => {
            res.writeHead(status, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'public, max-age=30',
                'X-Content-Type-Options': 'nosniff',
            });
            res.end(JSON.stringify(body));
        };

        // A malformed request target (for example "//") must get an answer, not hang the connection.
        let url;
        try {
            url = new URL(req.url || '/', 'http://localhost');
        } catch {
            return send(400, { error: 'bad request' });
        }
        const path = url.pathname;
        const isApi = path.startsWith('/api/');
        if (!isApi && (req.method !== 'GET' || path !== '/stats')) return send(404, { error: 'not found' });

        // The dashboard API exposes per-server data, so it is never available without a token,
        // and not at all when it is switched off (DASHBOARD_API=false).
        if (isApi && (!token || !dashboardApi)) return send(404, { error: 'not found' });

        if (token) {
            const header = req.headers.authorization || '';
            const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
            // Both comparisons always run, so the answer time does not tell which token matched.
            const current = Boolean(presented) && tokenMatches(presented, token);
            const previous = Boolean(presented) && Boolean(previousToken) && tokenMatches(presented, previousToken);
            if (!current && !previous) return send(401, { error: 'unauthorized' });
        }

        if (isApi) return dashboardApi(req, res, url);

        try {
            send(200, await getPayload());
        } catch (error) {
            logger.error('Stats endpoint failed to read the database.', error);
            send(503, { error: 'stats unavailable' });
        }
    });

    // The endpoint can be reached from the internet through a tunnel: do not let slow clients hold sockets open.
    server.requestTimeout = 15 * 1000;
    server.headersTimeout = 10 * 1000;
    return server;
}

/**
 * Start the stats endpoint.
 *
 * @param {import('discord.js').Client} client - Discord client
 * @param {{port: number, host: string, token?: string|null, previousToken?: string|null, dashboard?: boolean}} options - Listen settings
 * @returns {Promise<import('node:http').Server>}
 */
function startStatsServer(client, { port, host, token = null, previousToken = null, dashboard = true }) {
    for (const [name, value] of [['STATS_TOKEN', token], ['STATS_TOKEN_PREVIOUS', previousToken]]) {
        if (isWeakToken(value)) {
            logger.warn(`${name} is shorter than ${MIN_TOKEN_LENGTH} characters. Anyone who guesses it can act as any dashboard user, including the owner. Use a random value, for example: openssl rand -hex 32`);
        }
    }
    const server = createStatsServer(client, { token, previousToken, dashboard });
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
            server.off('error', reject);
            server.on('error', err => logger.error('Stats server error.', err));
            const api = token && dashboard ? ', dashboard API on /api/' : '';
            logger.system(`Stats endpoint listening on http://${host}:${server.address().port}/stats${token ? ' (token required)' : ''}${api}`);
            resolve(server);
        });
    });
}

module.exports = { startStatsServer, createStatsServer, isWeakToken };
