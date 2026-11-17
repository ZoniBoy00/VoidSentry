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
  DB_PASSWORD: 'mocked',
  DB_NAME: 'voidsentry_test',
  NODE_ENV: 'production',
});

const db = require('../src/utils/db');
const guildSettings = require('../src/utils/guildSettings');
const ownerAlerts = require('../src/utils/ownerAlerts');
const helpers = require('../src/utils/helpers');

const GUILD = '22222222222222222';
const USER = '77777777777777777';
const MOD = '44444444444444444';
const DAY = 24 * 60 * 60 * 1000;

// In-memory stand-ins for the database.
let bans = [];
let appealRows = [];
let blocks = new Set();
let audits = [];
let config = {};
db.findBansByUserId = async (userId, guildId) => bans.filter(b => b.user_id === userId && (!guildId || b.guild_id === guildId));
db.getAppealsByUser = async userId => appealRows.filter(a => a.user_id === userId).sort((a, b) => b.id - a.id);
db.isAppealBlocked = async (guildId, userId) => blocks.has(`${guildId}:${userId}`);
db.addAppealBlock = async (guildId, userId) => { blocks.add(`${guildId}:${userId}`); };
db.getAppeal = async id => appealRows.find(a => a.id === id) ?? null;
db.addAppeal = async ({ guildId, userId, userTag, text }) => {
  const id = appealRows.length + 1;
  appealRows.push({ id, guild_id: guildId, user_id: userId, user_tag: userTag, text, status: 'open', created_at: new Date() });
  return id;
};
db.decideAppeal = async (id, { status, reply, decidedBy }) => {
  const row = appealRows.find(a => a.id === id);
  if (!row || row.status !== 'open') return false;
  Object.assign(row, { status, reply, decided_by: decidedBy, decided_at: new Date() });
  return true;
};
db.reopenAppeal = async id => { Object.assign(appealRows.find(a => a.id === id), { status: 'open', reply: null, decided_by: null, decided_at: null }); };
db.addAudit = async entry => { audits.push(entry); };
guildSettings.getGuildConfig = () => ({ appealsEnabled: true, appealCooldownDays: 7, logChannelId: '88888888888888888', ...config });

const posted = [];
const ownerAlertsSent = [];
ownerAlerts.alertGuildOwner = async (guild, kind) => { ownerAlertsSent.push(kind); return true; };
helpers.fetchChannel = async () => ({ send: async payload => { posted.push(payload); } });

const appeals = require('../src/utils/appeals');

let unbanError = null;
let banLifted = false;
const unbanned = [];
const guild = {
  id: GUILD,
  name: 'Main server',
  iconURL: () => null,
  bans: { fetch: async () => { if (banLifted) throw Object.assign(new Error('Unknown Ban'), { code: 10026 }); return {}; } },
  members: { unban: async userId => { if (unbanError) throw unbanError; unbanned.push(userId); } },
};
const client = {
  guilds: { cache: new Map([[GUILD, guild]]) },
  users: { fetch: async () => ({ send: async () => {} }) },
};
guild.client = client;

function reset() {
  bans = [{ id: 1, user_id: USER, guild_id: GUILD, guild_name: 'Main server', channel_name: 'trap', created_at: new Date(Date.now() - DAY) }];
  appealRows = [];
  blocks = new Set();
  audits = [];
  config = {};
  posted.length = 0;
  ownerAlertsSent.length = 0;
  unbanned.length = 0;
  unbanError = null;
  banLifted = false;
}

const submit = text => appeals.submitAppeal(client, { userId: USER, userTag: 'spammer', guildId: GUILD, text });

test('a banned person can appeal once, and moderators hear about it', async () => {
  reset();
  const [entry] = await appeals.listForAppellant(client, USER);
  assert.equal(entry.state, 'can-appeal');

  const result = await submit('  It was my little brother, sorry.  ');
  assert.equal(result.ok, true);
  assert.equal(appealRows[0].text, 'It was my little brother, sorry.');
  assert.equal(posted.length, 1);
  assert.equal(posted[0].components[0].toJSON().components[0].custom_id, 'appeal:approve:1');
  assert.deepEqual(posted[0].allowedMentions, { parse: [] });
  assert.deepEqual(ownerAlertsSent, ['appeal']);

  const again = await submit('Another appeal while one is open.');
  assert.deepEqual(again, { ok: false, error: 'You already have an open appeal on this server.' });
});

test('appeals are refused when the text is too short or too long, or nothing can be appealed', async () => {
  reset();
  assert.equal((await submit('short')).ok, false);
  assert.equal((await submit('x'.repeat(1001))).ok, false);
  assert.equal((await submit(42)).ok, false);
  assert.match((await appeals.submitAppeal(client, { userId: '99999999999999999', userTag: 'x', guildId: GUILD, text: 'I was never banned here.' })).error, /no ban/);

  banLifted = true;
  assert.match((await submit('Please lift my ban, it was a mistake.')).error, /not banned/);
  assert.equal(appealRows.length, 0);
});

