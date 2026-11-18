const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

require('./booking-format.js');
require('./hotel-directory.js');

const html = require('./test-page').pageSource(path.join(__dirname, 'hotels.html'), 'utf8');

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

function loadSummary() {
  const context = { HotelDirectory: globalThis.HotelDirectory };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('totalHotelStaysLabel'),
    extractFunction('stayRoomCount'),
    extractFunction('fullTourCount'),
    extractFunction('stayViewSummary'),
  ].join('\n'), context);
  return context;
}

test('the top pill counts every stay, and the line above the list totals the current view', () => {
  const ctx = loadSummary();
  assert.equal(ctx.totalHotelStaysLabel(207), '207 total hotel stays');
  assert.equal(ctx.totalHotelStaysLabel(1), '1 total hotel stay');
  assert.equal(ctx.totalHotelStaysLabel(0), '0 total hotel stays');

  const statsAt = html.indexOf('id="stayStats"');
  const listAt = html.indexOf('id="stayList"');
  const toolbarAt = html.indexOf('id="yearFilter"');
  assert.ok(toolbarAt > 0 && statsAt > toolbarAt && statsAt < listAt);
  assert.match(html, /class="stay-stats"/);
  assert.match(html, /max-width:\s*100%/);
  assert.match(html, /overflow-wrap:\s*anywhere/);

  const render = extractFunction('render');
  assert.match(render, /const rows = visibleStays\(\)/);
  assert.match(render, /paintStayStats\(rows\)/);
  const visible = extractFunction('visibleStays');
  assert.match(visible, /yearFilter/);
  assert.match(visible, /search/);
  assert.equal((html.match(/totalHotelStaysLabel\(stays\.length\)/g) || []).length, 2);
  assert.equal(html.includes(" + ' hotel stay'"), false);
});

test('the hotels year filter opens on 2027, and a year in the URL still wins', () => {
  assert.match(html, /let yearFilter = '2027'/);
  assert.equal(html.includes('let yearFilter = String(new Date().getUTCFullYear())'), false);
  assert.match(html, /if \(requestedYear === 'all' \|\| \/\^\\d\{4\}\$\/\.test\(requestedYear \|\| ''\)\) yearFilter = requestedYear/);
  const fill = extractFunction('fillYearOptions');
  assert.match(fill, /years\.add\('2027'\)/);
});

test('view totals use known nights, skip cancelled nights, and add room-nights when rooms are shown', () => {
  const ctx = loadSummary();
  const rows = [
    {
      role: 'tour',
      arrivalDate: '2027-06-01',
      departureDate: '2027-06-05',
      roomsNeededLabel: '2 rooms needed',
    },
    {
      role: 'tour',
      bookingStatus: 'cancelled',
      arrivalDate: '2027-08-01',
      departureDate: '2027-08-06',
      roomsNeededLabel: '3 rooms needed',
    },
    {
      role: 'extra',
      explicitNights: '2',
      roomsNeededLabel: '',
    },
  ];
  const summary = ctx.stayViewSummary(rows, '2027');
  assert.equal(summary.text, '2027: 3 stays · 6 hotel nights · 8 room-nights · 0 full tours');
  assert.match(summary.title, /Cancelled stays are still listed and are not included in the nights/);
  assert.match(summary.title, /Room-nights are rooms × nights from the rooms already shown/);
  assert.match(summary.title, /Cancelled stays are left out of those too/);

  const all = ctx.stayViewSummary(rows, 'All years');
  assert.equal(all.text, 'All years: 3 stays · 6 hotel nights · 8 room-nights · 0 full tours');

  const one = ctx.stayViewSummary([{
    role: 'tour',
    arrivalDate: '2027-06-01',
    departureDate: '2027-06-02',
    roomsNeededLabel: '1 room needed',
  }], '2027');
  assert.equal(one.text, '2027: 1 stay · 1 hotel night · 1 room-night · 0 full tours');

  const noRooms = ctx.stayViewSummary([{
    role: 'tour',
    arrivalDate: '2027-06-01',
    departureDate: '2027-06-04',
  }], '2027');
  assert.equal(noRooms.text, '2027: 1 stay · 3 hotel nights · 0 full tours');
  assert.equal(/room-night/.test(noRooms.title), false);

  const cancelledOnly = ctx.stayViewSummary([{
    role: 'tour',
    bookingStatus: 'cancelled',
    arrivalDate: '2027-06-01',
    departureDate: '2027-06-08',
    roomsNeededLabel: '2 rooms needed',
  }], '2027');
  assert.equal(cancelledOnly.text, '2027: 1 stay · 0 hotel nights · 0 full tours');
  assert.equal(/room-night/.test(cancelledOnly.title), false);
});

