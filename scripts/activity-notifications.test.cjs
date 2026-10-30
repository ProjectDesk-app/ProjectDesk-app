const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInThisContext('(function(require,module,exports,console){' + source + '\n})', { filename: file })(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    return require(name);
  }, module, module.exports, mocks.__console || console);
  return module.exports;
}
const dates = load('src/lib/feedbackDates.ts');
const input = { eventKey: 'comment:7', category: 'TASK_COMMENT', actorId: 1, recipientIds: [2], projectId: 10, taskId: 20, subject: 'A task comment', message: 'New comment on a task.' };
function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('in' in value) return value.in.includes(row[key]);
      return true;
    }
    if (value instanceof Date) return row[key] instanceof Date && row[key].getTime() === value.getTime();
    return (row[key] ?? null) === value;
  });
}
function harness() {
  const state = { emails: [], notifications: [], entries: [], prefs: new Map(), users: new Map(), projects: new Map(), jobs: new Map(), tasks: [], taskQuery: null, failEmail: false, blocked: new Set() };
  const project = { id: 10, title: 'Project A', supervisorId: 2, archived: false, isCompleted: false, students: [{ id: 1 }, { id: 3 }], collaborators: [], members: [] };
  state.projects.set(10, project);
  for (const id of [1, 2, 3]) state.users.set(id, { id, name: `User ${id}`, email: `user${id}@example.test`, emailVerified: new Date(), feedbackOnly: false });
  const prisma = {
    activityEmail: {
      findUnique: async ({ where }) => where.userId_eventKey ? state.entries.find(entry => entry.userId === where.userId_eventKey.userId && entry.eventKey === where.userId_eventKey.eventKey) || null : state.entries.find(entry => entry.id === where.id) || null,
      create: async ({ data }) => {
        if (state.entries.some(entry => entry.userId === data.userId && entry.eventKey === data.eventKey)) throw Object.assign(new Error('Duplicate event'), { code: 'P2002' });
        const entry = { id: state.entries.length + 1, claimedAt: null, ...data }; state.entries.push(entry); return entry;
      },
      findUniqueOrThrow: async ({ where }) => { const entry = state.entries.find(entry => entry.id === where.id); assert.ok(entry); return { ...entry, user: { ...state.users.get(entry.userId), notificationPreferences: state.prefs.get(entry.userId) || null } }; },
      findMany: async ({ where }) => state.entries.filter(entry => matches(entry, where)).map(entry => ({ ...entry })),
      updateMany: async ({ where, data }) => { let count = 0; for (const entry of state.entries) if (matches(entry, where)) { Object.assign(entry, data); count++; } return { count }; },
      update: async ({ where, data }) => { const entry = state.entries.find(entry => entry.id === where.id); assert.ok(entry); Object.assign(entry, data); return entry; },
    },
    notification: { create: async ({ data }) => { state.notifications.push(data); return data; } },
    notificationPreferences: {
      findUnique: async ({ where }) => state.prefs.get(where.userId) || null,
      upsert: async ({ where, create, update }) => { state.prefs.set(where.userId, { ...(state.prefs.get(where.userId) || create), ...update }); return state.prefs.get(where.userId); },
    },
    user: { findUnique: async ({ where }) => state.users.has(where.id) ? { ...state.users.get(where.id), notificationPreferences: state.prefs.get(where.id) || null } : null },
    project: { findUnique: async ({ where }) => state.projects.get(where.id) || null },
    task: { findFirst: async ({ where }) => state.tasks.find(task => task.id === where.id && task.projectId === where.projectId && (task.assigneeId === where.OR[0].assigneeId || task.assignedUsers.some(user => user.id === where.OR[1].assignedUsers.some.id))) || null, findMany: async ({ where }) => {
      state.taskQuery = where;
      return state.tasks.filter(task => task.dueDate <= where.dueDate.lte && !where.status.notIn.includes(task.status) && !task.project.archived && !task.project.isCompleted);
    } },
    scheduledJobRun: {
      upsert: async ({ where, create }) => { if (!state.jobs.has(where.key)) state.jobs.set(where.key, { claimedAt: null, completedAt: null, ...create }); return state.jobs.get(where.key); },
      updateMany: async ({ where, data }) => { const row = state.jobs.get(where.key); if (!row || !matches(row, where)) return { count: 0 }; Object.assign(row, data); return { count: 1 }; },
      update: async ({ where, data }) => { const row = state.jobs.get(where.key); assert.ok(row); Object.assign(row, data); return row; },
    },
  };
  prisma.$transaction = async callback => callback(prisma);
  const activity = load('src/lib/activityNotifications.ts', {
    __console: { ...console, error() {} },
    '@/lib/prisma': { prisma },
    '@/lib/mailer': { sendEmail: async (to, subject, message) => { if (state.failEmail) throw new Error('Provider unavailable'); state.emails.push({ to, subject, message }); } },
    '@/lib/blockedEmails': { isEmailBlocked: async email => state.blocked.has(email) },
    '@/lib/feedbackDates': dates,
    '@/lib/taskSetSchedule': { deadlineInstant: (day, time) => new Date(`${day}T${time}:00Z`) },
  });
  return { state, prisma, activity, project };
}

