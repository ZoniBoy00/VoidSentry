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
const stats = require('../src/utils/stats');
const purgeUser = require('../src/commands/purgeUser');
const interactionCreate = require('../src/events/interactionCreate');

const TARGET = '12345678901234569';

function makeInteraction(userId, userOption = TARGET) {
  const replies = [];
  return {
    replies,
    interaction: {
      commandName: 'purge-user',
      user: { id: userId, tag: 'someone#0001' },
      inGuild: () => true,
      isButton: () => false,
      isChatInputCommand: () => true,
      options: { getString: () => userOption },
      deferReply: async () => {},
      editReply: async payload => { replies.push(payload); },
      reply: async payload => { replies.push(payload); },
    },
  };
}

test('deletes the stored records and forgets the user in memory', async () => {
  let deletedFor;
  db.deleteBansByUser = async id => { deletedFor = id; return 3; };
  stats.recordBan(TARGET, 'target#0001', '1');
  stats.recordBan('99999999999999999', 'other#0001', '1');

  const { interaction, replies } = makeInteraction(process.env.OWNER_ID);
  await purgeUser.execute(interaction);

  assert.equal(deletedFor, TARGET);
  assert.match(replies[0].content, /Deleted \*\*3\*\*/);
  assert.equal(stats.recentBans.some(ban => ban.userId === TARGET), false);
  assert.equal(stats.recentBans.some(ban => ban.userId === '99999999999999999'), true);
});

test('rejects an invalid user ID without touching the database', async () => {
  db.deleteBansByUser = async () => { throw new Error('must not be called'); };
  const { interaction, replies } = makeInteraction(process.env.OWNER_ID, 'not-an-id');
  await purgeUser.execute(interaction);
  assert.match(replies[0].content, /Invalid Discord ID/);
});

test('the router lets only the bot owner run /purge-user', async () => {
  let deleted = 0;
  db.deleteBansByUser = async () => { deleted += 1; return 1; };
  const commands = new Map([['purge-user', purgeUser]]);
  const client = { commands };

  const stranger = makeInteraction('55555555555555555');
  await interactionCreate.execute(client, stranger.interaction);
  assert.equal(deleted, 0);
  assert.match(stranger.replies[0].content, /only available to the bot owner/);

  const owner = makeInteraction(process.env.OWNER_ID);
  await interactionCreate.execute(client, owner.interaction);
  assert.equal(deleted, 1);
});
