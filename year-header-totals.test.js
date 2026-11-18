const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

require('./booking-format.js');

const html = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'booking-form.css'), 'utf8');
const money = global.BookingFormat.formatMoney;

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

function loadTotals() {
  const ctx = {
    DEFAULT_CURRENCY: 'GBP',
    formatMoney: money,
    normalizeCurrency() { return 'GBP'; },
    escapeHtml(str) {
      return String(str ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
    },
    tableColSizeStyle() { return ''; },
    localStorage: {
      _data: {},
      getItem(key) { return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : null; },
      setItem(key, value) { this._data[key] = String(value); },
    },
  };
  vm.createContext(ctx);
  vm.runInContext([
    extractFunction('yearBandIndex'),
    extractFunction('yearBandClass'),
    extractFunction('parseNightsCount'),
    extractFunction('profitListCell'),
    extractFunction('tableShownHotelNights'),
    extractFunction('tableYearTotals'),
    extractFunction('tableYearKey'),
    extractFunction('readTableYearOpenMap'),
    extractFunction('tableYearOpenDefault'),
    extractFunction('tableYearIsOpen'),
    extractFunction('setTableYearOpen'),
    extractFunction('tableYearHeaderRow'),
  ].join('\n'), ctx);
  return ctx;
}

const columns = [
  { key: 'group_name', label: 'Group Name' },
  { key: 'no_people', label: 'People' },
  { key: 'other_hotel_nights', label: 'Hotel nights' },
  { key: 'left_to_pay', label: 'Left to Pay' },
  { key: 'totalprofit', label: 'Total Profit' },
];

test('each year header totals the bookings shown in that year', () => {
  const api = loadTotals();
  const visible = [
    { group_name: 'May', no_people: 2, other_hotel_nights: 4, left_to_pay: 380, totalprofit: 500 },
    { group_name: 'June', no_people: '3', other_hotel_nights: '3 nights', left_to_pay: 1000, totalprofit: 200 },
  ];
  const hidden = { group_name: 'Filtered out', no_people: 9, other_hotel_nights: 8, left_to_pay: 50, totalprofit: 40 };
  const totals = api.tableYearTotals(visible);
  assert.equal(totals.people, 5);
  assert.equal(totals.nights, 7);
  assert.equal(totals.left, 1380);
  assert.equal(totals.profit, 2080);
  assert.equal(api.tableYearTotals([hidden]).people, 9);

  const header = api.tableYearHeaderRow(2027, visible, columns);
  assert.match(header, /table-year-header year-band year-band-5/);
  assert.match(header, /<span class="table-year-label">2027<\/span>/);
  assert.match(header, new RegExp('aria-expanded="' + (api.tableYearIsOpen(2027) ? 'true' : 'false') + '"'));
  assert.match(header, api.tableYearIsOpen(2027) ? /table-year-toggle[^>]*>▾</ : /table-year-toggle[^>]*>▸</);
  assert.match(header, /data-table-col="no_people"[^>]*>\s*<span class="year-total-figure">5<\/span>/);
  assert.match(header, /data-table-col="other_hotel_nights"[^>]*>\s*<span class="year-total-figure">7<\/span>/);
  assert.match(header, /data-table-col="left_to_pay"[^>]*>\s*<span class="year-total-figure">£1,380\.00<\/span>/);
  assert.match(header, /data-table-col="totalprofit"[^>]*>\s*<span class="year-total-figure">£2,080\.00<\/span>/);
  assert.equal(header.includes('colspan'), false);
  assert.equal(header.includes(money(hidden.left_to_pay)), false);

  const earlier = api.tableYearHeaderRow(2026, [{ no_people: 1, other_hotel_nights: '', left_to_pay: 0, totalprofit: 40 }], columns);
  assert.match(earlier, /table-year-label">2026</);
  assert.match(earlier, /year-total-figure">1</);
  assert.match(earlier, /year-total-figure">0</);
  assert.match(earlier, new RegExp('year-total-figure">' + money(40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(earlier.includes('2027'), false);

  const narrowed = columns.filter(col => col.key !== 'left_to_pay' && col.key !== 'totalprofit');
  const withoutMoney = api.tableYearHeaderRow(2027, visible, narrowed);
  assert.equal(withoutMoney.includes('left_to_pay'), false);
  assert.equal(withoutMoney.includes('totalprofit'), false);
  assert.match(withoutMoney, /year-total-figure">5</);
  assert.match(withoutMoney, /table-year-label">2027</);

  const table = extractFunction('renderTable');
  assert.match(table, /tableYearHeaderRow\(group\.year, group\.rows, activeColumns\)/);
  assert.match(table, /tableYearIsOpen\(group\.year\)/);
  assert.match(table, /yearOpen \? '' : ' hidden'/);
  assert.match(extractFunction('filterTable'), /renderTable\(filtered\)/);
  assert.match(css, /\.data-table tbody tr\.table-year-header \.year-total-figure \{[^}]*font-size:\s*12px/);
  assert.match(css, /\.data-table tbody tr\.table-year-header \{[^}]*cursor:\s*pointer/);
});

test('only the current year starts open, and a remembered choice overrides that', () => {
  const api = loadTotals();
  const now = new Date().getFullYear();
  assert.equal(api.tableYearIsOpen(now), true);
  assert.equal(api.tableYearIsOpen(now + 1), false);
  assert.equal(api.tableYearIsOpen(now - 1), false);
  assert.equal(api.tableYearIsOpen(null), false);
  api.setTableYearOpen(now + 1, true);
  assert.equal(api.tableYearIsOpen(now + 1), true);
  api.setTableYearOpen(now, false);
  assert.equal(api.tableYearIsOpen(now), false);
  api.setTableYearOpen(now + 1, false);
  assert.equal(api.tableYearIsOpen(now + 1), false);
  const closed = api.tableYearHeaderRow(now + 1, [{ no_people: 4, other_hotel_nights: 2, left_to_pay: 10, totalprofit: 3 }], columns);
  assert.match(closed, /aria-expanded="false"/);
  assert.match(closed, /table-year-toggle[^>]*>▸</);
  assert.match(closed, /year-total-figure">4</);
  assert.match(closed, /year-total-figure">2</);
  assert.match(closed, /data-table-col="left_to_pay"/);
  assert.match(closed, /data-table-col="totalprofit"/);
  assert.equal(closed.includes('colspan'), false);
});