test('activity defaults allow immediate comments, flags and risk changes, with in-app-only task changes', () => {
  const { activity } = harness();
  for (const category of ['TASK_COMMENT', 'TASK_FLAG', 'PROJECT_STATUS']) assert.equal(activity.activityDeliveryMode(category, null), 'IMMEDIATE');
  for (const category of ['TASK_ASSIGNED', 'TASK_DEADLINE']) assert.equal(activity.activityDeliveryMode(category, null), 'IN_APP');
  assert.equal(activity.activityDeliveryMode('TASK_COMMENT', { taskComments: 'DAILY' }), 'DAILY');
  assert.equal(activity.activityDeliveryMode('TASK_FLAG', { taskFlags: 'IN_APP' }), 'IN_APP');
});
test('assignments and deadline changes never enqueue email and can disable their in-app alerts', async () => {
  const { activity, state, prisma } = harness();
  for (const category of ['TASK_ASSIGNED', 'TASK_DEADLINE']) {
    assert.deepEqual(await activity.enqueueActivity({ ...input, category, eventKey: category }, prisma), []);
  }
  assert.equal(state.notifications.length, 2);
  assert.ok(state.entries.every(entry => entry.status === 'SKIPPED' && entry.deliveryMode === 'IN_APP'));
  state.prefs.set(2, { taskAssignments: false, taskDeadlineChanges: false });
  for (const category of ['TASK_ASSIGNED', 'TASK_DEADLINE']) await activity.emitActivity({ ...input, category, eventKey: category + ':disabled' });
  assert.equal(state.notifications.length, 2);
  assert.equal(state.emails.length, 0);
});
test('enqueue suppresses the author, duplicate recipients and duplicate source events within its transaction client', async () => {
  const { activity, state, prisma } = harness();
  const ids = await activity.enqueueActivity({ ...input, recipientIds: [1, 2, 2, 0, -1, 1.5] }, prisma);
  assert.deepEqual(ids, [1]);
  assert.deepEqual(await activity.enqueueActivity(input, prisma), []);
  assert.deepEqual(state.notifications.map(entry => entry.recipientId), [2]);
  assert.equal(state.emails.length, 0);
  await activity.enqueueActivity({ ...input, eventKey: 'scheduled-risk', recipientIds: [1], suppressActor: false }, prisma);
  assert.equal(state.notifications[1].recipientId, 1);
});
test('daily delivery records an in-app alert but waits for a digest', async () => {
  const { activity, state } = harness();
  state.prefs.set(2, { taskComments: 'DAILY' });
  await activity.emitActivity(input);
  assert.equal(state.notifications.length, 1);
  assert.equal(state.entries[0].status, 'PENDING');
  assert.equal(state.entries[0].deliveryMode, 'DAILY');
  assert.equal(state.emails.length, 0);
});
test('immediate emails are sent once, link to the task, and re-check current preferences', async () => {
  const { activity, state, prisma } = harness();
  await activity.emitActivity(input);
  await activity.dispatchActivity([1]);
  assert.equal(state.emails.length, 1);
  assert.match(state.emails[0].message, /\/tasks\/20/);
  assert.equal(state.entries[0].status, 'SENT');
  const ids = await activity.enqueueActivity({ ...input, eventKey: 'comment:8' }, prisma);
  state.prefs.set(2, { taskComments: 'IN_APP' });
  await activity.dispatchActivity(ids);
  assert.equal(state.entries[1].status, 'SKIPPED');
  assert.equal(state.emails.length, 1);
});
test('immediate email never reaches unverified, feedback-only, blocked or no-longer-authorised recipients', async () => {
  const cases = [
    h => { h.state.users.get(2).emailVerified = null; },
    h => { h.state.users.get(2).feedbackOnly = true; },
    h => { h.state.blocked.add('user2@example.test'); },
    h => { h.project.archived = true; },
    h => { h.project.isCompleted = true; },
    h => { h.project.supervisorId = 99; },
  ];
  for (const configure of cases) {
    const h = harness(); configure(h);
    await h.activity.emitActivity(input);
    assert.equal(h.state.emails.length, 0);
    assert.equal(h.state.entries[0].status, 'SKIPPED');
  }
});
test('provider failure leaves a successful activity saved and releases the immediate claim for retry', async () => {
  const { activity, state } = harness();
  state.failEmail = true;
  await activity.emitActivity(input);
  assert.equal(state.notifications.length, 1);
  assert.equal(state.entries[0].status, 'PENDING');
  assert.equal(state.entries[0].claimedAt, null);
  state.failEmail = false;
  await activity.dispatchActivity([1]);
  assert.equal(state.emails.length, 1);
});
test('daily deadline digest scopes students to assignments and supervisors to their own projects', async () => {
  const { activity, state, project } = harness();
  const makeTask = (id, title, assignedUsers, extra = {}) => ({ id, title, assignedUsers, project, projectId: 10, assigneeId: null, status: 'TODO', dueDate: new Date('2026-10-31T12:00:00Z'), ...extra });
  state.tasks = [makeTask(20, 'Student one task', [{ id: 1 }]), makeTask(21, 'Student three task', [{ id: 3 }]), makeTask(22, 'Finished task', [{ id: 1 }], { status: 'COMPLETE' }), makeTask(23, 'Archived task', [{ id: 1 }], { project: { ...project, archived: true } }), makeTask(24, 'Completed project task', [{ id: 1 }], { project: { ...project, isCompleted: true } })];
  const now = new Date('2026-10-30T09:00:00Z');
  assert.deepEqual(await activity.flushActivityDigest(now), { sent: 3, failed: 0 });
  const student = state.emails.find(email => email.to === 'user1@example.test');
  const supervisor = state.emails.find(email => email.to === 'user2@example.test');
  assert.match(student.message, /Student one task/);
  assert.doesNotMatch(student.message, /Student three task|Finished task|Archived task|Completed project task/);
  assert.match(supervisor.message, /Student one task/);
  assert.match(supervisor.message, /Student three task/);
  assert.deepEqual(state.taskQuery.status.notIn, ['COMPLETE', 'DONE']);
  assert.deepEqual(state.taskQuery.project, { archived: false, isCompleted: false });
  assert.deepEqual(await activity.flushActivityDigest(now), { sent: 0, failed: 0 });
  assert.equal(state.emails.length, 3);
});
test('digest respects deadline opt-out, current in-app-only preference, and project membership', async () => {
  const { activity, state, project, prisma } = harness();
  state.prefs.set(2, { deadlineSummary: false, taskComments: 'DAILY' });
  state.prefs.set(1, { deadlineSummary: false });
  state.tasks = [{ id: 20, title: 'No reminder', assignedUsers: [{ id: 1 }], project, projectId: 10, status: 'TODO', dueDate: new Date('2026-10-30T12:00:00Z') }];
  await activity.enqueueActivity(input, prisma);
  state.prefs.set(2, { deadlineSummary: false, taskComments: 'IN_APP' });
  assert.deepEqual(await activity.flushActivityDigest(new Date('2026-10-30T09:00:00Z')), { sent: 0, failed: 0 });
  assert.equal(state.emails.length, 0);
  assert.equal(state.entries[0].status, 'SKIPPED');
  state.prefs.set(3, { deadlineSummary: false, taskComments: 'DAILY' });
  await activity.enqueueActivity({ ...input, eventKey: 'private-event', recipientIds: [3] }, prisma);
  project.students = [{ id: 1 }];
  await activity.flushActivityDigest(new Date('2026-10-30T09:00:00Z'));
  assert.equal(state.emails.length, 0);
  assert.equal(state.entries[1].status, 'SKIPPED');
});
test('failed daily digest releases event and daily claims, then successful retry deduplicates', async () => {
  const { activity, state } = harness();
  state.prefs.set(2, { taskComments: 'DAILY', deadlineSummary: false });
  await activity.emitActivity(input);
  state.failEmail = true;
  const now = new Date('2026-10-30T09:00:00Z');
  assert.deepEqual(await activity.flushActivityDigest(now), { sent: 0, failed: 1 });
  assert.equal(state.entries[0].claimedAt, null);
  assert.equal(state.jobs.get('activity-digest:2026-10-30:2').claimedAt, null);
  state.failEmail = false;
  assert.deepEqual(await activity.flushActivityDigest(now), { sent: 1, failed: 0 });
  assert.equal(state.entries[0].status, 'SENT');
  assert.deepEqual(await activity.flushActivityDigest(now), { sent: 0, failed: 0 });
});
function preferencesHandler(h, session) {
  return load('src/pages/api/account/notification-preferences.ts', {
    'next-auth/next': { getServerSession: async () => session.value },
    '../auth/[...nextauth]': { authOptions: {} },
    '@/lib/prisma': { prisma: h.prisma },
    '@/lib/activityNotifications': h.activity,
  }).default;
}
function response() { return { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } }; }
test('notification preference API requires sign-in and verification and rejects unsupported methods', async () => {
  const h = harness(), session = { value: null }, handler = preferencesHandler(h, session);
  let res = response(); await handler({ method: 'GET' }, res); assert.equal(res.statusCode, 401);
  session.value = { user: { id: 2 } }; h.state.users.get(2).emailVerified = null;
  res = response(); await handler({ method: 'PUT', body: {} }, res); assert.equal(res.statusCode, 401);
  res = response(); await handler({ method: 'DELETE' }, res); assert.equal(res.statusCode, 405);
});
test('notification preference API returns defaults and validates before saving only the signed-in user', async () => {
  const h = harness(), session = { value: { user: { id: 2 } } }, handler = preferencesHandler(h, session);
  let res = response(); await handler({ method: 'GET' }, res); assert.deepEqual(res.body, h.activity.defaultNotificationPreferences);
  for (const body of [{ taskComments: 'NEVER' }, { deadlineSummary: 'yes' }, { userId: 1 }, []]) {
    res = response(); await handler({ method: 'PUT', body }, res); assert.equal(res.statusCode, 400); assert.equal(h.state.prefs.size, 0);
  }
  res = response(); await handler({ method: 'PUT', body: { taskComments: 'DAILY', deadlineSummary: false, taskAssignments: false } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ...h.activity.defaultNotificationPreferences, taskComments: 'DAILY', deadlineSummary: false, taskAssignments: false });
  assert.equal(h.state.prefs.has(1), false);
  assert.equal(h.state.prefs.has(2), true);
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
});
