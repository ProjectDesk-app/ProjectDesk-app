const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const token = 'a'.repeat(64);
const review = { id: 7, work: { supervisorId: 1, recipientName: 'Student', recipientEmail: 'student@example.org' } };
const viewId = '12345678-1234-1234-1234-123456789abc';
class FeedbackError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
function setup(user = null) {
  const calls = [], rows = new Map();
  const prisma = {
    user: { findUnique: async () => user },
    feedbackReview: { findUnique: async () => review },
    feedbackPageView: {
      createMany: async args => { calls.push(args); for (const row of args.data) rows.set(`${row.reviewId}:${row.viewId}`, row); },
      count: async args => { calls.push(args); return args.where.kind ? 1 : 2; },
      groupBy: async args => { calls.push(args); return [{ reviewId: 7 }]; },
      findMany: async args => { calls.push(args); return []; },
    },
  };
  const mocks = {
    '@/lib/prisma': { prisma },
    'next-auth/next': { getServerSession: async () => user ? { user: { id: user.id } } : null },
    '@/pages/api/auth/[...nextauth]': { authOptions: {} },
    '@/lib/feedback': { FeedbackError, feedbackUser: async () => { if (!user?.emailVerified) throw new FeedbackError('Unauthorised', 401); return user; },
      feedbackFailure: (res, error) => res.status(error.status || 500).json({ error: error.message }) },
  };
  const mod = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync('src/pages/api/feedback/views.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInThisContext('(function(require,module,exports){' + compiled + '\n})')(name => mocks[name], mod, mod.exports);
  async function request(method = 'POST', body = {}, query = {}, origin = new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000').origin) {
    const res = { statusCode: 200, headers: {}, setHeader(k,v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
    await mod.exports.default({ method, body: { token, viewId, source: 'TRACKING', ...body }, query, headers: { origin } }, res);
    return res;
  }
  return { request, calls, rows, prisma };
}
test('anonymous page opens store no identity and retries are idempotent', async () => {
  const s = setup();
  assert.equal((await s.request()).statusCode, 204);
  await s.request();
  assert.equal(s.rows.size, 1);
  assert.equal(s.calls[0].skipDuplicates, true);
  assert.equal(s.calls[0].data[0].kind, 'ANONYMOUS');
  assert.equal(s.calls[0].data[0].recipientName, null);
});
test('only a verified matching account is attributed to the recipient', async () => {
  for (const [email, emailVerified, expected] of [
    ['STUDENT@example.org', true, 'RECIPIENT'], ['student@example.org', null, 'ANONYMOUS'], ['other@example.org', true, 'ANONYMOUS'],
  ]) {
    const s = setup({ id: 2, email, emailVerified });
    await s.request();
    assert.equal(s.calls[0].data[0].kind, expected);
  }
});
test('supervisor opens are excluded and unrelated Hub viewers cannot insert views', async () => {
  const owner = setup({ id: 1, email: 'owner@example.org', emailVerified: true });
  assert.equal((await owner.request()).statusCode, 204);
  assert.equal(owner.calls.length, 0);
  const other = setup({ id: 3, email: 'other@example.org', emailVerified: true });
  assert.equal((await other.request('POST', { source: 'HUB', reviewId: 7 })).statusCode, 404);
  assert.equal(other.calls.length, 0);
});
test('cross-origin and invalid requests never write a log', async () => {
  const s = setup();
  assert.equal((await s.request('POST', {}, {}, 'https://other.example')).statusCode, 403);
  assert.equal((await s.request('POST', { viewId: 'bad' })).statusCode, 400);
  assert.equal((await s.request('POST', { source: 'HUB', reviewId: -1 })).statusCode, 400);
  assert.equal(s.calls.length, 0);
});
test('all log reads and summary counts are restricted to the current supervisor', async () => {
  const s = setup({ id: 8, email: 'supervisor@example.org', emailVerified: true });
  const res = await s.request('GET', {}, { reviewId: '7', cursor: '123' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.total, 2);
  assert.equal(res.body.anonymous, 1);
  for (const call of s.calls) {
    assert.equal(call.where.review.work.supervisorId, 8);
    assert.equal(call.where.reviewId, 7);
  }
  assert.deepEqual(s.calls[3].where.id, { lt: 123 });
  assert.equal(s.calls[3].select.viewId, undefined);
  assert.equal((await setup().request('GET')).statusCode, 401);
});
test('missing tracking links cannot create views', async () => {
  const s = setup();
  s.prisma.feedbackReview.findUnique = async () => null;
  assert.equal((await s.request()).statusCode, 404);
  assert.equal(s.calls.length, 0);
});

test('browser logging waits for visibility and ignores automatic refreshes', () => {
  const requests = [], listeners = new Map(), sent = { current: new Set() };
  let effect, cleanup;
  const document = { visibilityState: 'hidden', addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const mod = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync('src/components/feedback/useFeedbackView.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext('(function(require,module,exports){' + compiled + '\n})', {
    document, crypto: { randomUUID: () => viewId }, fetch: (url, options) => { requests.push(JSON.parse(options.body)); return Promise.resolve(); },
  })(() => ({ useRef: () => sent, useEffect: fn => { effect = fn; } }), mod, mod.exports);
  const render = ready => {
    cleanup?.();
    mod.exports.useFeedbackView([{ source: 'TRACKING', token }], ready);
    cleanup = effect();
  };
  render(false);
  assert.equal(requests.length, 0);
  render(true);
  assert.equal(requests.length, 0);
  document.visibilityState = 'visible';
  listeners.get('visibilitychange')();
  assert.equal(requests.length, 1);
  render(true); // SWR data revalidation or a normal component rerender.
  listeners.get('visibilitychange')();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].viewId, viewId);
});
