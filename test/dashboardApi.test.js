const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

Object.assign(process.env, {
  DISCORD_TOKEN: 'test-token',
  CLIENT_ID: '12345678901234567',
  OWNER_ID: '12345678901234568',
  BAN_CHANNEL_IDS: '',
  DB_HOST: '127.0.0.1',
  DB_PORT: '3306',
  DB_USER: 'voidsentry_test',
  DB_PASSWORD: 'test-password',
  DB_NAME: 'voidsentry_test',
  NODE_ENV: 'production',
});

const db = require('../src/utils/db');
const guildSettings = require('../src/utils/guildSettings');
const { createStatsServer } = require('../src/utils/statsServer');

const TOKEN = 'dashboard-token';
const GUILD = '22222222222222222';
const OTHER_GUILD = '33333333333333333';
const ADMIN = '44444444444444444';
const MEMBER = '55555555555555555';
const SERVER_OWNER = '66666666666666666';
const BOT_OWNER = '12345678901234568';

const searches = [];
db.getBanCount = async () => 7;
db.getUniqueUserCount = async () => 6;
const purged = [];
const saved = [];
const audits = [];
const unbanned = [];
const left = [];
let unbanError = null;
db.addAudit = async entry => { audits.push(entry); };
db.getAudit = async () => [{ id: 1, user_id: '44444444444444444', detail: 'dry-run turned on', created_at: new Date('2026-10-02T08:00:00Z') }];
guildSettings.setDryRun = async (guildId, enabled) => { saved.push([guildId, enabled]); };
db.getBanCountsByGuild = async () => new Map([[GUILD, 7], [OTHER_GUILD, 2]]);
db.deleteBansByUser = async userId => { purged.push(userId); return 3; };
db.searchBans = async (guildId, options) => {
  searches.push({ guildId, ...options });
  return {
    total: 51,
    rows: [{ id: 1, user_id: '77777777777777777', user_tag: 'spammer#0001', channel_name: 'trap', message_content: 'free nitro', reason: 'Security Breach', created_at: new Date('2026-10-01T10:00:00Z') }],
  };
};
guildSettings.getGuildConfig = () => ({
  logChannelId: '88888888888888888', banReason: 'Trap', deleteMessageSeconds: 86400, dryRun: false, exemptRoleIds: ['99999999999999999'],
});
guildSettings.listTrapChannels = () => ['11111111111111119'];

function makeGuild(id, name, { canBan = true } = {}) {
  const members = new Map([
    [ADMIN, { permissions: { has: () => true } }],
    [MEMBER, { permissions: { has: () => false } }],
  ]);
  return {
    id,
    name,
    ownerId: SERVER_OWNER,
    memberCount: 120,
    leave: async () => { left.push(id); },
    iconURL: () => 'https://cdn.example/icon.png',
    members: {
      unban: async (userId, reason) => {
        if (unbanError) throw unbanError;
        unbanned.push({ guildId: id, userId, reason });
      },
      me: { permissions: { has: () => canBan } },
      fetch: async userId => {
        const member = members.get(userId);
        if (!member) throw new Error('Unknown Member');
        return member;
      },
    },
    channels: { cache: new Map([['88888888888888888', { name: 'mod-logs' }], ['11111111111111119', { name: 'do-not-post' }]]) },
    roles: { cache: new Map([['99999999999999999', { name: 'Staff' }]]) },
  };
}

const guilds = new Map([[GUILD, makeGuild(GUILD, 'Main server')], [OTHER_GUILD, makeGuild(OTHER_GUILD, 'Other', { canBan: false })]]);
const client = { guilds: { cache: guilds } };

const revocations = new Map();
db.loadSessionRevocations = async () => [];
db.setSessionRevocation = async (userId, before) => { revocations.set(userId, before); };

function request(server, path, { user = ADMIN, token = TOKEN, method = 'GET', body = null, issued = null } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (user) headers['x-discord-user'] = user;
  if (issued !== null) headers['x-session-issued'] = String(issued);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path, method, headers }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.end(body === null ? undefined : JSON.stringify(body));
  });
}

async function withServer(options, fn) {
  const server = createStatsServer(client, options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await fn(server);
  } finally {
    server.close();
  }
}

test('the dashboard API does not exist unless a token is configured', async () => {
  await withServer({}, async server => {
    const { status } = await request(server, `/api/guilds/${GUILD}`, { token: null });
    assert.equal(status, 404);
  });
});

