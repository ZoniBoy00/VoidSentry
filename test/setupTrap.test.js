const test = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType } = require('discord.js');

Object.assign(process.env, {
  DISCORD_TOKEN: 'test-token',
  CLIENT_ID: '12345678901234567',
  OWNER_ID: '12345678901234568',
  DB_HOST: '127.0.0.1',
  DB_USER: 'voidsentry_test',
  DB_PASSWORD: 'mocked',
  DB_NAME: 'voidsentry_test',
  NODE_ENV: 'production',
});

const guildSettings = require('../src/utils/guildSettings');
const command = require('../src/commands/setupTrap');

function run(channel, { create = null, canManage = false } = {}) {
  const replies = [];
  const added = [];
  guildSettings.addTrapChannel = async (_guild, id) => { added.push(id); };
  const interaction = {
    channelId: `${Date.now()}${Math.random()}`,
    channel,
    guild: { id: '22222222222222222', members: { me: { permissions: { has: () => canManage } } } },
    user: { id: '44444444444444444', tag: 'admin' },
    options: { getString: () => create },
    reply: async payload => { replies.push(payload); },
    deferReply: async () => {},
    editReply: async payload => { replies.push(payload); },
  };
  return command.execute(interaction).then(() => ({ replies, added }));
}

test('refuses threads, forum posts and voice channel chats', async () => {
  for (const type of [ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.GuildVoice]) {
    const { replies, added } = await run({ id: '1', type, isTextBased: () => true, bulkDelete: async () => {} });
    assert.deepEqual(added, []);
    assert.match(replies.at(-1).content, /text or announcement channel/);
  }
});

test('creating a channel needs Manage Channels, and says so', async () => {
  const { replies, added } = await run(null, { create: 'do-not-post', canManage: false });
  assert.deepEqual(added, []);
  assert.match(replies.at(-1).content, /Manage Channels/);
});
