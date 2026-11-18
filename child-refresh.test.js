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

function loadMerge() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext([
    extractFunction('childMatchText'),
    extractFunction('guestNameMatchKey'),
    extractFunction('guestEmailMatchKey'),
    extractFunction('flightRowMatchKey'),
    extractFunction('childRowsMatch'),
    extractFunction('savedChildWasRemoved'),
    extractFunction('mergeSavedChildRows'),
    extractFunction('childGuardNextStep'),
    extractFunction('childRefreshPlan'),
    extractFunction('childRefreshMessage'),
  ].join('\n'), ctx);
  return ctx;
}

test('a matched guest takes the fresh id and keeps what was typed', () => {
  const ctx = loadMerge();
  const merged = ctx.mergeSavedChildRows(
    [{ id: 7, first_name: '  KAY ', last_name: 'enk', email: 'kay@new.test', deposit: '40' }],
    [{ id: 70, first_name: 'Kay', last_name: 'Enk', email: 'kay@old.test', deposit: '1' }],
    [],
    'members'
  );
  assert.equal(merged.rows.length, 1);
  assert.equal(merged.rows[0].id, 70);
  assert.equal(merged.rows[0].first_name, '  KAY ');
  assert.equal(merged.rows[0].deposit, '40');
  assert.equal(merged.rows[0].email, 'kay@new.test');
  assert.equal(merged.loadedIds.join(','), '70');
});

test('a saved guest missing on screen is put back, and a new guest stays new', () => {
  const ctx = loadMerge();
  const merged = ctx.mergeSavedChildRows(
    [
      { id: 7, first_name: 'Kay', last_name: 'Enk', deposit: '40' },
      { id: null, first_name: 'Ned', last_name: 'New', email: 'ned@new.test', deposit: '9' },
    ],
    [
      { id: 70, first_name: 'Kay', last_name: 'Enk', deposit: '1' },
      { id: 71, first_name: 'Ann', last_name: 'Other', email: 'ann@saved.test', deposit: '2' },
    ],
    [],
    'members'
  );
  assert.equal(merged.rows.length, 3);
  assert.equal(merged.rows[0].id, 70);
  assert.equal(merged.rows[0].deposit, '40');
  assert.equal(merged.rows[1].id, null);
  assert.equal(merged.rows[1].first_name, 'Ned');
  assert.equal(merged.rows[1].deposit, '9');
  assert.equal(merged.rows[2].id, 71);
  assert.equal(merged.rows[2].first_name, 'Ann');
  assert.equal(merged.rows[2].deposit, '2');
  assert.equal(merged.loadedIds.join(','), '70,71');
});

test('a guest removed in this tab is not put back', () => {
  const ctx = loadMerge();
  const merged = ctx.mergeSavedChildRows(
    [{ id: 7, first_name: 'Kay', last_name: 'Enk', deposit: '3' }],
    [
      { id: 70, first_name: 'Kay', last_name: 'Enk', deposit: '1' },
      { id: 71, first_name: 'Ann', last_name: 'Other', email: 'ann@saved.test', deposit: '2' },
    ],
    [{ id: '8', first_name: 'Ann', last_name: ' Other ', email: 'ANN@saved.test' }],
    'members'
  );
  assert.equal(merged.rows.length, 1);
  assert.equal(merged.rows[0].first_name, 'Kay');
  assert.equal(merged.rows[0].id, 70);
  assert.equal(merged.rows.map(row => row.first_name).join(','), 'Kay');
  assert.equal(merged.loadedIds.join(','), '70,71');
});

test('a renamed guest still matches by email', () => {
  const ctx = loadMerge();
  const merged = ctx.mergeSavedChildRows(
    [{ id: null, first_name: 'Katie', last_name: 'Enk', email: 'Kay@X.com', deposit: '8' }],
    [{ id: 70, first_name: 'Kay', last_name: 'Enk', email: 'kay@x.com', deposit: '1' }],
    [],
    'members'
  );
  assert.equal(merged.rows.length, 1);
  assert.equal(merged.rows[0].id, 70);
  assert.equal(merged.rows[0].first_name, 'Katie');
  assert.equal(merged.rows[0].deposit, '8');
});

test('flights match on number and dates, and a removed flight stays removed', () => {
  const ctx = loadMerge();
  const merged = ctx.mergeSavedChildRows(
    [{ id: 1, flight_number: 'BA 123', arrival_date: '2027-05-09', departure_date: '2027-05-15', comments: 'window' }],
    [
      { id: 9, flight_number: 'ba123', arrival_date: '2027-05-09T00:00:00', departure_date: '2027-05-15', comments: 'aisle' },
      { id: 10, flight_number: 'KL1', arrival_date: '2027-05-01', departure_date: '2027-05-02', comments: 'extra' },
    ],
    [{ flight_number: 'kl 1', arrival_date: '2027-05-01', departure_date: '2027-05-02' }],
    'flights'
  );
  assert.equal(merged.rows.length, 1);
  assert.equal(merged.rows[0].id, 9);
  assert.equal(merged.rows[0].comments, 'window');
  assert.equal(merged.rows[0].flight_number, 'BA 123');
  assert.equal(merged.loadedIds.join(','), '9,10');
});

test('a blocked save asks once, then uses the existing reload warning', () => {
  const ctx = loadMerge();
  assert.equal(ctx.childGuardNextStep('blocked', 0), 'prompt');
  assert.equal(ctx.childGuardNextStep('blocked', 1), 'reload');
  assert.equal(ctx.childRefreshPlan(['blocked', ''], 0), 'prompt');
  assert.equal(ctx.childRefreshPlan(['', 'blocked'], 0), 'prompt');
  assert.equal(ctx.childRefreshPlan(['blocked', 'blocked'], 1), 'reload');
  assert.equal(ctx.childRefreshPlan(['', ''], 1), 'save');
  assert.equal(ctx.childRefreshPlan(['error', 'blocked'], 0), 'error');

  let attempt = 0;
  const seen = ['blocked', 'blocked', 'blocked'].map(guard => {
    const plan = ctx.childRefreshPlan([guard], attempt);
    if (plan === 'prompt') attempt = 1;
    return plan;
  });
  assert.equal(seen.join(','), 'prompt,reload,reload');
  assert.equal(
    ctx.childRefreshMessage(true),
    'This booking was changed somewhere else (another tab or device). Refresh the guest list and save your changes?'
  );
  assert.match(html, /id="childRefreshConfirm">Refresh and save</);
  assert.match(html, /id="childRefreshCancel">Cancel</);
  const refresh = extractFunction('resolveSavedChildConflict');
  assert.equal((refresh.match(/await saveBooking\(/g) || []).length, 1);
  assert.match(refresh, /choice !== 'refresh'/);
  assert.equal(refresh.includes('closeTab('), false);
  assert.match(html, /This booking has guests saved that aren\\'t loaded on this screen/);
  assert.match(html, /This booking has flights saved that aren\\'t loaded on this screen/);
});
