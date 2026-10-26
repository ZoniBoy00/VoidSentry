const test = require('node:test');
const assert = require('node:assert/strict');

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

const { alertGuildOwner, resetOwnerAlerts } = require('../src/utils/ownerAlerts');

function makeGuild({ dmError = null } = {}) {
  const sent = [];
  return {
    sent,
    guild: {
      id: '12345678901234567',
      name: 'Test guild',
      fetchOwner: async () => ({
        send: async payload => {
          if (dmError) throw dmError;
          sent.push(payload);
        },
      }),
    },
  };
}

test('sends the owner a message naming the server and the fix', async () => {
  resetOwnerAlerts();
  const { guild, sent } = makeGuild();
  assert.equal(await alertGuildOwner(guild, 'missing-permission'), true);
  assert.equal(sent.length, 1);
  assert.match(sent[0].content, /Test guild/);
  assert.match(sent[0].content, /Ban Members/);
});

test('sends the same kind of alert only once per cooldown', async () => {
  resetOwnerAlerts();
  const { guild, sent } = makeGuild();
  assert.equal(await alertGuildOwner(guild, 'hierarchy'), true);
  assert.equal(await alertGuildOwner(guild, 'hierarchy'), false);
  assert.equal(await alertGuildOwner(guild, 'ban-failed'), true);
  assert.equal(sent.length, 2);
});

test('ignores unknown kinds and never throws when DMs are closed', async () => {
  resetOwnerAlerts();
  const { guild, sent } = makeGuild({ dmError: new Error('Cannot send messages to this user') });
  assert.equal(await alertGuildOwner(guild, 'nonsense'), false);
  assert.equal(await alertGuildOwner(guild, 'ban-failed'), false);
  assert.equal(sent.length, 0);
});
