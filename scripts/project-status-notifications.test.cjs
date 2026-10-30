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
const calculator = load('src/lib/projectStatus.ts');
const dates = load('src/lib/feedbackDates.ts');
const now = new Date('2026-10-30T01:00:00Z');
const task = (id, status = 'TODO', dueDate = '2026-10-27T12:00:00Z') => ({ id, title: 'Task ' + id, status, dueDate });
test('all completion spellings are excluded from every overdue and end-date rule', () => {
  for (const status of ['COMPLETE', 'DONE', 'Completed', 'complete', 'done']) {
    assert.equal(calculator.isCompletedTask(status), true);
    const result = calculator.calculateProjectStatus({ endDate: '2026-10-20', tasks: [task(1, status), task(2, 'TODO', '2026-11-01')] }, now);
    assert.equal(result.status, 'Danger');
    assert.deepEqual(result.affectedTasks.map(task => task.id), [2]);
    assert.equal(result.overdueTasks, 0);
    assert.equal(calculator.calculateProjectStatus({ tasks: [task(1, status)] }, now).status, 'Completed');
  }
});
test('status rules retain not-started, 24-hour grace, two-task risk and danger precedence', () => {
  assert.equal(calculator.calculateProjectStatus({ tasks: [] }, now).status, 'Not Started');
  assert.equal(calculator.calculateProjectStatus({ tasks: [task(1, 'TODO', '2026-10-30T00:00:00Z')] }, now).status, 'On Track');
  assert.equal(calculator.calculateProjectStatus({ tasks: [task(1)] }, now).status, 'Behind Schedule');
  const risk = calculator.calculateProjectStatus({ tasks: [task(1), task(2)] }, now);
  assert.equal(risk.status, 'At Risk'); assert.match(risk.reason, /2 unfinished tasks/);
  assert.equal(calculator.calculateProjectStatus({ endDate: '2026-10-26', tasks: [task(1), task(2)] }, now).status, 'Danger');
  assert.equal(calculator.calculateProjectStatus({ endDate: '2026-10-31', tasks: [{ id: 1, status: 'TODO', startDate: '2026-10-30', duration: 3 }] }, now).status, 'Danger');
});
function engineFixture(project, changed = 1) {
  const events = [], dispatches = [], updates = [];
  const tx = { project: { findUnique: async () => project, updateMany: async args => { updates.push(args); return { count: changed }; } } };
  const engine = load('src/lib/updateProjectStatus.ts', {
    '@/lib/prisma': { prisma: { $transaction: async callback => callback(tx) } },
    '@/lib/projectStatus': calculator,
    '@/lib/activityNotifications': { enqueueActivity: async (input, client) => { assert.equal(client, tx); events.push(input); return [1]; }, dispatchActivity: async ids => dispatches.push(ids) },
  });
  return { ...engine, events, dispatches, updates };
}
const project = { id: 1, supervisorId: 9, title: 'Research', status: 'On Track', updatedAt: new Date('2026-10-29T09:00:00Z'), tasks: [task(1)], students: [{ id: 2 }], collaborators: [{ id: 3 }], members: [{ userId: 4 }], isCompleted: false, archived: false };
test('a changed adverse status atomically enqueues an explained alert including supervisor and project members', async () => {
  const engine = engineFixture(project);
  const result = await engine.updateProjectStatus(1, now);
  assert.equal(result.status, 'Behind Schedule');
  assert.equal(engine.events.length, 1);
  assert.deepEqual(engine.events[0].recipientIds, [9, 2, 3, 4]);
  assert.equal(engine.events[0].suppressActor, false);
  assert.match(engine.events[0].message, /more than 24 hours overdue/);
  assert.match(engine.events[0].message, /Task 1/);
  assert.equal(engine.updates[0].where.status, 'On Track');
  assert.deepEqual(engine.dispatches, [[1]]);
});
test('unchanged, recovered, archived, completed and lost-CAS calculations send no alerts', async () => {
  for (const [value, changed] of [[{ ...project, status: 'Behind Schedule' }, 1], [{ ...project, status: 'At Risk', tasks: [task(1, 'TODO', '2026-11-05')] }, 1], [{ ...project, archived: true }, 1], [{ ...project, isCompleted: true }, 1], [project, 0]]) {
    const engine = engineFixture(value, changed);
    await engine.updateProjectStatus(1, now);
    assert.equal(engine.events.length, 0);
  }
});
const response = () => ({ code: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
async function withClock(instant, action) {
  const DateOriginal = global.Date;
  global.Date = class extends DateOriginal { constructor(...args) { super(...(args.length ? args : [instant])); } static now() { return DateOriginal.parse(instant); } };
  try { await action(); } finally { global.Date = DateOriginal; }
}
function cronFixture({ holiday = false, claimCount = 1, statusFailure = false } = {}) {
  let processed = 0, digests = 0;
  const writes = [];
  const handler = load('src/pages/api/cron/project-notifications.ts', {
    '@/lib/prisma': { prisma: { scheduledJobRun: { upsert: async () => ({}), updateMany: async args => { writes.push(args); return { count: args.data.claimedAt ? claimCount : 1 }; } }, project: { findMany: async () => [{ id: 1 }, { id: 2 }] } } },
    '@/lib/updateProjectStatus': { updateProjectStatus: async () => { processed++; if (statusFailure) throw Error('DB unavailable'); } },
    '@/lib/activityNotifications': { flushActivityDigest: async () => { digests++; return { sent: 1, failed: 0 }; } },
    '@/lib/feedbackDates': dates,
    '@/lib/feedbackHolidays': { feedbackHolidays: async day => new Set(holiday ? [day] : []) },
  }).default;
  return { handler, writes, processed: () => processed, digests: () => digests };
}
const request = (job = 'status', authorization = 'Bearer test-secret') => ({ method: 'POST', query: { job }, headers: { authorization } });
test('scheduled jobs authenticate and enforce UK time, holidays, weekends and completed-run claims', async () => {
  const old = process.env.CRON_SECRET; process.env.CRON_SECRET = 'test-secret';
  try {
    let fixture = cronFixture(), res = response(); await fixture.handler(request('status', 'wrong'), res); assert.equal(res.code, 401);
    for (const instant of ['2026-10-30T09:00:00Z', '2026-10-31T01:00:00Z']) await withClock(instant, async () => { fixture = cronFixture(); res = response(); await fixture.handler(request(), res); assert.equal(fixture.processed(), 0); assert.ok(res.body.skipped); });
    await withClock('2026-10-30T01:00:00Z', async () => {
      for (const options of [{ holiday: true }, { claimCount: 0 }]) { fixture = cronFixture(options); res = response(); await fixture.handler(request(), res); assert.equal(fixture.processed(), 0); assert.ok(res.body.skipped); }
    });
  } finally { if (old === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = old; }
});
test('1am status recalculation follows UK daylight saving and successful batches are marked complete', async () => {
  const old = process.env.CRON_SECRET; process.env.CRON_SECRET = 'test-secret';
  try {
    for (const instant of ['2026-10-30T01:00:00Z', '2026-06-02T00:00:00Z']) await withClock(instant, async () => {
      const fixture = cronFixture(), res = response(); await fixture.handler(request(), res);
      assert.equal(res.code, 200); assert.equal(fixture.processed(), 2); assert.equal(fixture.digests(), 0);
      assert.ok(fixture.writes.some(write => write.data.completedAt));
    });
    await withClock('2026-10-30T09:00:00Z', async () => { const fixture = cronFixture(), res = response(); await fixture.handler(request('digest'), res); assert.equal(fixture.digests(), 1); assert.equal(fixture.processed(), 0); });
  } finally { if (old === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = old; }
});
test('partial scheduled status failure releases its claim for safe retry', async () => {
  const old = process.env.CRON_SECRET; process.env.CRON_SECRET = 'test-secret';
  const originalError = console.error; console.error = () => {};
  try { await withClock('2026-10-30T01:00:00Z', async () => { const fixture = cronFixture({ statusFailure: true }), res = response(); await fixture.handler(request(), res); assert.equal(res.code, 503); assert.ok(fixture.writes.some(write => write.data.claimedAt === null)); }); }
  finally { console.error = originalError; if (old === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = old; }
});