test('requests without the right token or a user are refused', async () => {
  await withServer({ token: TOKEN }, async server => {
    assert.equal((await request(server, `/api/guilds/${GUILD}`, { token: 'wrong' })).status, 401);
    assert.equal((await request(server, `/api/guilds/${GUILD}`, { user: null })).status, 400);
    assert.equal((await request(server, `/api/guilds/${GUILD}`, { user: 'abc' })).status, 400);
    assert.equal((await request(server, `/api/guilds/${GUILD}`, { method: 'POST' })).status, 405);
  });
});

test('an administrator gets settings, health and totals', async () => {
  await withServer({ token: TOKEN }, async server => {
    const { status, body } = await request(server, `/api/guilds/${GUILD}`);
    assert.equal(status, 200);
    assert.equal(body.guild.name, 'Main server');
    assert.deepEqual(body.config.logChannel, { id: '88888888888888888', name: 'mod-logs' });
    assert.deepEqual(body.config.trapChannels, [{ id: '11111111111111119', name: 'do-not-post' }]);
    assert.deepEqual(body.config.exemptRoles, [{ id: '99999999999999999', name: 'Staff' }]);
    assert.deepEqual(body.health, { canBan: true, hasLogChannel: true, hasTrapChannel: true });
    assert.deepEqual(body.totals, { bans: 7, uniqueUsers: 6 });
  });
});

test('health reports a missing Ban Members permission', async () => {
  await withServer({ token: TOKEN }, async server => {
    const { body } = await request(server, `/api/guilds/${OTHER_GUILD}`);
    assert.equal(body.health.canBan, false);
  });
});

test('the server owner is allowed even without a fetched member', async () => {
  await withServer({ token: TOKEN }, async server => {
    assert.equal((await request(server, `/api/guilds/${GUILD}`, { user: SERVER_OWNER })).status, 200);
  });
});

test('ordinary members and strangers see the same 404 as a missing server', async () => {
  await withServer({ token: TOKEN }, async server => {
    assert.equal((await request(server, `/api/guilds/${GUILD}`, { user: MEMBER })).status, 404);
    assert.equal((await request(server, `/api/guilds/${GUILD}`, { user: '12121212121212121' })).status, 404);
    assert.equal((await request(server, '/api/guilds/10101010101010101')).status, 404);
    assert.equal((await request(server, `/api/guilds/${GUILD}/bans`, { user: MEMBER })).status, 404);
  });
});

test('the ban list is paged and searchable', async () => {
  await withServer({ token: TOKEN }, async server => {
    searches.length = 0;
    const { status, body } = await request(server, `/api/guilds/${GUILD}/bans?page=3&q=spam%25mer`);
    assert.equal(status, 200);
    assert.equal(body.total, 51);
    assert.equal(body.page, 3);
    assert.equal(body.pageSize, 25);
    assert.equal(body.bans[0].userTag, 'spammer#0001');
    assert.equal(body.bans[0].createdAt, '2026-10-01T10:00:00.000Z');
    assert.deepEqual(searches[0], { guildId: GUILD, query: 'spam%mer', limit: 25, offset: 50 });
  });
});

test('a bad page number falls back to the first page', async () => {
  await withServer({ token: TOKEN }, async server => {
    searches.length = 0;
    await request(server, `/api/guilds/${GUILD}/bans?page=-4`);
    assert.equal(searches[0].offset, 0);
  });
});

test('the server list only includes servers the user may manage', async () => {
  await withServer({ token: TOKEN }, async server => {
    const ids = [GUILD, OTHER_GUILD, '10101010101010101', 'junk'].join(',');
    const admin = await request(server, `/api/guilds?ids=${ids}`);
    assert.deepEqual(admin.body.guilds.map(g => g.id), [GUILD, OTHER_GUILD]);
    const member = await request(server, `/api/guilds?ids=${ids}`, { user: MEMBER });
    assert.deepEqual(member.body.guilds, []);
  });
});

test('the bot owner can open any server, other users are not owners', async () => {
  await withServer({ token: TOKEN }, async server => {
    assert.equal((await request(server, `/api/guilds/${GUILD}`, { user: BOT_OWNER })).status, 200);
    assert.equal((await request(server, '/api/me', { user: BOT_OWNER })).body.isOwner, true);
    assert.equal((await request(server, '/api/me', { user: ADMIN })).body.isOwner, false);
  });
});

