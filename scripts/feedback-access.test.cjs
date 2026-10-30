const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInThisContext('(function(require,module,exports){' + source + '\n})', { filename })((name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.includes('auth/[...nextauth]')) return { authOptions: {} };
    if (name === '@/lib/prisma') return { prisma: {} };
    if (name === '@/lib/mailer') return { sendEmail: async () => {} };
    if (name === 'next-auth/next') return { getServerSession: async () => null };
    if (name.startsWith('.')) return load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), name + '.ts')), mocks);
    return require(name);
  }, mod, mod.exports);
  return mod.exports;
}
const feedback = load('src/lib/feedback.ts');
const owner = { id: 1, email: 'owner@example.org' };
const recipient = { id: 2, email: 'Student@Example.org' };
const review = { id: 17, workId: 8, version: 3, status: 'FULL_REVIEW', receivedDate: '2026-10-01', estimateStart: '2026-10-05', estimateEnd: '2026-10-08', trackingToken: 'secret', work: { supervisorId: 1, recipientName: 'Private name', recipientEmail: 'student@example.org', title: 'Ethics', workType: 'Ethics Document', supervisor: { name: 'Supervisor', email: 'private-owner@example.org' } }, history: [{ message: 'private history' }] };
test('feedback ownership and recipient email enforce review boundaries', () => {
  assert.equal(feedback.canRead(review, owner), true);
  assert.equal(feedback.canRead(review, recipient), true);
  assert.equal(feedback.canRead(review, { id: 3, email: 'other@example.org', role: 'ADMIN' }), false);
});
test('management follows supervisor entitlement and does not extend to recipients', () => {
  assert.equal(feedback.canManageFeedback({ role: 'STUDENT', subscriptionType: 'SUBSCRIBED' }), false);
  assert.equal(feedback.canManageFeedback({ role: 'SUPERVISOR', subscriptionType: 'CANCELLED' }), false);
  assert.equal(feedback.canManageFeedback({ role: 'SUPERVISOR', subscriptionType: 'FREE_TRIAL', subscriptionExpiresAt: '2000-01-01' }), false);
  assert.equal(feedback.canManageFeedback({ role: 'SUPERVISOR', subscriptionType: 'ADMIN_APPROVED' }), true);
});
test('public tracking uses an explicit projection without recipient identity, tokens, or history', () => {
  const projection = feedback.publicReview(review);
  for (const key of ['recipientEmail', 'recipientName', 'history', 'trackingToken', 'workId', 'id']) assert.equal(key in projection, false);
  assert.equal(projection.title, 'Ethics');
  assert.equal(projection.version, 3);
  assert.equal(JSON.stringify(projection).includes('private-owner'), false);
});
test('feedback-only accounts cannot call unrelated workspace APIs', async () => {
  const next = { next: () => ({ next: true }), json: (body, options) => ({ body, ...options }), redirect: url => ({ redirect: url.pathname }) };
  const { middleware } = load('src/middleware.ts', { 'next-auth/jwt': { getToken: async () => ({ feedbackOnly: true }) }, 'next/server': { NextResponse: next } });
  const request = pathname => ({ nextUrl: { pathname }, url: 'https://example.org' + pathname });
  assert.equal((await middleware(request('/api/users/search'))).status, 403);
  assert.equal((await middleware(request('/dashboard'))).redirect, '/feedback');
  assert.equal((await middleware(request('/api/feedback/17'))).next, true);
  assert.equal((await middleware(request('/feedback'))).next, true);
});
test('mailer escapes user-controlled titles and content in HTML while preserving plain text', async () => {
  let sent;
  const originals = { fetch: global.fetch, node: process.env.NODE_ENV, force: process.env.MAILGUN_FORCE_SEND, from: process.env.MAILGUN_FROM_ADDRESS, domain: process.env.MAILGUN_DOMAIN, key: process.env.MAILGUN_API_KEY };
  Object.assign(process.env, { NODE_ENV: 'test', MAILGUN_FORCE_SEND: 'true', MAILGUN_FROM_ADDRESS: 'test@example.org', MAILGUN_DOMAIN: 'example.org', MAILGUN_API_KEY: 'test' });
  global.fetch = async (_url, options) => { sent = new URLSearchParams(options.body); return { ok: true, text: async () => '{}' }; };
  try {
    const mailer = load('src/lib/mailer.ts', { '@/lib/prisma': { prisma: { emailLog: { create: async () => {} } } } });
    await mailer.sendEmail('student@example.org', '<script>title</script>', 'Hello <img src=x onerror=alert(1)>');
    assert.match(sent.get('html'), /&lt;script&gt;title&lt;\/script&gt;/);
    assert.equal(sent.get('html').includes('<img src=x'), false);
    assert.equal(sent.get('text'), 'Hello <img src=x onerror=alert(1)>');
  } finally {
    global.fetch = originals.fetch;
    for (const [key, value] of Object.entries({ NODE_ENV: originals.node, MAILGUN_FORCE_SEND: originals.force, MAILGUN_FROM_ADDRESS: originals.from, MAILGUN_DOMAIN: originals.domain, MAILGUN_API_KEY: originals.key })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
