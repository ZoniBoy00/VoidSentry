const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const { createEncryptStream, decryptFile, MAGIC } = require('../scripts/backupCrypto');

const KEY = 'correct horse battery staple';

async function encrypt(dir, content, key = KEY) {
  const file = path.join(dir, 'backup.sql.gz.enc');
  await pipeline(Readable.from([content]), createEncryptStream(key), fs.createWriteStream(file));
  return file;
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'voidsentry-backup-'));
}

test('an encrypted backup decrypts back to the same bytes', async () => {
  const dir = tempDir();
  try {
    const content = crypto.randomBytes(200000);
    const file = await encrypt(dir, content);
    const raw = fs.readFileSync(file);
    assert.ok(raw.subarray(0, MAGIC.length).equals(MAGIC));
    assert.equal(raw.includes(content.subarray(0, 64)), false, 'the content is not stored in the clear');

    const out = path.join(dir, 'backup.sql.gz');
    await decryptFile(file, out, KEY);
    assert.ok(fs.readFileSync(out).equals(content));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an empty input still makes a valid encrypted file', async () => {
  const dir = tempDir();
  try {
    const file = path.join(dir, 'empty.enc');
    await pipeline(Readable.from([]), createEncryptStream(KEY), fs.createWriteStream(file));
    const out = path.join(dir, 'empty');
    await decryptFile(file, out, KEY);
    assert.equal(fs.readFileSync(out).length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a wrong key or a changed file is rejected and leaves no output', async () => {
  const dir = tempDir();
  try {
    const file = await encrypt(dir, Buffer.from('CREATE TABLE bans (id INT);'.repeat(100)));
    const out = path.join(dir, 'out.sql.gz');

    await assert.rejects(decryptFile(file, out, 'wrong key'), /Wrong BACKUP_KEY/);
    assert.equal(fs.existsSync(out), false);
    assert.equal(fs.existsSync(`${out}.partial`), false);

    const tampered = fs.readFileSync(file);
    tampered[60] ^= 0xff;
    fs.writeFileSync(file, tampered);
    await assert.rejects(decryptFile(file, out, KEY), /Wrong BACKUP_KEY/);
    assert.equal(fs.existsSync(out), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a file that is not an encrypted backup is refused', async () => {
  const dir = tempDir();
  try {
    const file = path.join(dir, 'plain.sql.gz');
    fs.writeFileSync(file, Buffer.alloc(100, 1));
    await assert.rejects(decryptFile(file, path.join(dir, 'out'), KEY), /not an encrypted VoidSentry backup/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
