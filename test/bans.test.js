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
const bansCommand = require('../src/commands/bans');

const GUILD_ID = '11111111111111111';

function makeInteraction({ subcommand, userId, global = false, options = {} }) {
  const calls = { reply: null };
  return {
    calls,
    interaction: {
      guildId: GUILD_ID,
      user: { id: userId },
      options: {
        getSubcommand: () => subcommand,
        getInteger: name => options[name] ?? null,
        getString: name => options[name] ?? null,
        getBoolean: name => (name === 'global' ? global : null),
      },
      reply: async payload => { calls.reply = payload; },
    },
  };
}

test('/bans recent is limited to the current server', async () => {
  let args;
  db.getBans = async (...a) => { args = a; return []; };
  const { interaction } = makeInteraction({ subcommand: 'recent', userId: '999999999999999999' });
  await bansCommand.execute(interaction);
  assert.equal(args[2], GUILD_ID);
});

test('/bans search is limited to the current server', async () => {
  let args;
  db.findBansByUserId = async (...a) => { args = a; return []; };
  const { interaction } = makeInteraction({ subcommand: 'search', userId: '999999999999999999', options: { user_id: '12345678901234569' } });
  await bansCommand.execute(interaction);
  assert.deepEqual(args, ['12345678901234569', GUILD_ID]);
});

test('/bans stats is limited to the current server', async () => {
  const ids = [];
  db.getBanCount = async id => { ids.push(id); return 1; };
  db.getUniqueUserCount = async id => { ids.push(id); return 1; };
  db.getGuildStats = async () => { throw new Error('per-server stats must not list other servers'); };
  const { interaction } = makeInteraction({ subcommand: 'stats', userId: '999999999999999999' });
  await bansCommand.execute(interaction);
  assert.deepEqual(ids, [GUILD_ID, GUILD_ID]);
});

test('only the bot owner can use global scope', async () => {
  const seen = [];
  db.getBans = async (...a) => { seen.push(a[2]); return []; };

  const stranger = makeInteraction({ subcommand: 'recent', userId: '999999999999999999', global: true });
  await bansCommand.execute(stranger.interaction);
  const owner = makeInteraction({ subcommand: 'recent', userId: process.env.OWNER_ID, global: true });
  await bansCommand.execute(owner.interaction);

  assert.deepEqual(seen, [GUILD_ID, null]);
});