function loadHotelNights() {
  const context = { HotelDirectory: globalThis.HotelDirectory };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('normName'),
    extractFunction('isPlaceholderHotelName'),
    extractFunction('hotelNightPhrase'),
    extractFunction('stayHotelLabel'),
    extractFunction('hotelNightRows'),
    extractFunction('hotelNightPreview'),
  ].join('\n'), context);
  return context;
}

test('nights in view are listed per hotel, with the top three and a more toggle', () => {
  const ctx = loadHotelNights();
  const rows = [
    { hotelName: 'Golden Lion', role: 'tour', arrivalDate: '2027-06-01', departureDate: '2027-06-07' },
    { hotelName: 'golden lion', role: 'tour', explicitNights: '4' },
    { hotelName: 'Park Hotel', role: 'tour', explicitNights: '3' },
    { hotelName: 'Amber Inn', role: 'tour', explicitNights: '10' },
    { hotelName: 'Cedar Lodge', role: 'tour', explicitNights: '2' },
    { hotelName: 'Birch House', role: 'tour', arrivalDate: '2027-04-01', departureDate: '2027-04-02' },
    { hotelName: 'Quiet Hotel', role: 'tour', bookingStatus: 'cancelled', explicitNights: '9' },
    { hotelName: '', role: 'extra', explicitNights: '2' },
    { hotelName: 'Name not in notes', role: 'extra', explicitNights: '1' },
    { hotelName: 'Lake Hotel', role: 'prague' },
  ];
  const items = ctx.hotelNightRows(rows);
  assert.equal(Array.from(items, item => item.text).join('\n'), [
    '10 nights at Amber Inn',
    '10 nights at Golden Lion',
    '3 nights at Hotel not named yet',
    '3 nights at Park Hotel',
    '2 nights at Cedar Lodge',
    '1 night at Birch House',
  ].join('\n'));
  assert.equal(ctx.hotelNightPhrase(1, 'Park Hotel'), '1 night at Park Hotel');

  const closed = ctx.hotelNightPreview(items, false);
  assert.equal(closed.text, '10 nights at Amber Inn · 10 nights at Golden Lion · 3 nights at Hotel not named yet');
  assert.equal(closed.more, '+3 more');
  const open = ctx.hotelNightPreview(items, true);
  assert.equal(open.text, items.map(item => item.text).join(' · '));
  assert.equal(open.more, 'Show less');
  const short = ctx.hotelNightPreview(items.slice(0, 2), false);
  assert.equal(short.more, '');

  const statsAt = html.indexOf('id="stayStats"');
  const hotelsAt = html.indexOf('id="stayHotelNights"');
  const listAt = html.indexOf('id="stayList"');
  assert.ok(statsAt > 0 && hotelsAt > statsAt && hotelsAt < listAt);
  const render = extractFunction('render');
  assert.match(render, /paintStayStats\(rows\);\s*paintStayHotelNights\(rows\)/);
  assert.match(html, /Hotel not named yet/);
  assert.match(html, /data-hotel-nights-more/);
  assert.match(extractFunction('hotelNightPreview'), /'\+' \+ extra \+ ' more'/);
  assert.match(html, /\.stay-hotel-nights[\s\S]*max-width:\s*100%/);
  assert.match(html, /overflow-wrap:\s*break-word/);
});
