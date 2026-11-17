const test = require('node:test');
const assert = require('node:assert/strict');

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

const db = require('../src/utils/db');
const command = require('../src/commands/unbanRecent');

const GUILD = '22222222222222222';

function run({ hours = 24, users = [], click = 'unban-recent:confirm', unban = async () => {} } = {}) {
  const replies = [];
  const audits = [];
  db.getRecentBannedUsers = async (_guild, _hours, limit) => users.slice(0, limit);
  db.addAudit = async entry => { audits.push(entry); };
  const interaction = {
    guild: { id: GUILD, name: 'Test guild', members: { unban } },
    user: { id: '44444444444444444', tag: 'admin' },
    options: { getInteger: () => hours },
    reply: async payload => { replies.push(payload); },
    deferReply: async () => {},
    editReply: async payload => {
      replies.push(payload);
      return {
        awaitMessageComponent: async () => {
          if (!click) throw new Error('time');
          return { customId: click, update: async next => { replies.push(next); } };
        },
      };
    },
  };
  return { done: command.execute(interaction), replies, audits };
}

const user = n => ({ user_id: `7000000000000000${n}`, user_tag: `spammer${n}`, created_at: new Date() });

test('says so when there is nothing to lift', async () => {
  const { done, replies } = run();
  await done;
  assert.match(replies.at(-1).content, /has not banned anyone/);
});

test('lifts nothing without the confirmation', async () => {
  const unbanned = [];
  const { done, replies } = run({ users: [user(1)], click: null, unban: async id => { unbanned.push(id); } });
  await done;
  assert.deepEqual(unbanned, []);
  assert.match(replies.at(-1).content, /timed out/);
});

test('lifts the bans one by one after confirmation and writes one change log entry', async () => {
  const unbanned = [];
  const unban = async id => {
    if (id === user(2).user_id) throw Object.assign(new Error('Unknown Ban'), { code: 10026 });
    unbanned.push(id);
  };
  const { done, replies, audits } = run({ users: [user(1), user(2), user(3)], unban });
  await done;
  assert.deepEqual(unbanned, [user(1).user_id, user(3).user_id]);
  assert.equal(audits.length, 1);
  assert.match(audits[0].detail, /2 users unbanned .*last 24 hours/);
  assert.match(replies.at(-1).content, /Lifted 2 bans[\s\S]*1 was already unbanned/);
});

test('caps one run at the limit', async () => {
  const unbanned = [];
  const users = Array.from({ length: command.MAX_USERS + 5 }, (_, i) => user(String(i).padStart(2, '0')));
  const { done, replies } = run({ users, unban: async id => { unbanned.push(id); } });
  await done;
  assert.equal(unbanned.length, command.MAX_USERS);
  assert.match(replies[0].content, /Only the newest 25/);
});

test('refuses a window that is not offered', async () => {
  const { done, replies } = run({ hours: 9999, users: [user(1)] });
  await done;
  assert.match(replies[0].content, /Choose one of the offered/);
});
