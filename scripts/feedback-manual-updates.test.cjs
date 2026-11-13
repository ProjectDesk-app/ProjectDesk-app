const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function setup({ owner = true, entitled = true, email = 'student@example.org', failEmail = false } = {}) {
  const events = [], emails = [];
  const review = { id: 7, status: 'FULL_REVIEW', trackingToken: 'protected-token', version: 2,
    work: { recipientEmail: email, recipientName: 'Alex', title: 'Draft', supervisor: { name: 'Brad' } } };
  class FeedbackError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
  const mocks = {
    '@/lib/prisma': { prisma: { feedbackEvent: { create: async args => events.push(args.data) } } },
    '@/lib/feedback': { FeedbackError,
      feedbackUser: async (_req, _res, manage) => { assert.equal(manage, true); if (!entitled) throw new FeedbackError('Access denied.', 403); return {}; },
      getReview: async () => review, owns: () => owner,
      text: (value, _label, max) => { if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new FeedbackError('Invalid text'); return value.trim(); },
      trackLink: token => `https://example.org/feedback/track/${token}`,
      feedbackFailure: (res, error) => res.status(error.status || 500).json({ error: error.message }),
    },
    '@/lib/emailTemplates': { sendTemplatedEmail: async (...args) => { emails.push(args); if (failEmail) throw new Error('Provider failed'); } },
  };
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync('src/pages/api/feedback/[id]/updates.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInThisContext('(function(require,module,exports){' + source + '\n})')(name => mocks[name], mod, mod.exports);
  async function request(body = {}, method = 'POST') {
    const res = { code: 200, headers: {}, setHeader(k,v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() {} };
    await mod.exports.default({ method, query: { id: '7' }, body: { title: '  Progress update  ', detail: 'Methods checked.\nResults are next.', ...body } }, res);
    return res;
  }
  return { events, emails, review, request };
}
test('manual updates save their title, details and current stage without email by default', async () => {
  const s = setup();
  assert.equal((await s.request()).code, 201);
  assert.equal(s.events[0].reviewId, 7);
  assert.equal(s.events[0].type, 'MANUAL_UPDATE');
  assert.deepEqual(JSON.parse(s.events[0].message), { title: 'Progress update', detail: 'Methods checked.\nResults are next.', stage: 'FULL_REVIEW' });
  assert.equal(s.review.status, 'FULL_REVIEW');
  assert.equal(s.emails.length, 0);
});
test('student notifications require explicit opt-in and use the manual update template', async () => {
  const s = setup();
  assert.equal((await s.request({ notifyRecipient: false })).code, 201);
  assert.equal(s.emails.length, 0);
  assert.equal((await s.request({ notifyRecipient: true })).code, 201);
  assert.equal(s.emails.length, 1);
  assert.equal(s.emails[0][0], 'student@example.org');
  assert.equal(s.emails[0][1], 'feedback_manual_update');
  assert.equal(s.emails[0][2].updateTitle, 'Progress update');
  assert.match(s.emails[0][2].actionUrl, /protected-token$/);
});
test('unauthorised users and inactive supervisors cannot write updates', async () => {
  for (const options of [{ owner: false }, { entitled: false }]) {
    const s = setup(options);
    assert.equal((await s.request()).code, options.owner === false ? 404 : 403);
    assert.equal(s.events.length, 0);
    assert.equal(s.emails.length, 0);
  }
});
test('private reviews accept updates but reject student notification requests', async () => {
  const s = setup({ email: null });
  assert.equal((await s.request()).code, 201);
  assert.equal((await s.request({ notifyRecipient: true })).code, 400);
  assert.equal(s.events.length, 1);
  assert.equal(s.emails.length, 0);
});
test('invalid update content and notification preferences never write events', async () => {
  const s = setup();
  for (const body of [{ title: ' ' }, { detail: '' }, { title: 'a'.repeat(201) }, { detail: 'a'.repeat(5001) }, { notifyRecipient: 'true' }]) {
    assert.equal((await s.request(body)).code, 400);
  }
  assert.equal(s.events.length, 0);
  assert.equal((await s.request({}, 'GET')).code, 405);
});
test('an email failure leaves the saved update intact and returns a warning', async () => {
  const s = setup({ failEmail: true });
  const res = await s.request({ notifyRecipient: true });
  assert.equal(res.code, 201);
  assert.match(res.body.warning, /Update saved/);
  assert.equal(s.events.length, 1);
});
