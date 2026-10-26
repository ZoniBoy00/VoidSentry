const test = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType } = require('discord.js');

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
const { applySettings } = require('../src/utils/dashboardSettings');

const GUILD = '22222222222222222';
const USER = '44444444444444444';
const LOG = '10000000000000001';
const TRAP = '10000000000000002';
const NEW_TRAP = '10000000000000003';
const HIDDEN = '10000000000000004';
const VOICE = '10000000000000005';
const FOREIGN = '10000000000009999';
const ROLE = '20000000000000001';
const EXEMPT = '20000000000000002';

let calls;
let audits;
let state;

function reset({ traps = [TRAP], exempt = [EXEMPT], logChannelId = null, auditFails = false } = {}) {
  calls = [];
  audits = [];
  state = { traps: [...traps], exempt: [...exempt], logChannelId };
  guildSettings.getGuildConfig = () => ({ logChannelId: state.logChannelId, banReason: 'Trap', deleteMessageSeconds: 86400, dryRun: false, exemptRoleIds: [...state.exempt] });
  guildSettings.listTrapChannels = () => [...state.traps];
  for (const name of ['setLogChannel', 'setBanReason', 'setDeleteMessageSeconds', 'setDryRun', 'addTrapChannel', 'removeTrapChannel', 'addExemptRole', 'removeExemptRole']) {
    guildSettings[name] = async (...args) => { calls.push([name, ...args]); };
  }
  db.addAudit = async entry => {
    if (auditFails) throw new Error('audit table missing');
    audits.push(entry);
  };
}

function channel(id, name, { type = ChannelType.GuildText, canPost = true } = {}) {
  return { id, name, type, permissionsFor: () => ({ has: () => canPost }) };
}

const guild = {
  id: GUILD,
  name: 'Test guild',
  members: { me: { id: 'bot' } },
  channels: {
    cache: new Map([
      [LOG, channel(LOG, 'mod-logs')],
      [TRAP, channel(TRAP, 'do-not-post')],
      [NEW_TRAP, channel(NEW_TRAP, 'honeypot')],
      [HIDDEN, channel(HIDDEN, 'staff-only', { canPost: false })],
      [VOICE, channel(VOICE, 'voice', { type: ChannelType.GuildVoice })],
    ]),
  },
  roles: {
    cache: new Map([
      [GUILD, { id: GUILD, name: '@everyone' }],
      [ROLE, { id: ROLE, name: 'Helper' }],
      [EXEMPT, { id: EXEMPT, name: 'Staff' }],
    ]),
  },
};

const apply = (body, options) => applySettings(guild, USER, body, options);

test('rejects empty, malformed and unknown requests without changing anything', async () => {
  reset();
  for (const body of [null, [], 'text', {}, { ownerId: '1' }]) {
    assert.equal((await apply(body)).ok, false);
  }
  assert.deepEqual(calls, []);
});

test('sets the log channel to a writable text channel and records who did it', async () => {
  reset();
  const result = await apply({ logChannelId: LOG });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [['setLogChannel', GUILD, LOG]]);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].userId, USER);
  assert.match(audits[0].detail, /log channel set to #mod-logs/);
});

test('refuses log channels from other servers, voice channels and channels the bot cannot write in', async () => {
  reset();
  for (const id of [FOREIGN, VOICE, HIDDEN, 'not-an-id', 5]) {
    const result = await apply({ logChannelId: id });
    assert.equal(result.ok, false, String(id));
  }
  assert.deepEqual(calls, []);
});

test('a trap channel cannot be the log channel, in either order', async () => {
  reset();
  assert.equal((await apply({ logChannelId: TRAP })).ok, false);

  reset({ logChannelId: LOG });
  assert.equal((await apply({ addTrapChannel: LOG })).ok, false);

  reset();
  assert.equal((await apply({ logChannelId: NEW_TRAP, addTrapChannel: NEW_TRAP })).ok, false);
  assert.deepEqual(calls, []);
});

