const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

require('./booking-format.js');

const form = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');
const hotels = fs.readFileSync(path.join(__dirname, 'hotels.js'), 'utf8');

function extractFunction(source, name) {
  let start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing function ' + name);
  if (source.slice(start - 6, start) === 'async ') start -= 6;
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

test('an unconfirmed booking shows (unverified) once, including Gail Berglund', () => {
  const title = BookingFormat.unverifiedBookingTitle;
  assert.equal(title('Gail Berglund', 'unconfirmed'), 'Gail Berglund (unverified)');
  assert.equal(title('Gail Berglund (unverified)', 'unconfirmed'), 'Gail Berglund (unverified)');
  assert.equal(title('Gail Berglund (unverified) ', 'Unconfirmed'), 'Gail Berglund (unverified)');
  assert.equal(title('Gail Berglund', null), 'Gail Berglund');
  assert.equal(title('Gail Berglund', 'cancelled'), 'Gail Berglund');
  assert.equal(title('Gail Berglund', 'duplicate'), 'Gail Berglund');
  assert.equal(title('Gail Berglund', 'companion'), 'Gail Berglund');
  assert.equal(title('  Gail Berglund  ', 'unconfirmed'), 'Gail Berglund (unverified)');
});

test('the unverified tick writes unconfirmed and leaves other statuses alone', () => {
  const fare = form.slice(form.indexOf('function tourFareHTML('), form.indexOf('function fuelCostFieldHTML('));
  const full = fare.indexOf('id="t${t}_tour_full"');
  const box = fare.indexOf('id="t${t}_unverified"');
  const group = fare.indexOf('id="t${t}_group_price"');
  assert.ok(full > 0 && box > full && group > box);
  assert.match(fare, /> Unverified</);

  const context = {};
  vm.createContext(context);
  vm.runInContext([
    extractFunction(form, 'protectedBookingStatus'),
    extractFunction(form, 'statusAfterUnverifiedTick'),
    extractFunction(form, 'rememberedBookingStatus'),
  ].join('\n'), context);

  assert.equal(context.statusAfterUnverifiedTick(null, true), 'unconfirmed');
  assert.equal(context.statusAfterUnverifiedTick('unconfirmed', true), 'unconfirmed');
  assert.equal(context.statusAfterUnverifiedTick('unconfirmed', false), null);
  assert.equal(context.statusAfterUnverifiedTick(null, false), null);
  assert.equal(context.statusAfterUnverifiedTick('', false), null);
  assert.equal(context.statusAfterUnverifiedTick('cancelled', false), 'cancelled');
  assert.equal(context.statusAfterUnverifiedTick('cancelled', true), 'cancelled');
  assert.equal(context.statusAfterUnverifiedTick('duplicate', false), 'duplicate');
  assert.equal(context.statusAfterUnverifiedTick('Duplicate', true), 'duplicate');
  assert.equal(context.statusAfterUnverifiedTick('companion', true), 'companion');
  assert.equal(context.statusAfterUnverifiedTick('Companion', false), 'companion');
  assert.equal(context.rememberedBookingStatus('unconfirmed'), 'unconfirmed');
  assert.equal(context.rememberedBookingStatus('cancelled'), 'cancelled');
  assert.equal(context.rememberedBookingStatus(null), null);

  const save = extractFunction(form, 'getTabFormData');
  assert.match(save, /data\.status = typeof statusAfterUnverifiedTick/);
  assert.equal(save.includes('(unverified)'), false);
  assert.match(form, /optional\.status = bookingData\.status/);
  assert.match(extractFunction(form, 'populateTab'), /applyUnverified\(tabId, rememberedBookingStatus\(record\.status\) === 'unconfirmed'\)/);

  for (const name of ['buildYearTourPlan', 'yearTourById', 'renderYearCalendar', 'renderRecords', 'renderTable', 'openNewTab', 'fillCompanionSelect', 'bookingOwnStats']) {
    assert.match(extractFunction(form, name), /bookingShownName\(/, name);
  }
  assert.match(hotels, /BookingFormat\.unverifiedBookingTitle\(s\.groupName, s\.bookingStatus\)/);
  assert.equal(hotels.includes("groupName: BookingFormat"), false);
});

test('year tour titles use the shared suffix and do not double it', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'booking-format.js'), 'utf8'), ctx);
  vm.runInContext([
    extractFunction(form, 'bookingShownName'),
    extractFunction(form, 'parseISODateUTC'),
    extractFunction(form, 'toISODateUTC'),
    extractFunction(form, 'extractBookingRangeUTC'),
    extractFunction(form, 'bookingIsCancelled'),
    extractFunction(form, 'bookingIsTourFull'),
    extractFunction(form, 'yearTourIsDayTrip'),
    extractFunction(form, 'buildYearTourPlan'),
  ].join('\n'), ctx);
  const plan = ctx.buildYearTourPlan([
    { id: 315, group_name: 'Gail Berglund (unverified)', status: 'unconfirmed', tour_arrival_date: '2027-05-09', departure_date: '2027-05-15' },
    { id: 316, group_name: 'May stay', status: 'unconfirmed', tour_arrival_date: '2027-05-20', departure_date: '2027-05-24' },
    { id: 317, group_name: 'Kept', status: 'cancelled', tour_arrival_date: '2027-06-01', departure_date: '2027-06-04' },
  ]);
  const titles = Array.from(plan.years[0].months[4].tours, tour => String(tour.title));
  assert.deepEqual(titles, ['Gail Berglund (unverified)', 'May stay (unverified)']);
  assert.equal(String(plan.years[0].months[5].tours[0].title), 'Kept');
});
