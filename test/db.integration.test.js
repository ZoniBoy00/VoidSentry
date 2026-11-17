/**
 * Integration tests against a real MySQL or MariaDB server.
 *
 * Every other test mocks the database, so a wrong SQL statement or migration
 * would pass them. These run the migrations and every query in db.js for real.
 * They are skipped unless TEST_DB_HOST is set; CI starts a database for them.
 * The test database is emptied first: never point TEST_DB_* at real data.
 *
 *   TEST_DB_HOST=127.0.0.1 TEST_DB_USER=root TEST_DB_PASSWORD=... TEST_DB_NAME=voidsentry_test npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const enabled = Boolean(process.env.TEST_DB_HOST);

Object.assign(process.env, {
  DISCORD_TOKEN: 'test-token',
  CLIENT_ID: '12345678901234567',
  OWNER_ID: '12345678901234568',
  BAN_CHANNEL_IDS: '',
  DB_HOST: process.env.TEST_DB_HOST || '127.0.0.1',
  DB_PORT: process.env.TEST_DB_PORT || '3306',
  DB_USER: process.env.TEST_DB_USER || 'root',
  DB_PASSWORD: process.env.TEST_DB_PASSWORD || 'unset',
  DB_NAME: process.env.TEST_DB_NAME || 'voidsentry_test',
  NODE_ENV: 'production',
});

const mysql = require('mysql2/promise');
const db = require('../src/utils/db');
const { MIGRATIONS, runMigrations } = require('../src/utils/migrations');

const GUILD = '22222222222222222';
const OTHER_GUILD = '33333333333333333';
const USER = '44444444444444444';
const OTHER_USER = '55555555555555555';

/** A ban record with sensible defaults. */
function ban(overrides = {}) {
  return {
    userId: USER,
    userTag: 'spammer',
    guildId: GUILD,
    guildName: 'Main server',
    channelId: '11111111111111119',
    channelName: 'do-not-post',
    messageContent: 'free nitro',
    reason: 'Trap',
    ...overrides,
  };
}

/** Run `sql` on the shared pool. */
async function query(sql, params) {
  const pool = await db.getPool();
  const [rows] = await pool.query(sql, params);
  return rows;
}

