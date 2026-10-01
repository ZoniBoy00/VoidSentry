const test = require('node:test');
const assert = require('node:assert/strict');

const testEnv = {
  DISCORD_TOKEN: 'test-token',
  CLIENT_ID: '12345678901234567',
  OWNER_ID: '12345678901234568',
  BAN_CHANNEL_IDS: '12345678901234569',
  LOG_CHANNEL_ID: '',
  DB_HOST: '127.0.0.1',
  DB_PORT: '3306',
  DB_USER: 'voidsentry_test',
  DB_PASSWORD: 'test-password',
  DB_NAME: 'voidsentry_test',
  DELETE_MESSAGE_SECONDS: '86400',
  NODE_ENV: 'production',
};
Object.assign(process.env, testEnv);

const handler = require('../src/events/messageCreate');
const db = require('../src/utils/db');
let storedBans = 0;
db.addBan = async () => {
  storedBans += 1;
  return storedBans;
};

function makeMessage({ hasBanPermission = true, bannable = true, banError = null } = {}) {
  const actions = [];
  const guild = {
    id: '12345678901234567',
    name: 'Test guild',
    members: {
      me: { permissions: { has: () => hasBanPermission } },
      ban: async (_author, options) => {
        actions.push({ type: 'ban', options });
        if (banError) throw banError;
      },
    },
    channels: { fetch: async () => null },
  };
  const author = {
    id: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
    bot: false,
    tag: 'fixture#0001',
    username: 'fixture',
    createdAt: new Date('2020-01-01T00:00:00Z'),
    send: async () => { actions.push({ type: 'dm' }); },
  };
  const member = {
    bannable,
    displayName: 'Fixture member',
    joinedAt: new Date('2025-01-01T00:00:00Z'),
    roles: { cache: { clone: () => new Map() } },
    guild,
  };
  const message = {
    author,
    guild,
    member,
    channel: { id: process.env.BAN_CHANNEL_IDS, name: 'trap-channel' },
    content: 'fixture evidence',
    attachments: new Map(),
    embeds: [],
    stickers: new Map(),
    deletable: true,
    delete: async () => { actions.push({ type: 'delete' }); },
  };
  return { message, actions };
}

test('leaves the trigger message intact when the bot lacks Ban Members', async () => {
  const { message, actions } = makeMessage({ hasBanPermission: false });
  await handler.execute({}, message);
  assert.equal(actions.some(action => action.type === 'ban'), false);
  assert.equal(actions.some(action => action.type === 'delete'), false);
});

test('leaves the trigger message intact when the member is not bannable', async () => {
  const { message, actions } = makeMessage({ bannable: false });
  await handler.execute({}, message);
  assert.equal(actions.some(action => action.type === 'ban'), false);
  assert.equal(actions.some(action => action.type === 'delete'), false);
});

test('does not delete the trigger message when the Discord ban request fails', async () => {
  const { message, actions } = makeMessage({ banError: Object.assign(new Error('fixture ban failure'), { code: 50013 }) });
  const storedBansBefore = storedBans;
  await handler.execute({}, message);
  assert.equal(actions.some(action => action.type === 'ban'), true);
  assert.equal(actions.some(action => action.type === 'delete'), false);
  assert.equal(actions.some(action => action.type === 'dm'), false);
  assert.equal(storedBans, storedBansBefore);
});

test('deletes the trigger message only after a successful ban', async () => {
  const { message, actions } = makeMessage();
  const storedBansBefore = storedBans;
  await handler.execute({}, message);
  const banIndex = actions.findIndex(action => action.type === 'ban');
  const deleteIndex = actions.findIndex(action => action.type === 'delete');
  const dmIndex = actions.findIndex(action => action.type === 'dm');
  assert.notEqual(banIndex, -1);
  assert.ok(deleteIndex > banIndex);
  assert.ok(dmIndex > banIndex);
  assert.equal(storedBans, storedBansBefore + 1);
});
