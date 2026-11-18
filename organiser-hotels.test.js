const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const vm = require('node:vm');

const html = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');
const extrasSrc = fs.readFileSync(path.join(__dirname, 'booking-extras.js'), 'utf8');
const taxSrc = fs.readFileSync(path.join(__dirname, 'tax-summary.js'), 'utf8');
const analytics = fs.readFileSync(path.join(__dirname, 'analytics.html'), 'utf8');
const hotels = require('./test-page').pageSource(path.join(__dirname, 'hotels.html'), 'utf8');
const planner = require('./test-page').pageSource(path.join(__dirname, 'tour-planner.html'), 'utf8');

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

function loadExtras() {
  const ctx = { window: {}, globalThis: {} };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(extrasSrc, ctx);
  return ctx.BookingExtras;
}

test('organiser books hotels is stored in extras and absent means off', () => {
  const BE = loadExtras();
  assert.equal(BE.empty().organiserBooksHotels, false);
  assert.equal(BE.merge({}).organiserBooksHotels, false);
  assert.equal(BE.merge({ organiserBooksHotels: true }).organiserBooksHotels, true);
  assert.equal(BE.merge({ organiserBooksHotels: 'yes' }).organiserBooksHotels, false);
  assert.equal(BE.hasContent({ organiserBooksHotels: false }), false);
  assert.equal(BE.hasContent({ organiserBooksHotels: true }), true);

  const packed = BE.joinNotesAndExtras('Doris', { organiserBooksHotels: true });
  const split = BE.splitNotesAndExtras(packed);
  assert.equal(split.notes, 'Doris');
  assert.equal(split.extras.organiserBooksHotels, true);
  assert.equal(BE.joinNotesAndExtras('Doris', { organiserBooksHotels: false }), 'Doris');

  assert.equal(BE.organiserBooksHotelsOn({ extra_notes: packed }, null), true);
  assert.equal(BE.organiserBooksHotelsOn({ extra_notes: 'Doris' }, null), false);
  assert.equal(BE.organiserBooksHotelsOn(null, { organiserBooksHotels: true }), true);
  assert.equal(BE.organiserBooksHotelsOn({ extra_notes: packed }, { organiserBooksHotels: false }), false);
});

test('hotel cost drops out of a saved total only when that total still includes it', () => {
  const BE = loadExtras();
  const rows = [
    { hotel_id: 3, cost: 400 },
    { description: 'Coach', cost: 80 },
  ];
  const on = { organiserBooksHotels: true };
  const off = { organiserBooksHotels: false };
  const included = { totalexpenses: 520, fuelcost: 40 };
  const alreadyOut = { totalexpenses: 120, fuelcost: 40 };
  const blank = { fuelcost: 40 };

  assert.equal(BE.expensesStillIncludeHotels(included, rows, off), 0);
  assert.equal(BE.expensesStillIncludeHotels(included, rows, on), 400);
  assert.equal(BE.expensesStillIncludeHotels(alreadyOut, rows, on), 0);
  assert.equal(BE.expensesStillIncludeHotels(blank, rows, on), 0);
  assert.equal(BE.hotelExpenseTotal(rows), 400);
});

test('a ticked booking keeps the hotel name and drops the rooms count', () => {
  const BE = loadExtras();
  const notes = BE.joinNotesAndExtras('', {
    organiserBooksHotels: true,
    rooms: { singles: '14', keithRoom: true },
    organiser: { firstName: 'Doris', lastName: '' },
  });
  const booking = {
    extra_notes: notes,
    hotel_name: 'Park Hotel',
    tour_arrival_date: '2027-04-11',
    keith_own_room: true,
    no_people: 1,
  };
  const link = BE.bookingLink(booking, null);
  assert.equal(link.organiserBooksHotels, true);
  assert.equal(link.hotel, 'Park Hotel');
  assert.equal(link.roomsLabel, '');
  assert.equal(link.dayTrip, false);

  const plain = BE.bookingLink({
    extra_notes: BE.joinNotesAndExtras('', { rooms: { singles: '2', keithRoom: true } }),
    hotel_name: 'Park Hotel',
    keith_own_room: true,
  }, null);
  assert.equal(plain.organiserBooksHotels, false);
  assert.equal(plain.hotel, 'Park Hotel');
  assert.match(plain.roomsLabel, /rooms needed/);

  const fromPlan = BE.bookingLink(null, {
    tourHotelName: 'Park Hotel',
    bookingDetails: { organiserBooksHotels: true, rooms: { singles: '14' } },
  });
  assert.equal(fromPlan.organiserBooksHotels, true);
  assert.equal(fromPlan.hotel, 'Park Hotel');
  assert.equal(fromPlan.roomsLabel, '');
});