test('database integration', { skip: !enabled && 'set TEST_DB_HOST to run against a real database' }, async t => {
  // Start from an empty database, so the migrations run as they would on a new install.
  const setup = await mysql.createConnection({ ...require('../src/config').DB, multipleStatements: false });
  const [tables] = await setup.query('SHOW TABLES');
  await setup.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const row of tables) await setup.query(`DROP TABLE \`${Object.values(row)[0]}\``);
  await setup.query('SET FOREIGN_KEY_CHECKS = 1');
  await setup.end();

  t.after(() => db.closePool());

  await t.test('a new database gets every migration, and running them again changes nothing', async () => {
    const pool = await db.initDatabase();
    const rows = await query('SELECT version FROM schema_migrations ORDER BY version');
    assert.deepEqual(rows.map(row => row.version), MIGRATIONS.map(migration => migration.version));
    assert.deepEqual(await runMigrations(pool), []);
  });

  await t.test('the first migration adopts tables that already exist', async () => {
    // Databases from before versioned migrations have the tables but no record of them.
    await query('DELETE FROM schema_migrations WHERE version = 1');
    const applied = await runMigrations(await db.getPool());
    assert.deepEqual(applied, [1]);
  });

  await t.test('bans are stored and read back, including emoji', async () => {
    const id = await db.addBan(ban({ messageContent: 'free nitro 🎁 ä' }));
    assert.ok(id > 0);
    await db.addBan(ban({ userId: OTHER_USER, userTag: 'other_100%' }));
    await db.addBan(ban({ guildId: OTHER_GUILD, guildName: 'Other' }));

    const mine = await db.findBansByUserId(USER);
    assert.equal(mine.length, 2);
    assert.equal(mine.find(row => row.id === id).message_content, 'free nitro 🎁 ä');
    assert.equal((await db.findBansByUserId(USER, GUILD)).length, 1);

    assert.equal((await db.getBans(10, 0)).length, 3);
    assert.equal((await db.getBans(1, 1)).length, 1);
    assert.equal((await db.getBans(10, 0, OTHER_GUILD)).length, 1);
  });

  await t.test('search matches IDs and names, with LIKE wildcards taken literally', async () => {
    assert.equal((await db.searchBans(GUILD)).total, 2);
    assert.equal((await db.searchBans(null)).total, 3);
    assert.equal((await db.searchBans(GUILD, { query: USER })).total, 1);
    assert.equal((await db.searchBans(GUILD, { query: 'SPAM' })).total, 1);
    assert.equal((await db.searchBans(GUILD, { query: '100%' })).total, 1);
    assert.equal((await db.searchBans(GUILD, { query: '%' })).total, 1);
    assert.equal((await db.searchBans(GUILD, { query: '_' })).total, 1);

    const page = await db.searchBans(null, { limit: 2, offset: 2 });
    assert.equal(page.total, 3);
    assert.equal(page.rows.length, 1);
  });

  await t.test('counts and statistics', async () => {
    assert.equal(Number(await db.getBanCount()), 3);
    assert.equal(Number(await db.getBanCount(GUILD)), 2);
    assert.equal(Number(await db.getUniqueUserCount()), 2);
    assert.equal(Number(await db.getUniqueUserCount(OTHER_GUILD)), 1);
    assert.equal(Number(await db.getBanCountSince(7)), 3);

    const counts = await db.getBanCountsByGuild();
    assert.equal(counts.get(GUILD), 2);
    assert.equal(counts.get(OTHER_GUILD), 1);

    const stats = await db.getGuildStats();
    assert.deepEqual(stats.map(row => [row.guild_name, Number(row.count)]), [['Main server', 2], ['Other', 1]]);

    const activity = await db.getBanActivity(GUILD, 30, 1);
    assert.equal(activity.rows.length, 1);
    assert.equal(activity.truncated, true);
    assert.equal((await db.getBanActivity(null, 30)).rows.length, 3);
  });

  await t.test('old message content is cleared, the ban stays', async () => {
    await query('UPDATE bans SET created_at = NOW() - INTERVAL 100 DAY WHERE guild_id = ?', [OTHER_GUILD]);
    assert.equal(await db.purgeOldMessageContent(90), 1);
    assert.equal(await db.purgeOldMessageContent(0), 0);
    const [row] = await db.findBansByUserId(USER, OTHER_GUILD);
    assert.equal(row.message_content, null);
    assert.equal(Number(await db.getBanCountSince(7)), 2);
  });

  await t.test('server settings, trap channels and exempt roles', async () => {
    await db.setGuildSetting(GUILD, 'log_channel_id', '88888888888888888');
    await db.setGuildSetting(GUILD, 'dry_run', 1);
    await db.setGuildSetting(GUILD, 'dry_run', 0);
    await db.addTrapChannel(GUILD, '11111111111111119');
    await db.addTrapChannel(GUILD, '11111111111111119');
    await db.addTrapChannel(GUILD, '11111111111111118');
    await db.removeTrapChannel('11111111111111118');
    await db.addExemptRole(GUILD, '99999999999999999');
    await db.addExemptRole(GUILD, '99999999999999999');
    await assert.rejects(db.setGuildSetting(GUILD, 'guild_id', 'x'), /Unknown guild setting/);

    const loaded = await db.loadGuildSettings();
    assert.deepEqual(loaded.settings.map(row => [row.guild_id, row.log_channel_id, Number(row.dry_run)]), [[GUILD, '88888888888888888', 0]]);
    assert.deepEqual(loaded.channels.map(row => row.channel_id), ['11111111111111119']);
    assert.deepEqual(loaded.exemptRoles.map(row => row.role_id), ['99999999999999999']);

    await db.removeExemptRole(GUILD, '99999999999999999');
    assert.equal((await db.loadGuildSettings()).exemptRoles.length, 0);
  });

  await t.test('audit log entries are cut to fit and listed newest first', async () => {
    await db.addAudit({ guildId: GUILD, userId: USER, detail: 'first' });
    await db.addAudit({ guildId: GUILD, userId: USER, detail: 'x'.repeat(400) });
    const entries = await db.getAudit(GUILD, 10);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].detail.length, 300);
    assert.equal(entries[1].detail, 'first');
    assert.equal((await db.getAudit(GUILD, 1)).length, 1);
  });

  await t.test('leaving a server removes its settings but keeps its bans', async () => {
    await db.removeGuildData(GUILD);
    const loaded = await db.loadGuildSettings();
    assert.equal(loaded.settings.length, 0);
    assert.equal(loaded.channels.length, 0);
    assert.equal((await db.getAudit(GUILD)).length, 0);
    assert.equal(Number(await db.getBanCount(GUILD)), 2);
  });

  await t.test('session revocations are stored and replaced', async () => {
    await db.setSessionRevocation(USER, 1000);
    await db.setSessionRevocation(USER, 2000);
    const rows = await db.loadSessionRevocations();
    assert.deepEqual(rows.map(row => [row.user_id, Number(row.revoked_before)]), [[USER, 2000]]);
  });

  await t.test('appeals: store, list, decide once, block, reopen and expire', async () => {
    await db.setGuildSetting(OTHER_GUILD, 'appeals_enabled', 1);
    await db.setGuildSetting(OTHER_GUILD, 'appeal_cooldown_days', 3);
    const settings = (await db.loadGuildSettings()).settings.find(row => row.guild_id === OTHER_GUILD);
    assert.equal(Number(settings.appeals_enabled), 1);
    assert.equal(Number(settings.appeal_cooldown_days), 3);

    const first = await db.addAppeal({ guildId: OTHER_GUILD, userId: USER, userTag: 'spammer', text: 'It was my cat 🐈' });
    const second = await db.addAppeal({ guildId: OTHER_GUILD, userId: OTHER_USER, userTag: 'other', text: 'x'.repeat(1200) });
    assert.equal((await db.getAppeal(first)).text, 'It was my cat 🐈');
    assert.equal((await db.getAppeal(second)).text.length, 1000);
    assert.equal((await db.getAppeal(first)).status, 'open');
    assert.equal(await db.getAppeal(999999), null);
    assert.equal(await db.countOpenAppeals(OTHER_GUILD), 2);
    assert.deepEqual((await db.getGuildAppeals(OTHER_GUILD, 'open')).map(row => row.id), [first, second]);
    assert.deepEqual((await db.getAppealsByUser(USER)).map(row => row.id), [first]);

    assert.equal(await db.decideAppeal(first, { status: 'denied', reply: 'No.', decidedBy: OTHER_USER }), true);
    assert.equal(await db.decideAppeal(first, { status: 'approved', reply: null, decidedBy: OTHER_USER }), false);
    const decided = await db.getAppeal(first);
    assert.equal(decided.status, 'denied');
    assert.ok(decided.decided_at instanceof Date);
    assert.deepEqual((await db.getGuildAppeals(OTHER_GUILD, 'decided')).map(row => row.id), [first]);

    await db.reopenAppeal(first);
    assert.equal((await db.getAppeal(first)).status, 'open');
    assert.equal((await db.getAppeal(first)).decided_at, null);
    await db.decideAppeal(first, { status: 'denied', reply: null, decidedBy: OTHER_USER });

    await db.addAppealBlock(OTHER_GUILD, USER, OTHER_USER);
    await db.addAppealBlock(OTHER_GUILD, USER, OTHER_USER);
    assert.equal(await db.isAppealBlocked(OTHER_GUILD, USER), true);
    assert.equal((await db.getAppealBlocks(OTHER_GUILD)).length, 1);
    assert.equal(await db.removeAppealBlock(OTHER_GUILD, USER), true);
    assert.equal(await db.removeAppealBlock(OTHER_GUILD, USER), false);
    await db.addAppealBlock(OTHER_GUILD, USER, OTHER_USER);

    await query('UPDATE appeals SET decided_at = NOW() - INTERVAL 100 DAY WHERE id = ?', [first]);
    assert.equal(await db.purgeDecidedAppeals(90), 1);
    assert.equal(await db.getAppeal(second).then(row => row.status), 'open');
    await db.addAppeal({ guildId: OTHER_GUILD, userId: USER, userTag: 'spammer', text: 'One more try.' });
  });

  await t.test('a data deletion request removes every ban and appeal of the user', async () => {
    assert.equal(await db.deleteAppealsByUser(USER), 1);
    assert.equal(await db.isAppealBlocked(OTHER_GUILD, USER), false);
    assert.equal(await db.countOpenAppeals(OTHER_GUILD), 1);
    assert.equal(await db.deleteBansByUser(USER), 2);
    assert.equal((await db.findBansByUserId(USER)).length, 0);
    assert.equal(Number(await db.getBanCount()), 1);
  });

  await t.test('leaving a server also removes its appeals and appeal blocks', async () => {
    await db.addAppealBlock(OTHER_GUILD, OTHER_USER, USER);
    await db.removeGuildData(OTHER_GUILD);
    assert.equal(await db.countOpenAppeals(OTHER_GUILD), 0);
    assert.equal(await db.isAppealBlocked(OTHER_GUILD, OTHER_USER), false);
  });

  await t.test('recent banned users: one row per user, newest first, only inside the window', async () => {
    const RECENT_GUILD = '66666666666666666';
    await db.addBan(ban({ guildId: RECENT_GUILD, userId: USER, userTag: 'first' }));
    await db.addBan(ban({ guildId: RECENT_GUILD, userId: USER, userTag: 'first' }));
    await db.addBan(ban({ guildId: RECENT_GUILD, userId: OTHER_USER, userTag: 'second' }));
    const old = await db.addBan(ban({ guildId: RECENT_GUILD, userId: '77777777777777777', userTag: 'old' }));
    await query('UPDATE bans SET created_at = NOW() - INTERVAL 3 HOUR WHERE id = ?', [old]);
    await query('UPDATE bans SET created_at = NOW() - INTERVAL 10 MINUTE WHERE guild_id = ? AND user_id = ?', [RECENT_GUILD, USER]);

    const rows = await db.getRecentBannedUsers(RECENT_GUILD, 1, 10);
    assert.deepEqual(rows.map(row => row.user_id), [OTHER_USER, USER]);
    assert.equal((await db.getRecentBannedUsers(RECENT_GUILD, 6, 10)).length, 3);
    assert.equal((await db.getRecentBannedUsers(RECENT_GUILD, 6, 2)).length, 2);
  });
});
