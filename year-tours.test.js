const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, 'booking-form.html'), 'utf8');

function extractFunction(name) {
  const start = html.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing function ' + name);
  let i = html.indexOf('{', start);
  let depth = 0;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error('unclosed function ' + name);
}

function loadPlan() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext([
    extractFunction('parseISODateUTC'),
    extractFunction('toISODateUTC'),
    extractFunction('extractBookingRangeUTC'),
    extractFunction('bookingIsCancelled'),
    extractFunction('yearTourIsDayTrip'),
    extractFunction('buildYearTourPlan'),
  ].join('\n'), ctx);
  return ctx.buildYearTourPlan;
}

test('year tours are grouped from booking dates, across months and years', () => {
  const build = loadPlan();
  const plan = build([
    { id: 1, group_name: 'May stay', tour_arrival_date: '2026-05-28', departure_date: '2026-06-02', no_people: 4, hotel_name: 'Hotel Karolina' },
    { id: 2, group_name: 'New year', tour_arrival_date: '2025-12-30', departure_date: '2026-01-02', no_people: 1 },
    { id: 3, group_name: 'Undated' },
    { id: 4, group_name: 'Cancelled week', tour_arrival_date: '2026-05-01', departure_date: '2026-05-04', status: 'cancelled' },
  ]);

  assert.deepEqual(Array.from(plan.years, year => Number(year.year)), [2026, 2025]);
  const y2026 = plan.years[0];
  assert.equal(y2026.tourCount, 3);
  assert.equal(y2026.months[4].name, 'May');
  assert.deepEqual(Array.from(y2026.months[4].tours, tour => tour.title), ['Cancelled week', 'May stay']);
  assert.equal(y2026.months[4].tours[1].hotel, 'Hotel Karolina');
  assert.equal(y2026.months[5].tours[0].title, 'May stay');
  assert.equal(y2026.months[0].tours[0].title, 'New year');
  assert.equal(y2026.months[0].tours[0].cancelled, false);
  assert.equal(y2026.months[4].tours[0].cancelled, true);
  const y2025 = plan.years[1];
  assert.equal(y2025.tourCount, 1);
  assert.equal(y2025.months[11].tours[0].title, 'New year');
  assert.deepEqual(Array.from(plan.undated, tour => tour.title), ['Undated']);
});

test('arrival and flight dates start closed, and the fare row stays in order', () => {
  const dates = html.slice(html.indexOf('function tourDatesFoldHTML('), html.indexOf('function flightDatesFoldHTML('));
  const flights = html.slice(html.indexOf('function flightDatesFoldHTML('), html.indexOf('function tourFareHTML('));
  const fare = html.slice(html.indexOf('function tourFareHTML('), html.indexOf('function fuelCostFieldHTML('));
  assert.match(dates, /data-fold="tour-dates"/);
  assert.equal(dates.includes(' open'), false);
  assert.match(flights, /data-fold="flights"/);
  assert.equal(flights.includes(' open'), false);
  assert.match(dates, /id: 't' \+ t \+ '_tour_arrival_date'/);
  assert.match(dates, /id: 't' \+ t \+ '_departure_date'/);
  const name = fare.indexOf('_group_name');
  const price = fare.indexOf('_price_per_person');
  const head = fare.indexOf('_no_people');
  const total = fare.indexOf('_beading_tour_price');
  assert.ok(name > 0 && price > name && head > price && total > head);
  assert.equal(fare.includes('readonly'), false);

  const table = html.indexOf('id="navTable"');
  const year = html.indexOf('id="navYearTours"');
  const analytics = html.indexOf('id="navAnalytics"');
  assert.ok(table > 0 && year > table && analytics > year);
  assert.match(html, /Year tours/);
  assert.match(html, /Show the year/);
  assert.match(html, /Close the year/);
  assert.match(extractFunction('showView'), /view === 'year'/);
  assert.match(html, /id="navForm"/);

  const grid = extractFunction('yearTourMonthGridHTML');
  assert.match(grid, /class="yc-grid"/);
  assert.match(grid, /yc-cell/);
  assert.match(grid, /openYearTourDay/);
  const opener = extractFunction('openYearTourBooking');
  assert.match(opener, /setFormLayout\('layout'\)/);
  assert.match(opener, /openBookingInTab/);
  assert.equal(opener.includes("setFormLayout('standard')"), false);
});

function loadHeat() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext([
    extractFunction('yearTourHeadcount'),
    extractFunction('yearTourHeatAmount'),
    extractFunction('yearTourShade'),
    extractFunction('yearTourDayHeat'),
    extractFunction('yearTourIsDayTrip'),
  ].join('\n'), ctx);
  return ctx;
}

function channelSum(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255);
}

test('larger groups are darker, and a day trip uses blue', () => {
  const heat = loadHeat();
  const scale = { min: 2, max: 12 };
  const small = heat.yearTourShade(false, heat.yearTourHeatAmount(2, scale));
  const large = heat.yearTourShade(false, heat.yearTourHeatAmount(12, scale));
  const day = heat.yearTourShade(true, heat.yearTourHeatAmount(12, scale));
  assert.ok(channelSum(large.bg) < channelSum(small.bg));
  const overnight = parseInt(large.bg.slice(1), 16);
  const dayRgb = parseInt(day.bg.slice(1), 16);
  const og = (overnight >> 8) & 255;
  const or = (overnight >> 16) & 255;
  const ob = overnight & 255;
  const db = dayRgb & 255;
  const dg = (dayRgb >> 8) & 255;
  assert.ok(og > or && og > ob, 'overnight stays green');
  assert.ok(db > dg, 'day trip is blue');
  const shared = heat.yearTourDayHeat([
    { people: 3, dayTrip: false, title: 'Small' },
    { people: 9, dayTrip: true, title: 'Big day' },
  ], scale);
  assert.equal(shared.head, 9);
  assert.equal(shared.dayTrip, true);
  assert.equal(heat.yearTourIsDayTrip({ group_name: 'Prague day trip', hotel_name: '' }), true);
  assert.equal(heat.yearTourIsDayTrip({ group_name: 'May stay', hotel_name: 'Hotel Karolina' }), false);
});
