const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

Object.assign(process.env, {
  DISCORD_TOKEN: 'test-token',
  CLIENT_ID: '12345678901234567',
  OWNER_ID: '12345678901234568',
  STATUS_TEXT: 'Watching for breaches...',
  DB_HOST: '127.0.0.1',
  DB_PORT: '3306',
  DB_USER: 'voidsentry_test',
  DB_PASSWORD: 'test-password',
  DB_NAME: 'voidsentry_test',
  NODE_ENV: 'production',
});

const helpers = require('../src/utils/helpers');
helpers.createLogoAttachment = () => ({ name: 'fixture-logo' });
const helpCommand = require('../src/commands/help');
const presence = require('../src/utils/presence');
const db = require('../src/utils/db');

function loadCommands() {
  const dir = path.join(__dirname, '../src/commands');
  const commands = new Map();
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const command = require(path.join(dir, file));
    commands.set(command.data.name, command);
  }
  return commands;
}

test('/help lists every loaded command and marks admin commands', async () => {
  const commands = loadCommands();
  let payload;
  await helpCommand.execute({
    client: { commands },
    reply: async p => { payload = p; },
  });

  const fields = payload.embeds[0].data.fields;
  assert.equal(fields.length, commands.size);
  for (const name of commands.keys()) {
    assert.ok(fields.some(f => f.name.startsWith(`/${name}`)), `missing /${name}`);
  }
  assert.ok(fields.find(f => f.name.startsWith('/setup-trap')).name.includes('🔒'));
  assert.ok(!fields.find(f => f.name.startsWith('/help')).name.includes('🔒'));
  assert.ok(fields.every(f => f.value.length <= 1024));
  assert.deepEqual(payload.flags, [64]);
});

test('presence shows server count and, once known, the ban total', async () => {
  const client = { guilds: { cache: { size: 1 } } };
  assert.deepEqual(presence.buildActivities(client), ['Watching for breaches...', '1 server']);

  db.getBanCount = async () => 1234;
  const setPresenceCalls = [];
  const readyClient = {
    guilds: { cache: { size: 3 } },
    user: { setPresence: p => setPresenceCalls.push(p) },
  };
  await presence.start(readyClient);
  assert.deepEqual(presence.buildActivities(readyClient), ['Watching for breaches...', '3 servers', '1,234 users banned']);
  assert.equal(setPresenceCalls.length, 1);
  assert.equal(setPresenceCalls[0].activities[0].name, 'Watching for breaches...');

  presence.recordBan();
  assert.equal(presence.buildActivities(readyClient)[2], '1,235 users banned');
});
