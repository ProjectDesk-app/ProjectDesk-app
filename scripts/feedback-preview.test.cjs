const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function setup({ owner = true, entitled = true, email = 'student@example.org' } = {}) {
  const queries = [], projections = [], queues = [];
  const selected = { id: 7, work: { supervisorId: 1, recipientName: 'Alex', recipientEmail: email } };
  const records = [selected, { ...selected, id: 8 }];
  class FeedbackError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
  const mocks = {
    '@/lib/prisma': { prisma: { feedbackReview: { findMany: async args => { queries.push(args); return records; } } } },
    '@/lib/feedbackQueue': { feedbackQueueMap: async ids => { queues.push(ids); return new Map([[7, { queuePosition: 2, queueTotal: 9, queueAhead: 1 }]]); } },
    '@/lib/feedback': { FeedbackError, reviewInclude: {},
      feedbackUser: async (_req, _res, manage) => { assert.equal(manage, true); if (!entitled) throw new FeedbackError('Access denied.', 403); return { id: 1, email: 'supervisor@example.org' }; },
      getReview: async () => selected, owns: () => owner,
      serializeReview: async (review, user, queue) => { projections.push({ user, queue }); return { id: review.id, isOwner: user.id === review.work.supervisorId, ...queue }; },
      feedbackFailure: (res, error) => res.status(error.status || 500).json({ error: error.message }),
    },
  };
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync('src/pages/api/feedback/[id]/preview.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInThisContext('(function(require,module,exports){' + source + '\n})')(name => mocks[name], mod, mod.exports);
  async function request(method = 'GET') {
    const res = { code: 200, headers: {}, setHeader(k,v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() {} };
    await mod.exports.default({ method, query: { id: '7' } }, res);
    return res;
  }
  return { request, queries, projections, queues };
}
test('preview queries only the current supervisor’s shared reviews for the selected recipient', async () => {
  const s = setup();
  const res = await s.request();
  assert.equal(res.code, 200);
  assert.deepEqual(s.queries[0].where, { work: { supervisorId: 1, recipientEmail: { equals: 'student@example.org', mode: 'insensitive' } } });
  assert.deepEqual(s.queues, [[1]]);
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
  assert.equal(res.body.canManage, false);
  assert.equal(res.body.preview.recipientName, 'Alex');
  assert.equal(res.body.reviews[0].queueTotal, 9);
  for (const { user } of s.projections) {
    assert.deepEqual(user, { id: 0, email: 'student@example.org' });
  }
  assert.equal(res.body.reviews.every(r => r.isOwner === false), true);
});
test('recipients, unrelated supervisors and inactive accounts cannot preview reviews', async () => {
  for (const options of [{ owner: false }, { entitled: false }]) {
    const s = setup(options);
    assert.equal((await s.request()).code, options.owner === false ? 404 : 403);
    assert.equal(s.queries.length, 0);
    assert.equal(s.projections.length, 0);
  }
});
test('private reviews cannot be used to launch a student preview', async () => {
  const s = setup({ email: null });
  assert.equal((await s.request()).code, 404);
  assert.equal(s.queries.length, 0);
});
test('preview endpoint accepts no mutations', async () => {
  const s = setup();
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    const res = await s.request(method);
    assert.equal(res.code, 405);
    assert.equal(res.headers.Allow, 'GET');
  }
  assert.equal(s.queries.length, 0);
});

test('shared Hub renders student controls read-only in preview and suppresses view logging', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  function load(file, mocks) {
    const mod = { exports: {} };
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    vm.runInThisContext('(function(require,module,exports){' + source + '\n})')(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), mod, mod.exports);
    return mod.exports;
  }
  const shared = load('src/components/feedback/shared.tsx', {});
  const mobileCard = load('src/components/feedback/MobileReviewCard.tsx', { './shared': shared });
  const review = { id: 7, workId: 4, title: 'Draft', recipientName: 'Alex', recipientEmail: 'alex@example.org',
    workType: 'Ethics', version: 1, status: 'RECEIVED', isOwner: false, overdue: true, canRequestUpdate: true,
    receivedDate: '2026-11-01', estimateStart: '2026-11-03', estimateEnd: '2026-11-04',
    queuePosition: 2, queueTotal: 4, queueAhead: 1, supervisorName: 'Brad', history: [] };
  for (const preview of [true, false]) {
    const keys = [], logging = [];
    const data = { reviews: [review], canManage: false, ...(preview ? { preview: { recipientName: 'Alex' } } : {}) };
    const page = load('src/pages/feedback/index.tsx', {
      'next-auth/react': { useSession: () => ({ data: { user: { id: 1 } }, status: 'authenticated' }) },
      'next/link': { default: 'a' },
      swr: { default: key => { keys.push(key); return key ? { data, mutate: () => {} } : {}; } },
      'lucide-react': { ClipboardCheck: () => null, Plus: () => null, Settings: () => null, Search: () => null },
      'react-hot-toast': { toast: {} },
      '@/components/Layout': { default: ({ children }) => React.createElement('main', null, children) },
      '@/components/feedback/ReviewForm': { default: () => null },
      '@/components/feedback/ReviewDetails': { default: () => null },
      '@/components/feedback/MobileReviewCard': mobileCard,
      '@/components/feedback/Settings': { default: () => null },
      '@/components/feedback/UsageLog': { default: () => React.createElement('span', null, 'PRIVATE USAGE LOG') },
      '@/components/feedback/useFeedbackView': { useFeedbackView: (_targets, ready) => logging.push(ready) },
      '@/components/feedback/shared': shared,
    }).default;
    const html = renderToStaticMarkup(React.createElement(page, preview ? { previewReviewId: '7' } : {}));
    assert.equal(keys[0], preview ? '/api/feedback/7/preview' : '/api/feedback');
    assert.equal(logging[0], !preview);
    assert.equal(html.includes('Preview as student: Alex'), preview);
    assert.equal(html.includes('PRIVATE USAGE LOG'), false);
    const reminderButtons = [...html.matchAll(/<button\b([^>]*)>Request update<\/button>/g)];
    assert.equal(reminderButtons.length, 2); // Mobile and desktop share the same data.
    for (const button of reminderButtons) assert.equal(/(?:^|\s)disabled(?:=|\s|$)/.test(button[1]), preview);
  }
});
