/**
 * Ban statistics for the dashboard, computed from ban timestamps.
 *
 * The database only returns timestamps and channel names; the grouping happens
 * here, in UTC, so the result does not depend on the database's time zone.
 *
 * @module utils/banStats
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_CHANNELS = 5;

/**
 * @param {{created_at: Date|string, channel_name: string}[]} rows - Bans from the last `days` days
 * @param {{days?: number, now?: Date, truncated?: boolean}} [options]
 * @returns {{
 *   days: number, last7: number, last30: number, truncated: boolean,
 *   perDay: {date: string, count: number}[], byHour: number[], byWeekday: number[],
 *   channels: {name: string, count: number}[]
 * }}
 */
function summarizeBans(rows, { days = 30, now = new Date(), truncated = false } = {}) {
    const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const firstDay = startOfToday - (days - 1) * DAY_MS;

    const perDay = Array.from({ length: days }, (_, index) => ({
        date: new Date(firstDay + index * DAY_MS).toISOString().slice(0, 10),
        count: 0,
    }));
    const byHour = new Array(24).fill(0);
    const byWeekday = new Array(7).fill(0); // Monday first
    const channels = new Map();
    let last7 = 0;

    for (const row of rows) {
        const at = new Date(row.created_at);
        const time = at.getTime();
        if (Number.isNaN(time) || time < firstDay || time >= startOfToday + DAY_MS) continue;

        const dayIndex = Math.floor((time - firstDay) / DAY_MS);
        perDay[dayIndex].count += 1;
        if (dayIndex >= days - 7) last7 += 1;
        byHour[at.getUTCHours()] += 1;
        byWeekday[(at.getUTCDay() + 6) % 7] += 1;
        channels.set(row.channel_name, (channels.get(row.channel_name) ?? 0) + 1);
    }

    return {
        days,
        last7,
        last30: perDay.reduce((sum, day) => sum + day.count, 0),
        truncated,
        perDay,
        byHour,
        byWeekday,
        channels: [...channels]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
            .slice(0, TOP_CHANNELS),
    };
}

module.exports = { summarizeBans };
