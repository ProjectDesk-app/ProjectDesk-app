const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInThisContext('(function(require,module,exports){' + source + '\n})', { filename: file })(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    return require(name);
  }, module, module.exports);
  return module.exports;
}
const info = { queuePosition: 4, queueTotal: 12, queueAhead: 3 };
const record = { id: 8, status: 'RECEIVED', work: { supervisorId: 6, title: 'Own work', supervisor: { name: 'Supervisor' } } };
const response = () => ({ code: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; }, end() { return this; } });
test('public tracking gets queue statistics for the owning supervisor and returns only the public projection', async () => {
  let scopes;
  const handler = load('src/pages/api/feedback/track/[token].ts', {
    '@/lib/prisma': { prisma: { feedbackReview: { findUnique: async () => record } } },
    '@/lib/feedbackQueue': { feedbackQueueMap: async ids => { scopes = ids; return new Map([[8, info]]); } },
    '@/lib/feedback': { publicReview: (review, queue) => ({ title: review.work.title, ...queue }), reviewInclude: {}, feedbackFailure: () => assert.fail('unexpected failure') },
  }).default;
  const res = response();
  await handler({ method: 'GET', query: { token: 'a'.repeat(64) } }, res);
  assert.deepEqual(scopes, [6]);
  assert.deepEqual(res.body, { review: { title: 'Own work', ...info } });
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
  assert.equal(JSON.stringify(res.body).includes('supervisorId'), false);
});
test('review list batches queue aggregates across matching supervisors and supplies each review its own position', async () => {
  let scopes;
  const records = [record, { ...record, id: 9, work: { ...record.work, supervisorId: 7 } }, { ...record, id: 10 }];
  const handler = load('src/pages/api/feedback/index.ts', {
    '@/lib/prisma': { prisma: { feedbackReview: { findMany: async () => records } } },
    '@/lib/blockedEmails': {}, '@/lib/feedbackDates': {},
    '@/lib/feedbackQueue': { feedbackQueueMap: async ids => { scopes = ids; return new Map([[8, info], [9, { queuePosition: 1, queueTotal: 2, queueAhead: 0 }]]); } },
    '@/lib/feedback': { feedbackUser: async () => ({ id: 55, email: 'recipient@example.org' }), canManageFeedback: () => false, serializeReview: async (review, _user, queue) => ({ id: review.id, ...(queue || { queuePosition: null }) }), reviewInclude: {}, feedbackFailure: () => assert.fail('unexpected failure') },
  }).default;
  const res = response();
  await handler({ method: 'GET' }, res);
  assert.deepEqual(scopes, [6, 7]);
  assert.equal(res.body.reviews[0].queuePosition, 4);
  assert.equal(res.body.reviews[1].queuePosition, 1);
  assert.equal(res.body.reviews[2].queuePosition, null);
  assert.equal(res.body.canManage, false);
});

test('permanent deletion removes history and review atomically, cleans up empty work, and sends no mail', async () => {
  const calls = [];
  const handler = deleteHandler({ calls });
  const res = response();
  await handler({ method: 'DELETE', query: { id: '8' } }, res);
  assert.equal(res.code, 204);
  assert.deepEqual(calls, [
    ['events', { where: { reviewId: 8 } }],
    ['review', { where: { id: 8 } }],
    ['work', { where: { id: 12, reviews: { none: {} } } }],
  ]);
});
for (const access of ['recipient', 'unrelated', 'expired']) {
  test(`permanent deletion rejects ${access} access before any database mutation`, async () => {
    const calls = [];
    const res = response();
    await deleteHandler({ calls, access })({ method: 'DELETE', query: { id: '8' } }, res);
    assert.equal(res.code, access === 'unrelated' ? 404 : 403);
    assert.deepEqual(calls, []);
  });
}
function deleteHandler({ calls, access = 'owner' }) {
  class FeedbackError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
  return load('src/pages/api/feedback/[id]/index.ts', {
    '@/lib/prisma': { prisma: { $transaction: async (fn, options) => {
      assert.equal(options.isolationLevel, 'Serializable');
      return fn({
        feedbackEvent: { deleteMany: async args => calls.push(['events', args]) },
        feedbackReview: { delete: async args => calls.push(['review', args]) },
        feedbackWork: { deleteMany: async args => calls.push(['work', args]) },
      });
    } } },
    '@/lib/feedbackQueue': {}, '@/lib/feedbackDates': {}, '@/lib/blockedEmails': {}, '@/lib/feedbackHolidays': {},
    '@/lib/emailTemplates': { sendTemplatedEmail: () => assert.fail('must not send email') },
    '@/lib/feedback': {
      feedbackUser: async (_req, _res, manage) => { assert.equal(manage, true); if (access === 'expired') throw new FeedbackError('Access denied.', 403); return {}; },
      getReview: async () => ({ ...record, workId: 12 }),
      canRead: () => access !== 'unrelated', owns: () => access === 'owner', canManageFeedback: () => true,
      FeedbackError, feedbackFailure: (res, error) => res.status(error.status || 500).json({ error: error.message }),
      sendReviewEmail: () => assert.fail('must not send email'),
    },
  }).default;
}
