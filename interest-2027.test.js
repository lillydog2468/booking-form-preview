const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sql = fs.readFileSync(path.join(__dirname, 'sql/24_interest_2027.sql'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, 'interest-2027.html'), 'utf8');
const booking = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');
const analytics = fs.readFileSync(path.join(__dirname, 'analytics.html'), 'utf8');
const admin = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
const tax = fs.readFileSync(path.join(__dirname, 'tax-summary.html'), 'utf8');

const names = [
  'Tina Paul',
  'Eileen Ranson (Ransom)',
  'Jayde Hollingworth',
  'Karen Poll',
  'Kathy Kentfield',
  'Anna (Tigerguld)',
  'Ann Lucas',
  'Kath Mc (Katherine McLeary)',
  'Linda Barbara Pauer',
  'Jenny Playford',
  'Rhonda Heidebrecht',
  'Bruria Adin',
  'Ronit (via Bruria Adin)',
];

test('interest_2027 is admin-only and seeds the 13 people', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS interest_2027/);
  assert.match(sql, /do_not_contact\s+BOOLEAN NOT NULL DEFAULT false/);
  assert.match(sql, /CHECK \(status IN \('interested', 'waiting for dates', 'placed'\)\)/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  for (const op of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
    assert.match(sql, new RegExp('FOR ' + op + '[\\s\\S]{0,180}is_admin\\(\\)'));
  }
  assert.equal(sql.includes('TO anon'), false);
  assert.match(sql, /REVOKE ALL ON TABLE interest_2027 FROM PUBLIC, anon/);
  names.forEach(name => assert.ok(sql.includes(name), name));
  const karen = sql.split('\n').find(line => line.includes('Karen Poll'));
  assert.match(karen, /, true\),?$/);
  const flags = [...sql.matchAll(/, (true|false)\)/g)].map(match => match[1]);
  assert.equal(flags.length, 13);
  assert.equal(flags.filter(flag => flag === 'true').length, 1);
  assert.equal((sql.match(/'interested'/g) || []).length >= 11, true);
  assert.equal((sql.match(/'waiting for dates'/g) || []).length, 4);
  assert.equal((sql.match(/'placed'/g) || []).length, 1);
});

