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
const record = { id: 8, status: 'RECEIVED', work: { supervisorId: 6, recipientEmail: 'student@example.org', title: 'Own work', supervisor: { name: 'Supervisor' } } };
const response = () => ({ code: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; }, end() { return this; } });
test('title edits update the shared work only, preserve review data and never email', async () => {
  for (const access of ['owner', 'recipient', 'unrelated', 'expired']) {
    const writes = [];
    const review = { ...record, workId: 12, status: 'COMPLETED', trackingToken: 'existing-token', queuePosition: null, history: [{ message: 'Existing history' }] };
    class FeedbackError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
    const handler = load('src/pages/api/feedback/[id]/index.ts', {
      '@/lib/prisma': { prisma: { feedbackWork: { update: async args => { writes.push(args); review.work = { ...review.work, title: args.data.title }; } } } },
      '@/lib/feedbackQueue': { feedbackQueueMap: async () => new Map() },
      '@/lib/feedbackDates': {}, '@/lib/blockedEmails': {}, '@/lib/feedbackHolidays': {},
      '@/lib/emailTemplates': { sendTemplatedEmail: () => assert.fail('must not email') },
      '@/lib/feedback': { FeedbackError,
        feedbackUser: async () => ({}), getReview: async () => review,
        canRead: () => access !== 'unrelated', owns: () => access !== 'recipient', canManageFeedback: () => access !== 'expired',
        text: value => { if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) throw new FeedbackError('Invalid title'); return value.trim(); },
        serializeReview: async r => r, feedbackFailure: (res, error) => res.status(error.status || 500).json({ error: error.message }),
        sendReviewEmail: () => assert.fail('must not retry a pending completion email'),
      },
    }).default;
    const res = response();
    await handler({ method: 'PATCH', query: { id: '8' }, body: { title: '  Revised title  ' } }, res);
    if (access === 'owner') {
      assert.equal(res.code, 200);
      assert.deepEqual(writes, [{ where: { id: 12 }, data: { title: 'Revised title' } }]);
      assert.equal(res.body.review.trackingToken, 'existing-token');
      assert.equal(res.body.review.status, 'COMPLETED');
      assert.deepEqual(res.body.review.history, [{ message: 'Existing history' }]);
      const invalid = response();
      await handler({ method: 'PATCH', query: { id: '8' }, body: { title: ' ' } }, invalid);
      assert.equal(invalid.code, 400);
      assert.equal(writes.length, 1);
    } else {
      assert.equal(res.code, access === 'unrelated' ? 404 : 403);
      assert.equal(writes.length, 0);
    }
  }
});
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

async function patchPause(body, overrides = {}) {
  let record = { id: 8, status: 'FULL_REVIEW', paused: false, receivedDate: '2026-11-02', estimateStart: '2026-11-09', estimateEnd: '2026-11-13', work: { supervisorId: 6, recipientName: 'Alex', recipientEmail: 'alex@example.org', title: 'Draft', supervisor: {} }, ...overrides };
  const emails = [];
  class FeedbackError extends Error {}
  const handler = load('src/pages/api/feedback/[id]/index.ts', {
    '@/lib/prisma': { prisma: { $transaction: async fn => fn({ feedbackReview: { findUniqueOrThrow: async () => record, update: async ({data}) => (record = {...record,...data}) } }) } },
    '@/lib/feedbackQueue': { feedbackQueueMap: async () => new Map() },
    '@/lib/feedbackDates': load('src/lib/feedbackDates.ts', {}),
    '@/lib/blockedEmails': {}, '@/lib/feedbackHolidays': { feedbackHolidays: async () => new Set() },
    '@/lib/emailTemplates': { sendTemplatedEmail: async (...args) => emails.push(args) },
    '@/lib/feedback': {
      feedbackUser: async () => ({}), getReview: async () => record, canRead: () => true, owns: () => true, canManageFeedback: () => true,
      feedbackStatuses: ['FULL_REVIEW','COMPLETED'], terminal: status => ['COMPLETED','CANCELLED'].includes(status),
      serializeReview: async r => r, FeedbackError, feedbackFailure: (res,e) => res.status(400).json({error:e.message}),
      sendReviewEmail: async () => {}, trackLink: () => 'https://example.org/track/token',
    },
  }).default;
  const res = response();
  await handler({method:'PATCH', query:{id:'8'}, body}, res);
  return {res,record,emails};
}
test('pause preserves review stage, extends only latest date by working days and sends date-free mail', async () => {
  const {res,record,emails} = await patchPause({paused:true,pauseDays:2});
  assert.equal(res.code,200);
  assert.equal(record.status,'FULL_REVIEW');
  assert.equal(record.paused,true);
  assert.equal(record.estimateStart,'2026-11-09');
  assert.equal(record.estimateEnd,'2026-11-17');
  assert.equal(emails.length,1);
  assert.equal(emails[0][1],'feedback_paused');
  assert.equal('estimatedRange' in emails[0][2],false);
});
test('resume requires explicit confirmation of both dates, even when completing', async () => {
  for (const body of [{paused:false},{status:'COMPLETED'},{paused:false,estimateConfirmed:true}]) {
    assert.equal((await patchPause(body,{paused:true})).res.code,400);
  }
  const {res,record,emails} = await patchPause({paused:false,estimateConfirmed:true,estimateStart:'2026-11-09',estimateEnd:'2026-11-16'},{paused:true});
  assert.equal(res.code,200);assert.equal(record.paused,false);assert.equal(record.estimateEnd,'2026-11-16');assert.equal(emails.length,0);
});
test('terminal reviews and invalid pause lengths cannot be paused', async () => {
  assert.equal((await patchPause({paused:true},{status:'COMPLETED'})).res.code,400);
  for (const pauseDays of [-1,1.5,731,'2']) assert.equal((await patchPause({paused:true,pauseDays})).res.code,400);
});

