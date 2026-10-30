const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

test('billing alerts exclude feedback-only accounts from both count and displayed results', async () => {
  const users = [
    { id: 1, feedbackOnly: true, sponsorSubscriptionInactive: true, createdAt: new Date(), role: 'STUDENT' },
    { id: 2, feedbackOnly: false, sponsorSubscriptionInactive: true, createdAt: new Date(), role: 'STUDENT' },
    { id: 3, feedbackOnly: false, sponsorSubscriptionInactive: false, createdAt: new Date(), role: 'STUDENT' },
  ];
  const filters = [];
  const matching = where => users.filter(user => Object.entries(where).every(([key, value]) => user[key] === value));
  const prisma = { user: {
    groupBy: async () => [],
    count: async ({ where }) => { filters.push(where); return matching(where).length; },
    findMany: async ({ where }) => {
      if (!Object.hasOwn(where, 'sponsorSubscriptionInactive')) return [];
      filters.push(where); return matching(where);
    },
  } };
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync('src/pages/api/admin/subscription-metrics.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInThisContext('(function(require,module,exports){' + source + '\n})')((name) => {
    if (name === '@/lib/prisma') return { prisma };
    if (name === 'next-auth/next') return { getServerSession: async () => ({ user: { role: 'ADMIN' } }) };
    if (name.includes('[...nextauth]')) return { authOptions: {} };
    return require(name);
  }, module, module.exports);
  let result;
  const response = { status(code) { assert.equal(code, 200); return this; }, json(body) { result = body; return this; } };
  await module.exports.default({ method: 'GET' }, response);
  assert.equal(result.sponsorAlerts.impactedCount, 1);
  assert.deepEqual(result.sponsorAlerts.users.map(user => user.id), [2]);
  assert.equal(filters.length, 2);
  for (const filter of filters) assert.equal(filter.feedbackOnly, false);
});
