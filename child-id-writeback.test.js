const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('node:vm');

const html = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'));

function extractFunction(name) {
  const marker = 'function ' + name + '(';
  let start = html.indexOf(marker);
  assert.ok(start >= 0, 'missing ' + name);
  const asyncAt = start - 'async '.length;
  if (asyncAt >= 0 && html.slice(asyncAt, start) === 'async ') start = asyncAt;
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

function memberRow(id, first, last, email) {
  const values = {
    '.member-first': first || '',
    '.member-last': last || '',
    '.member-email': email || '',
    '.member-name': '',
  };
  return {
    dataset: { memberId: id == null || id === '' ? '' : String(id) },
    querySelector(sel) {
      if (!Object.prototype.hasOwnProperty.call(values, sel)) return null;
      return { value: values[sel] };
    },
  };
}

function flightRow(id) {
  return { dataset: { flightId: id == null || id === '' ? '' : String(id) } };
}

function mockSupabase(seed) {
  const store = Object.assign({ _seq: 500 }, seed || {});
  const calls = [];
  function rowsOf(table) {
    if (!Array.isArray(store[table])) store[table] = [];
    return store[table];
  }
  function project(list, cols) {
    if (!cols || cols === '*') return list.map(row => Object.assign({}, row));
    const fields = String(cols).split(',').map(part => part.trim()).filter(Boolean);
    return list.map(row => {
      const out = {};
      fields.forEach(field => { out[field] = row[field]; });
      return out;
    });
  }
  function run(query) {
    calls.push({ table: query.table, action: query.action, returning: query.returning });
    const rows = rowsOf(query.table);
    const match = (row) => query.filters.every(filter => String(row[filter.col]) === String(filter.val));
    if (query.action === 'delete') {
      store[query.table] = rows.filter(row => !match(row));
      return { data: null, error: null };
    }
    if (query.action === 'insert') {
      const list = Array.isArray(query.payload) ? query.payload : [query.payload];
      const inserted = list.map(row => {
        const copy = Object.assign({}, row, { id: store._seq++ });
        rowsOf(query.table).push(copy);
        return copy;
      });
      if (!query.returning) return { data: null, error: null };
      return { data: project(inserted, query.returning), error: null };
    }
    if (query.action === 'update') return { data: query.returning ? [] : null, error: null };
    return { data: project(rows.filter(match), query.returning || '*'), error: null };
  }
  function from(table) {
    const query = {
      table: table,
      action: 'select',
      payload: null,
      filters: [],
      returning: null,
      select(cols) {
        if (query.action === 'insert' || query.action === 'update' || query.action === 'delete') query.returning = cols;
        else {
          query.action = 'select';
          query.returning = cols;
        }
        return query;
      },
      insert(payload) { query.action = 'insert'; query.payload = payload; return query; },
      update(payload) { query.action = 'update'; query.payload = payload; return query; },
      delete() { query.action = 'delete'; return query; },
      eq(col, val) { query.filters.push({ col: col, val: val }); return query; },
      order() { return query; },
      limit() { return query; },
      then(resolve, reject) {
        return Promise.resolve().then(() => run(query)).then(resolve, reject);
      },
    };
    return query;
  }
  return { from: from, store: store, calls: calls };
}

function idsFor(store, table, bookingId) {
  return (store[table] || [])
    .filter(row => String(row.booking_id) === String(bookingId))
    .map(row => String(row.id));
}

function loadForm(db, screens) {
  const prompts = [];
  const toasts = [];
  const reloads = [];
  let deposit = '10';
  const elements = new Map();
  function makeEl() {
    return {
      value: '',
      textContent: '',
      style: {},
      disabled: false,
      attributes: {},
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
    };
  }
  const ctx = {
    tabs: new Map(),
    cloudReady: true,
    activeTabId: null,
    allBookings: [],
    bookingSaveFlights: new Map(),
    MEMBER_PAY_OPEN_KEY: 'member_pay_open',
    sb: db,
    prompts: prompts,
    toasts: toasts,
    reloads: reloads,
    screens: screens,
    localStorage: { getItem() { return null; }, setItem() {} },
    memberRows(tabId) { return screens[tabId].members; },
    document: {
      getElementById(id) {
        const match = /^t(.+)_flights_list$/.exec(String(id));
        if (!match || !screens[match[1]]) return null;
        const flights = screens[match[1]].flights;
        return {
          querySelectorAll(sel) { return sel === '.flight-row' ? flights.slice() : []; },
        };
      },
    },
    tEl(tabId, suffix) {
      const key = tabId + ':' + suffix;
      if (!elements.has(key)) elements.set(key, makeEl());
      return elements.get(key);
    },
    toast(message, kind) { toasts.push({ message: message, kind: kind || '' }); },
    askChildRefresh(message) {
      prompts.push(message);
      return Promise.resolve('cancel');
    },
    async loadBookings() {
      for (const [tabId, tab] of ctx.tabs) {
        const screen = screens[tabId];
        if (!screen) continue;
        reloads.push({
          tabId: tabId,
          members: (tab.loadedMemberIds || []).join(','),
          flights: (tab.loadedFlightIds || []).join(','),
          screenMembers: screen.members.map(row => row.dataset.memberId).filter(Boolean).join(','),
          screenFlights: screen.flights.map(row => row.dataset.flightId).filter(Boolean).join(','),
        });
        // Typing during the slow reload marks the tab dirty, so the reload
        // itself must not be what copies the new ids onto the form.
        tab.dirty = true;
      }
    },
    async saveBookingRow(bookingData, extras, bid) {
      if (bid) return { data: [{ id: bid }], error: null };
      return { data: [{ id: 77 }], error: null };
    },
    memberMoneyOrNull(value) {
      if (value == null || String(value).trim() === '') return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    },
    memberDateOrNull() { return null; },
    memberTimeOrNull(value) { return value || null; },
    isMissingColumnError() { return false; },
    missingColumnFromError() { return ''; },
    collectBookingExtras() { return {}; },
    addOtherHotel() { return null; },
    mirrorHotelExpensesForSave() { return []; },
    orphanExpensesForSave() { return []; },
    tabIsDayTrip() { return false; },
    saveSharedAlbumsForBooking() {},
    saveBookingExtrasForBooking() {},
    savePlanHotelFlags() {},
    rememberSavedDates() {},
    rememberedBookingStatus(status) { return status || null; },
    applyUnverified() {},
    refreshOpenBookingTitle() {},
    applyBookingCancelledChrome() {},
    markTabDirty(tabId, dirty) {
      const tab = ctx.tabs.get(tabId);
      if (tab) tab.dirty = dirty;
    },
    readMemberPayOpenMap() { return {}; },
    openBookingId() { return ''; },
    updateTabTitle() {},
    syncBookingIdTag() {},
    applyTabYearTint() {},
    bookingShownName(name) { return name || 'Booking'; },
    childReloadToast() {},
    refreshLoadedChildren() { throw new Error('refresh should not run when the warning is cancelled'); },
    setDeposit(value) { deposit = value; },
  };
  vm.createContext(ctx);
  vm.runInContext([
    'unseenSavedRows',
    'screenGuestsLackLoadedIds',
    'childGuardNextStep',
    'childRefreshPlan',
    'childRefreshMessage',
    'guardSavedChildRows',
    'memberRowNamed',
    'insertMembers',
    'insertFlights',
    'noteInsertedChildIds',
    'resolveSavedChildConflict',
    'bookingSaveKey',
    'setBookingSaveBusy',
    'startBookingSave',
    'saveBooking',
  ].map(extractFunction).join('\n'), ctx);
  ctx.getTabFormData = async function (tabId) {
    const screen = screens[tabId];
    const named = screen.members.filter(row => ctx.memberRowNamed(row));
    return {
      group_name: 'Prague spring',
      status: 'confirmed',
      _extras: {},
      _hotel_stays: [],
      _additional_expenses: [],
      _orphanHotelExpenses: [],
      _members: named.map(row => ({
        id: row.dataset.memberId ? parseInt(row.dataset.memberId, 10) : null,
        first_name: row.querySelector('.member-first').value,
        last_name: row.querySelector('.member-last').value,
        email: row.querySelector('.member-email').value,
        deposit: deposit,
        final_payment: '',
        deposit_date: '',
        final_payment_date: '',
        arrival_flight: '',
        arrival_date: '',
        arrival_time: '',
        departure_flight: '',
        departure_date: '',
        departure_time: '',
        flight_note: '',
        prague_stays: [],
      })),
      _flights: screen.flights.map(row => ({
        id: row.dataset.flightId ? parseInt(row.dataset.flightId, 10) : null,
        flight_number: 'BA123',
        arrival_date: '2027-05-09',
        arrival_time: '10:00',
        departure_date: '2027-05-16',
        departure_time: '18:00',
        comments: 'edit ' + deposit,
      })),
    };
  };
  return ctx;
}

function namedIds(ctx, tabId) {
  return ctx.screens[tabId].members
    .filter(row => ctx.memberRowNamed(row))
    .map(row => row.dataset.memberId);
}

test('repeated saves keep the new guest and flight ids, including a blank row and autosave', async () => {
  const db = mockSupabase({
    members: [
      { id: 1, booking_id: 50, first_name: 'Kay', last_name: 'Enk', deposit: 1 },
      { id: 2, booking_id: 50, first_name: 'Ann', last_name: 'Other', deposit: 1 },
    ],
    flights: [
      { id: 10, booking_id: 50, flight_number: 'BA123', comments: 'old' },
    ],
  });
  const screens = {
    '1': {
      members: [
        memberRow('1', 'Kay', 'Enk', 'kay@enk.test'),
        memberRow('', '', '', ''),
        memberRow('2', 'Ann', 'Other', 'ann@other.test'),
        memberRow('', 'Ned', 'New', ''),
      ],
      flights: [flightRow('10'), flightRow('')],
    },
  };
  const ctx = loadForm(db, screens);
  ctx.tabs.set('1', {
    bookingId: 50,
    loadedMemberIds: ['1', '2'],
    loadedFlightIds: ['10'],
    dirty: true,
    childRefreshAttempt: 0,
  });

  ctx.setDeposit('41');
  await ctx.saveBooking('1', false);
  ctx.setDeposit('42');
  await ctx.saveBooking('1', true);
  ctx.setDeposit('43');
  await ctx.saveBooking('1', false);

  assert.deepEqual(ctx.prompts, []);
  assert.deepEqual(ctx.toasts.map(item => item.message), ['Booking updated', 'Booking updated']);
  assert.equal(ctx.reloads.length, 3);
  const seen = new Set();
  ctx.reloads.forEach(reload => {
    assert.equal(reload.members, reload.screenMembers);
    assert.equal(reload.flights, reload.screenFlights);
    assert.notEqual(reload.members, '1,2');
    assert.ok(reload.flights.length > 0);
    assert.equal(reload.flights.includes('10'), false);
    seen.add(reload.members + '|' + reload.flights);
  });
  assert.equal(seen.size, 3, 'each save mints new ids and writes them back before reload');

  const tab = ctx.tabs.get('1');
  const guestIds = namedIds(ctx, '1');
  assert.equal(guestIds.length, 3);
  assert.deepEqual(guestIds, tab.loadedMemberIds);
  assert.equal(ctx.screens['1'].members[1].dataset.memberId, '');
  assert.deepEqual(idsFor(db.store, 'members', 50), guestIds);
  assert.deepEqual(
    ctx.screens['1'].flights.map(row => row.dataset.flightId),
    tab.loadedFlightIds
  );
  assert.deepEqual(idsFor(db.store, 'flights', 50), tab.loadedFlightIds);
  db.store.members.filter(row => String(row.booking_id) === '50').forEach(row => {
    assert.equal(row.deposit, 43);
  });
  db.store.flights.filter(row => String(row.booking_id) === '50').forEach(row => {
    assert.equal(row.comments, 'edit 43');
  });
  db.calls.filter(call => (call.table === 'members' || call.table === 'flights') && call.action === 'insert').forEach(call => {
    assert.equal(call.returning, 'id');
  });

  db.store.members.push({ id: 9999, booking_id: 50, first_name: 'Pat', last_name: 'Phone' });
  await ctx.saveBooking('1', false);
  assert.deepEqual(ctx.prompts, [
    'This booking was changed somewhere else (another tab or device). Refresh the guest list and save your changes?',
  ]);
  assert.ok(db.store.members.some(row => row.id === 9999));
  assert.deepEqual(idsFor(db.store, 'members', 50).filter(id => id !== '9999'), guestIds);
});

test('a flight added on another tab still warns after our own saves', async () => {
  const db = mockSupabase({
    members: [{ id: 1, booking_id: 50, first_name: 'Kay', last_name: 'Enk' }],
    flights: [{ id: 10, booking_id: 50, flight_number: 'BA123' }],
  });
  const screens = {
    '1': {
      members: [memberRow('1', 'Kay', 'Enk', 'kay@enk.test')],
      flights: [flightRow('10')],
    },
  };
  const ctx = loadForm(db, screens);
  ctx.tabs.set('1', {
    bookingId: 50,
    loadedMemberIds: ['1'],
    loadedFlightIds: ['10'],
    dirty: false,
    childRefreshAttempt: 0,
  });
  await ctx.saveBooking('1', true);
  assert.deepEqual(ctx.prompts, []);
  const kept = idsFor(db.store, 'flights', 50).slice();
  db.store.flights.push({ id: 8888, booking_id: 50, flight_number: 'ZZ9' });
  await ctx.saveBooking('1', false);
  assert.deepEqual(ctx.prompts, [
    'This booking was changed somewhere else (another tab or device). Refresh the flight list and save your changes?',
  ]);
  assert.ok(db.store.flights.some(row => row.id === 8888));
  assert.deepEqual(idsFor(db.store, 'flights', 50).filter(id => id !== '8888'), kept);
});

test('a brand new booking remembers ids before the next save', async () => {
  const db = mockSupabase({ members: [], flights: [] });
  const screens = {
    '2': {
      members: [memberRow('', 'Bea', 'New', 'bea@new.test'), memberRow('', '', '', '')],
      flights: [flightRow('')],
    },
  };
  const ctx = loadForm(db, screens);
  ctx.tabs.set('2', {
    bookingId: null,
    loadedMemberIds: [],
    loadedFlightIds: [],
    dirty: true,
    childRefreshAttempt: 0,
  });
  await ctx.saveBooking('2', false);
  await ctx.saveBooking('2', true);
  await ctx.saveBooking('2', false);
  assert.deepEqual(ctx.prompts, []);
  const tab = ctx.tabs.get('2');
  assert.equal(tab.bookingId, 77);
  assert.deepEqual(namedIds(ctx, '2'), tab.loadedMemberIds);
  assert.equal(ctx.screens['2'].members[1].dataset.memberId, '');
  assert.deepEqual(idsFor(db.store, 'members', 77), tab.loadedMemberIds);
  assert.deepEqual(idsFor(db.store, 'flights', 77), tab.loadedFlightIds);
  assert.deepEqual(ctx.toasts.map(item => item.message), ['Booking created', 'Booking updated']);
});

test('an inserted flight with no on-screen row is still treated as ours', async () => {
  const db = mockSupabase({ members: [], flights: [] });
  const screens = { '1': { members: [], flights: [flightRow('')] } };
  const ctx = loadForm(db, screens);
  const tab = { bookingId: 50, loadedMemberIds: [], loadedFlightIds: [] };
  ctx.tabs.set('1', tab);
  ctx.noteInsertedChildIds('1', 'flights', [{ id: 5 }, { id: 6 }]);
  assert.equal(screens['1'].flights[0].dataset.flightId, '5');
  assert.deepEqual(tab.loadedFlightIds, ['5', '6']);
  db.store.flights.push({ id: 5, booking_id: 50 }, { id: 6, booking_id: 50 });
  assert.equal(await ctx.guardSavedChildRows(50, 'flights', tab.loadedFlightIds), '');
  db.store.flights.push({ id: 7, booking_id: 50 });
  assert.equal(await ctx.guardSavedChildRows(50, 'flights', tab.loadedFlightIds), 'blocked');
});
