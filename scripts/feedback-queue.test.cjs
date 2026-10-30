const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative), module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInThisContext('(function(require,module,exports){' + source + '\n})', { filename })(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === '@/lib/prisma') return { prisma: {} };
    if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts', mocks);
    return require(name);
  }, module, module.exports);
  return module.exports;
}
const { orderFeedbackQueue, feedbackQueueMap } = load('src/lib/feedbackQueue.ts');
const row = (id, receivedDate, overrides = {}) => ({ id, receivedDate, createdAt: new Date('2026-10-30T10:00:00Z'), queuePosition: null, status: 'RECEIVED', ...overrides });

test('default queue uses receipt date, entry time, then id; excludes terminal reviews', () => {
  const rows = [row(3, '2026-10-02'), row(2, '2026-10-01'), row(1, '2026-10-01'), row(4, '2026-10-01', { createdAt: new Date('2026-10-29T10:00:00Z') }), row(5, '2026-09-01', { status: 'COMPLETED' }), row(6, '2026-09-01', { status: 'CANCELLED' })];
  assert.deepEqual(orderFeedbackQueue(rows).map(r => r.id), [4, 1, 2, 3]);
  assert.equal(rows[0].id, 3, 'input is not mutated');
});
test('manual order takes precedence and new unranked arrivals follow in receipt order', () => {
  assert.deepEqual(orderFeedbackQueue([row(1, '2026-10-01', { queuePosition: 2 }), row(2, '2026-10-02', { queuePosition: 1 }), row(3, '2026-10-01'), row(4, '2026-10-03')]).map(r => r.id), [2, 1, 3, 4]);
});
test('queue aggregates all outstanding review stages and separates supervisor totals', async () => {
  let query;
  const rows = [row(1, '2026-10-01', { work: { supervisorId: 10 } }), row(2, '2026-10-02', { work: { supervisorId: 10 } }), row(3, '2026-10-03', { work: { supervisorId: 20 } })];
  const result = await feedbackQueueMap([10, 20, 10], { feedbackReview: { findMany: async input => { query = input; return rows; } } });
  assert.deepEqual(result.get(2), { queuePosition: 2, queueTotal: 2, queueAhead: 1 });
  assert.deepEqual(result.get(3), { queuePosition: 1, queueTotal: 1, queueAhead: 0 });
  assert.deepEqual(query.where.work.supervisorId.in, [10, 20]);
  assert.deepEqual(query.where.status.notIn, ['COMPLETED', 'CANCELLED']);
  assert.equal(JSON.stringify(query.select).includes('recipient'), false);
});

class FeedbackError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
function endpointFixture({ denied = false, conflict = false } = {}) {
  const active = [row(1, '2026-10-01'), row(2, '2026-10-02'), row(3, '2026-10-03')], writes = [], events = [];
  const tx = { feedbackReview: {
    findMany: async query => { assert.equal(query.where.work.supervisorId, 10); assert.deepEqual(query.where.status.notIn, ['COMPLETED', 'CANCELLED']); return active; },
    update: async ({ where, data }) => { writes.push({ id: where.id, ...data }); },
    updateMany: async ({ where, data }) => { assert.equal(where.work.supervisorId, 10); writes.push({ ids: where.id.in, ...data }); },
  }, feedbackEvent: { create: async ({ data }) => events.push(data), createMany: async ({ data }) => events.push(...data) } };
  const handler = load('src/pages/api/feedback/queue.ts', {
    '@/lib/prisma': { prisma: { $transaction: async (callback, options) => { assert.equal(options.isolationLevel, 'Serializable'); if (conflict) throw Object.assign(new Error('conflict'), { code: 'P2034' }); return callback(tx); } } },
    '@/lib/feedback': { FeedbackError, feedbackUser: async (_req, _res, manage) => { assert.equal(manage, true); if (denied) throw new FeedbackError('Forbidden', 403); return { id: 10 }; }, feedbackFailure: (res, error) => res.status(error.code === 'P2034' ? 409 : error.status || 500).json({ error: error.message }) },
  }).default;
  return { active, writes, events, invoke: async (body, method = 'POST') => { let status = 200, result; const response = { setHeader() {}, status(value) { status = value; return this; }, json(value) { result = value; return this; } }; await handler({ body, method }, response); return { status, result }; } };
}
test('moving a review writes unique contiguous ranks, records only a generic event', async () => {
  const fixture = endpointFixture(), response = await fixture.invoke({ reviewId: 3, position: 1 });
  assert.equal(response.status, 200);
  assert.deepEqual(fixture.writes, [{ id: 3, queuePosition: 1 }, { id: 1, queuePosition: 2 }, { id: 2, queuePosition: 3 }]);
  assert.deepEqual(fixture.events, [{ reviewId: 3, type: 'QUEUE_CHANGED', message: 'Queue position adjusted by supervisor.' }]);
});
test('queue moves reject unrelated, terminal, fractional and out-of-range selections without writes', async () => {
  for (const [body, expected] of [[{ reviewId: 99, position: 1 }, 404], [{ reviewId: 1, position: 4 }, 400], [{ reviewId: 1, position: 1.5 }, 400], [{ reviewId: 1, position: 0 }, 400]]) {
    const fixture = endpointFixture(); assert.equal((await fixture.invoke(body)).status, expected); assert.equal(fixture.writes.length, 0);
  }
});
test('queue endpoint requires management access and handles concurrent changes', async () => {
  assert.equal((await endpointFixture({ denied: true }).invoke({ reviewId: 1, position: 2 })).status, 403);
  assert.equal((await endpointFixture({ conflict: true }).invoke({ reviewId: 1, position: 2 })).status, 409);
  assert.equal((await endpointFixture().invoke({}, 'GET')).status, 405);
});
test('reset clears owner active ranks and leaves unranked or other supervisor reviews untouched', async () => {
  const fixture = endpointFixture(); fixture.active[0].queuePosition = 3; fixture.active[1].queuePosition = 1;
  assert.equal((await fixture.invoke({ reset: true })).status, 200);
  assert.deepEqual(fixture.writes, [{ ids: [1, 2], queuePosition: null }]);
  assert.equal(fixture.events.length, 2);
  assert.equal((await fixture.invoke({ reset: true, position: 2 })).status, 400);
});
test('moving to the current position does not accidentally enable manual ordering', async () => {
  const fixture = endpointFixture(); assert.equal((await fixture.invoke({ reviewId: 1, position: 1 })).status, 200);
  assert.equal(fixture.writes.length, 0); assert.equal(fixture.events.length, 0);
});
