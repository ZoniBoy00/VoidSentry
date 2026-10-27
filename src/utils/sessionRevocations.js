/**
 * "Sign out everywhere" for the website dashboard.
 *
 * The website keeps sessions in signed cookies and cannot cancel one itself.
 * Instead the bot remembers, per user, a time before which sessions are no
 * longer accepted; the website sends the session's issue time with every
 * request. The list is kept in memory, so checking it costs no query.
 *
 * @module utils/sessionRevocations
 */

const db = require('./db');

/** @type {Map<string, number>} user ID → Unix seconds */
const revokedBefore = new Map();

/** Load the stored revocations. Call once after the database is ready. */
async function load() {
    revokedBefore.clear();
    for (const row of await db.loadSessionRevocations()) revokedBefore.set(row.user_id, Number(row.revoked_before));
}

/**
 * Whether a session of this user, issued at `issuedAt`, has been revoked.
 * Sessions without an issue time count as issued at 0.
 *
 * @param {string} userId - Discord user ID
 * @param {number} issuedAt - Unix time in seconds
 * @returns {boolean}
 */
function isRevoked(userId, issuedAt) {
    const before = revokedBefore.get(userId);
    return before !== undefined && !(issuedAt >= before);
}

/**
 * Revoke every session of a user issued up to now. Stored first, so a failed
 * write never looks like a successful sign-out.
 *
 * @param {string} userId - Discord user ID
 * @param {number} [now] - Unix time in seconds
 */
async function revokeAll(userId, now = Math.floor(Date.now() / 1000)) {
    // A session issued in this same second is revoked too.
    const before = now + 1;
    await db.setSessionRevocation(userId, before);
    revokedBefore.set(userId, before);
}

module.exports = { load, isRevoked, revokeAll };
