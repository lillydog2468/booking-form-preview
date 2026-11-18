const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const planner = require('./test-page').pageSource(path.join(__dirname, 'tour-planner.html'), 'utf8');
const extrasSrc = fs.readFileSync(path.join(__dirname, 'booking-extras.js'), 'utf8');
const formatSrc = fs.readFileSync(path.join(__dirname, 'booking-format.js'), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing function ' + name);
  let i = source.indexOf('{', start);
  let depth = 0;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('unclosed function ' + name);
}

function loadDays() {
  const source = [
    extractFunction(planner, 'parseISODateUTC'),
    extractFunction(planner, 'toISODateUTC'),
    extractFunction(planner, 'enumerateDates'),
    extractFunction(planner, 'isRealBlock'),
    extractFunction(planner, 'emptyStoredDay'),
    extractFunction(planner, 'storedPlanDay'),
    extractFunction(planner, 'blankDayDate'),
    extractFunction(planner, 'materializeBlankDays'),
    extractFunction(planner, 'prepareDaysForSave'),
    extractFunction(planner, 'ensureTourSpanDays'),
    extractFunction(planner, 'mergeDays'),
  ].join('\n');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(formatSrc, ctx, { filename: 'booking-format.js' });
  vm.runInContext(source, ctx, { filename: 'plan-days.js' });
  return ctx;
}

function loadExtras() {
  const ctx = {};
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(extrasSrc, ctx, { filename: 'booking-extras.js' });
  return ctx.BookingExtras;
}

test('booking dates fill the missing weekdays, including 10 to 14 May 2027', () => {
  const ctx = loadDays();
  const plan = {
    arrivalDate: '2027-05-10',
    departureDate: '2027-05-14',
    days: [
      { date: '2027-05-10', blocks: [{ id: 'air', title: 'Airport', time: '10:30', guestIds: ['kay'] }] },
      { date: '2027-05-14', blocks: [] },
    ],
  };
  ctx.ensureTourSpanDays(plan);
  assert.equal(plan.days.map(day => day.date).join(','), '2027-05-10,2027-05-11,2027-05-12,2027-05-13,2027-05-14');
  assert.equal(plan.days[0].blocks[0].title, 'Airport');
  assert.equal(plan.days[0].blocks[0].time, '10:30');
  assert.equal(JSON.stringify(plan.days[1].blocks), '[]');
  assert.equal(plan.days.map(day => ctx.parseISODateUTC(day.date).getUTCDay()).join(','), '1,2,3,4,5');
});

test('a weekend null between dated days is saved as an empty day', () => {
  const ctx = loadDays();
  const days = ctx.prepareDaysForSave([
    { date: '2026-10-05', blocks: [{ id: 's1', title: 'Shop' }] },
    null,
    null,
    { date: '2026-10-08', blocks: [] },
  ], null);
  assert.equal(days.length, 4);
  assert.deepEqual(days.map(d => d.date), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']);
  assert.equal(JSON.stringify(days[1]), JSON.stringify({ date: '2026-10-06', blocks: [] }));
  assert.equal(JSON.stringify(days[2]), JSON.stringify({ date: '2026-10-07', blocks: [] }));
  assert.equal(days[0].blocks[0].title, 'Shop');
  assert.equal(days.some(d => d == null), false);
});

test('a null lines up with the tour dates when the array is the same length', () => {
  const ctx = loadDays();
  const days = ctx.materializeBlankDays(
    [{ date: '2026-10-09', blocks: [{ id: 'arrive' }] }, null, null, { date: '2026-10-12', blocks: [] }],
    { arrivalDate: '2026-10-09', departureDate: '2026-10-12' }
  );
  assert.deepEqual(days.map(d => d && d.date), ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12']);
  assert.equal(JSON.stringify(days[1].blocks), '[]');
  assert.equal(JSON.stringify(days[2].blocks), '[]');
});

test('a day with no blocks is stored with blocks: [], and a dateless null is not written', () => {
  const ctx = loadDays();
  const kept = ctx.storedPlanDay({ date: '2026-10-10', blocks: null }, '2026-10-10');
  assert.equal(JSON.stringify(kept.blocks), '[]');
  assert.equal(kept.date, '2026-10-10');
  const saved = ctx.prepareDaysForSave([
    { date: '2026-10-05', blocks: [] },
    null,
  ], null);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].date, '2026-10-05');
  assert.equal(saved.some(d => d == null), false);
});