test('private reviews can pause, change estimates and complete without student emails', async () => {
  const work = { supervisorId: 6, recipientName: 'Alex', recipientEmail: null, title: 'Assessment', supervisor: {} };
  for (const body of [{ paused: true, pauseDays: 2 }, { estimateEnd: '2026-11-16', notifyRecipient: true }, { status: 'COMPLETED' }]) {
    const { res, emails } = await patchPause(body, { work });
    assert.equal(res.code, 200);
    assert.equal(emails.length, 0);
  }
  for (const body of [{ retryEmail: 'receipt' }, { recipientEmail: 'student@example.org' }]) {
    const { res, emails } = await patchPause(body, { work });
    assert.equal(res.code, 400);
    assert.equal(emails.length, 0);
  }
});

test('private review creation and next versions store no email and never send receipts', async () => {
  class FeedbackError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
  const dates = load('src/lib/feedbackDates.ts', {});
  for (const nextVersion of [false, true]) {
    let work = { id: 12, supervisorId: 6, title: 'Assessment', recipientName: 'Alex', recipientEmail: null, workType: 'Assessment' };
    const tx = {
      feedbackWork: { create: async ({ data }) => (work = { ...work, ...data }), findFirst: async () => work, update: async () => ({ ...work, nextVersion: nextVersion ? 3 : 2 }) },
      feedbackReview: { findMany: async () => [], create: async ({ data }) => ({ ...data, id: 8, work }) },
    };
    const handler = load('src/pages/api/feedback/index.ts', {
      '@/lib/prisma': { prisma: { $transaction: fn => fn(tx) } },
      '@/lib/feedbackDates': dates, '@/lib/blockedEmails': { isEmailBlocked: () => assert.fail('no email should be checked') },
      '@/lib/feedbackQueue': { feedbackQueueMap: async () => new Map([[8, info]]) },
      '@/lib/feedback': { FeedbackError, feedbackUser: async () => ({ id: 6 }),
        text: value => value, sendReviewEmail: () => assert.fail('must not email private reviews'),
        serializeReview: async (review, _user, queue) => ({ ...review, ...queue }),
        feedbackFailure: (res, error) => res.status(error.status || 500).json({ error: error.message }) },
    }).default;
    const res = response();
    await handler({ method: 'POST', body: { privateReview: !nextVersion, recipientEmail: 'ignored@example.org',
      recipientName: 'Alex', title: 'Assessment', workType: 'Assessment', receivedDate: '2026-11-02',
      estimateStart: '2026-11-09', estimateEnd: '2026-11-13', ...(nextVersion ? { workId: 12 } : {}) } }, res);
    assert.equal(res.code, 201);
    assert.equal(res.body.review.work.recipientEmail, null);
    assert.equal(res.body.review.queueTotal, 12);
    assert.equal(res.body.review.version, nextVersion ? 2 : 1);
  }
});

test('private reviews are not accessible through public tracking tokens', async () => {
  const handler = load('src/pages/api/feedback/track/[token].ts', {
    '@/lib/prisma': { prisma: { feedbackReview: { findUnique: async () => ({ ...record, work: { ...record.work, recipientEmail: null } }) } } },
    '@/lib/feedbackQueue': { feedbackQueueMap: () => assert.fail('private review must not be projected') },
    '@/lib/feedback': { reviewInclude: {}, feedbackFailure: () => assert.fail('unexpected failure') },
  }).default;
  const res = response();
  await handler({ method: 'GET', query: { token: 'a'.repeat(64) } }, res);
  assert.equal(res.code, 404);
});
