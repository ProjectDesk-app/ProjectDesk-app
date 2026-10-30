const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInThisContext('(function(require,module,exports){' + source + '\n})', { filename: file })(name => { if (Object.hasOwn(mocks, name)) return mocks[name]; return require(name); }, module, module.exports);
  return module.exports;
}
const dates = load('src/lib/feedbackDates.ts');
test('working days start after receipt and skip weekends and bank holidays', () => {
  const holidays = new Set(['2026-12-25', '2026-12-28']);
  assert.equal(dates.addWorkingDays('2026-12-24', 1, holidays), '2026-12-29');
  assert.equal(dates.addWorkingDays('2026-12-24', 5, holidays), '2027-01-04');
  assert.equal(dates.workingDaysBetween('2026-12-24', '2026-12-29', holidays), 1);
});
test('UK date boundaries respect daylight saving and calendar ranges reject rollover', () => {
  assert.equal(dates.ukToday(new Date('2026-06-01T23:30:00Z')), '2026-06-02');
  assert.equal(dates.ukToday(new Date('2026-12-01T23:30:00Z')), '2026-12-01');
  for (const value of ['2026-02-29', '2026-13-01', '26-01-01', null]) assert.throws(() => dates.calendarDate(value));
  assert.throws(() => dates.validateRange('2026-10-20', '2026-10-19', '2026-10-18'));
});
test('five working-day cooldown crosses holidays and weekends', () => {
  assert.equal(dates.addWorkingDays('2026-12-24', 5, new Set(['2026-12-25', '2026-12-28', '2027-01-01'])), '2027-01-05');
});
test('completion email atomic claim suppresses concurrent sends and later recompletion', async () => {
  let claimed = false, sentAt = null, sends = 0;
  const review = { id: 1, version: 3, trackingToken: 'a'.repeat(64), work: { title: 'Thesis', recipientEmail: 'student@example.test', recipientName: 'Student', supervisor: { name: 'Supervisor' } } };
  const prisma = { feedbackReview: {
    updateMany: async ({ data }) => { if (data.completionEmailClaimedAt === null) { claimed = false; return { count: 1 }; } if (claimed || sentAt) return { count: 0 }; claimed = true; return { count: 1 }; },
    findUnique: async () => review,
    update: async ({ data }) => { sentAt = data.completionEmailSentAt; return review; }
  } };
  const feedback = load('src/lib/feedback.ts', { 'next-auth/next': {}, '@/pages/api/auth/[...nextauth]': {}, '@/lib/prisma': { prisma }, '@/lib/mailer': { sendEmail: async () => { sends++; } }, './feedbackDates': dates, './feedbackHolidays': {} });
  await Promise.all([feedback.sendReviewEmail(1, 'completion'), feedback.sendReviewEmail(1, 'completion')]);
  await feedback.sendReviewEmail(1, 'completion');
  assert.equal(sends, 1);
});
test('failed completion email releases claim for explicit retry', async () => {
  let claimed = false, attempts = 0;
  const review = { id: 1, version: 1, trackingToken: 'a'.repeat(64), work: { title: 'Ethics', recipientEmail: 's@example.test', recipientName: 'S', supervisor: { name: 'Owner' } } };
  const prisma = { feedbackReview: {
    updateMany: async ({ data }) => { if (data.completionEmailClaimedAt === null) { claimed = false; return { count: 1 }; } if (claimed) return { count: 0 }; claimed = true; return { count: 1 }; }, findUnique: async () => review, update: async () => review
  } };
  const feedback = load('src/lib/feedback.ts', { 'next-auth/next': {}, '@/pages/api/auth/[...nextauth]': {}, '@/lib/prisma': { prisma }, '@/lib/mailer': { sendEmail: async () => { if (++attempts === 1) throw new Error('Delivery failed'); } }, './feedbackDates': dates, './feedbackHolidays': {} });
  await assert.rejects(feedback.sendReviewEmail(1, 'completion'));
  await feedback.sendReviewEmail(1, 'completion');
  assert.equal(attempts, 2);
});
test('update requests enforce five working days and reject concurrent claim losers', async () => {
  const today = '2026-10-30';
  let requestDate = '2026-10-29', sends = 0, claimCount = 0;
  const review = { id: 7, status: 'RECEIVED', estimateEnd: '2026-10-20', estimateStart: '2026-10-19', lastRequestDate: requestDate, version: 1, work: { title: 'Draft', recipientName: 'Student', supervisor: { email: 'owner@example.test' } } };
  const error = class extends Error { constructor(message, status = 400) { super(message); this.status = status; } };
  const mocks = {
    '@/lib/prisma': { prisma: { feedbackReview: { updateMany: async () => ({ count: claimCount }) }, feedbackEvent: { create: async () => ({}) } } },
    '@/lib/feedback': { feedbackUser: async () => ({ name: 'Student' }), getReview: async () => review, owns: () => false, canRead: () => true, terminal: () => false, FeedbackError: error, serializeReview: async r => r, feedbackFailure: (res, e) => res.status(e.status || 500).json({ error: e.message }) },
    '@/lib/feedbackDates': { ...dates, ukToday: () => today },
    '@/lib/feedbackHolidays': { feedbackHolidays: async () => new Set() },
    '@/lib/mailer': { sendEmail: async () => { sends++; } }
  };
  const handler = load('src/pages/api/feedback/[id]/request-update.ts', mocks).default;
  function response() { return { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }
  const first = response(); await handler({ method: 'POST', query: { id: '7' } }, first); assert.equal(first.code, 429); assert.equal(sends, 0);
  review.lastRequestDate = null;
  const lost = response(); await handler({ method: 'POST', query: { id: '7' } }, lost); assert.equal(lost.code, 409); assert.equal(sends, 0);
  claimCount = 1;
  const sent = response(); await handler({ method: 'POST', query: { id: '7' } }, sent); assert.equal(sent.code, 200); assert.equal(sends, 1);
});
test('update request is denied to owners/unrelated users, non-overdue and terminal reviews', async () => {
  let owned = false, readable = true, stage = 'RECEIVED', end = '2026-10-30', sends = 0;
  const review = { id: 1, get status() { return stage; }, get estimateEnd() { return end; }, lastRequestDate: null };
  const error = class extends Error { constructor(message, status = 400) { super(message); this.status = status; } };
  const handler = load('src/pages/api/feedback/[id]/request-update.ts', {
    '@/lib/prisma': { prisma: {} },
    '@/lib/feedback': { feedbackUser: async () => ({}), getReview: async () => review, owns: () => owned, canRead: () => readable, terminal: s => ['COMPLETED', 'CANCELLED'].includes(s), FeedbackError: error, feedbackFailure: (res, e) => res.status(e.status || 500).json({ error: e.message }) },
    '@/lib/feedbackDates': { ...dates, ukToday: () => '2026-10-30' }, '@/lib/feedbackHolidays': { feedbackHolidays: async () => new Set() }, '@/lib/mailer': { sendEmail: async () => { sends++; } }
  }).default;
  async function code() { const res = { code: 200, status(c) { this.code = c; return this; }, json() { return this; } }; await handler({ method: 'POST', query: { id: '1' } }, res); return res.code; }
  assert.equal(await code(), 400);
  owned = true; assert.equal(await code(), 404);
  owned = false; readable = false; assert.equal(await code(), 404);
  readable = true; end = '2026-10-20'; stage = 'COMPLETED'; assert.equal(await code(), 400);
  stage = 'CANCELLED'; assert.equal(await code(), 400);
  assert.equal(sends, 0);
});
test('daily summary skips outside UK 9am, skips holidays, and dedupes claims', async () => {
  const originalSecret = process.env.CRON_SECRET; process.env.CRON_SECRET = 'test-secret';
  const OriginalDate = global.Date;
  const fixed = new OriginalDate('2026-10-30T09:00:00Z');
  class FixedDate extends OriginalDate { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed.getTime(); } }
  global.Date = FixedDate;
  let working = false, claim = 0, sends = 0;
  try {
    const handler = load('src/pages/api/feedback/cron.ts', {
      '@/lib/prisma': { prisma: { feedbackSettings: { findMany: async () => [{ userId: 1, user: { email: 'owner@example.test' } }], updateMany: async () => ({ count: claim }) }, feedbackReview: { findMany: async () => [{ version: 1, status: 'RECEIVED', estimateStart: '2026-10-20', estimateEnd: '2026-10-21', work: { recipientName: 'Student', title: 'Draft' } }] } } },
      '@/lib/feedback': { canManageFeedback: () => true }, '@/lib/feedbackDates': { ...dates, isWorkingDay: () => working }, '@/lib/feedbackHolidays': { feedbackHolidays: async () => new Set() }, '@/lib/mailer': { sendEmail: async () => { sends++; } }
    }).default;
    async function run(auth = 'Bearer test-secret') { const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(body) { this.body = body; return this; } }; await handler({ method: 'POST', headers: { authorization: auth } }, res); return res; }
    assert.equal((await run('invalid')).code, 401);
    assert.equal((await run()).body.skipped, 'Not a working day.');
    working = true; assert.equal((await run()).body.sent, 0); assert.equal(sends, 0);
    claim = 1; assert.equal((await run()).body.sent, 1); assert.equal(sends, 1);
    fixed.setUTCHours(10); assert.match((await run()).body.skipped, /Outside/); assert.equal(sends, 1);
  } finally { global.Date = OriginalDate; if (originalSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = originalSecret; }
});
test('public projection excludes recipient identity, email, tokens and private history', () => {
  const feedback = load('src/lib/feedback.ts', { 'next-auth/next': {}, '@/pages/api/auth/[...nextauth]': {}, '@/lib/prisma': {}, '@/lib/mailer': {}, './feedbackDates': dates, './feedbackHolidays': {} });
  const result = feedback.publicReview({ id: 1, version: 2, status: 'RECEIVED', receivedDate: '2026-10-01', estimateStart: '2026-10-02', estimateEnd: '2026-10-08', completedAt: null, cancellationReason: null, trackingToken: 'secret', history: [{ message: 'Private' }], work: { title: 'Ethics', recipientName: 'Student', recipientEmail: 'private@example.test', supervisor: { name: 'Supervisor', email: 'supervisor@example.test' } } });
  const json = JSON.stringify(result);
  for (const secret of ['private@example.test', 'Student', 'secret', 'Private', 'supervisor@example.test']) assert.ok(!json.includes(secret));
  assert.equal(result.title, 'Ethics'); assert.equal(result.version, 2);
});
test('supervisor management eligibility is independent from recipient read access', () => {
  const feedback = load('src/lib/feedback.ts', { 'next-auth/next': {}, '@/pages/api/auth/[...nextauth]': {}, '@/lib/prisma': {}, '@/lib/mailer': {}, './feedbackDates': dates, './feedbackHolidays': {} });
  assert.equal(feedback.canManageFeedback({ role: 'STUDENT', subscriptionType: 'SUBSCRIBED' }), false);
  assert.equal(feedback.canManageFeedback({ role: 'SUPERVISOR', subscriptionType: 'FREE_TRIAL', subscriptionExpiresAt: '2000-01-01' }), false);
  assert.equal(feedback.canManageFeedback({ role: 'SUPERVISOR', subscriptionType: 'CANCELLED' }), false);
  assert.equal(feedback.canManageFeedback({ role: 'SUPERVISOR', subscriptionType: 'ADMIN_APPROVED' }), true);
  assert.equal(feedback.canRead({ work: { supervisorId: 1, recipientEmail: 'student@example.test' } }, { id: 2, email: 'STUDENT@example.test' }), true);
});
test('stored historical turnaround survives unavailable or rolled-off holiday coverage', async () => {
  const feedback = load('src/lib/feedback.ts', { 'next-auth/next': {}, '@/pages/api/auth/[...nextauth]': {}, '@/lib/prisma': {}, '@/lib/mailer': {}, './feedbackDates': dates, './feedbackHolidays': { feedbackHolidays: async () => { throw new Error('Historical calendar unavailable'); } } });
  const result = await feedback.serializeReview({ id: 1, version: 1, status: 'COMPLETED', receivedDate: '2020-01-01', estimateStart: '2020-01-03', estimateEnd: '2020-01-10', completedAt: new Date('2020-01-08'), turnaroundWorkingDays: 5, history: [], work: { supervisorId: 1, title: 'Draft', recipientName: 'Student', recipientEmail: 'student@example.test', supervisor: { name: 'Supervisor' } } });
  assert.equal(result.turnaroundWorkingDays, 5);
});