test('adding a trap channel saves it and posts the warning', async () => {
  reset();
  const posted = [];
  const result = await apply({ addTrapChannel: NEW_TRAP }, { postWarning: async ch => { posted.push(ch.id); } });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [['addTrapChannel', GUILD, NEW_TRAP]]);
  assert.deepEqual(posted, [NEW_TRAP]);
});

test('the trap stays registered even if the warning cannot be posted', async () => {
  reset();
  const result = await apply({ addTrapChannel: NEW_TRAP }, { postWarning: async () => { throw new Error('Missing Access'); } });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [['addTrapChannel', GUILD, NEW_TRAP]]);
});

test('trap channel limits and duplicates are enforced', async () => {
  reset();
  assert.equal((await apply({ addTrapChannel: TRAP })).ok, false);
  assert.equal((await apply({ addTrapChannel: VOICE })).ok, false);
  assert.equal((await apply({ removeTrapChannel: NEW_TRAP })).ok, false);

  reset({ traps: Array.from({ length: 10 }, (_, i) => `3000000000000000${i}`) });
  assert.equal((await apply({ addTrapChannel: NEW_TRAP })).ok, false);
  assert.deepEqual(calls, []);
});

test('removing a trap channel works only for existing traps', async () => {
  reset();
  assert.equal((await apply({ removeTrapChannel: TRAP })).ok, true);
  assert.deepEqual(calls, [['removeTrapChannel', TRAP]]);
});

test('nothing is saved when any part of a request is invalid', async () => {
  reset();
  const result = await apply({ dryRun: true, logChannelId: FOREIGN });
  assert.equal(result.ok, false);
  assert.deepEqual(calls, []);
  assert.deepEqual(audits, []);
});

test('ban reason is trimmed, limited and can be reset', async () => {
  reset();
  assert.equal((await apply({ banReason: '  Scam account  ' })).ok, true);
  assert.deepEqual(calls.at(-1), ['setBanReason', GUILD, 'Scam account']);
  assert.equal((await apply({ banReason: '   ' })).ok, true);
  assert.deepEqual(calls.at(-1), ['setBanReason', GUILD, null]);
  assert.equal((await apply({ banReason: 'x'.repeat(501) })).ok, false);
  assert.equal((await apply({ banReason: 5 })).ok, false);
});

test('message deletion must be a whole number of seconds in range', async () => {
  reset();
  for (const value of [-1, 604801, 1.5, '60', NaN]) assert.equal((await apply({ deleteMessageSeconds: value })).ok, false, String(value));
  assert.equal((await apply({ deleteMessageSeconds: 0 })).ok, true);
  assert.equal((await apply({ deleteMessageSeconds: 604800 })).ok, true);
  assert.equal((await apply({ deleteMessageSeconds: null })).ok, true);
});

test('dry-run needs a real boolean', async () => {
  reset();
  assert.equal((await apply({ dryRun: 'true' })).ok, false);
  assert.equal((await apply({ dryRun: 1 })).ok, false);
  assert.equal((await apply({ dryRun: true })).ok, true);
  assert.deepEqual(calls.at(-1), ['setDryRun', GUILD, true]);
});

test('exempt roles must belong to the server, and @everyone is refused', async () => {
  reset();
  assert.equal((await apply({ addExemptRole: ROLE })).ok, true);
  assert.deepEqual(calls.at(-1), ['addExemptRole', GUILD, ROLE]);
  assert.equal((await apply({ addExemptRole: GUILD })).ok, false);
  assert.equal((await apply({ addExemptRole: '20000000000009999' })).ok, false);
  assert.equal((await apply({ addExemptRole: EXEMPT })).ok, false);
  assert.equal((await apply({ removeExemptRole: ROLE })).ok, false);
  assert.equal((await apply({ removeExemptRole: EXEMPT })).ok, true);
});

test('a failing audit log never hides a change that was saved', async () => {
  reset({ auditFails: true });
  const result = await apply({ dryRun: true });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [['setDryRun', GUILD, true]]);
});
