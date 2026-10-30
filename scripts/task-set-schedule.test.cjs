const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadSource(relative, mocks = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, "..", relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  function localRequire(name) {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === "@/lib/updateProjectStatus") return { updateProjectStatus: async () => {} };
    if (name.includes("/auth/[...nextauth]") || name === "@/lib/auth") return { authOptions: {} };
    if (name.startsWith("@/") || name.startsWith(".")) {
      const target = name.startsWith("@/") ? path.resolve(__dirname, "../src", name.slice(2)) : path.resolve(path.dirname(filename), name);
      return loadSource(path.relative(path.resolve(__dirname, ".."), target + ".ts"), mocks, cache);
    }
    return require(name);
  }
  vm.runInThisContext("(function(require, module, exports) {" + source + "\n})", { filename })(localRequire, module, module.exports);
  return module.exports;
}
const schedule = loadSource("src/lib/taskSetSchedule.ts");
const preset = loadSource("src/lib/l6Schedule.ts");

test("calendar dates reject rollover, blanks and invalid values", () => {
  for (const value of ["2027-02-29", "2026-13-01", "2026-1-01", "", null]) assert.throws(() => schedule.parseCalendarDate(value));
  assert.equal(schedule.shiftDate("2028-02-28", 1), "2028-02-29");
  assert.equal(schedule.shiftDate("2026-12-31", 1), "2027-01-01");
});
test("day zero, negative offsets and inclusive one-day periods are preserved", () => {
  const [item] = schedule.validateTemplates([{ title: "Plan", startOffset: 0, dueOffset: 0, duration: 7 }]);
  assert.equal(item.startOffset, 0); assert.equal(item.dueOffset, 0); assert.equal(item.duration, 1);
  assert.equal(schedule.resolveTemplate(item, "2026-10-12").startDay, "2026-10-12");
  assert.equal(schedule.resolveTemplate({ startOffset: -2, dueOffset: 0 }, "2026-10-12").startDay, "2026-10-10");
});
test("explicit dates, legacy duration and missing values have distinct interpretations", () => {
  assert.equal(schedule.resolveTemplate({ startOffset: 0, dueOffset: 6, duration: 7 }, "2026-10-12").duration, 7);
  assert.equal(schedule.resolveTemplate({ dueOffset: 6, duration: 7 }, "2026-10-12").startDay, "2026-10-11");
  assert.equal(schedule.resolveTemplate({ title: "Unscheduled" }, "2026-10-12").startDate, null);
  assert.equal(schedule.resolveTemplate({ startOffset: 0, duration: 7 }, "2026-10-12").dueDate, null);
});
test("UK deadline times remain correct across GMT and British Summer Time", () => {
  assert.equal(schedule.deadlineInstant("2026-11-26", "13:00").toISOString(), "2026-11-26T13:00:00.000Z");
  assert.equal(schedule.deadlineInstant("2027-04-22", "13:00").toISOString(), "2027-04-22T12:00:00.000Z");
  assert.equal(schedule.deadlineInstant("2027-03-27", "13:00").toISOString(), "2027-03-27T13:00:00.000Z");
  assert.equal(schedule.deadlineInstant("2027-03-28", "13:00").toISOString(), "2027-03-28T12:00:00.000Z");
  assert.throws(() => schedule.deadlineInstant("2027-03-28", "01:30"), /does not exist/);
});
test("invalid schedules reject inverted dates, duplicate titles, bad times and fractional offsets", () => {
  for (const item of [
    { title: "Invalid", startOffset: 2, dueOffset: 1 },
    { title: "Invalid", dueOffset: 0, dueTime: "25:00" },
    { title: "Invalid", startOffset: 0.5 },
    { title: "Invalid", kind: "BREAK" },
    { title: "Invalid", kind: "MILESTONE", startOffset: 0, dueOffset: 1 },
  ]) assert.throws(() => schedule.validateTemplates([item]));
  assert.throws(() => schedule.validateTemplates([{ title: "Same" }, { title: "Same" }]), /different title/);
  const [milestone] = schedule.validateTemplates([{ title: "Due", kind: "MILESTONE", dueOffset: 0 }]);
  assert.equal(milestone.duration, 0); assert.equal(milestone.startOffset, 0);
});
test("L6 source schedule preserves work weeks, interrupted preparation and exact submission times", () => {
  const items = schedule.validateTemplates(preset.l6Schedule());
  const find = title => schedule.resolveTemplate(items.find(t => t.title === title), preset.L6_START);
  assert.equal(items.length, 30);
  assert.equal(items.filter(t => t.kind !== "BREAK").length, 27);
  assert.equal(find("Literature searching").duration, 56);
  assert.equal(find("Writing Methods").startDay, "2026-11-16");
  assert.equal(find("Writing Methods").duration, 35);
  assert.equal(find("Interview preparation before winter break").dueDay, "2026-12-20");
  assert.equal(find("Interview preparation after winter break").startDay, "2027-01-11");
  assert.equal(find("Presentations").dueDay, "2026-12-13");
  assert.equal(find("Presentation preparation").dueDate.toISOString(), "2026-11-26T13:00:00.000Z");
  assert.equal(find("Thesis Submission").dueDate.toISOString(), "2027-04-22T12:00:00.000Z");
  const nextYear = schedule.resolveTemplate(items.find(t => t.title === "Writing Methods"), "2027-10-11");
  assert.equal(nextYear.startDay, "2027-11-15"); assert.equal(nextYear.duration, 35);
});

