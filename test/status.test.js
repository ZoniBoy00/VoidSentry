const test = require('node:test');
const assert = require('node:assert/strict');

Object.assign(process.env, {
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
  NODE_ENV: 'production',
});

const helpers = require('../src/utils/helpers');
helpers.createLogoAttachment = () => ({ name: 'fixture-logo' });
const db = require('../src/utils/db');
const statusCommand = require('../src/commands/status');

function makeInteraction() {
  let deferredOptions;
  let replyPayload;
  const interaction = {
    member: { id: process.env.OWNER_ID },
    client: {
      user: { displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' },
      ws: { ping: 12 },
      guilds: { cache: { size: 1 } },
    },
    deferReply: async options => { deferredOptions = options; },
    editReply: async payload => { replyPayload = payload; },
  };
  return {
    interaction,
    get deferredOptions() { return deferredOptions; },
    get replyPayload() { return replyPayload; },
  };
}

test('shows persistent database totals separately from process-local counters', async () => {
  db.getBanCount = async () => 42;
  db.getBans = async () => [{ user_tag: 'User#1234', created_at: new Date('2026-09-01T12:00:00Z') }];
  const fixture = makeInteraction();

  await statusCommand.execute(fixture.interaction);

  assert.deepEqual(fixture.deferredOptions.flags, [64]);
  const fields = fixture.replyPayload.embeds[0].data.fields;
  assert.equal(fields.find(field => field.name === '🗄️ Bans in Database').value, '`42`');
  assert.ok(fields.some(field => field.name === '🔨 Bans This Run'));
  assert.ok(fields.some(field => field.name === '⚠️ Detections This Run'));
  assert.match(fields.find(field => field.name.startsWith('📋 Latest Stored Bans')).value, /User#1234/);
});

test('keeps /status available and labels database history unavailable on query failure', async () => {
  db.getBanCount = async () => { throw new Error('fixture database failure'); };
  db.getBans = async () => { throw new Error('fixture database failure'); };
  const fixture = makeInteraction();

  await statusCommand.execute(fixture.interaction);

  const fields = fixture.replyPayload.embeds[0].data.fields;
  assert.equal(fields.find(field => field.name === '🗄️ Bans in Database').value, 'Unavailable');
  assert.ok(fields.some(field => field.name === '🔨 Bans This Run'));
});
