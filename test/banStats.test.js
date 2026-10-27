const test = require('node:test');
const assert = require('node:assert/strict');

const { summarizeBans } = require('../src/utils/banStats');

const now = new Date('2026-10-27T12:00:00Z');

test('bans are grouped by day, hour, weekday and channel in UTC', () => {
    const stats = summarizeBans(
        [
            { created_at: new Date('2026-10-27T01:30:00Z'), channel_name: 'trap' }, // Tuesday
            { created_at: new Date('2026-10-27T01:45:00Z'), channel_name: 'trap' },
            { created_at: new Date('2026-10-20T23:59:00Z'), channel_name: 'bait' }, // 7 days before: outside last7
            { created_at: new Date('2026-10-21T00:00:00Z'), channel_name: 'bait' }, // inside last7
            { created_at: new Date('2026-08-01T00:00:00Z'), channel_name: 'old' }, // outside the window
        ],
        { now }
    );

    assert.equal(stats.perDay.length, 30);
    assert.equal(stats.perDay.at(-1).date, '2026-10-27');
    assert.equal(stats.perDay.at(-1).count, 2);
    assert.equal(stats.last7, 3);
    assert.equal(stats.last30, 4);
    assert.equal(stats.byHour[1], 2);
    assert.equal(stats.byHour[23], 1);
    assert.equal(stats.byWeekday[1], 3); // 27 and 20 October are both Tuesdays
    assert.deepEqual(stats.channels, [{ name: 'bait', count: 2 }, { name: 'trap', count: 2 }]);
});

test('an empty history gives zeroes and carries the truncated flag', () => {
    const stats = summarizeBans([], { now, truncated: true });
    assert.equal(stats.last30, 0);
    assert.equal(stats.truncated, true);
    assert.deepEqual(stats.channels, []);
    assert.equal(stats.byHour.length, 24);
    assert.equal(stats.byWeekday.length, 7);
});
