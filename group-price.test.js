const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const extrasSrc = fs.readFileSync(path.join(__dirname, 'booking-extras.js'), 'utf8');
const formSrc = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');

function loadExtras() {
  const context = { window: {}, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(extrasSrc, context);
  return context.window.BookingExtras;
}

test('Dorris is ticked only when the stored total is not headcount times the price', () => {
  const BE = loadExtras();
  assert.equal(BE.inferGroupPrice({
    group_name: 'Dorris Group',
    no_people: 1,
    price_per_person: 48,
    beading_tour_price: 200,
  }, null), true);
  assert.equal(BE.inferGroupPrice({
    group_name: 'Doris',
    no_people: '8',
    price_per_person: '48',
    beading_tour_price: '2000',
  }, {}), true);
  assert.equal(BE.inferGroupPrice({
    group_name: 'Dorris Group',
    no_people: 1,
    price_per_person: 48,
    beading_tour_price: 48,
  }, null), false);
  assert.equal(BE.inferGroupPrice({
    group_name: 'Heather',
    no_people: 1,
    price_per_person: 48,
    beading_tour_price: 200,
  }, null), false);
  assert.equal(BE.inferGroupPrice({
    group_name: 'Dorris Group',
    no_people: 4,
    beading_tour_price: 2000,
  }, null), false);
  assert.equal(BE.inferGroupPrice({
    group_name: 'Dorris Group',
    no_people: 1,
    price_per_person: 48,
    beading_tour_price: 200,
  }, { groupPrice: false }), false);
  assert.equal(BE.inferGroupPrice({
    group_name: 'Heather',
    no_people: 4,
    price_per_person: 100,
    beading_tour_price: 400,
  }, { groupPrice: true }), true);
});

test('a group price is not halved and is stored without a new column', () => {
  const BE = loadExtras();
  assert.equal(BE.tourRevenue({
    no_people: 8,
    price_per_person: 48,
    beading_tour_price: 2000,
    leader_half_price: true,
  }, { groupPrice: true }), 2000);
  assert.equal(BE.tourRevenue({
    no_people: 8,
    price_per_person: 48,
    beading_tour_price: 384,
    leader_half_price: true,
  }, { groupPrice: true }), 384);
  const on = BE.merge({ groupPrice: true, money: { total: '2000' } });
  assert.equal(on.groupPrice, true);
  assert.equal(on.money.total, '2000');
  const off = BE.merge({ groupPrice: false });
  assert.equal(off.groupPrice, false);
  const untouched = BE.merge({ money: { total: '48' } });
  assert.equal(Object.prototype.hasOwnProperty.call(untouched, 'groupPrice'), false);
  assert.equal(BE.hasContent({ groupPrice: true }), true);
  assert.equal(BE.hasContent({ groupPrice: false }), false);
  assert.doesNotMatch(formSrc, /group_price BOOLEAN/);
  assert.doesNotMatch(formSrc, /ADD COLUMN IF NOT EXISTS group_price/);
});

test('group price does not invent a per-person remainder', () => {
  const BE = loadExtras();
  const guests = [
    { firstName: 'Ann', deposit: '50', price: '', finalPayment: '' },
    { firstName: 'Bob', deposit: '', price: '', finalPayment: '' },
  ];
  assert.equal(BE.guestLeftToPay(guests, '48', { groupPrice: true }), null);
  const split = BE.guestLeftToPay(guests, '48');
  assert.equal(split.rows[0].left, -2);
  assert.equal(split.rows[1].left, 48);
  assert.equal(split.left, 46);
});

test('the tick sits beside headcount and the total stays fixed', () => {
  const fare = formSrc.slice(formSrc.indexOf('function tourFareHTML('), formSrc.indexOf('function fuelCostFieldHTML('));
  const head = fare.indexOf('id="t${t}_no_people"');
  const tick = fare.indexOf('id="t${t}_group_price"');
  const total = fare.indexOf('id="t${t}_beading_tour_price"');
  assert.ok(head >= 0 && tick > head && total > tick);
  assert.match(fare, /One price for the whole group/);
  assert.match(formSrc, /Group price — fixed for any number/);
  assert.match(formSrc, /tourPriceSource = 'group'/);
  assert.match(formSrc, /!fixedGroup &&/);
  assert.match(formSrc, /!groupPriceOn\(tabId\) && window\.BookingExtras/);
  assert.match(formSrc, /groupLoaded === 'inferred'/);
  assert.match(formSrc, /inferGroupPrice/);
});
