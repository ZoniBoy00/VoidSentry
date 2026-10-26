const test = require('node:test');
const assert = require('node:assert/strict');

Object.assign(process.env, {
  DISCORD_TOKEN: 'test-token',
  CLIENT_ID: '12345678901234567',
  OWNER_ID: '12345678901234568',
  BAN_CHANNEL_IDS: '',
  LOG_CHANNEL_ID: '',
  DB_HOST: '127.0.0.1',
  DB_PORT: '3306',
  DB_USER: 'voidsentry_test',
  DB_PASSWORD: 'test-password',
  DB_NAME: 'voidsentry_test',
  BAN_REASON: 'default reason',
  DELETE_MESSAGE_SECONDS: '86400',
  NODE_ENV: 'production',
});

const db = require('../src/utils/db');
const guildSettings = require('../src/utils/guildSettings');

const GUILD_A = '11111111111111111';
const GUILD_B = '22222222222222222';
const CHANNEL_A = '33333333333333333';
const CHANNEL_B = '44444444444444444';

db.addTrapChannel = async () => {};
db.removeTrapChannel = async () => {};
db.removeGuildData = async () => {};
db.setGuildSetting = async () => {};

test('starts without any trap channels when BAN_CHANNEL_IDS is empty', () => {
  assert.equal(guildSettings.isTrapChannel(GUILD_A, CHANNEL_A), false);
});

test('trap channels belong to the server that registered them', async () => {
  await guildSettings.addTrapChannel(GUILD_A, CHANNEL_A);
  await guildSettings.addTrapChannel(GUILD_B, CHANNEL_B);
  assert.equal(guildSettings.isTrapChannel(GUILD_A, CHANNEL_A), true);
  assert.equal(guildSettings.isTrapChannel(GUILD_B, CHANNEL_B), true);
  assert.equal(guildSettings.isTrapChannel(GUILD_B, CHANNEL_A), false);
  assert.deepEqual(guildSettings.listTrapChannels(GUILD_A), [CHANNEL_A]);
});

test('settings are per server and fall back to the global defaults', async () => {
  assert.equal(guildSettings.getGuildConfig(GUILD_A).banReason, 'default reason');
  await guildSettings.setBanReason(GUILD_A, 'custom reason');
  await guildSettings.setLogChannel(GUILD_A, CHANNEL_A);
  await guildSettings.setDeleteMessageSeconds(GUILD_A, 0);
  const a = guildSettings.getGuildConfig(GUILD_A);
  assert.equal(a.banReason, 'custom reason');
  assert.equal(a.logChannelId, CHANNEL_A);
  assert.equal(a.deleteMessageSeconds, 0);
  const b = guildSettings.getGuildConfig(GUILD_B);
  assert.equal(b.banReason, 'default reason');
  assert.equal(b.logChannelId, null);
  assert.equal(b.deleteMessageSeconds, 86400);
});

test('clearing a setting restores the default', async () => {
  await guildSettings.setBanReason(GUILD_A, null);
  assert.equal(guildSettings.getGuildConfig(GUILD_A).banReason, 'default reason');
});

test('loads stored rows into memory', async () => {
  db.loadGuildSettings = async () => ({
    channels: [{ channel_id: CHANNEL_B, guild_id: GUILD_A }],
    settings: [{ guild_id: GUILD_A, log_channel_id: null, ban_reason: 'stored', delete_message_seconds: 60 }],
  });
  await guildSettings.load();
  assert.equal(guildSettings.isTrapChannel(GUILD_A, CHANNEL_B), true);
  assert.equal(guildSettings.isTrapChannel(GUILD_A, CHANNEL_A), false);
  assert.equal(guildSettings.getGuildConfig(GUILD_A).banReason, 'stored');
  assert.equal(guildSettings.getGuildConfig(GUILD_A).deleteMessageSeconds, 60);
});

test('removing a server forgets its channels and settings', async () => {
  await guildSettings.removeGuild(GUILD_A);
  assert.equal(guildSettings.isTrapChannel(GUILD_A, CHANNEL_B), false);
  assert.equal(guildSettings.getGuildConfig(GUILD_A).banReason, 'default reason');
});
