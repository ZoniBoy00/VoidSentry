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

const db = require('../src/utils/db');
const audits = [];
db.addAudit = async entry => { audits.push(entry); };

const { createUnbanRow, handleUnbanButton } = require('../src/utils/unbanButton');

const TARGET = '98765432109876543';

function makePress({ isAdmin = true, unbanError = null, inGuild = true, customId = `unban:${TARGET}` } = {}) {
  const calls = { unban: [], reply: [], update: [] };
  const interaction = {
    customId,
    inGuild: () => inGuild,
    member: { id: '11111111111111111', permissions: { has: () => isAdmin } },
    user: { id: '11111111111111111', tag: 'mod#0001', username: 'mod' },
    guild: {
      id: '12345678901234567',
      name: 'Test guild',
      members: {
        unban: async (id, reason) => {
          calls.unban.push({ id, reason });
          if (unbanError) throw unbanError;
        },
      },
    },
    reply: async payload => { calls.reply.push(payload); },
    update: async payload => { calls.update.push(payload); },
  };
  return { interaction, calls };
}

test('the log row carries the banned user in the button ID', () => {
  const row = createUnbanRow(TARGET).toJSON();
  assert.equal(row.components[0].custom_id, `unban:${TARGET}`);
});

test('an administrator can unban from the button, which then shows who did it', async () => {
  const { interaction, calls } = makePress();
  await handleUnbanButton(interaction);
  assert.equal(calls.unban.length, 1);
  assert.equal(calls.unban[0].id, TARGET);
  const [button] = calls.update[0].components[0].toJSON().components;
  assert.equal(button.disabled, true);
  assert.match(button.label, /Unbanned by mod/);
  assert.deepEqual(audits.at(-1), { guildId: '12345678901234567', userId: '11111111111111111', detail: `user ${TARGET} unbanned (with the log button)` });
});

test('members without Administrator are refused and nothing is unbanned', async () => {
  const { interaction, calls } = makePress({ isAdmin: false });
  await handleUnbanButton(interaction);
  assert.equal(calls.unban.length, 0);
  assert.equal(calls.update.length, 0);
  assert.match(calls.reply[0].content, /permission/);
});

test('an already lifted ban just shows the final state', async () => {
  const { interaction, calls } = makePress({ unbanError: Object.assign(new Error('Unknown Ban'), { code: 10026 }) });
  await handleUnbanButton(interaction);
  assert.equal(calls.update.length, 1);
  assert.equal(calls.reply.length, 0);
});

test('other failures are reported privately and the button stays active', async () => {
  const { interaction, calls } = makePress({ unbanError: Object.assign(new Error('Missing Permissions'), { code: 50013 }) });
  await handleUnbanButton(interaction);
  assert.equal(calls.update.length, 0);
  assert.match(calls.reply[0].content, /Failed to unban/);
});

test('a malformed button ID is rejected', async () => {
  const { interaction, calls } = makePress({ customId: 'unban:notanid' });
  await handleUnbanButton(interaction);
  assert.equal(calls.unban.length, 0);
  assert.match(calls.reply[0].content, /not valid/);
});
