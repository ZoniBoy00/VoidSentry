const test = require('node:test');
const assert = require('node:assert/strict');

const { createRateLimiter } = require('../src/utils/rateLimit');

test('allows up to the limit per key and window, then refuses', () => {
  let time = 0;
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => time });
  assert.equal(limiter.hit('a'), true);
  assert.equal(limiter.hit('a'), true);
  assert.equal(limiter.hit('a'), false);
  assert.equal(limiter.hit('b'), true, 'keys are counted separately');
});

test('a new window starts with fresh counters', () => {
  let time = 0;
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => time });
  assert.equal(limiter.hit('a'), true);
  assert.equal(limiter.hit('a'), false);
  time = 1000;
  assert.equal(limiter.hit('a'), true);
});
