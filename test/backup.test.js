const test = require('node:test');
const assert = require('node:assert/strict');

const { backupsToDelete, stamp } = require('../scripts/backup');

const names = ['voidsentry-20261001-000000.sql.gz', 'voidsentry-20261003-000000.sql.gz', 'voidsentry-20261002-000000.sql.gz', 'notes.txt'];

test('deletes the oldest backups and keeps the newest ones', () => {
  assert.deepEqual(backupsToDelete(names, 2), ['voidsentry-20261001-000000.sql.gz']);
  assert.deepEqual(backupsToDelete(names, 1), ['voidsentry-20261001-000000.sql.gz', 'voidsentry-20261002-000000.sql.gz']);
});

test('never deletes files that are not backups, and always keeps at least one', () => {
  assert.deepEqual(backupsToDelete(names, 10), []);
  assert.equal(backupsToDelete(names, 0).includes('voidsentry-20261003-000000.sql.gz'), false);
  assert.equal(backupsToDelete(names, 0).includes('notes.txt'), false);
});

test('plain and encrypted backups are pruned together', () => {
  const mixed = ['voidsentry-20261001-000000.sql.gz', 'voidsentry-20261002-000000.sql.gz.enc', 'voidsentry-20261003-000000.sql.gz.enc'];
  assert.deepEqual(backupsToDelete(mixed, 2), ['voidsentry-20261001-000000.sql.gz']);
  assert.deepEqual(backupsToDelete(mixed, 1), ['voidsentry-20261001-000000.sql.gz', 'voidsentry-20261002-000000.sql.gz.enc']);
});

test('file name timestamps sort in time order', () => {
  assert.equal(stamp(new Date('2026-10-27T03:15:00Z')), '20261027-031500');
});
