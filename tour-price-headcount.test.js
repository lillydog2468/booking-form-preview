const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');
const extrasSrc = fs.readFileSync(path.join(__dirname, 'booking-extras.js'), 'utf8');

function extractFunction(name) {
  const start = html.indexOf('function ' + name + '(');
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

function field(value, extra) {
  return Object.assign({ value: value, dataset: {} }, extra || {});
}

function loadFare() {
  const nodes = new Map();
  const ctx = {
    nodes,
    guests: [],
    document: { getElementById(id) { return nodes.get(id) || null; } },
    tEl(tabId, key) { return nodes.get('t' + tabId + '_' + key) || null; },
    window: {},
    perGuestRowsFromDom() { return ctx.guests; },
    syncHotelExpenseLines() {},
    syncMainPaymentsFromGuests() {},
    syncGroupPriceChrome() {},
    getExpensesTotalCost() { return 0; },
    getAdditionalExpensesTotalCost() { return 0; },
    tNum() { return 0; },
    formatMoney() { return ''; },
    updateDepositHint() {},
    updateRoomWarning() {},
    refreshMemberPayments() {},
    DEFAULT_CURRENCY: 'GBP',
    groupPriceOn(tabId) { return !!(ctx.tEl(tabId, 'group_price') && ctx.tEl(tabId, 'group_price').checked); },
    leaderHalfPriceOn(tabId) { return !!(ctx.tEl(tabId, 'leader_half_price') && ctx.tEl(tabId, 'leader_half_price').checked); },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(extrasSrc, ctx);
  vm.runInContext(
    extractFunction('tourFareAmount') + '\n' +
    extractFunction('releaseTypedTourPrice') + '\n' +
    extractFunction('noteLoadedTourPrice') + '\n' +
    extractFunction('recalculateTab'),
    ctx
  );
  return ctx;
}

test('booking 315 shows headcount times the price, even when the stored total was stale', () => {
  const ctx = loadFare();
  const total = field('690');
  total.dataset.tourPriceSource = 'typed';
  ctx.nodes.set('t1_beading_tour_price', total);
  ctx.nodes.set('t1_no_people', field('2'));
  ctx.nodes.set('t1_price_per_person', field('690'));
  ctx.noteLoadedTourPrice('1');
  assert.equal(total.value, '1380.00');
  assert.equal(total.dataset.tourPriceSource, 'computed');
});

test('changing the headcount or the price per person updates a typed tour total', () => {
  const ctx = loadFare();
  const total = field('690');
  total.dataset.tourPriceSource = 'typed';
  ctx.nodes.set('t1_beading_tour_price', total);
  ctx.nodes.set('t1_no_people', field('2'));
  ctx.nodes.set('t1_price_per_person', field('690'));
  ctx.recalculateTab('1');
  assert.equal(total.value, '690');
  assert.equal(total.dataset.tourPriceSource, 'typed');

  ctx.nodes.get('t1_no_people').value = '3';
  ctx.releaseTypedTourPrice('1');
  ctx.recalculateTab('1');
  assert.equal(total.value, '2070.00');
  assert.equal(total.dataset.tourPriceSource, 'computed');

  total.dataset.tourPriceSource = 'typed';
  total.value = '10';
  ctx.nodes.get('t1_price_per_person').value = '100';
  ctx.releaseTypedTourPrice('1');
  ctx.nodes.set('t1_leader_half_price', { checked: true });
  ctx.recalculateTab('1');
  assert.equal(total.value, '250.00');
  assert.equal(total.dataset.tourPriceSource, 'computed');
});

test('a group price and per-guest prices are left on their own totals', () => {
  const ctx = loadFare();
  const total = field('200');
  total.dataset.tourPriceSource = 'typed';
  ctx.nodes.set('t1_beading_tour_price', total);
  ctx.nodes.set('t1_no_people', field('4'));
  ctx.nodes.set('t1_price_per_person', field('48'));
  ctx.nodes.set('t1_group_price', { checked: true });
  ctx.releaseTypedTourPrice('1');
  ctx.recalculateTab('1');
  assert.equal(total.value, '200');
  assert.equal(total.dataset.tourPriceSource, 'group');

  ctx.nodes.set('t1_group_price', { checked: false });
  total.dataset.tourPriceSource = 'typed';
  ctx.guests = [{ price: '40' }, { price: '60' }];
  ctx.recalculateTab('1');
  assert.equal(total.value, '100.00');
  assert.equal(total.dataset.tourPriceSource, 'computed');
});

test('the headcount and price fields release a typed total before the fare is recalculated', () => {
  const input = extractFunction('onTabInput');
  const release = input.indexOf("if (changedId.endsWith('_no_people')) releaseTypedTourPrice(tabId);");
  const price = input.indexOf("if (priceNow) releaseTypedTourPrice(tabId);");
  const recalc = input.indexOf('recalculateTab(tabId);');
  assert.ok(release > 0 && price > release && recalc > price);
  assert.match(extractFunction('recalculateTab'), /tourPriceSource !== 'typed'/);
  assert.match(extractFunction('recalculateTab'), /perGuestMoney/);
  assert.match(extractFunction('applySuggestedPrice'), /releaseTypedTourPrice\(tabId\)/);
});
