/**
 * Recent bans that VoidSentry could not carry out, per server, so the dashboard
 * can show them next to the setup checklist instead of only in a direct message
 * to the owner. Kept in memory: a restart clears the list, which is fine for a
 * "look at this now" notice.
 *
 * @module utils/banProblems
 */

/** Entries kept per server. */
const MAX_PER_GUILD = 10;
/** Entries older than this are dropped. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** @typedef {'missing-permission'|'hierarchy'|'ban-failed'} ProblemKind */

/** @type {Map<string, {kind: ProblemKind, userId: string, userTag: string, channelId: string, at: number}[]>} */
const problems = new Map();

/**
 * Remember a ban that failed.
 *
 * @param {string} guildId
 * @param {{kind: ProblemKind, userId: string, userTag: string, channelId: string}} problem
 */
function recordProblem(guildId, problem) {
    const list = problems.get(guildId) ?? [];
    list.unshift({ ...problem, at: Date.now() });
    problems.set(guildId, list.slice(0, MAX_PER_GUILD));
}

/**
 * Recent problems of a server, newest first.
 *
 * @param {string} guildId
 * @returns {{kind: ProblemKind, userId: string, userTag: string, channelId: string, at: string}[]}
 */
function getProblems(guildId) {
    const cutoff = Date.now() - MAX_AGE_MS;
    const list = (problems.get(guildId) ?? []).filter(problem => problem.at >= cutoff);
    if (list.length === 0) problems.delete(guildId);
    else problems.set(guildId, list);
    return list.map(problem => ({ ...problem, at: new Date(problem.at).toISOString() }));
}

/** Forget a server's problems (once it is fixed, or when the bot leaves). */
function clearProblems(guildId) {
    problems.delete(guildId);
}

module.exports = { recordProblem, getProblems, clearProblems, MAX_PER_GUILD };