test('tax leaves hotel cost out when the tick is on and leaves other bookings alone', () => {
  const ctx = { window: {}, globalThis: {} };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(extrasSrc + '\n' + taxSrc, ctx);
  const BE = ctx.BookingExtras;
  const period = { start: '2027-01-01', end: '2027-12-31', label: '2027' };
  const hotelRows = [
    { booking_id: 292, hotel_id: 3, cost: 900, currency: 'GBP' },
    { booking_id: 292, description: 'Coach', cost: 50, currency: 'GBP' },
    { booking_id: 10, hotel_id: 4, cost: 200, currency: 'GBP' },
  ];
  function booking(id, flag, expenses, profit, cost) {
    return {
      id,
      group_name: id === 292 ? 'Doris' : 'Heather',
      status: '',
      tour_arrival_date: '2027-06-01',
      no_people: 1,
      price_per_person: 48,
      beading_tour_price: 48,
      fuelcost: 20,
      totalexpenses: expenses,
      totalprofit: profit,
      totalcost: cost,
      depositmade: 48,
      extra_notes: BE.joinNotesAndExtras('', { organiserBooksHotels: flag }),
    };
  }
  const summary = ctx.TaxSummary.buildTaxSummary([
    booking(292, true, 970, 48 - 970, 48 + 970),
    booking(10, false, 220, 48 - 220, 48 + 220),
  ], hotelRows, period);
  const doris = summary.rows.find(row => row.id === 292);
  const heather = summary.rows.find(row => row.id === 10);
  assert.equal(doris.costs.amount, 70);
  assert.equal(doris.hotels.amount, 0);
  assert.equal(doris.other.amount, 50);
  assert.equal(doris.profit.amount, 48 - 70);
  assert.equal(doris.totalCost.amount, 48 + 70);
  assert.equal(heather.costs.amount, 220);
  assert.equal(heather.hotels.amount, 200);
  assert.equal(heather.profit.amount, 48 - 220);
});

test('the tick sits with Day trip and the hotel section notes who arranges it', () => {
  const kind = html.slice(html.indexOf('function tourKindControlsHTML('), html.indexOf('function tourDatesFoldHTML('));
  const day = kind.indexOf('id="t${t}_day_trip"');
  const half = kind.indexOf('id="t${t}_leader_half_price"');
  const tick = kind.indexOf('id="t${t}_organiser_books_hotels"');
  assert.ok(day >= 0 && half > day && tick > half);
  assert.equal(kind.match(/day-trip-toggle/g).length, 3);
  assert.match(kind, /Organiser books hotels/);
  assert.match(html, /Organiser arranges hotels\./);
  assert.match(html, /hotel-booking-panel\.organiser-arranges/);
  assert.match(html, /x\.organiserBooksHotels = checkVal\(tabId, 'organiser_books_hotels'\)/);
  assert.doesNotMatch(html, /organiser_books_hotels BOOLEAN/);
  assert.match(analytics, /bookingHotelAdjust/);
  assert.match(analytics, /organiserBooksHotelsOn/);
  assert.match(planner, /organiserBooksHotels/);
  assert.match(hotels, /stay\.organiserBooksHotels/);
});

