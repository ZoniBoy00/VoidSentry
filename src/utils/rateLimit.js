/**
 * Fixed-window request counters for the dashboard API.
 *
 * Every request reaches the bot from the website's servers, so limits are kept
 * per Discord user (the X-Discord-User header) plus one shared bucket that caps
 * the total. Counters live in memory and reset each window.
 *
 * @module utils/rateLimit
 */

/**
 * Create a limiter allowing `limit` hits per key in each window.
 *
 * @param {{limit: number, windowMs: number, now?: () => number}} options - Limit, window length and clock
 * @returns {{hit: (key: string) => boolean}} `hit` counts one request and returns false once the key is over the limit
 */
function createRateLimiter({ limit, windowMs, now = Date.now }) {
    let windowStart = now();
    /** @type {Map<string, number>} */
    let counts = new Map();

    return {
        hit(key) {
            const time = now();
            if (time - windowStart >= windowMs) {
                // Dropping the whole map also forgets users who stopped calling.
                windowStart = time;
                counts = new Map();
            }
            const count = (counts.get(key) ?? 0) + 1;
            counts.set(key, count);
            return count <= limit;
        },
    };
}

module.exports = { createRateLimiter };