test('admin routes look like they do not exist to everyone but the bot owner', async () => {
  await withServer({ token: TOKEN }, async server => {
    for (const user of [ADMIN, SERVER_OWNER, MEMBER]) {
      assert.equal((await request(server, '/api/admin/overview', { user })).status, 404);
      assert.equal((await request(server, '/api/admin/bans', { user })).status, 404);
    }
    purged.length = 0;
    const attempt = await request(server, '/api/admin/purge-user', { user: ADMIN, method: 'POST', body: { userId: '77777777777777777' } });
    assert.equal(attempt.status, 404);
    assert.deepEqual(purged, []);
  });
});

test('the owner sees every server with ban counts, busiest first', async () => {
  await withServer({ token: TOKEN }, async server => {
    const { status, body } = await request(server, '/api/admin/overview', { user: BOT_OWNER });
    assert.equal(status, 200);
    assert.deepEqual(body.servers.map(s => [s.id, s.bans]), [[GUILD, 7], [OTHER_GUILD, 2]]);
    assert.deepEqual(body.totals, { bans: 7, uniqueUsers: 6 });
  });
});

test('the owner can search bans across all servers', async () => {
  await withServer({ token: TOKEN }, async server => {
    searches.length = 0;
    const { status, body } = await request(server, '/api/admin/bans?q=spam&page=2', { user: BOT_OWNER });
    assert.equal(status, 200);
    assert.equal(body.total, 51);
    assert.deepEqual(searches[0], { guildId: null, query: 'spam', limit: 25, offset: 25 });
  });
});

