const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('node:vm');

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

test('Status sits beside the group name and the table name cell no longer carries FULL', () => {
  const columns = html.slice(html.indexOf('const TABLE_COLUMNS'), html.indexOf('const DATE_KEYS'));
  const groupAt = columns.indexOf("key: 'group_name'");
  const statusAt = columns.indexOf("key: 'status'");
  const organiserAt = columns.indexOf("key: 'organiser_display'");
  assert.ok(groupAt > 0 && statusAt > groupAt && organiserAt > statusAt);

  const table = extractFunction('renderTable');
  const groupBranch = table.slice(table.indexOf("col.key === 'group_name'"), table.indexOf("col.key === 'status'"));
  assert.equal(groupBranch.includes('tour-full-badge'), false);
  assert.match(groupBranch, /cancelled-tag/);
  assert.match(groupBranch, /Rescheduled/);
  assert.match(table, /tableStatusCell\(r\)/);

  const list = extractFunction('renderRecords');
  assert.match(list, /tour-full-badge">FULL</);
  assert.match(extractFunction('loadTablePreferences'), /withStatusColumn\(order\)/);
});

test('the status cell shows Full, the booking status, or both', () => {
  const ctx = { escapeHtml(s) { return String(s); } };
  vm.createContext(ctx);
  ctx.window = {};
  vm.runInContext([
    extractFunction('bookingIsTourFull'),
    extractFunction('yearTourIsDayTrip'),
    extractFunction('tableIsoDay'),
    extractFunction('tableBookingIsDayTrip'),
    extractFunction('tableStatusCell'),
    extractFunction('withStatusColumn'),
  ].join('\n'), ctx);

  assert.equal(ctx.tableStatusCell({ tour_full: true, status: 'unconfirmed' }), '<span class="tour-full-badge">Full</span> · Unconfirmed');
  assert.equal(ctx.tableStatusCell({ tour_full: true }), '<span class="tour-full-badge">Full</span>');
  assert.equal(ctx.tableStatusCell({ status: 'cancelled' }), 'Cancelled');
  assert.equal(ctx.tableStatusCell({ status: 'Confirmed' }), 'Confirmed');
  assert.equal(ctx.tableStatusCell({}), '');
  assert.equal(
    ctx.tableStatusCell({ tour_arrival_date: '2027-10-02', departure_date: '2027-10-02', tour_full: true, status: 'unconfirmed' }),
    '<span class="table-day-trip">Day trip</span> · <span class="tour-full-badge">Full</span> · Unconfirmed'
  );
  assert.equal(ctx.tableStatusCell({ _extras: { dayTrip: true }, tour_arrival_date: '2027-05-01', departure_date: '2027-05-04' }), '<span class="table-day-trip">Day trip</span>');
  assert.equal(ctx.tableStatusCell({ _extras: { dayTrip: false }, tour_arrival_date: '2027-10-02', departure_date: '2027-10-02' }), '');
  assert.match(html, /\.table-day-trip \{[^}]*background: #d6ebf8;/);

  const saved = ['id', 'organiser_display', 'group_name', 'hotel_name'];
  assert.deepEqual(ctx.withStatusColumn(saved), ['id', 'organiser_display', 'group_name', 'status', 'hotel_name']);
  const moved = ['id', 'status', 'group_name'];
  assert.deepEqual(ctx.withStatusColumn(moved), ['id', 'status', 'group_name']);
});
