/**
 * Encryption for database backups.
 *
 * AES-256-GCM with a key derived from BACKUP_KEY by scrypt, using a new random
 * salt and IV for every file. File layout:
 *
 *   MAGIC (6) | salt (16) | iv (12) | ciphertext | auth tag (16)
 *
 * GCM only proves the file is intact at the very end, so decryption writes to a
 * temporary file and renames it only after the tag has been verified.
 *
 * @module scripts/backupCrypto
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const MAGIC = Buffer.from('VSBK1\0', 'latin1');
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + SALT_BYTES + IV_BYTES;

/** Derive the 32-byte file key from the passphrase and the file's salt. */
function deriveKey(passphrase, salt) {
    return crypto.scryptSync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

/**
 * A stream that encrypts what passes through it and adds the header and tag.
 *
 * @param {string} passphrase - BACKUP_KEY
 * @returns {import('node:stream').Transform}
 */
function createEncryptStream(passphrase) {
    const salt = crypto.randomBytes(SALT_BYTES);
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
    let headerSent = false;

    return new Transform({
        transform(chunk, _encoding, callback) {
            if (!headerSent) {
                this.push(Buffer.concat([MAGIC, salt, iv]));
                headerSent = true;
            }
            callback(null, cipher.update(chunk));
        },
        flush(callback) {
            if (!headerSent) this.push(Buffer.concat([MAGIC, salt, iv]));
            this.push(cipher.final());
            callback(null, cipher.getAuthTag());
        },
    });
}

/**
 * Decrypt an encrypted backup into `target`. Nothing is left at `target` if the
 * passphrase is wrong or the file was changed.
 *
 * @param {string} source - Encrypted file
 * @param {string} target - Where the decrypted file goes
 * @param {string} passphrase - BACKUP_KEY used when the backup was made
 */
async function decryptFile(source, target, passphrase) {
    const size = fs.statSync(source).size;
    if (size < HEADER_BYTES + TAG_BYTES) throw new Error('This is not an encrypted VoidSentry backup.');

    const fd = fs.openSync(source, 'r');
    const header = Buffer.alloc(HEADER_BYTES);
    const tag = Buffer.alloc(TAG_BYTES);
    try {
        fs.readSync(fd, header, 0, HEADER_BYTES, 0);
        fs.readSync(fd, tag, 0, TAG_BYTES, size - TAG_BYTES);
    } finally {
        fs.closeSync(fd);
    }
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('This is not an encrypted VoidSentry backup.');

    const salt = header.subarray(MAGIC.length, MAGIC.length + SALT_BYTES);
    const iv = header.subarray(MAGIC.length + SALT_BYTES);
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
    decipher.setAuthTag(tag);

    const partial = `${target}.partial`;
    try {
        const empty = size === HEADER_BYTES + TAG_BYTES;
        await pipeline(
            empty ? Readable.from([]) : fs.createReadStream(source, { start: HEADER_BYTES, end: size - TAG_BYTES - 1 }),
            decipher,
            fs.createWriteStream(partial, { mode: 0o600 }),
        );
    } catch (error) {
        fs.rmSync(partial, { force: true });
        if (/auth|unable to authenticate/i.test(error.message)) {
            throw new Error('Wrong BACKUP_KEY, or the file is damaged or was changed.');
        }
        throw error;
    }
    fs.renameSync(partial, target);
}

module.exports = { createEncryptStream, decryptFile, MAGIC };
