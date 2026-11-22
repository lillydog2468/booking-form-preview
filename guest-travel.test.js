const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('node:vm');

require('./booking-format.js');

const html = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');

function extractFunction(name) {
  const start = html.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing ' + name);
  let i = html.indexOf('{', start);
  let depth = 0;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

function loadGuestTravel() {
  const ctx = { BookingFormat: global.BookingFormat };
  vm.createContext(ctx);
  vm.runInContext([
    "const GUEST_FLIGHT_KEYS = ['arrival_flight', 'arrival_date', 'arrival_time', 'departure_flight', 'departure_date', 'departure_time', 'flight_note'];",
    extractFunction('parseISODateUTC'),
    extractFunction('toISODateUTC'),
    extractFunction('formatDateDMY'),
    extractFunction('parseFlexibleDateUTC'),
    extractFunction('toStorageISO'),
    extractFunction('guestShortDate'),
    extractFunction('guestDayMonth'),
    extractFunction('guestClock'),
    extractFunction('pragueStayNights'),
    extractFunction('pragueNightPhrase'),
    extractFunction('guestFlightSummary'),
    extractFunction('normalisePragueStay'),
    extractFunction('pragueStayHasDetail'),
    extractFunction('pragueStayTitle'),
    extractFunction('guestPragueSummary'),
    extractFunction('guestPersonName'),
    extractFunction('ownPragueStaysLine'),
    extractFunction('guestFlightKey'),
    extractFunction('pragueStayKey'),
    extractFunction('joinedNames'),
    extractFunction('sharedFlightPrompt'),
    extractFunction('sharedPraguePrompt'),
    extractFunction('copyFlightFields'),
    extractFunction('copyFlightsFromFirst'),
    extractFunction('copyPragueToEveryGuest'),
    extractFunction('unseenSavedRows'),
    extractFunction('pragueFillFromGuests'),
    extractFunction('bookingChildrenReady'),
    extractFunction('screenGuestsLackLoadedIds'),
    extractFunction('tabMissedSavedChildren'),
  ].join('\n'), ctx);
  return ctx;
}

test('flight and Prague summaries, and nights between check-in and check-out', () => {
  const ctx = loadGuestTravel();
  assert.equal(ctx.guestFlightSummary({}), 'No flights yet');
  const kay = {
    id: 5635,
    first_name: 'Kay',
    last_name: 'Enk',
    arrival_flight: 'KL1353',
    arrival_date: '2027-05-09',
    arrival_time: '10:30:00',
    departure_flight: 'KL1356',
    departure_date: '2027-05-15',
    departure_time: '14:30:00',
    flight_note: 'window seat',
  };
  assert.equal(ctx.guestFlightSummary(kay), 'KL1353 arr 09/05 10:30 · KL1356 dep 15/05 14:30');
  assert.equal(ctx.pragueStayNights('2027-05-09', '2027-05-10'), 1);
  assert.equal(ctx.pragueStayNights('2027-05-09', '2027-05-09'), 0);
  assert.equal(ctx.guestPragueSummary([
    { hotel: 'Hotel X', check_in: '2027-05-09', check_out: '2027-05-10' },
    { hotel: 'Hotel X', check_in: '2027-05-14', check_out: '2027-05-15' },
  ]), 'Own Prague hotel: Hotel X 9 May (1 night), 14 May (1 night)');
  assert.equal(ctx.guestPragueSummary([]), 'No own Prague stay');
  assert.equal(ctx.ownPragueStaysLine([
    { first_name: 'Kay', last_name: 'Enk', prague_stays: [
      { hotel: 'Hotel X', check_in: '2027-05-09', check_out: '2027-05-10' },
      { hotel: 'Hotel X', check_in: '2027-05-14', check_out: '2027-05-15' },
    ] },
  ]), 'Own Prague stays: Kay Enk, 2 nights (9 May, 14 May)');
});

test('shared flights and Prague stays ask before replacing, then copy', () => {
  const ctx = loadGuestTravel();
  const guests = [
    { first_name: 'Dana', last_name: 'Lee', arrival_flight: 'KL1', departure_flight: 'KL2', prague_stays: [{ hotel: 'Group Hotel', check_in: '2027-05-09', check_out: '2027-05-10', note: '' }] },
    { first_name: 'Kay', last_name: 'Enk', arrival_flight: 'BA9', prague_stays: [{ hotel: 'Own Hotel', check_in: '2027-05-09', check_out: '2027-05-10', note: '' }] },
    { first_name: 'Ann', last_name: 'Other', arrival_flight: '', prague_stays: [] },
  ];
  assert.equal(ctx.sharedFlightPrompt(guests), "Kay Enk has their own flights. Replace them with Dana Lee's?");
  assert.equal(ctx.sharedPraguePrompt(guests), "Kay Enk has their own Prague stays. Replace them with the group's?");
  assert.equal(ctx.sharedFlightPrompt([guests[0], { first_name: 'Ann', last_name: 'Other' }]), '');
  const copied = ctx.copyFlightsFromFirst(guests);
  assert.equal(copied[1].arrival_flight, 'KL1');
  assert.equal(copied[1].departure_flight, 'KL2');
  assert.equal(copied[0].arrival_flight, 'KL1');
  const shared = ctx.copyPragueToEveryGuest(guests, guests[0].prague_stays);
  assert.equal(shared[1].prague_stays[0].hotel, 'Group Hotel');
  assert.equal(shared[2].prague_stays[0].hotel, 'Group Hotel');
  assert.notEqual(shared[1].prague_stays, shared[2].prague_stays);
});

test('a save stops when the database has flights or guests this screen never loaded', () => {
  const ctx = loadGuestTravel();
  const loaded = ['4', '9'];
  assert.equal(ctx.bookingChildrenReady({ id: 310, _members: [], _childrenLoaded: false }), false);
  assert.equal(ctx.bookingChildrenReady({ id: 310, _members: [{ id: 5635, arrival_flight: 'KL1353', arrival_date: '2027-05-09', arrival_time: '10:30:00', departure_flight: 'KL1356', departure_date: '2027-05-15', departure_time: '14:30:00' }], _childrenLoaded: true }), true);
  assert.equal(ctx.screenGuestsLackLoadedIds([{ first_name: 'Kay', last_name: 'Enk', id: null }], [{ id: 5635 }]), true);
  assert.equal(ctx.screenGuestsLackLoadedIds([{ id: 5635, first_name: 'Kay' }], [{ id: 5635 }]), false);
  assert.equal(ctx.tabMissedSavedChildren(
    { dirty: false, loadedMemberIds: [], loadedFlightIds: [] },
    { _childrenLoaded: true, _members: [{ id: 5635 }], _flights: [] }
  ), true);
  assert.equal(ctx.tabMissedSavedChildren(
    { dirty: true, loadedMemberIds: [], loadedFlightIds: [] },
    { _childrenLoaded: true, _members: [{ id: 5635 }], _flights: [] }
  ), false);
  assert.equal(ctx.guestFlightSummary({
    id: 5635,
    arrival_flight: 'KL1353',
    arrival_date: '2027-05-09',
    arrival_time: '10:30:00',
    departure_flight: 'KL1356',
    departure_date: '2027-05-15',
    departure_time: '14:30:00',
    flight_note: 'window seat',
  }), 'KL1353 arr 09/05 10:30 · KL1356 dep 15/05 14:30');
  assert.deepEqual(ctx.unseenSavedRows([{ id: 4 }, { id: 9 }, { id: 12 }], loaded).map(row => row.id), [12]);
  assert.deepEqual(ctx.unseenSavedRows([{ id: 4 }], loaded), []);
  assert.deepEqual(ctx.unseenSavedRows([{ id: 3 }], []), [{ id: 3 }]);
  const patch = ctx.pragueFillFromGuests('', '', [
    { prague_stays: [{ hotel: 'Hotel X', check_in: '2027-05-09', check_out: '2027-05-11', note: '' }] },
  ], false);
  assert.equal(patch.nights, '2');
  assert.equal(patch.hotel, 'Hotel X');
  assert.equal(ctx.pragueFillFromGuests('4', 'Already typed', [
    { prague_stays: [{ hotel: 'Other', check_in: '2027-05-09', check_out: '2027-05-10' }] },
  ], false), null);
  assert.match(html, /This booking has flights saved that aren\\'t loaded on this screen/);
  assert.match(html, /This booking has guests saved that aren\\'t loaded on this screen/);
  assert.match(html, /Everyone on the same flights/);
  assert.match(html, /Whole group in the same Prague hotel/);
  assert.match(html, /Fill from guests/);
});
