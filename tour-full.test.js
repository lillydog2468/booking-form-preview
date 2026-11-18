const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

require('./booking-format.js');
require('./hotel-directory.js');

const form = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');
const hotels = require('./test-page').pageSource(path.join(__dirname, 'hotels.html'), 'utf8');
const sql = fs.readFileSync(path.join(__dirname, 'sql/26_tour_full.sql'), 'utf8');
const HD = globalThis.HotelDirectory;

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

test('the tour full column is added without new grants', () => {
  assert.match(sql, /ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tour_full BOOLEAN NOT NULL DEFAULT false/);
  assert.equal(/GRANT/i.test(sql), false);
  assert.match(form, /optional\.tour_full = bookingData\.tour_full === true/);
  assert.match(form, /data\.tour_full = tourFullOn\(tabId\)/);
  assert.match(hotels, /tour_full/);
  assert.match(hotels, /if \(bookingQuery\.error && \/tour_full\/i\.test/);
});

test('the booking form toggle blocks extra people and says the tour is full', () => {
  const fare = form.slice(form.indexOf('function tourFareHTML('), form.indexOf('function fuelCostFieldHTML('));
  const head = fare.indexOf('id="t${t}_no_people"');
  const toggle = fare.indexOf('id="t${t}_tour_full"');
  assert.ok(head > 0 && toggle > head);
  assert.match(fare, />Tour full</);
  assert.match(fare, /Tour is full\. Untick Full to add more people\./);
  assert.match(form, /id="t\$\{t\}_fullTag" hidden>FULL</);
  assert.match(form, /if \(reveal && tourFullOn\(tabId\)\) return/);
  assert.match(form, /button\.member-add/);

  const context = {};
  vm.createContext(context);
  vm.runInContext([
    extractFunction(form, 'bookingIsTourFull'),
    extractFunction(form, 'nextHeadcountWhenFull'),
  ].join('\n'), context);
  assert.equal(context.bookingIsTourFull({ tour_full: true }), true);
  assert.equal(context.bookingIsTourFull({ tour_full: false }), false);
  assert.equal(context.bookingIsTourFull({}), false);
  assert.equal(JSON.stringify(context.nextHeadcountWhenFull('4', '6')), JSON.stringify({ value: '4', cap: '4' }));
  assert.equal(JSON.stringify(context.nextHeadcountWhenFull('4', '2')), JSON.stringify({ value: '2', cap: '2' }));
  assert.equal(JSON.stringify(context.nextHeadcountWhenFull('4', '')), JSON.stringify({ value: '', cap: '4' }));
  assert.equal(JSON.stringify(context.nextHeadcountWhenFull('', '1')), JSON.stringify({ value: '', cap: '' }));

  assert.match(form, /<span class="year-tour-full">FULL<\/span>/);
  assert.match(form, /<span class="tour-full-badge">FULL<\/span>/);
  assert.match(extractFunction(form, 'renderTable'), /tableStatusCell\(r\)/);
  assert.match(extractFunction(form, 'tableStatusCell'), /bookingIsTourFull\(record\)/);
  const nameCell = extractFunction(form, 'renderTable');
  const groupBranch = nameCell.slice(nameCell.indexOf("col.key === 'group_name'"), nameCell.indexOf("col.key === 'status'"));
  assert.equal(groupBranch.includes('tour-full-badge'), false);
});

test('hotels flag a full tour, soften it once the hotel is booked, and count full tours in view', () => {
  assert.match(hotels, /Full tours only/);
  assert.match(hotels, /if \(fullOnly && !s\.tourFull\) return false/);
  assert.match(hotels, /Tour full: make sure the hotel is booked/);
  assert.match(hotels, /Tour full · hotel booked ✓/);

  const context = { HotelDirectory: HD };
  vm.createContext(context);
  vm.runInContext([
    extractFunction(hotels, 'fullTourCount'),
    extractFunction(hotels, 'stayRoomCount'),
    extractFunction(hotels, 'stayViewSummary'),
    extractFunction(hotels, 'fullHotelFlag'),
  ].join('\n'), context);

  const rows = [
    { bookingId: 7, tourFull: true, role: 'tour', explicitNights: '4', roomsNeededLabel: '1 room needed', booked: false },
    { bookingId: 7, tourFull: true, role: 'prague', explicitNights: '1', booked: true },
    { bookingId: 8, tourFull: true, role: 'tour', explicitNights: '2', booked: false },
    { bookingId: 9, tourFull: false, role: 'tour', explicitNights: '3', booked: false },
  ];
  assert.equal(context.fullTourCount(rows), 2);
  assert.equal(context.stayViewSummary(rows, '2027').text, '2027: 4 stays · 10 hotel nights · 4 room-nights · 2 full tours');
  assert.match(context.fullHotelFlag(rows[0]), /Tour full: make sure the hotel is booked/);
  assert.equal(/is-booked/.test(context.fullHotelFlag(rows[0])), false);
  assert.match(context.fullHotelFlag(rows[1]), /Tour full · hotel booked ✓/);
  assert.equal(context.fullHotelFlag(rows[3]), '');

  const loud = HD.renderDirectoryHtml(HD.buildDirectory({
    stays: [{
      key: '7|tour|park hotel',
      hotelName: 'Park hotel',
      role: 'tour',
      groupName: 'June group',
      bookingKey: '7',
      bookingId: '7',
      tourFull: true,
      booked: false,
      arrivalDate: '2027-06-01',
      departureDate: '2027-06-05',
    }],
  }), '');
  assert.match(loud, /Tour full: make sure the hotel is booked/);
  assert.equal(/is-booked/.test(loud), false);

  const quiet = HD.renderDirectoryHtml(HD.buildDirectory({
    stays: [{
      key: '8|tour|lake hotel',
      hotelName: 'Lake hotel',
      role: 'tour',
      groupName: 'July group',
      bookingKey: '8',
      bookingId: '8',
      tourFull: true,
      booked: true,
      arrivalDate: '2027-07-01',
      departureDate: '2027-07-04',
    }],
  }), '');
  assert.match(quiet, /Tour full · hotel booked ✓/);
  assert.match(quiet, /is-booked/);
});
