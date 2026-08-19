const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeEmbedText } = require('../src/utils/helpers');
const stats = require('../src/utils/stats');

test('sanitizes embed formatting and mentions', () => {
  const result = sanitizeEmbedText('hello @everyone ```secret```');
  assert.equal(result.includes('`'), false);
  assert.equal(result.includes('@everyone'), false);
  assert.ok(result.includes('@\u200b'));
});

test('enforces embed text length', () => {
  assert.equal(sanitizeEmbedText('x'.repeat(2000), 100).length, 100);
});

test('tracks bans with bounded recent history', () => {
  stats.start();
  for (let i = 0; i < 55; i += 1) stats.recordBan(String(i), `user-${i}`, 'channel');
  const summary = stats.getSummary();
  assert.equal(summary.totalBans, 55);
  assert.equal(summary.recentBans.length, 10);
  assert.match(summary.uptime, /s$/);
});
