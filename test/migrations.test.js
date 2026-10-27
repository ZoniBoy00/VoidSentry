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

const { MIGRATIONS, runMigrations } = require('../src/utils/migrations');

function fakePool(alreadyApplied = []) {
  const statements = [];
  const recorded = [...alreadyApplied];
  return {
    statements,
    recorded,
    query: async (sql, params) => {
      statements.push(sql);
      if (/SELECT version FROM schema_migrations/.test(sql)) return [recorded.map(version => ({ version }))];
      if (/INSERT INTO schema_migrations/.test(sql)) recorded.push(params[0]);
      return [[]];
    },
  };
}

test('migration versions are unique and strictly increasing', () => {
  const versions = MIGRATIONS.map(migration => migration.version);
  assert.deepEqual(versions, [...new Set(versions)].sort((a, b) => a - b));
  assert.equal(versions[0], 1);
});

test('a fresh database gets every migration, once, in order', async () => {
  const pool = fakePool();
  const applied = await runMigrations(pool);
  assert.deepEqual(applied, MIGRATIONS.map(migration => migration.version));
  assert.deepEqual(pool.recorded, applied);
});

test('migrations that already ran are skipped', async () => {
  const pool = fakePool([1]);
  const applied = await runMigrations(pool);
  assert.deepEqual(applied, MIGRATIONS.map(migration => migration.version).filter(version => version !== 1));
  assert.equal(pool.statements.some(sql => /CREATE TABLE IF NOT EXISTS bans/.test(sql)), false);
});

test('running again after everything is applied changes nothing', async () => {
  const pool = fakePool(MIGRATIONS.map(migration => migration.version));
  assert.deepEqual(await runMigrations(pool), []);
});
