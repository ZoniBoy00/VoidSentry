const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const baseEnv = {
  DISCORD_TOKEN: 'test-token',
  CLIENT_ID: '12345678901234567',
  OWNER_ID: '12345678901234568',
  BAN_CHANNEL_IDS: '12345678901234569,12345678901234570',
  DB_HOST: '127.0.0.1',
  DB_PORT: '3306',
  DB_USER: 'voidsentry',
  DB_PASSWORD: 'test-password',
  DB_NAME: 'voidsentry_test',
};

test('accepts a complete valid configuration', () => {
  const result = spawnSync(process.execPath, ['-e', "const c=require('./src/config'); if(c.DB.database!=='voidsentry_test') process.exit(2)"], {
    cwd: process.cwd(),
    env: { ...process.env, ...baseEnv },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
});

test('rejects empty database credentials', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./src/config')"], {
    cwd: process.cwd(),
    env: { ...process.env, ...baseEnv, DB_PASSWORD: '' },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DB_PASSWORD is required/);
});

test('the dashboard API is on by default and can be switched off', () => {
  const read = value => spawnSync(process.execPath, ['-e', "process.stdout.write('\\n' + require('./src/config').DASHBOARD_API)"], {
    cwd: process.cwd(),
    env: { ...process.env, ...baseEnv, DASHBOARD_API: value },
    encoding: 'utf8',
  });
  // dotenv may print a line of its own first.
  const value = setting => read(setting).stdout.split('\n').at(-1);
  assert.equal(value(''), 'true');
  assert.equal(value('false'), 'false');
  assert.equal(value('OFF'), 'false');
  const invalid = read('maybe');
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /DASHBOARD_API must be true or false/);
});

test('rejects invalid purge duration', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./src/config')"], {
    cwd: process.cwd(),
    env: { ...process.env, ...baseEnv, DELETE_MESSAGE_SECONDS: '999999' },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DELETE_MESSAGE_SECONDS/);
});