test('servers that did not turn appeals on, and blocked people, cannot be appealed to', async () => {
  reset();
  config = { appealsEnabled: false };
  assert.equal((await appeals.listForAppellant(client, USER))[0].state, 'disabled');
  assert.match((await submit('Please lift my ban, it was a mistake.')).error, /does not accept appeals/);

  config = {};
  blocks.add(`${GUILD}:${USER}`);
  assert.equal((await appeals.listForAppellant(client, USER))[0].state, 'blocked');
});

test('a denial starts the cooldown; after it the person may appeal again', async () => {
  reset();
  await submit('Please lift my ban, it was a mistake.');
  const denied = await appeals.decideAppealFor(guild, { appealId: 1, deciderId: MOD, decision: 'deny', reply: 'No.' });
  assert.deepEqual(denied, { ok: true, status: 'denied' });
  assert.equal(appealRows[0].reply, 'No.');
  assert.match(audits.at(-1).detail, /appeal #1 denied \(user 77777777777777777\)/);

  const [entry] = await appeals.listForAppellant(client, USER);
  assert.equal(entry.state, 'cooldown');
  assert.ok(new Date(entry.availableAt) > new Date());
  assert.equal(entry.appeal.reply, 'No.');

  appealRows[0].decided_at = new Date(Date.now() - 8 * DAY);
  assert.equal((await appeals.listForAppellant(client, USER))[0].state, 'can-appeal');
});

test('approving lifts the ban once, and a second decision is refused', async () => {
  reset();
  await submit('Please lift my ban, it was a mistake.');
  const approved = await appeals.decideAppealFor(guild, { appealId: 1, deciderId: MOD, decision: 'approve', via: 'with the log button' });
  assert.deepEqual(approved, { ok: true, status: 'approved' });
  assert.deepEqual(unbanned, [USER]);
  assert.equal(audits.at(-1).detail, `user ${USER} unbanned (appeal #1 approved, with the log button)`);
  assert.equal((await appeals.listForAppellant(client, USER))[0].state, 'approved');

  const twice = await appeals.decideAppealFor(guild, { appealId: 1, deciderId: MOD, decision: 'deny' });
  assert.deepEqual(twice, { ok: false, error: 'This appeal was already decided.' });
  assert.equal(unbanned.length, 1);
});

test('a failed unban leaves the appeal open', async () => {
  reset();
  await submit('Please lift my ban, it was a mistake.');
  unbanError = Object.assign(new Error('Missing Permissions'), { code: 50013 });
  const result = await appeals.decideAppealFor(guild, { appealId: 1, deciderId: MOD, decision: 'approve' });
  assert.equal(result.ok, false);
  assert.equal(appealRows[0].status, 'open');
});

test('deny with block stops further appeals; appeals of other servers cannot be decided here', async () => {
  reset();
  await submit('Please lift my ban, it was a mistake.');
  const other = { ...guild, id: '33333333333333333' };
  assert.deepEqual(await appeals.decideAppealFor(other, { appealId: 1, deciderId: MOD, decision: 'approve' }), { ok: false, error: 'Unknown appeal.' });
  assert.deepEqual(await appeals.decideAppealFor(guild, { appealId: 1, deciderId: MOD, decision: 'maybe' }), { ok: false, error: 'Choose approve or deny.' });

  await appeals.decideAppealFor(guild, { appealId: 1, deciderId: MOD, decision: 'deny', block: true });
  assert.ok(blocks.has(`${GUILD}:${USER}`));
  assert.match(audits.at(-1).detail, /no further appeals/);
});

test('a newer ban after an approved appeal can be appealed again', async () => {
  reset();
  await submit('Please lift my ban, it was a mistake.');
  await appeals.decideAppealFor(guild, { appealId: 1, deciderId: MOD, decision: 'approve' });
  bans.unshift({ id: 2, user_id: USER, guild_id: GUILD, guild_name: 'Main server', channel_name: 'trap', created_at: new Date(Date.now() + 1000) });
  assert.equal((await appeals.listForAppellant(client, USER))[0].state, 'can-appeal');
});

test('only administrators can use the Approve and Deny buttons', async () => {
  reset();
  await submit('Please lift my ban, it was a mistake.');
  const replies = [];
  const updates = [];
  let modal = null;
  const press = (customId, isAdmin) => ({
    customId,
    inGuild: () => true,
    member: { id: MOD, permissions: { has: () => isAdmin } },
    user: { id: MOD, username: 'mod' },
    guild,
    reply: async payload => { replies.push(payload); },
    update: async payload => { updates.push(payload); },
    showModal: async payload => { modal = payload; },
  });

  await appeals.handleAppealButton(press('appeal:approve:1', false));
  assert.match(replies[0].content, /permission/);
  assert.equal(unbanned.length, 0);

  await appeals.handleAppealButton(press('appeal:deny:1', true));
  assert.equal(modal.toJSON().custom_id, 'appeal-deny:1');

  await appeals.handleAppealButton(press('appeal:approve:1', true));
  assert.deepEqual(unbanned, [USER]);
  assert.match(updates[0].components[0].toJSON().components[0].label, /Approved by mod/);
});
