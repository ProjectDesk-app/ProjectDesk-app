const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}, cache = new Map()) {
  const filename = path.resolve(root, file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInThisContext('(function(require,module,exports){' + source + '\n})', { filename })(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.includes('auth/[...nextauth]')) return { authOptions: {} };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const target = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(path.dirname(filename), name);
      return load(target + '.ts', mocks, cache);
    }
    return require(name);
  }, module, module.exports);
  return module.exports;
}
const mailer = load('src/lib/mailer.ts', { '@/lib/prisma': { prisma: {} } });
const baseMocks = { '@/lib/prisma': { prisma: {} }, '@/lib/mailer': mailer };
const engine = load('src/lib/emailTemplates.ts', baseMocks);
const catalog = load('src/lib/emailTemplates/catalog.ts').emailTemplateCatalog;

test('every catalogue default renders a complete subject, safe body and protected sample button', () => {
  assert.ok(catalog.length >= 27);
  assert.equal(new Set(catalog.map(def => def.id)).size, catalog.length);
  for (const def of catalog) {
    const rendered = engine.renderEmailTemplate(def, def, engine.sampleEmailVariables(def));
    assert.ok(rendered.subject.trim(), def.id);
    assert.equal(rendered.text.includes('{{'), false, def.id);
    if (def.buttonUrlVariable) {
      assert.ok(rendered.html.includes('role="presentation"'), def.id);
      assert.ok(rendered.html.includes(`>${def.buttonLabel}</a>`), def.id);
      assert.equal(engine.templateView(def).variables.some(v => v.key === def.buttonUrlVariable), false);
    }
  }
});
test('revised feedback estimates share receipt button styling and human date ranges', () => {
  const def = engine.emailTemplate('feedback_estimate_updated');
  const rendered = engine.renderEmailTemplate(def, def, engine.sampleEmailVariables(def));
  assert.ok(rendered.html.includes('3rd – 6th November 2026'));
  assert.ok(rendered.html.includes('>Track Progress</a>'));
  assert.equal(rendered.html.includes('Track Progress:<br'), false);
  assert.ok(rendered.text.includes('https://example.org/feedback/track/example'));
});
test('unknown, broken, removed required and duplicated action placeholders are rejected', () => {
  const def = engine.emailTemplate('feedback_estimate_updated');
  for (const body of [def.body + '{{unknown}}', def.body + '{{broken', def.body.replace('{{action}}', ''), def.body + '{{action}}', def.body.replace('{{estimatedRange}}', ''), def.body.replace('{{action}}', '{{actionUrl}}')]) assert.throws(() => engine.validateEmailTemplate(def, { ...def, body }));
  assert.throws(() => engine.validateEmailTemplate(def, { ...def, subject: '{{action}}' }));
  assert.throws(() => engine.validateEmailTemplate(def, { ...def, subject: 'Injected\nheader' }));
});
test('variable content is escaped as text and never recursively interpreted as template code', () => {
  const def = engine.emailTemplate('feedback_estimate_updated');
  const rendered = engine.renderEmailTemplate(def, def, { ...engine.sampleEmailVariables(def), workTitle: '<script>alert(1)</script>{{recipientName}}' });
  assert.ok(rendered.html.includes('&lt;script&gt;'));
  assert.equal(rendered.html.includes('<script>'), false);
  assert.ok(rendered.text.includes('{{recipientName}}'));
  assert.throws(() => engine.renderEmailTemplate(def, def, { ...engine.sampleEmailVariables(def), actionUrl: 'javascript:alert(1)' }));
  assert.throws(() => engine.renderEmailTemplate(def, def, { ...engine.sampleEmailVariables(def), actionUrl: 'https://user:password@example.org/' }));
});
test('sending uses stored wording and reset tombstones use current defaults while retaining revisions', async () => {
  let stored, sent;
  const mail = load('src/lib/emailTemplates.ts', { '@/lib/prisma': { prisma: { emailTemplateOverride: { findUnique: async () => stored } } }, '@/lib/mailer': { ...mailer, sendEmail: async (...args) => { sent = args; } } });
  const def = mail.emailTemplate('feedback_estimate_updated'), values = mail.sampleEmailVariables(def);
  stored = { subject: 'Custom {{workTitle}}', body: def.body, buttonLabel: 'View Review', version: 5, isCustomized: true };
  await mail.sendTemplatedEmail('recipient@example.org', def.id, values);
  assert.equal(sent[1], 'Custom Ethics Submission'); assert.equal(sent[3].action.label, 'View Review');
  stored.isCustomized = false;
  await mail.sendTemplatedEmail('recipient@example.org', def.id, values);
  assert.equal(sent[1], 'Feedback estimate updated: Ethics Submission'); assert.equal(sent[3].action.label, 'Track Progress');
  assert.equal(mail.templateView(def, stored).isCustomized, false); assert.equal(mail.templateView(def, stored).version, 5);
});
const response = () => ({ code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } });
test('template preview, editing and test sends require administrator access', async () => {
  for (const file of ['index.ts', 'preview.ts', '[id].ts', 'test.ts']) {
    const handler = load('src/pages/api/admin/email-templates/' + file, { ...baseMocks, 'next-auth/next': { getServerSession: async () => ({ user: { id: 1, role: 'STUDENT' } }) } }).default;
    const res = response(); await handler({ method: 'POST', body: {}, query: {} }, res); assert.equal(res.code, 403, file);
  }
});
test('template editing rejects stale versions and reset retains a monotonically increasing revision', async () => {
  const def = engine.emailTemplate('feedback_estimate_updated');
  let row = { ...def, id: def.id, version: 3, isCustomized: true }, writes = 0;
  const tx = { emailTemplateOverride: { findUnique: async () => row, update: async ({ data }) => { writes++; row = { ...row, ...data, version: row.version + data.version.increment }; return row; }, upsert: async () => assert.fail('stale edits must not write') } };
  const handler = load('src/pages/api/admin/email-templates/[id].ts', { ...baseMocks, '@/lib/prisma': { prisma: { $transaction: async fn => fn(tx) } }, 'next-auth/next': { getServerSession: async () => ({ user: { id: 1, role: 'ADMIN' } }) } }).default;
  const stale = response(); await handler({ method: 'PUT', query: { id: def.id }, body: { ...def, version: 2 } }, stale); assert.equal(stale.code, 409); assert.equal(writes, 0);
  const reset = response(); await handler({ method: 'DELETE', query: { id: def.id }, body: { version: 3 } }, reset); assert.equal(reset.code, 200); assert.equal(reset.body.template.version, 4); assert.equal(reset.body.template.isCustomized, false);
});
