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
const { createStatsServer } = require('../src/utils/statsServer');

let dbCalls = 0;
db.getBanCount = async () => { dbCalls += 1; return 42; };
db.getUniqueUserCount = async () => 30;
db.getBanCountSince = async () => 5;

const guildList = [{ memberCount: 100 }, { memberCount: 250 }];
const client = {
  guilds: { cache: { size: guildList.length, reduce: (fn, init) => guildList.reduce(fn, init) } },
};

function request(server, { path = '/stats', method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path, method, headers }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.end();
  });
}

function listen(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
}

test('serves aggregate stats and nothing user-specific', async () => {
  const server = createStatsServer(client);
  await listen(server);
  try {
    const { status, body } = await request(server);
    assert.equal(status, 200);
    assert.equal(body.servers, 2);
    assert.equal(body.members, 350);
    assert.equal(body.totalBans, 42);
    assert.equal(body.uniqueUsers, 30);
    assert.equal(body.recentBans, 5);
    assert.deepEqual(Object.keys(body).sort(), ['members', 'recentBans', 'recentDays', 'servers', 'totalBans', 'uniqueUsers', 'updatedAt', 'uptimeSeconds']);
  } finally {
    server.close();
  }
});

test('reuses the cached answer instead of querying the database per request', async () => {
  const server = createStatsServer(client);
  await listen(server);
  dbCalls = 0;
  try {
    await Promise.all([request(server), request(server), request(server)]);
    await request(server);
    assert.equal(dbCalls, 1);
  } finally {
    server.close();
  }
});

test('only answers GET /stats', async () => {
  const server = createStatsServer(client);
  await listen(server);
  try {
    assert.equal((await request(server, { path: '/other' })).status, 404);
    assert.equal((await request(server, { method: 'POST' })).status, 404);
  } finally {
    server.close();
  }
});

test('requires the bearer token when one is configured', async () => {
  const server = createStatsServer(client, { token: 'secret-token' });
  await listen(server);
  try {
    assert.equal((await request(server)).status, 401);
    assert.equal((await request(server, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
    assert.equal((await request(server, { headers: { Authorization: 'Bearer secret-token' } })).status, 200);
  } finally {
    server.close();
  }
});

test('answers 503 when the database is unavailable', async () => {
  const original = db.getBanCount;
  db.getBanCount = async () => { throw new Error('fixture database failure'); };
  const server = createStatsServer(client);
  await listen(server);
  try {
    const { status, body } = await request(server);
    assert.equal(status, 503);
    assert.deepEqual(body, { error: 'stats unavailable' });
  } finally {
    db.getBanCount = original;
    server.close();
  }
});
