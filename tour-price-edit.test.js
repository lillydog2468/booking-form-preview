const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const vm = require('node:vm');

const html = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');

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

test('the beading tour price box can be typed into', () => {
  const fare = html.slice(html.indexOf('function tourFareHTML('), html.indexOf('function fuelCostFieldHTML('));
  assert.match(fare, /id="t\$\{t\}_beading_tour_price"/);
  assert.equal(fare.includes('readonly'), false);
});

test('a flat price with headcount 1 is kept only when the group tick is on', () => {
  const nodes = new Map();
  function field(value) { return { value, dataset: {} }; }
  const ctx = {
    document: { getElementById(id) { return nodes.get(id) || null; } },
    tEl(tabId, key) { return nodes.get('t' + tabId + '_' + key) || null; },
    groupPriceOn(tabId) { return !!(ctx.tEl(tabId, 'group_price') && ctx.tEl(tabId, 'group_price').checked); },
  };
  vm.createContext(ctx);
  vm.runInContext(
    extractFunction('leaderHalfPriceOn') + '\n' +
    extractFunction('tourFareAmount') + '\n' +
    extractFunction('noteLoadedTourPrice'),
    ctx
  );

  const total = field('200');
  nodes.set('t1_beading_tour_price', total);
  nodes.set('t1_no_people', field('1'));
  nodes.set('t1_price_per_person', field('48'));
  ctx.noteLoadedTourPrice('1');
  assert.equal(total.value, '48.00');
  assert.equal(total.dataset.tourPriceSource, 'computed');

  const grouped = field('200');
  nodes.set('t1_beading_tour_price', grouped);
  nodes.set('t1_group_price', { checked: true });
  ctx.noteLoadedTourPrice('1');
  assert.equal(grouped.value, '200');
  assert.equal(grouped.dataset.tourPriceSource, 'group');

  nodes.set('t1_group_price', { checked: false });
  const matched = field('48.00');
  nodes.set('t1_beading_tour_price', matched);
  ctx.noteLoadedTourPrice('1');
  assert.equal(matched.value, '48.00');
  assert.equal(matched.dataset.tourPriceSource, 'computed');
});

test('recalculate leaves a typed tour price and still multiplies the others', () => {
  const src = extractFunction('recalculateTab');
  assert.match(src, /tourPriceSource !== 'typed'/);
  assert.match(src, /tourFareAmount\(people, pricePerPerson, half\)/);
});