test('mergeDays keeps real days and never writes null', () => {
  const ctx = loadDays();
  const existing = {
    days: [
      null,
      { date: '2026-10-06', blocks: [{ id: 'x', title: 'Factory' }] },
    ],
  };
  ctx.mergeDays(existing, [
    { date: '2026-10-05', blocks: [] },
    null,
  ]);
  assert.equal(existing.days.length, 2);
  assert.equal(existing.days[0].date, '2026-10-05');
  assert.equal(JSON.stringify(existing.days[0].blocks), '[]');
  assert.equal(existing.days[1].blocks[0].id, 'x');
  assert.equal(existing.days.every(d => d && typeof d === 'object' && Array.isArray(d.blocks)), true);
});

test('normalizePlan drops null days before it reads blocks, and sorts by date', () => {
  const start = planner.indexOf('function normalizePlan(');
  const end = planner.indexOf('function normalizeCatalogue(');
  const norm = planner.slice(start, end);
  const materializeAt = norm.indexOf('materializeBlankDays(plan.days, plan)');
  const filterAt = norm.indexOf(".filter(d => d && typeof d === 'object')");
  const sortAt = norm.indexOf("String(a.date || '9999').localeCompare(String(b.date || '9999'))");
  const forEachAt = norm.indexOf('(plan.days || []).forEach((d, dayIndex) => {');
  assert.ok(materializeAt >= 0 && materializeAt < filterAt, 'blank days are filled before the null filter');
  assert.ok(filterAt >= 0 && filterAt < forEachAt, 'null days are removed before blocks are read');
  assert.ok(sortAt > filterAt && sortAt < forEachAt);
  assert.match(norm, /if \(!d \|\| typeof d !== 'object'\) return;/);
});

test('mergeDays does not read .date off a null day', () => {
  const merge = extractFunction(planner, 'mergeDays');
  assert.match(merge, /if \(d && d\.date\)/);
  assert.equal(merge.includes('if (d.date)'), false);
});

test('a cloud save of an edited plan does not write a null day back', () => {
  const BE = loadExtras();
  const server = {
    days: [
      { date: '2026-10-05', blocks: [{ id: 'a', title: 'Shop' }] },
      null,
      { date: '2026-10-07', blocks: [] },
    ],
  };
  const baseline = {
    days: [
      { date: '2026-10-05', blocks: [{ id: 'a', title: 'Shop' }] },
      { date: '2026-10-06', blocks: [] },
      { date: '2026-10-07', blocks: [] },
    ],
  };
  const current = JSON.parse(JSON.stringify(baseline));
  current.days[0].blocks[0].title = 'Factory';
  const patched = BE.applyEditedPatch(server, baseline, current);
  assert.equal(patched.changed, true);
  assert.equal(patched.value.days.every(d => d && typeof d === 'object' && Array.isArray(d.blocks)), true);
  assert.equal(patched.value.days[0].blocks[0].title, 'Factory');
  assert.equal(JSON.stringify(patched.value.days[1]), JSON.stringify({ date: '2026-10-06', blocks: [] }));
  assert.equal(patched.value.days[2].date, '2026-10-07');
});

test('primitive lists still patch, and deleting a real day still removes it', () => {
  const BE = loadExtras();
  const years = BE.applyEditedPatch([2024, 2025], [2024, 2025], [2024, 2025, 2026]);
  assert.equal(JSON.stringify(years.value), JSON.stringify([2024, 2025, 2026]));

  const server = {
    days: [
      { date: '2026-10-05', blocks: [] },
      { date: '2026-10-06', blocks: [{ id: 'a' }] },
    ],
  };
  const baseline = JSON.parse(JSON.stringify(server));
  const current = { days: [{ date: '2026-10-05', blocks: [] }] };
  const patched = BE.applyEditedPatch(server, baseline, current);
  assert.equal(JSON.stringify(patched.value.days.map(d => d.date)), JSON.stringify(['2026-10-05']));
});
