/**
 * Decrypt a backup made with BACKUP_KEY: `npm run backup:decrypt -- <file.sql.gz.enc> [output]`.
 *
 * Reads BACKUP_KEY from the environment or .env and writes the gzip-compressed
 * dump next to the input (without `.enc`) unless an output path is given.
 * Restore it as usual: `gunzip -c <file.sql.gz> | mysql -h HOST -u USER -p DATABASE`.
 *
 * @module scripts/decrypt-backup
 */

require('dotenv').config();

const path = require('node:path');
const { decryptFile } = require('./backupCrypto');

async function main() {
    const [source, output] = process.argv.slice(2);
    if (!source) throw new Error('Usage: npm run backup:decrypt -- <file.sql.gz.enc> [output]');
    const key = process.env.BACKUP_KEY;
    if (!key) throw new Error('BACKUP_KEY must be set to the key the backup was made with.');

    const target = path.resolve(output || source.replace(/\.enc$/, '') || `${source}.sql.gz`);
    if (target === path.resolve(source)) throw new Error('Give an output path that differs from the input.');
    await decryptFile(source, target, key);
    console.log(`Decrypted to ${target}`);
}

main().catch(error => {
    console.error(`Decryption failed: ${error.message}`);
    process.exitCode = 1;
});
