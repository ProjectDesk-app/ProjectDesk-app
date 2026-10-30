const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
function load(file, mocks = {}) {
  const filename = path.resolve(file);
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInThisContext('(function(require,module,exports){' + source + '\n})', { filename })((name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith('@/')) return load(path.resolve('src', name.slice(2)) + '.ts', mocks);
    if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), name) + '.ts', mocks);
    return require(name);
  }, mod, mod.exports);
  return mod.exports;
}
const actor = { id: 2, name: 'Student' };
const project = { id: 5, supervisorId: 1, title: 'Project', students: [{ id: 2 }, { id: 3 }], collaborators: [], members: [] };
const task = { id: 9, projectId: 5, project, title: 'Draft', flagged: false, dueDate: new Date('2026-10-30'), assigneeId: 2, assignedUsers: [{ id: 2 }], updatedAt: new Date('2026-10-29') };
function response() { return { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } }; }
test('task changes notify only newly assigned users, and deadline updates have a separate in-app-only category', async () => {
  const events = [];
  const { emitTaskChanges } = load('src/lib/taskActivity.ts', { '@/lib/activityNotifications': { emitActivity: async event => events.push(event) }, '@/lib/prisma': { prisma: {} } });
  await emitTaskChanges(task, { ...task, assignedUsers: [{ id: 2 }, { id: 3 }], dueDate: new Date('2026-11-02') }, actor);
  assert.deepEqual(events.map(event => event.category), ['TASK_ASSIGNED', 'TASK_DEADLINE']);
  assert.deepEqual(events[0].recipientIds, [3]);
  assert.deepEqual(events[1].recipientIds, [2, 3]);
  assert.match(events[1].message, /30 Oct 2026/);
  assert.match(events[1].message, /2 Nov 2026/);
});
test('re-saving unchanged fields and removing flags emit no events; newly flagged tasks notify supervisor', async () => {
  const events = [];
  const { emitTaskChanges } = load('src/lib/taskActivity.ts', { '@/lib/activityNotifications': { emitActivity: async event => events.push(event) }, '@/lib/prisma': { prisma: {} } });
  await emitTaskChanges(task, { ...task }, actor);
  await emitTaskChanges({ ...task, flagged: true }, task, actor);
  assert.equal(events.length, 0);
  await emitTaskChanges(task, { ...task, flagged: true }, actor);
  assert.equal(events[0].category, 'TASK_FLAG');
  assert.deepEqual(events[0].recipientIds, [1]);
  assert.equal(events[0].taskId, 9);
});
test('access checks deny unrelated accounts and assignment to people outside the project', async () => {
  const access = load('src/lib/taskAccess.ts', { '@/lib/prisma': { prisma: { task: { findUnique: async () => task } } } });
  assert.equal(access.projectAccess(project, actor), true);
  assert.equal(access.projectAccess(project, { id: 77 }), false);
  await assert.rejects(access.accessibleTask(9, { id: 77 }), /Access denied/);
  assert.throws(() => access.validateAssignees(project, [77]), /must belong/);
  assert.doesNotThrow(() => access.validateAssignees(project, [1, 2, 3]));
});
test('new comments notify existing project participants once per user and include single assignees', async () => {
  const events = [];
  const commentTask = { ...task, assigneeId: 4, assignedUsers: [{ id: 2 }], project: { ...project, members: [{ userId: 3 }] } };
  const handler = load('src/pages/api/tasks/[id]/comments.ts', {
    'next-auth/next': { getServerSession: async () => ({ user: actor }) },
    '../../auth/[...nextauth]': { authOptions: {} },
    '@/lib/prisma': { prisma: { task: { findUnique: async () => commentTask }, comment: { create: async ({ data }) => ({ id: 17, content: data.content, User: actor }) } } },
    '@/lib/activityNotifications': { emitActivity: async event => events.push(event) },
  }).default;
  const res = response();
  await handler({ method: 'POST', query: { id: '9' }, body: { content: 'Please check this' } }, res);
  assert.equal(res.code, 201);
  assert.equal(events[0].eventKey, 'comment:17');
  assert.deepEqual(events[0].recipientIds, [1, 2, 3, 4]);
  assert.match(events[0].message, /Please check this/);
});
test('comment edits do not emit notifications and cannot target another task comment', async () => {
  const events = [];
  let commentTaskId = 10, writes = 0;
  const handler = load('src/pages/api/tasks/[id]/comments.ts', {
    'next-auth/next': { getServerSession: async () => ({ user: actor }) }, '../../auth/[...nextauth]': { authOptions: {} },
    '@/lib/prisma': { prisma: { task: { findUnique: async () => task }, comment: { findUnique: async () => ({ userId: 2, taskId: commentTaskId }), update: async () => { writes++; return {}; } } } },
    '@/lib/activityNotifications': { emitActivity: async event => events.push(event) },
  }).default;
  const wrong = response(); await handler({ method: 'PATCH', query: { id: '9' }, body: { id: 17, content: 'Edit' } }, wrong);
  assert.equal(wrong.code, 404); assert.equal(writes, 0);
  commentTaskId = 9;
  const valid = response(); await handler({ method: 'PATCH', query: { id: '9' }, body: { id: 17, content: 'Edit' } }, valid);
  assert.equal(valid.code, 200); assert.equal(writes, 1); assert.equal(events.length, 0);
});
test('flag toggle claims reject races without sending duplicate notifications', async () => {
  let claimCount = 0, events = 0;
  const handler = load('src/pages/api/tasks/[id]/flag.ts', {
    'next-auth/next': { getServerSession: async () => ({ user: actor }) }, '../../auth/[...nextauth]': { authOptions: {} },
    '@/lib/prisma': { prisma: { task: { findUnique: async () => task, updateMany: async () => ({ count: claimCount }), findUniqueOrThrow: async () => ({ ...task, flagged: true }) } } },
    '@/lib/activityNotifications': { emitActivity: async () => { events++; } }, '@/lib/updateProjectStatus': { updateProjectStatus: async () => {} },
  }).default;
  const lost = response(); await handler({ method: 'POST', query: { id: '9' } }, lost);
  assert.equal(lost.code, 409); assert.equal(events, 0);
  claimCount = 1;
  const won = response(); await handler({ method: 'POST', query: { id: '9' } }, won);
  assert.equal(won.code, 200); assert.equal(events, 1);
});
