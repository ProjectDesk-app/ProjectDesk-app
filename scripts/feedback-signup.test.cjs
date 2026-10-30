const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadSource(relative, mocks) {
  const filename = path.resolve(__dirname, '..', relative);
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInThisContext('(function(require,module,exports){' + source + '\n})', { filename })((name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    throw new Error(`Unexpected dependency: ${name}`);
  }, mod, mod.exports);
  return mod.exports;
}

const trackingToken = 'a'.repeat(64);
const body = { token: trackingToken, name: ' Student ', email: ' Student@Example.org ', password: 'a long password' };
function response() {
  return { headers: {}, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
}
function setup(options = {}) {
  const calls = [];
  const prisma = {
    feedbackReview: { findUnique: async (query) => { calls.push(['review', query]); return options.noReview ? null : { work: { recipientEmail: options.recipientEmail || 'student@example.org' } }; } },
    user: {
      findUnique: async () => options.existing || null,
      create: async (query) => { calls.push(['createUser', query]); return { id: 42 }; },
      updateMany: async (query) => { calls.push(['claimUser', query]); return { count: options.claimLost ? 0 : 1 }; },
    },
    emailVerification: {
      deleteMany: async (query) => { calls.push(['deleteVerification', query]); },
      create: async (query) => { calls.push(['verification', query]); },
    },
  };
  prisma.$transaction = async (callback) => { calls.push(['transaction']); return callback(prisma); };
  const mocks = {
    '@/lib/prisma': { prisma },
    bcryptjs: { hash: async (password) => { calls.push(['hash', password]); return 'hashed-password'; }, compare: async () => true },
    '@/lib/tokens': { generateToken: () => 'verification-token', tokenExpiry: () => new Date('2030-01-01') },
    '@/lib/mailer': { sendEmail: async (...args) => { calls.push(['mail', ...args]); if (options.mailFails) throw new Error('Provider unavailable'); } },
    '@/lib/blockedEmails': { isEmailBlocked: async () => Boolean(options.blocked), normalizeEmail: (email) => email?.trim().toLowerCase() },
  };
  return { calls, mocks, prisma, handler: loadSource('src/pages/api/feedback-signup.ts', mocks).default };
}

test('recipient signup rejects unsupported methods before reading any record', async () => {
  const { handler, calls } = setup(); const res = response();
  await handler({ method: 'GET' }, res);
  assert.equal(res.statusCode, 405); assert.equal(res.headers.Allow, 'POST'); assert.equal(calls.length, 0);
});
test('recipient signup requires both a valid tracking token and its matching email', async () => {
  for (const options of [{ noReview: true }, { recipientEmail: 'someone-else@example.org' }]) {
    const { handler, calls } = setup(options); const res = response();
    await handler({ method: 'POST', body }, res);
    assert.equal(res.statusCode, 403); assert.equal(calls.some(([name]) => name === 'transaction' || name === 'mail'), false);
  }
  const { handler, calls } = setup(); const res = response();
  await handler({ method: 'POST', body: { ...body, token: 'guessable' } }, res);
  assert.equal(res.statusCode, 400); assert.equal(calls.length, 0);
});
test('recipient signup cannot overwrite an existing account password', async () => {
  const { handler, calls } = setup({ existing: { id: 7, passwordHash: 'existing-secret' } }); const res = response();
  await handler({ method: 'POST', body }, res);
  assert.equal(res.statusCode, 409); assert.match(res.body.error, /Sign in/);
  assert.equal(calls.some(([name]) => ['hash', 'transaction', 'mail'].includes(name)), false);
});
test('blocked recipient cannot register even with a matching tracking link', async () => {
  const { handler, calls } = setup({ blocked: true }); const res = response();
  await handler({ method: 'POST', body }, res);
  assert.equal(res.statusCode, 403); assert.equal(calls.some(([name]) => name === 'transaction' || name === 'mail'), false);
});
test('new recipient gets a feedback-only account and a verification email, without sponsor entitlement', async () => {
  const { handler, calls } = setup(); const res = response();
  await handler({ method: 'POST', body }, res);
  assert.equal(res.statusCode, 201); assert.equal(res.headers['Cache-Control'], 'no-store');
  const user = calls.find(([name]) => name === 'createUser')[1].data;
  assert.equal(user.email, 'student@example.org'); assert.equal(user.name, 'Student');
  assert.equal(user.feedbackOnly, true); assert.equal(user.role, 'STUDENT'); assert.equal(user.subscriptionType, 'SPONSORED');
  assert.equal(user.sponsorSubscriptionInactive, true); assert.equal(user.sponsorId, undefined); assert.equal(user.emailVerified, undefined);
  assert.equal(user.passwordHash, 'hashed-password'); assert.equal(JSON.stringify(user).includes(body.password), false);
  const verification = calls.find(([name]) => name === 'verification')[1].data;
  assert.equal(verification.userId, 42); assert.equal(verification.token, 'verification-token');
  const email = calls.find(([name]) => name === 'mail');
  assert.equal(email[1], 'student@example.org'); assert.match(email[3], /verify-email\?token=verification-token&feedback=1/);
  assert.equal(email[3].includes(trackingToken), false);
});
test('invited account activation claims only a still-empty password and requires fresh verification', async () => {
  const { handler, calls } = setup({ existing: { id: 7, passwordHash: null } }); const res = response();
  await handler({ method: 'POST', body }, res);
  assert.equal(res.statusCode, 201);
  const update = calls.find(([name]) => name === 'claimUser')[1];
  assert.deepEqual(update.where, { id: 7, passwordHash: null }); assert.equal(update.data.emailVerified, null);
  assert.equal('role' in update.data, false); assert.equal('feedbackOnly' in update.data, false);
  const conflict = setup({ existing: { id: 7, passwordHash: null }, claimLost: true }); const conflictRes = response();
  await conflict.handler({ method: 'POST', body }, conflictRes);
  assert.equal(conflictRes.statusCode, 409); assert.equal(conflict.calls.some(([name]) => name === 'verification' || name === 'mail'), false);
});
test('verification delivery failure preserves account success and gives recovery instructions', async () => {
  const { handler } = setup({ mailFails: true }); const res = response();
  await handler({ method: 'POST', body }, res);
  assert.equal(res.statusCode, 201); assert.match(res.body.message, /Sign in to request another verification email/);
});

function primaryAuth(options = {}) {
  const state = setup(options);
  const user = { id: 42, name: 'Student', email: 'student@example.org', passwordHash: 'hash', role: 'STUDENT', subscriptionType: 'SPONSORED', sponsorId: null, sponsorSubscriptionInactive: true, feedbackOnly: true, emailVerified: options.unverified ? null : new Date(), ...options.user };
  state.prisma.user.findUnique = async () => user;
  state.prisma.feedbackWork = { findFirst: async () => options.noFeedback ? null : { id: 1 } };
  state.prisma.$transaction = async (operations) => Promise.all(operations);
  const mocks = { ...state.mocks,
    'next-auth/next': { default: () => ({}) },
    'next-auth/providers/credentials': { default: (config) => config },
    '@next-auth/prisma-adapter': { PrismaAdapter: () => ({}) },
    '@prisma/client': { SubscriptionType: { SPONSORED: 'SPONSORED' } },
  };
  return { ...state, auth: loadSource('src/pages/api/auth/[...nextauth].ts', mocks).authOptions };
}
test('primary sign-in rejects unverified feedback recipients before granting a session', async () => {
  const { auth, calls } = primaryAuth({ unverified: true });
  await assert.rejects(auth.providers[0].authorize({ email: 'student@example.org', password: 'secret' }), /Email not verified/);
  assert.equal(calls.filter(([name]) => name === 'verification').length, 1);
  assert.match(calls.find(([name]) => name === 'mail')[3], /feedback=1/);
});
test('primary sign-in permits verified unsponsored feedback recipients but rejects unrelated unsponsored users', async () => {
  const { auth } = primaryAuth();
  assert.equal((await auth.providers[0].authorize({ email: 'student@example.org', password: 'secret' })).id, '42');
  const denied = primaryAuth({ noFeedback: true });
  await assert.rejects(denied.auth.providers[0].authorize({ email: 'student@example.org', password: 'secret' }), /Awaiting sponsorship approval/);
});
test('primary JWT and session retain the database feedback-only restriction', async () => {
  const { auth } = primaryAuth();
  const token = await auth.callbacks.jwt({ token: { id: 42 } });
  assert.equal(token.feedbackOnly, true);
  const session = await auth.callbacks.session({ session: { user: {} }, token });
  assert.equal(session.user.feedbackOnly, true); assert.equal(session.user.id, 42);
});