test('ticking drops hotel cost, rooms and the nights warning on the form', () => {
  const nodes = new Map();
  const ctx = {
    document: {
      getElementById(id) { return nodes.get(id) || null; },
      querySelector() { return null; },
    },
    tEl(tabId, key) { return nodes.get('t' + tabId + '_' + key) || null; },
    hotelDraftsForTab() { return [{ priceRaw: '400', name: 'Park Hotel' }]; },
    orphanHotelExpenses() { return [{ cost: '25' }]; },
    hotelCostNumber(v) { return Number(v) || 0; },
    tabIsDayTrip() { return false; },
    headcountPeople() { return 14; },
    roomCountBlank() { return !String(ctx.tEl('1', 'rooms_singles').value || '').trim(); },
    primaryHotelVisible() { return true; },
    renumberHotelStayRows() {},
    paintHotelTones() {},
    updatePriceHint() {},
    paintMismatch: null,
    paintHotelNightsMismatch(tabId, on) { ctx.paintMismatch = on; },
  };
  vm.createContext(ctx);
  vm.runInContext(
    extractFunction(html, 'organiserBooksHotelsOn') + '\n' +
    extractFunction(html, 'getExpensesTotalCost') + '\n' +
    extractFunction(html, 'suggestRoomsFromHeadcount') + '\n' +
    extractFunction(html, 'updateHotelNightsHint') + '\n' +
    extractFunction(html, 'syncHotelPanel'),
    ctx
  );

  const box = { checked: false };
  nodes.set('t1_organiser_books_hotels', box);
  assert.equal(ctx.getExpensesTotalCost('1'), 425);
  box.checked = true;
  assert.equal(ctx.getExpensesTotalCost('1'), 0);

  const singles = { value: '', dataset: {} };
  nodes.set('t1_rooms_singles', singles);
  nodes.set('t1_rooms_keith', { checked: false });
  ctx.suggestRoomsFromHeadcount('1');
  assert.equal(singles.value, '');
  box.checked = false;
  ctx.suggestRoomsFromHeadcount('1');
  assert.equal(singles.value, '14');
  assert.equal(singles.dataset.roomsSource, 'headcount');

  const hint = { hidden: false, textContent: 'old', classList: { removed: [], remove(name) { this.removed.push(name); } } };
  nodes.set('t1_hotel_nights_hint', hint);
  box.checked = true;
  ctx.updateHotelNightsHint('1');
  assert.equal(hint.hidden, true);
  assert.equal(hint.textContent, '');
  assert.deepEqual(hint.classList.removed, ['hotel-nights-mismatch']);
  assert.equal(ctx.paintMismatch, false);

  const panel = { hidden: false, classList: { names: new Set(), toggle(name, on) { if (on) this.names.add(name); else this.names.delete(name); } } };
  const note = { hidden: true };
  nodes.set('t1_hotel_booking_panel', panel);
  nodes.set('t1_organiser_hotels_note', note);
  nodes.set('t1_day_trip_panel', { hidden: true });
  ctx.syncHotelPanel('1');
  assert.equal(panel.hidden, false);
  assert.equal(panel.classList.names.has('organiser-arranges'), true);
  assert.equal(note.hidden, false);
});

test('Keith’s hotel list omits the booking and does not count its rooms', () => {
  const ctx = {
    isPlaceholderHotelName() { return false; },
    stayKey(a, b, c) { return [a, b, c].join('|'); },
    stayBookingId(stay) { return stay.bookingId ? String(stay.bookingId) : ''; },
    isDayTripHotelName() { return false; },
    omitUnpaidKelliStay() { return false; },
  };
  vm.createContext(ctx);
  vm.runInContext(
    extractFunction(hotels, 'addStay') + '\n' +
    extractFunction(hotels, 'omitHotelStay'),
    ctx
  );
  const listed = [];
  ctx.addStay(listed, {
    bookingKey: '292',
    bookingId: 292,
    hotelName: 'Park Hotel',
    role: 'tour',
    groupName: 'Doris',
    organiserBooksHotels: true,
    roomsNeededLabel: '15 rooms needed',
  });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].hotelName, 'Park Hotel');
  assert.equal(listed[0].organiserBooksHotels, true);
  assert.equal(listed[0].roomsNeededLabel, '');
  assert.equal(ctx.omitHotelStay(listed[0], {}), true);

  const kept = [];
  ctx.addStay(kept, {
    bookingKey: '10',
    bookingId: 10,
    hotelName: 'Grand',
    role: 'tour',
    groupName: 'Heather',
    roomsNeededLabel: '2 rooms needed',
  });
  assert.equal(kept[0].organiserBooksHotels, false);
  assert.equal(kept[0].roomsNeededLabel, '2 rooms needed');
  assert.equal(ctx.omitHotelStay(kept[0], {}), false);
});
