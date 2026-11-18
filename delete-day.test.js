const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

require('./booking-format.js');

const planner = fs.readFileSync(path.join(__dirname, 'tour-planner.js'), 'utf8');

function extractFunction(name) {
  const start = planner.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing ' + name);
  let i = planner.indexOf('{', start);
  let depth = 0;
  for (; i < planner.length; i++) {
    if (planner[i] === '{') depth++;
    else if (planner[i] === '}') {
      depth--;
      if (depth === 0) return planner.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

function loadDays() {
  const ctx = { BookingFormat: global.BookingFormat };
  vm.createContext(ctx);
  vm.runInContext([
    extractFunction('parseISODateUTC'),
    extractFunction('toISODateUTC'),
    extractFunction('enumerateDates'),
    extractFunction('emptyStoredDay'),
    extractFunction('storedPlanDay'),
    extractFunction('ensureTourSpanDays'),
    extractFunction('deleteDayLabel'),
    extractFunction('forgetRemovedDay'),
    extractFunction('removePlanDay'),
  ].join('\n'), ctx);
  return ctx;
}

test('deleting a day drops that day and its stops and leaves the others untouched', () => {
  const api = loadDays();
  const monday = { id: 'mon', date: '2027-05-31', blocks: [{ id: 'keep', title: 'Stay' }] };
  const tuesday = { id: 'tue', date: '2027-06-01', blocks: [{ id: 'gone', title: 'Matubo' }] };
  const wednesday = { id: 'wed', date: '2027-06-02', blocks: [{ id: 'shop', title: 'Vlad' }] };
  const plan = {
    arrivalDate: '2027-05-31',
    departureDate: '2027-06-02',
    days: [monday, tuesday, wednesday],
  };
  assert.equal(api.deleteDayLabel(tuesday, 1), 'Tue 1 Jun');
  assert.equal(api.deleteDayLabel({ date: '' }, 2), 'Day 3');
  assert.equal(api.removePlanDay(plan, 1), true);
  assert.equal(plan.days.length, 2);
  assert.equal(plan.days[0], monday);
  assert.equal(plan.days[1], wednesday);
  assert.deepEqual(monday.blocks, [{ id: 'keep', title: 'Stay' }]);
  assert.deepEqual(wednesday.blocks, [{ id: 'shop', title: 'Vlad' }]);
  assert.equal(plan.removedDayDates.length, 1);
  assert.equal(plan.removedDayDates[0], '2027-06-01');

  api.ensureTourSpanDays(plan);
  assert.equal(plan.days.length, 2);
  assert.equal(plan.days[0], monday);
  assert.equal(plan.days[1], wednesday);

  const ask = extractFunction('deletePlanDay');
  assert.match(ask, /confirm\('Delete ' \+ deleteDayLabel\(day, index\) \+ ' and its stops\?'\)/);
  assert.match(ask, /scheduleAutoSave\(\)/);
  assert.match(planner, /data-delete-day=/);
  assert.match(planner, /class="day-delete"/);
  const rough = planner.slice(planner.indexOf('function renderRoughPlanPanel('), planner.indexOf('function renderDayGlance('));
  assert.ok(rough.length > 100);
  assert.equal(rough.includes('data-delete-day'), false);
});
