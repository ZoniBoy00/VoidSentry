const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeEmbedText } = require('../src/utils/helpers');
const { buildMessageEvidence } = require('../src/utils/messageEvidence');
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

test('describes attachment-only messages with file type and size', () => {
  const evidence = buildMessageEvidence({
    content: '',
    attachments: new Map([
      ['1', { name: 'screen.png', contentType: 'image/png', size: 1536 }],
    ]),
    embeds: [],
    stickers: new Map(),
  });

  assert.match(evidence, /No text content/);
  assert.match(evidence, /screen\.png/);
  assert.match(evidence, /image\/png/);
  assert.match(evidence, /1\.5 KiB/);
});

test('describes embeds and stickers without storing linked media', () => {
  const evidence = buildMessageEvidence({
    content: '',
    attachments: new Map(),
    embeds: [{ title: 'Preview title', url: 'https://example.com/path', type: 'rich' }],
    stickers: new Map([['1', { name: 'Wave' }]]),
  });

  assert.match(evidence, /Preview title/);
  assert.match(evidence, /example\.com/);
  assert.match(evidence, /Wave/);
  assert.doesNotMatch(evidence, /https:\/\/example\.com\/path/);
});

test('marks empty messages when Discord provides no media metadata', () => {
  const evidence = buildMessageEvidence({ content: '', attachments: new Map(), embeds: [], stickers: new Map() });
  assert.match(evidence, /No text content/);
  assert.match(evidence, /No attachment, embed, or sticker metadata/);
});