test('the page is behind the auth gate and is_admin, and the link is admin-only', () => {
  assert.match(page, /AuthGate\.require\(sb, \{ title: '2027 interest' \}\)/);
  assert.match(page, /sb\.rpc\('is_admin'\)/);
  assert.match(page, /from\('interest_2027'\)/);
  assert.match(page, /DO NOT CONTACT/);
  assert.match(page, /No group yet/);
  assert.match(page, /id="statusFilter"/);
  assert.match(page, /id="confirmModal"/);
  assert.match(page, /@media \(max-width: 700px\) \{[\s\S]*min-height: 44px/);
  assert.equal(page.includes('£'), false);

  assert.match(booking, /id="userMenuInterestLink" href="interest-2027.html" style="display:none;"/);
  assert.match(booking, /interestLink\.style\.display = isAdmin \? 'flex' : 'none'/);
  assert.match(booking, /id="navInterest" href="interest-2027.html" title="2027 interest" style="display:none;text-decoration:none;"/);
  assert.match(booking, /interestTab\.style\.display = isAdmin \? 'flex' : 'none'/);
  assert.match(page, /href="booking-form.html">Back to booking form</);
  assert.match(page, /<option value="interested">Interested<\/option>/);
  assert.match(page, /<option value="waiting for dates">Waiting for dates<\/option>/);
  assert.match(page, /<option value="placed">Placed<\/option>/);
  assert.match(analytics, /id="userMenuInterestLink" href="interest-2027.html" style="display:none;"/);
  assert.match(analytics, /interestLink\.style\.display = showAdmin \? 'flex' : 'none'/);
  assert.match(admin, /href="interest-2027.html"/);
  assert.match(tax, /id="interestNav" hidden/);
  assert.match(tax, /interestNav\.hidden = false/);
});

test('the 2027 title, filter and column headings stay put while the list scrolls', () => {
  const css = page.slice(page.indexOf('<style>'), page.indexOf('</style>'));
  const sticky = css.slice(css.indexOf('.page-sticky {'), css.indexOf('.topbar {'));
  assert.match(sticky, /position:\s*-webkit-sticky/);
  assert.match(sticky, /position:\s*sticky/);
  assert.match(sticky, /top:\s*0/);
  assert.match(sticky, /background:\s*var\(--surface\)/);
  assert.match(sticky, /box-shadow:/);
  assert.match(sticky, /env\(safe-area-inset-top/);
  const bar = page.slice(page.indexOf('<header class="page-sticky">'), page.indexOf('</header>'));
  assert.match(bar, /<h1>2027 interest<\/h1>/);
  assert.match(bar, /href="booking-form.html">Back to booking form/);
  assert.match(bar, /href="admin.html">Admin/);
  assert.match(bar, /id="toolbar"/);
  assert.match(bar, /id="statusFilter"/);
  assert.match(bar, /id="addBtn"/);
  assert.match(css, /position:\s*-webkit-sticky;\s*position:\s*sticky;\s*top:\s*var\(--interest-head/);
  assert.match(css, /background:\s*var\(--surface-alt\)/);
  assert.match(css, /\.table-wrap \{ overflow: visible/);
  assert.match(css, /border-collapse: separate/);
  assert.match(css, /@media \(max-width: 700px\) \{[\s\S]*thead \{ display: none; \}/);
  assert.match(page, /function pinInterestHead\(/);
  assert.match(page, /--interest-head/);
  assert.match(page, /ResizeObserver/);
});

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

function loadSort() {
  const names = ['interestDateValue', 'interestNumber', 'interestSortValue', 'compareInterestRows', 'sortInterestRows'];
  const context = {};
  vm.createContext(context);
  vm.runInContext(names.map(name => extractFunction(page, name)).join('\n'), context);
  return context;
}

test('names sort A to Z ignoring case, and blanks stay last when reversed', () => {
  const sort = loadSort();
  const rows = [
    { id: 3, name: 'zoe' },
    { id: 1, name: '' },
    { id: 2, name: 'Ann' },
    { id: 4, name: 'ann' },
  ];
  assert.deepEqual(sort.sortInterestRows(rows, 'name', 'asc').map(row => row.id), [2, 4, 3, 1]);
  assert.deepEqual(sort.sortInterestRows(rows, 'name', 'desc').map(row => row.id), [3, 4, 2, 1]);
});

test('preferred dates sort chronologically and undated text follows them', () => {
  const sort = loadSort();
  const rows = [
    { id: 1, preferred_when: 'not said' },
    { id: 2, preferred_when: 'April 2027' },
    { id: 3, preferred_when: 'Day trip Fri 11 Dec 2026' },
    { id: 4, preferred_when: '' },
    { id: 5, preferred_when: '2027: proposed 7–12 Mar' },
  ];
  assert.deepEqual(sort.sortInterestRows(rows, 'when', 'asc').map(row => row.id), [3, 5, 2, 1, 4]);
  assert.deepEqual(sort.sortInterestRows(rows, 'when', 'desc').map(row => row.id), [1, 2, 5, 3, 4]);
  const parties = [
    { id: 1, party_size: '10' },
    { id: 2, party_size: '2' },
    { id: 3, party_size: 'Solo (1)' },
    { id: 4, party_size: '' },
  ];
  assert.deepEqual(sort.sortInterestRows(parties, 'party', 'asc').map(row => row.id), [2, 1, 3, 4]);
});

test('the sort controls sit in the sticky bar and the phone sort is remembered', () => {
  const bar = page.slice(page.indexOf('<header class="page-sticky">'), page.indexOf('</header>'));
  assert.match(bar, /id="sortColumn"/);
  assert.match(bar, /id="sortDir"/);
  assert.match(bar, /class="sort-tools"/);
  assert.match(page, /data-sort="name"/);
  assert.match(page, /data-sort="when"/);
  assert.match(page, /data-sort="status"/);
  assert.match(page, /▲/);
  assert.match(page, /▼/);
  assert.match(page, /interest_2027_sort/);
  assert.match(page, /chooseInterestSort\(button\.getAttribute\('data-sort'\), true\)/);
  assert.match(page, /sortInterestRows\(filteredRows\(\)/);
  const css = page.slice(page.indexOf('<style>'), page.indexOf('</style>'));
  assert.match(css, /\.sort-tools \{ display: none/);
  assert.match(css, /@media \(max-width: 700px\) \{[\s\S]*\.sort-tools \{ display: flex; \}/);
  assert.match(css, /thead \{ display: none; \}/);
});
