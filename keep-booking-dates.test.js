const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('node:vm');

const html = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');

function extractFunction(name, nextName) {
  let start = html.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing function ' + name);
  if (html.slice(start - 6, start) === 'async ') start -= 6;
  if (nextName) {
    const end = html.indexOf('\n  function ' + nextName + '(', start);
    assert.ok(end > start, 'missing next function ' + nextName);
    return html.slice(start, end);
  }
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

function dateContext() {
  const nodes = new Map();
  const ctx = {
    tabs: new Map(),
    nodes,
    FORM_DATE_KEYS: new Set(['tour_arrival_date', 'departure_date', 'deposit_paid_date', 'final_payment_date']),
    FIELDS: ['group_name', 'no_people', 'price_per_person', 'tour_arrival_date', 'departure_date', 'deposit_paid_date', 'final_payment_date', 'fuelcost', 'other_hotel_nights', 'depositmade', 'finalpayment', 'beading_tour_price', 'extra_notes'],
    NUMERIC_FIELDS: ['price_per_person', 'fuelcost', 'depositmade', 'finalpayment', 'beading_tour_price'],
    CURRENCY_FIELDS: [],
    DEFAULT_CURRENCY: 'GBP',
    allBookings: [],
    window: {},
    console,
  };
  ctx.tEl = (tabId, suffix) => nodes.get('t' + tabId + '_' + suffix) || null;
  ctx.syncMainPaymentsFromGuests = () => {};
  ctx.applySuggestedPrice = () => {};
  ctx.groupPriceOn = () => false;
  ctx.checkVal = () => false;
  ctx.tourFullOn = () => false;
  ctx.getExpensesTotalCost = () => 0;
  ctx.getAdditionalExpensesTotalCost = () => 0;
  ctx.getMembersData = () => [];
  ctx.resolveSideTripHotels = async () => {};
  ctx.collectBookingExtras = () => ({});
  ctx.packBookingNotes = () => '';
  ctx.getFlightsData = () => [];
  ctx.getHotelStaysData = () => [];
  ctx.orphanHotelExpenses = () => [];
  ctx.getAdditionalExpensesData = () => [];
  vm.createContext(ctx);
  vm.runInContext([
    extractFunction('parseFlexibleDateUTC'),
    extractFunction('toISODateUTC'),
    extractFunction('toStorageISO'),
    extractFunction('normaliseStoredDate'),
    extractFunction('bookingDateForSave'),
    extractFunction('getTabFormData', 'populateTab'),
  ].join('\n'), ctx);
  return ctx;
}

function input(ctx, id, value) {
  const node = { id, value: value == null ? '' : String(value) };
  ctx.nodes.set(id, node);
  return node;
}

test('saving an existing booking keeps its dates when the date boxes are empty', async () => {
  const ctx = dateContext();
  ctx.tabs.set('tab1', {
    bookingId: 292,
    loadedDates: {
      tour_arrival_date: '2027-10-02',
      departure_date: '2027-10-10',
    },
    dateFieldsTouched: {},
  });
  input(ctx, 'ttab1_group_name', 'Dorris 2027');
  input(ctx, 'ttab1_no_people', '14');
  input(ctx, 'ttab1_tour_arrival_date', '');
  input(ctx, 'ttab1_departure_date', '');
  const data = await vm.runInContext('getTabFormData("tab1")', ctx);
  assert.equal(data.tour_arrival_date, '2027-10-02');
  assert.equal(data.departure_date, '2027-10-10');
  assert.equal(data.group_name, 'Dorris 2027');
});

test('a missing date box does not wipe a stored date, and clearing the box does', async () => {
  const ctx = dateContext();
  ctx.tabs.set('tab1', {
    bookingId: 292,
    loadedDates: {
      tour_arrival_date: '2027-10-02',
      departure_date: '2027-10-10',
      deposit_paid_date: '2027-01-04',
    },
    dateFieldsTouched: { tour_arrival_date: true },
  });
  input(ctx, 'ttab1_group_name', 'Dorris 2027');
  input(ctx, 'ttab1_tour_arrival_date', '');
  input(ctx, 'ttab1_departure_date', '2027-10-10T00:00:00.000Z');
  const data = await vm.runInContext('getTabFormData("tab1")', ctx);
  assert.equal(data.tour_arrival_date, null);
  assert.equal(data.departure_date, '2027-10-10');
  assert.equal(data.deposit_paid_date, '2027-01-04');
});

test('a date Keith types still replaces the stored one', () => {
  const ctx = dateContext();
  ctx.tabs.set('tab1', {
    loadedDates: { tour_arrival_date: '2027-10-02' },
    dateFieldsTouched: { tour_arrival_date: true },
  });
  const iso = vm.runInContext('bookingDateForSave("tab1", "tour_arrival_date", "03/10/2027")', ctx);
  assert.equal(iso, '2027-10-03');
});

test('the form remembers loaded dates and only a real edit counts as clearing them', () => {
  const populate = extractFunction('populateTab');
  assert.match(populate, /rememberLoadedDates\(tabId, record\)/);
  const inputFn = extractFunction('onTabInput');
  assert.match(inputFn, /noteDateFieldTouched\(tabId, changedId\)/);
  const reset = extractFunction('resetTab');
  assert.match(reset, /tabData\.loadedDates = \{\}/);
  assert.match(reset, /tabData\.dateFieldsTouched = \{\}/);
  const save = extractFunction('saveBooking');
  assert.match(save, /rememberSavedDates\(tabId, data\)/);
  assert.equal(html.includes('data[f] = toStorageISO(val)'), false);
});

function listContext() {
  const list = { innerHTML: '' };
  const ctx = {
    tabs: new Map(),
    activeTabId: null,
    list,
    el(id) { return id === 'recordsList' ? list : null; },
    escapeHtml(s) { return String(s == null ? '' : s); },
    bookingIsCancelled() { return false; },
    bookingIdLabel() { return ''; },
    bookingIsTourFull() { return false; },
    delayUntilLabel() { return ''; },
    formatDateDMY(iso) { return String(iso || ''); },
    formatMoney() { return ''; },
    normalizeCurrency() { return 'GBP'; },
    DEFAULT_CURRENCY: 'GBP',
    pairSummaryText() { return ''; },
    cancelCrossHtml() { return ''; },
    yearBandIndex() { return 0; },
    sidebarYearIsOpen() { return true; },
    sidebarYearKey(year) { return year == null ? 'none' : String(year); },
  };
  vm.createContext(ctx);
  vm.runInContext([
    extractFunction('bookingYear'),
    extractFunction('bookingMatchesSidebarYear'),
    extractFunction('sidebarRecordGroups'),
    extractFunction('renderRecords'),
  ].join('\n'), ctx);
  return ctx;
}

test('bookings with no dates stay in an Undated group at the top, including when a year is chosen', () => {
  const ctx = listContext();
  const records = [
    { id: 10, group_name: 'May', tour_arrival_date: '2027-05-10', departure_date: '2027-05-14', no_people: 5 },
    { id: 292, group_name: 'Dorris 2027', tour_arrival_date: null, departure_date: null, no_people: 14 },
    { id: 11, group_name: 'October', tour_arrival_date: '2026-10-02', departure_date: '2026-10-10', no_people: 3 },
  ];
  ctx.records = records;
  vm.runInContext('renderRecords(records)', ctx);
  const htmlOut = ctx.list.innerHTML;
  const undatedAt = htmlOut.indexOf('>Undated<');
  const year2027 = htmlOut.indexOf('>2027<');
  const year2026 = htmlOut.indexOf('>2026<');
  assert.ok(undatedAt >= 0, 'missing Undated group');
  assert.ok(year2027 > undatedAt);
  assert.ok(year2026 > undatedAt);
  assert.ok(htmlOut.indexOf('Dorris 2027') > undatedAt);
  assert.ok(htmlOut.indexOf('Dorris 2027') < year2027);
  assert.equal(htmlOut.includes('>No year<'), false);

  const kept = vm.runInContext('records.filter(b => bookingMatchesSidebarYear(b, 2027)).map(b => b.id)', ctx);
  assert.deepEqual(kept, [10, 292]);
});