function harness({ user = { id: 4, role: "SUPERVISOR" }, set = {}, project = {}, existing = [], createError } = {}) {
  const calls = [];
  const taskSet = { id: 1, supervisorId: 4, name: "L6", scheduleStartDate: new Date(preset.L6_START),
    templates: schedule.validateTemplates(preset.l6Schedule()), ...set };
  const prisma = {
    taskSet: { findFirst: async query => { calls.push(["set", query]); return query.where.supervisorId && query.where.supervisorId !== taskSet.supervisorId ? null : taskSet; },
      create: async query => { calls.push(["duplicate", query]); return query.data; },
      update: async query => { calls.push(["update", query]); return query.data; } },
    project: { findFirst: async query => { calls.push(["project", query]); const value = { supervisorId: 4, startDate: new Date("2026-10-20"), isCompleted: false, ...project }; return query.where.supervisorId && query.where.supervisorId !== value.supervisorId ? null : value; } },
    task: { findMany: async () => existing, createMany: async query => { calls.push(["create", query]); if (createError) throw createError; return { count: query.data.length }; } },
  };
  const mocks = { "@/lib/prisma": { prisma }, "./prisma": { prisma }, "next-auth/next": { getServerSession: async () => user ? { user } : null } };
  async function call(route = "apply", body = {}, method = "POST") {
    const handler = loadSource("src/pages/api/tasksets/[id]" + (route === "details" ? ".ts" : "/" + route + ".ts"), mocks).default;
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; }, setHeader() {}, end() { return this; } };
    await handler({ method, query: { id: "1" }, body: { projectId: 2, ...body } }, response);
    return response;
  }
  return { call, calls };
}
test("applying uses shared academic dates and writes all tasks with starts and durations together", async () => {
  const h = harness(), res = await h.call();
  assert.equal(res.statusCode, 201);
  const created = h.calls.find(c => c[0] === "create")[1].data;
  assert.equal(created.length, 27);
  assert.equal(created.find(t => t.title === "Initial planning").startDate.toISOString(), "2026-10-11T23:00:00.000Z");
  assert.equal(created.find(t => t.title === "Thesis Submission").duration, 0);
  assert.equal(created.find(t => t.title === "Thesis Submission").kind, "MILESTONE");
  assert.equal(created.find(t => t.title === "Initial planning").kind, "TASK");
  assert.equal(h.calls.find(c => c[0] === "project")[1].where.supervisorId, 4);
  assert.equal(h.calls.find(c => c[0] === "set")[1].where.supervisorId, 4);
});
test("project and custom anchors shift the entire schedule without changing duration", async () => {
  for (const [dateMode, start, expected] of [["project", undefined, "2026-10-20"], ["custom", "2027-10-11", "2027-10-11"]]) {
    const h = harness(), res = await h.call("apply", { dateMode, scheduleStartDate: start });
    assert.equal(res.statusCode, 201);
    const first = h.calls.find(c => c[0] === "create")[1].data[0];
    const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(first.startDate);
    assert.equal(localDay, expected); assert.equal(first.duration, 7);
  }
});
test("unauthenticated and student requests cannot access schedule writes", async () => {
  for (const [user, code] of [[null, 401], [{ id: 3, role: "STUDENT" }, 403]]) {
    const h = harness({ user }), res = await h.call();
    assert.equal(res.statusCode, code); assert.equal(h.calls.length, 0);
  }
});
test("duplicate applications report conflict without creating a partial schedule", async () => {
  const h = harness({ existing: [{ title: "Initial planning" }] });
  assert.equal((await h.call()).statusCode, 409);
  assert.equal(h.calls.some(c => c[0] === "create"), false);
  const concurrent = harness({ createError: { code: "P2002" } });
  assert.equal((await concurrent.call()).statusCode, 409);
});
test("missing project start accepts shared dates but rejects project-relative dates", async () => {
  const shared = harness({ project: { startDate: null } });
  assert.equal((await shared.call()).statusCode, 201);
  const relative = harness({ project: { startDate: null } });
  assert.equal((await relative.call("apply", { dateMode: "project" })).statusCode, 400);
  assert.equal(relative.calls.some(c => c[0] === "create"), false);
});
test("duplication retains durations, offsets, milestones, breaks and times", async () => {
  const h = harness(), res = await h.call("duplicate");
  assert.equal(res.statusCode, 200);
  const copied = h.calls.find(c => c[0] === "duplicate")[1].data;
  assert.equal(copied.scheduleStartDate.toISOString().slice(0, 10), preset.L6_START);
  const thesis = copied.templates.create.find(t => t.title === "Thesis Submission");
  assert.equal(thesis.duration, 0); assert.equal(thesis.dueTime, "13:00"); assert.equal(thesis.kind, "MILESTONE");
});
test("rename leaves the stored schedule alone and saving invalid dates makes no writes", async () => {
  const h = harness();
  assert.equal((await h.call("details", { name: "Renamed" }, "PUT")).statusCode, 200);
  const update = h.calls.find(c => c[0] === "update")[1].data;
  assert.equal(update.templates, undefined); assert.equal(update.scheduleStartDate, undefined);
  const invalid = harness();
  assert.equal((await invalid.call("details", { name: "Invalid", scheduleStartDate: "2027-02-29" }, "PUT")).statusCode, 400);
  assert.equal(invalid.calls.some(c => c[0] === "update"), false);
});
test("another supervisor's sets and projects cannot be used, while administrators can manage them", async () => {
  const foreignSet = harness({ set: { supervisorId: 99 } });
  assert.equal((await foreignSet.call()).statusCode, 404);
  const foreignProject = harness({ project: { supervisorId: 99 } });
  assert.equal((await foreignProject.call()).statusCode, 404);
  const admin = harness({ user: { id: 1, role: "ADMIN" }, set: { supervisorId: 99 }, project: { supervisorId: 99 } });
  assert.equal((await admin.call()).statusCode, 201);
});
test("completed projects and break-only sets do not create tasks", async () => {
  for (const options of [{ project: { isCompleted: true } }, { set: { templates: preset.l6Schedule().filter(t => t.kind === "BREAK") } }]) {
    const h = harness(options);
    assert.equal((await h.call()).statusCode, 400);
    assert.equal(h.calls.some(c => c[0] === "create"), false);
  }
});
test("a summer milestone at midnight is represented by one valid instant", () => {
  const item = schedule.resolveTemplate({ title: "Midnight", kind: "MILESTONE", startOffset: 0, dueOffset: 0, dueTime: "00:00" }, "2027-04-22");
  assert.equal(item.startDate.toISOString(), "2027-04-21T23:00:00.000Z");
  assert.equal(item.startDate.getTime(), item.dueDate.getTime());
});
test("calendar duration includes both dates even at end of day or across a clock change", () => {
  assert.equal(schedule.calendarDuration(new Date("2026-11-16T00:00:00Z"), new Date("2026-12-20T23:59:00Z")), 35);
  assert.equal(schedule.calendarDuration(new Date("2027-03-22T00:00:00Z"), new Date("2027-04-04T22:59:00Z")), 14);
});
test("editing project dates preserves inclusive work duration and milestone duration", async () => {
  for (const [kind, expected] of [["TASK", 14], ["MILESTONE", 0]]) {
    let saved;
    const prisma = { task: { findUnique: async () => ({ id: 10, kind, projectId: 9, assignedUsers: [], assigneeId: null, project: { id: 9, supervisorId: 4, students: [], collaborators: [], members: [] } }), update: async query => { saved = query.data; return saved; } } };
    const handler = loadSource("src/pages/api/tasks/[id].ts", { "@/lib/prisma": { prisma },
      "@/lib/taskActivity": { emitTaskChanges: async () => {} }, "@/lib/updateProjectStatus": { updateProjectStatus: async () => {} },
      "next-auth/next": { getServerSession: async () => ({ user: { id: 4, role: "SUPERVISOR" } }) } }).default;
    const res = { status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } };
    await handler({ method: "PATCH", query: { id: "10" }, body: { startDate: "2027-03-22T00:00:00Z", dueDate: "2027-04-04T22:59:00Z" } }, res);
    assert.equal(saved.duration, expected);
  }
});