test('the owner can delete a user from all ban records, and bad IDs are refused', async () => {
  await withServer({ token: TOKEN }, async server => {
    purged.length = 0;
    const ok = await request(server, '/api/admin/purge-user', { user: BOT_OWNER, method: 'POST', body: { userId: '77777777777777777' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.deleted, 3);
    assert.deepEqual(purged, ['77777777777777777']);

    const bad = await request(server, '/api/admin/purge-user', { user: BOT_OWNER, method: 'POST', body: { userId: 'nope' } });
    assert.equal(bad.status, 400);
    assert.equal(purged.length, 1);
  });
});

test('a malformed request target gets a 400 instead of hanging', async () => {
  await withServer({ token: TOKEN }, async server => {
    const status = await new Promise((resolve, reject) => {
      const socket = require('node:net').connect(server.address().port, '127.0.0.1', () => {
        socket.write('GET // HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
      });
      let data = '';
      socket.on('data', chunk => { data += chunk; });
      socket.on('end', () => resolve(Number(data.split(' ')[1])));
      socket.on('error', reject);
      socket.setTimeout(3000, () => reject(new Error('request hung')));
    });
    assert.equal(status, 400);
  });
});

test('settings can be changed by an administrator and the change is logged', async () => {
  await withServer({ token: TOKEN }, async server => {
    saved.length = 0;
    audits.length = 0;
    const { status, body } = await request(server, `/api/guilds/${GUILD}/settings`, { method: 'POST', body: { dryRun: true } });
    assert.equal(status, 200);
    assert.deepEqual(saved, [[GUILD, true]]);
    assert.equal(audits[0].userId, ADMIN);
    assert.equal(body.ok, true);
  });
});

test('settings cannot be changed by ordinary members or for servers they cannot open', async () => {
  await withServer({ token: TOKEN }, async server => {
    saved.length = 0;
    assert.equal((await request(server, `/api/guilds/${GUILD}/settings`, { user: MEMBER, method: 'POST', body: { dryRun: true } })).status, 404);
    assert.equal((await request(server, '/api/guilds/10101010101010101/settings', { method: 'POST', body: { dryRun: true } })).status, 404);
    assert.deepEqual(saved, []);
  });
});

test('invalid settings requests are rejected with 422 and nothing is saved', async () => {
  await withServer({ token: TOKEN }, async server => {
    saved.length = 0;
    assert.equal((await request(server, `/api/guilds/${GUILD}/settings`, { method: 'POST', body: { dryRun: 'yes' } })).status, 422);
    assert.equal((await request(server, `/api/guilds/${GUILD}/settings`, { method: 'POST', body: { nope: 1 } })).status, 422);
    assert.deepEqual(saved, []);
  });
});

test('an administrator can unban a user and the unban is logged', async () => {
  await withServer({ token: TOKEN }, async server => {
    unbanned.length = 0;
    audits.length = 0;
    unbanError = null;
    const { status, body } = await request(server, `/api/guilds/${GUILD}/unban`, { method: 'POST', body: { userId: '77777777777777777' } });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(unbanned.length, 1);
    assert.equal(unbanned[0].userId, '77777777777777777');
    assert.match(unbanned[0].reason, new RegExp(ADMIN));
    assert.equal(audits[0].userId, ADMIN);
    assert.match(audits[0].detail, /77777777777777777 unbanned/);
  });
});

test('unban is refused for members, unknown servers and invalid IDs', async () => {
  await withServer({ token: TOKEN }, async server => {
    unbanned.length = 0;
    unbanError = null;
    const target = { userId: '77777777777777777' };
    assert.equal((await request(server, `/api/guilds/${GUILD}/unban`, { user: MEMBER, method: 'POST', body: target })).status, 404);
    assert.equal((await request(server, '/api/guilds/10101010101010101/unban', { method: 'POST', body: target })).status, 404);
    assert.equal((await request(server, `/api/guilds/${GUILD}/unban`, { method: 'POST', body: { userId: 'abc' } })).status, 422);
    assert.equal((await request(server, `/api/guilds/${GUILD}/unban`, { method: 'GET' })).status, 404);
    assert.deepEqual(unbanned, []);
  });
});

test('unban treats an already lifted ban as success and reports other failures', async () => {
  await withServer({ token: TOKEN }, async server => {
    audits.length = 0;
    unbanError = Object.assign(new Error('Unknown Ban'), { code: 10026 });
    assert.equal((await request(server, `/api/guilds/${GUILD}/unban`, { method: 'POST', body: { userId: '77777777777777777' } })).status, 200);
    assert.equal(audits.length, 1);

    audits.length = 0;
    unbanError = Object.assign(new Error('Missing Permissions'), { code: 50013 });
    const failed = await request(server, `/api/guilds/${GUILD}/unban`, { method: 'POST', body: { userId: '77777777777777777' } });
    assert.equal(failed.status, 422);
    assert.match(failed.body.error, /Ban Members/);
    assert.equal(audits.length, 0);
    unbanError = null;
  });
});

test('an administrator can export the ban history; members cannot', async () => {
  await withServer({ token: TOKEN }, async server => {
    searches.length = 0;
    const { status, body } = await request(server, `/api/guilds/${GUILD}/export`);
    assert.equal(status, 200);
    assert.equal(body.bans[0].userTag, 'spammer#0001');
    assert.equal(body.truncated, true, '51 bans in total, 1 row returned by the stub');
    assert.equal(searches[0].guildId, GUILD);
    assert.equal(searches[0].limit, 2000);
    assert.equal((await request(server, `/api/guilds/${GUILD}/export`, { user: MEMBER })).status, 404);
  });
});

test('the audit log is available to the same people', async () => {
  await withServer({ token: TOKEN }, async server => {
    const { status, body } = await request(server, `/api/guilds/${GUILD}/audit`);
    assert.equal(status, 200);
    assert.equal(body.entries[0].detail, 'dry-run turned on');
    assert.equal((await request(server, `/api/guilds/${GUILD}/audit`, { user: MEMBER })).status, 404);
  });
});

test('with the dashboard API switched off only /stats is served, even with a token', async () => {
  await withServer({ token: TOKEN, dashboard: false }, async server => {
    assert.equal((await request(server, '/api/me')).status, 404);
    assert.equal((await request(server, `/api/guilds/${GUILD}`)).status, 404);
  });
});

test('during a token rotation both the new and the previous token work, others do not', async () => {
  await withServer({ token: TOKEN, previousToken: 'old-token' }, async server => {
    assert.equal((await request(server, '/api/me')).status, 200);
    assert.equal((await request(server, '/api/me', { token: 'old-token' })).status, 200);
    assert.equal((await request(server, '/api/me', { token: 'other' })).status, 401);
  });
  await withServer({ token: TOKEN }, async server => {
    assert.equal((await request(server, '/api/me', { token: 'old-token' })).status, 401);
  });
});

test('signing out everywhere refuses older sessions but not newer ones, for owner routes too', async () => {
  const sessionRevocations = require('../src/utils/sessionRevocations');
  await sessionRevocations.load();
  await withServer({ token: TOKEN }, async server => {
    const before = Math.floor(Date.now() / 1000) - 60;
    assert.equal((await request(server, '/api/me/revoke', { method: 'POST', issued: before })).status, 200);
    assert.ok(revocations.get(ADMIN) > before);

    const refused = await request(server, `/api/guilds/${GUILD}`, { issued: before });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.error, 'session revoked');
    assert.equal((await request(server, `/api/guilds/${GUILD}`)).status, 403, 'a session without an issue time counts as old');
    assert.equal((await request(server, `/api/guilds/${GUILD}`, { issued: revocations.get(ADMIN) })).status, 200);
    // Other users are not affected.
    assert.equal((await request(server, `/api/guilds/${GUILD}`, { user: SERVER_OWNER, issued: before })).status, 200);

    await request(server, '/api/me/revoke', { user: BOT_OWNER, method: 'POST' });
    assert.equal((await request(server, '/api/admin/overview', { user: BOT_OWNER, issued: before })).status, 403);
  });
  await sessionRevocations.load();
});

test('requests over the per-user, search and total limits get 429', async () => {
  await withServer({ token: TOKEN, limits: { perUser: 3, searchesPerUser: 1, total: 5 } }, async server => {
    assert.equal((await request(server, `/api/guilds/${GUILD}/bans?q=a`)).status, 200);
    assert.equal((await request(server, `/api/guilds/${GUILD}/bans?q=b`)).status, 429, 'second search');
    assert.equal((await request(server, '/api/me')).status, 200);
    assert.equal((await request(server, '/api/me')).status, 429, 'fourth request of the same user');
    // A different user has their own budget until the shared total runs out.
    assert.equal((await request(server, '/api/me', { user: SERVER_OWNER })).status, 200);
    assert.equal((await request(server, '/api/me', { user: SERVER_OWNER })).status, 429, 'total of 5 reached');
  });
});

test('writing to read-only routes is still refused', async () => {
  await withServer({ token: TOKEN }, async server => {
    assert.equal((await request(server, `/api/guilds/${GUILD}/bans`, { method: 'POST', body: {} })).status, 405);
    assert.equal((await request(server, `/api/guilds/${GUILD}`, { method: 'POST', body: {} })).status, 405);
  });
});

test('ban statistics are available to administrators of the server and to the owner', async () => {
  const now = new Date();
  db.getBanActivity = async guildId => ({
    truncated: false,
    rows: [
      { created_at: now, guild_id: guildId ?? GUILD, channel_name: 'trap' },
      { created_at: now, guild_id: guildId ?? GUILD, channel_name: 'trap' },
      { created_at: now, guild_id: OTHER_GUILD, channel_name: 'other' },
    ],
  });
  await withServer({ token: TOKEN }, async server => {
    const { status, body } = await request(server, `/api/guilds/${GUILD}/stats`);
    assert.equal(status, 200);
    assert.equal(body.last30, 3);
    assert.equal(body.perDay.length, 30);
    assert.deepEqual(body.channels[0], { name: 'trap', count: 2 });
    assert.equal((await request(server, `/api/guilds/${GUILD}/stats`, { user: MEMBER })).status, 404);

    assert.equal((await request(server, '/api/admin/stats', { user: ADMIN })).status, 404);
    const all = await request(server, '/api/admin/stats', { user: BOT_OWNER });
    assert.equal(all.status, 200);
    assert.deepEqual(all.body.servers[0], { id: GUILD, name: 'Main server', count: 2 });
  });
});

test('only the owner can make the bot leave a server', async () => {
  left.length = 0;
  await withServer({ token: TOKEN }, async server => {
    const refused = await request(server, '/api/admin/leave', { user: ADMIN, method: 'POST', body: { guildId: OTHER_GUILD } });
    assert.equal(refused.status, 404);
    assert.deepEqual(left, []);

    assert.equal((await request(server, '/api/admin/leave', { user: BOT_OWNER, method: 'POST', body: { guildId: 'nope' } })).status, 422);
    assert.equal((await request(server, '/api/admin/leave', { user: BOT_OWNER, method: 'POST', body: { guildId: '99999999999999990' } })).status, 422);

    const ok = await request(server, '/api/admin/leave', { user: BOT_OWNER, method: 'POST', body: { guildId: OTHER_GUILD } });
    assert.equal(ok.status, 200);
    assert.deepEqual(left, [OTHER_GUILD]);
  });
});
