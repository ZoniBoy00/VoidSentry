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
const guildSettings = require('../src/utils/guildSettings');

const audits = [];
db.addAudit = async entry => { audits.push(entry); };
guildSettings.setDryRun = async () => {};
guildSettings.setLogChannel = async () => {};
guildSettings.listTrapChannels = () => [];

const trapSettings = require('../src/commands/trapSettings');
const removeLogChannel = require('../src/commands/removeLogChannel');

const GUILD = '22222222222222222';
const ADMIN = '44444444444444444';

function makeInteraction(subcommand, { booleans = {}, channels = {} } = {}) {
  const replies = [];
  return {
    replies,
    interaction: {
      guild: { id: GUILD, name: 'Main server' },
      user: { id: ADMIN, tag: 'admin#0001' },
      channel: { id: '11111111111111111', name: 'general' },
      options: {
        getSubcommand: () => subcommand,
        getBoolean: name => booleans[name] ?? null,
        getChannel: name => channels[name] ?? null,
        getString: () => null,
        getInteger: () => null,
        getRole: () => null,
      },
      reply: async payload => { replies.push(payload); },
    },
  };
}

test('/trap-settings writes an audit entry that says it came from the command', async () => {
  audits.length = 0;
  const { interaction, replies } = makeInteraction('dry-run', { booleans: { enabled: true } });
  await trapSettings.execute(interaction);
  assert.match(replies[0].content, /Dry-run enabled/);
  assert.deepEqual(audits, [{ guildId: GUILD, userId: ADMIN, detail: 'dry-run turned on (with /trap-settings)' }]);
});

test('a refused change writes no audit entry', async () => {
  audits.length = 0;
  const { interaction, replies } = makeInteraction('remove-trap', { channels: { channel: { id: '99999999999999999', name: 'x' } } });
  await trapSettings.execute(interaction);
  assert.match(replies[0].content, /is not a trap channel/);
  assert.deepEqual(audits, []);
});

test('/remove-logchannel is recorded too', async () => {
  audits.length = 0;
  const { interaction } = makeInteraction();
  await removeLogChannel.execute(interaction);
  assert.equal(audits[0].detail, 'log channel removed (with /remove-logchannel)');
});

test('a failing audit write does not break the command', async () => {
  db.addAudit = async () => { throw new Error('database down'); };
  const { interaction, replies } = makeInteraction('dry-run', { booleans: { enabled: false } });
  await trapSettings.execute(interaction);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(replies[0].content, /Dry-run disabled/);
  db.addAudit = async entry => { audits.push(entry); };
});
