/**
 * Database backup: `npm run backup`.
 *
 * Writes a gzip-compressed mysqldump of the bot database to BACKUP_DIR
 * (default ./backups) and keeps only the newest BACKUP_KEEP files (default 14).
 * Run it daily from cron or a scheduler. It needs the `mysqldump` program and
 * reads the same DB_* settings as the bot. The password is passed through the
 * environment, never on the command line.
 *
 * With BACKUP_KEY set, the file is encrypted (`.sql.gz.enc`, see backupCrypto.js);
 * decrypt it with `npm run backup:decrypt`. With BACKUP_COPY_DIR set, a copy is
 * also written there (for example a folder synced to another machine) and
 * pruned the same way.
 *
 * @module scripts/backup
 */

require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');

const { createEncryptStream } = require('./backupCrypto');

const PREFIX = 'voidsentry-';
const SUFFIX = '.sql.gz';
const ENCRYPTED_SUFFIX = '.sql.gz.enc';

const isBackup = name => name.startsWith(PREFIX) && (name.endsWith(SUFFIX) || name.endsWith(ENCRYPTED_SUFFIX));

/**
 * Backup files that should be deleted so only the newest `keep` remain.
 * Plain and encrypted backups count together. File names start with a
 * sortable timestamp, so name order is age order.
 *
 * @param {string[]} files - File names in the backup directory
 * @param {number} keep - How many backups to keep
 * @returns {string[]}
 */
function backupsToDelete(files, keep) {
    const backups = files.filter(isBackup).sort();
    return backups.slice(0, Math.max(0, backups.length - Math.max(1, keep)));
}

/** Timestamp such as 20261027-031500 for use in file names. */
function stamp(date = new Date()) {
    return date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

async function main() {
    const { DB_HOST, DB_PORT = '3306', DB_USER, DB_PASSWORD, DB_NAME } = process.env;
    if (!DB_HOST || !DB_USER || !DB_NAME) throw new Error('DB_HOST, DB_USER and DB_NAME must be set.');

    const dir = path.resolve(process.env.BACKUP_DIR || 'backups');
    const keep = Number.parseInt(process.env.BACKUP_KEEP || '14', 10) || 14;
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

    const key = process.env.BACKUP_KEY || '';
    if (!key) console.warn('BACKUP_KEY is not set: the backup is written unencrypted.');
    const target = path.join(dir, `${PREFIX}${stamp()}${key ? ENCRYPTED_SUFFIX : SUFFIX}`);
    const dump = spawn(
        'mysqldump',
        ['--single-transaction', '--routines', '--host', DB_HOST, '--port', DB_PORT, '--user', DB_USER, DB_NAME],
        { env: { ...process.env, MYSQL_PWD: DB_PASSWORD || '' }, stdio: ['ignore', 'pipe', 'inherit'] },
    );
    const exited = new Promise((resolve, reject) => {
        dump.on('error', reject);
        dump.on('close', code => (code === 0 ? resolve() : reject(new Error(`mysqldump exited with code ${code}`))));
    });

    try {
        const stages = [dump.stdout, zlib.createGzip(), ...(key ? [createEncryptStream(key)] : []), fs.createWriteStream(target, { mode: 0o600 })];
        await Promise.all([pipeline(...stages), exited]);
    } catch (error) {
        fs.rmSync(target, { force: true });
        throw error;
    }

    for (const name of backupsToDelete(fs.readdirSync(dir), keep)) fs.rmSync(path.join(dir, name));
    console.log(`Backup written to ${target}`);

    const copyDir = process.env.BACKUP_COPY_DIR ? path.resolve(process.env.BACKUP_COPY_DIR) : null;
    if (copyDir && copyDir !== dir && !key) {
        // The copy is meant to leave this machine; an unencrypted dump must not.
        console.error('BACKUP_COPY_DIR is set but BACKUP_KEY is not: the copy was skipped. Set BACKUP_KEY to enable it.');
        process.exitCode = 1;
    } else if (copyDir && copyDir !== dir) {
        fs.mkdirSync(copyDir, { recursive: true, mode: 0o700 });
        const copy = path.join(copyDir, path.basename(target));
        fs.copyFileSync(target, copy);
        for (const name of backupsToDelete(fs.readdirSync(copyDir), keep)) fs.rmSync(path.join(copyDir, name));
        console.log(`Copy written to ${copy}`);
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error(`Backup failed: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = { backupsToDelete, stamp };
