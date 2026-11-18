const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('node:vm');

const html = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');

function extractFunction(name) {
  let start = html.indexOf('function ' + name + '(');
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

function listContext() {
  const list = { innerHTML: '' };
  const ctx = {
    tabs: new Map(),
    activeTabId: null,
    list,
    el(id) { return id === 'recordsList' ? list : null; },
    escapeHtml(s) { return String(s == null ? '' : s); },
    bookingIsCancelled(record) { return String(record && record.status || '').trim().toLowerCase() === 'cancelled'; },
    bookingIdLabel() { return ''; },
    bookingIsTourFull() { return false; },
    delayUntilLabel() { return ''; },
    formatDateDMY(iso) { return String(iso || ''); },
    formatMoney() { return ''; },
    normalizeCurrency() { return 'GBP'; },
    DEFAULT_CURRENCY: 'GBP',
    pairSummaryText() { return ''; },
    cancelCrossHtml() { return ''; },
    yearBandIndex() { return 2; },
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

test('unconfirmed bookings are amber in every year, and cancelled stays grey', () => {
  const ctx = listContext();
  const records = [
    { id: 1, group_name: 'May group', status: 'unconfirmed', tour_arrival_date: '2027-05-20', departure_date: '2027-05-24' },
    { id: 2, group_name: 'Earlier', status: 'unconfirmed', tour_arrival_date: '2026-06-01', departure_date: '2026-06-04' },
    { id: 3, group_name: 'Kept week', status: 'cancelled', tour_arrival_date: '2027-06-01', departure_date: '2027-06-04' },
    { id: 4, group_name: 'Plain', status: null, tour_arrival_date: '2025-04-01', departure_date: '2025-04-04' },
  ];
  vm.runInContext('renderRecords(records)', Object.assign(ctx, { records }));
  const out = ctx.list.innerHTML;
  const row = (name) => {
    const at = out.indexOf(name);
    assert.ok(at > 0, name);
    return out.slice(out.lastIndexOf('<div class="record-item', at), at);
  };
  assert.match(row('May group'), /unconfirmed/);
  assert.match(row('Earlier'), /unconfirmed/);
  assert.equal(/unconfirmed/.test(row('Kept week')), false);
  assert.equal(/unconfirmed/.test(row('Plain')), false);
  assert.match(row('Kept week'), /cancelled/);

  const css = html.slice(html.indexOf('.record-item.unconfirmed'), html.indexOf('.tab.unconfirmed.active') + 80);
  assert.match(css, /background:\s*#fff1d6/);
  assert.match(css, /border-left:\s*4px dashed #d97706/);
  assert.match(css, /\.record-item\.year-band\.unconfirmed\.active/);
  assert.match(css, /background:\s*#ffd59a/);
  assert.match(html, /\.record-item\.year-band\.cancelled\.active[\s\S]*background:\s*#eef0f3/);
  assert.match(extractFunction('onTabInput'), /syncUnverifiedList\(tabId\)/);
  assert.match(extractFunction('syncUnverifiedList'), /highlightSidebarRecords\(\)/);
});
