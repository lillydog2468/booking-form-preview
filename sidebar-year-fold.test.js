const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const html = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'));
const css = fs.readFileSync(path.join(__dirname, 'booking-form.css'), 'utf8');

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

function loadList() {
  const list = { innerHTML: '' };
  const store = {};
  const ctx = {
    tabs: new Map(),
    activeTabId: null,
    list,
    records: [],
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
    yearBandIndex(year) { return Number(year) === 2027 ? 5 : 0; },
    localStorage: {
      getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
      setItem(key, value) { store[key] = String(value); },
    },
  };
  ctx.applySidebarList = function () { ctx.renderRecords(ctx.records); };
  vm.createContext(ctx);
  vm.runInContext([
    'bookingYear',
    'sidebarRecordGroups',
    'sidebarYearKey',
    'readSidebarYearOpenMap',
    'sidebarYearIsOpen',
    'setSidebarYearOpen',
    'toggleSidebarYear',
    'renderRecords',
  ].map(extractFunction).join('\n'), ctx);
  return ctx;
}

const records = [
  { id: 1, group_name: 'May group', tour_arrival_date: '2027-05-20', no_people: 4 },
  { id: 2, group_name: 'June group', tour_arrival_date: '2027-06-02', no_people: 6 },
  { id: 3, group_name: 'This year', tour_arrival_date: '2026-09-01', no_people: 3 },
  { id: 4, group_name: 'No date yet', tour_arrival_date: null, no_people: 2 },
];

test('clicking a layout year hides and shows that year’s bookings', () => {
  const ctx = loadList();
  ctx.records = records;
  ctx.renderRecords(records);
  let out = ctx.list.innerHTML;
  assert.match(out, /May group/);
  assert.match(out, /June group/);
  assert.match(out, /This year/);
  assert.match(out, /No date yet/);
  assert.match(out, /data-year-key="2027"[^>]*aria-expanded="true"/);
  assert.match(out, /table-year-toggle[^>]*>▾</);
  assert.match(css, /\.records-year-header \{[^}]*cursor:\s*pointer/);

  ctx.toggleSidebarYear('2027');
  out = ctx.list.innerHTML;
  assert.equal(out.includes('May group'), false);
  assert.equal(out.includes('June group'), false);
  assert.match(out, /This year/);
  assert.match(out, /No date yet/);
  assert.match(out, /data-year-key="2027"[^>]*aria-expanded="false"/);
  assert.match(out, /aria-label="Show 2027"/);
  assert.match(out, /records-year-label">2027</);
  const closed = out.slice(out.indexOf('data-year-key="2027"'), out.indexOf('data-year-key="2026"'));
  assert.match(closed, /▸/);

  ctx.toggleSidebarYear('2027');
  out = ctx.list.innerHTML;
  assert.match(out, /May group/);
  assert.match(out, /June group/);
  assert.match(out, /aria-label="Hide 2027"/);

  ctx.toggleSidebarYear('none');
  out = ctx.list.innerHTML;
  assert.equal(out.includes('No date yet'), false);
  assert.match(out, /May group/);
  assert.match(out, /aria-label="Show Undated"/);
});
