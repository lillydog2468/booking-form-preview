const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const extrasSrc = fs.readFileSync(path.join(__dirname, 'booking-extras.js'), 'utf8');
const formSrc = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');

function loadExtras() {
  const context = { window: {}, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(extrasSrc, context);
  return context.window.BookingExtras;
}

const guests = [
  { personId: 'p-kay', id: 1, firstName: 'Kay', lastName: 'Enk' },
  { personId: 'p-maggie', id: 2, firstName: 'Maggie', lastName: 'Cox' },
  { id: 3, firstName: 'Jennifer', lastName: 'Lindsay' },
  { firstName: 'Gail', lastName: 'DeLuca' },
];

test('a missing or empty stayer list means the whole group', () => {
  const BE = loadExtras();
  assert.equal(BE.stayerKeysForSlot(undefined, 'primary'), null);
  assert.equal(BE.stayerKeysForSlot([], 'primary'), null);
  assert.equal(BE.stayerKeysForSlot([{ slot: 'primary', guests: [] }], 'primary'), null);
  assert.equal(BE.guestsForHotel(guests, [], 'primary').length, 4);
  const round = BE.merge({});
  assert.equal(JSON.stringify(round.hotelStayers), '[]');
  assert.equal(round.guests.length, 0);
});

test('booking 310 keeps Kay and Maggie on the early hotel and everyone on the main hotel', () => {
  const BE = loadExtras();
  const saved = BE.merge({
    hotelStayers: [{
      slot: 'hotel:41#0',
      hotelId: 41,
      name: 'Sunday hotel',
      guests: ['p-kay', 'p-maggie'],
    }],
  });
  const early = BE.guestsForHotel(guests, saved.hotelStayers, 'hotel:41#0').map(guest => BE.guestStayKey(guest));
  assert.equal(JSON.stringify(early), JSON.stringify(['p-kay', 'p-maggie']));
  assert.equal(BE.guestsForHotel(guests, saved.hotelStayers, 'primary').length, 4);
  assert.equal(BE.stayerBrief(['Kay Enk', 'Maggie Cox'], 4), 'Kay Enk, Maggie Cox (2 of 4)');
  assert.equal(BE.stayerBrief(['Kay Enk', 'Maggie Cox', 'Jennifer Lindsay', 'Gail DeLuca'], 4), '');
  const again = BE.merge(saved);
  assert.equal(JSON.stringify(again.hotelStayers[0].guests), JSON.stringify(['p-kay', 'p-maggie']));
});

test('guest keys prefer person id, then member id, then name', () => {
  const BE = loadExtras();
  assert.equal(BE.guestStayKey(guests[0]), 'p-kay');
  assert.equal(BE.guestStayKey(guests[2]), 'member:3');
  assert.equal(BE.guestStayKey(guests[3]), 'Gail DeLuca');
  const named = BE.guestsForHotel(guests, [{ slot: 'primary', guests: ['Gail DeLuca', 'member:3'] }], 'primary');
  assert.equal(named.map(guest => guest.firstName).join(','), 'Jennifer,Gail');
});

test('auto rooms use the ticked guests and still add Keith’s room', () => {
  const BE = loadExtras();
  const auto = { rooms: { singles: '4', twins: '', doubles: '', keithRoom: true } };
  assert.equal(BE.roomsLabelForHotel(auto, null, null, 4), '5 rooms needed');
  assert.equal(BE.roomsLabelForHotel(auto, null, 2, 4), '3 rooms needed');
  const typed = { rooms: { singles: '1', twins: '1', doubles: '', keithRoom: true } };
  assert.equal(BE.roomsLabelForHotel(typed, null, 2, 4), BE.roomsLabelForHotel(typed, null, null, 4));
  assert.equal(BE.roomsLabelForHotel({ rooms: { singles: '4', twins: '', doubles: '', keithRoom: false } }, false, 2, 4), '2 rooms needed');
});

test('the hotel tick list is on each hotel box and nights still use the whole stay', () => {
  assert.match(formSrc, /Who is staying/);
  assert.match(formSrc, /function hotelWhoHTML/);
  assert.match(formSrc, /hotelStayers/);
  assert.match(formSrc, /function updateHotelNightsHint/);
  assert.match(formSrc, /The stay from arrival to departure is/);
  const nights = formSrc.slice(formSrc.indexOf('function updateHotelNightsHint('), formSrc.indexOf('function paintHotelNightsMismatch('));
  assert.equal(nights.includes('stayer'), false);
});

test('per-person prices change the total only when the prices differ', () => {
  const BE = loadExtras();
  const same = [
    { firstName: 'Kay', lastName: 'Enk', price: '670', deposit: '100', finalPayment: '0' },
    { firstName: 'Gail', lastName: 'DeLuca', price: '670', deposit: '100', finalPayment: '' },
  ];
  assert.equal(BE.perGuestMoney(same, 670), null);
  assert.equal(BE.perGuestMoney([
    { price: '', deposit: '100' },
    { price: '', deposit: '100' },
  ], 670), null);
  const split = BE.perGuestMoney([
    { firstName: 'Jennifer', lastName: 'Lindsay', price: '670', deposit: '100', finalPayment: '' },
    { firstName: 'Gail', lastName: 'DeLuca', price: '670', deposit: '100', finalPayment: '' },
    { firstName: 'Kay', lastName: 'Enk', price: '690', deposit: '100', finalPayment: '' },
    { firstName: 'Maggie', lastName: 'Cox', price: '690', deposit: '', finalPayment: '' },
  ], 670);
  assert.equal(split.total, 2720);
  assert.equal(split.left, 2420);
  const merged = BE.merge({
    guests: [
      { firstName: 'Jennifer', lastName: 'Lindsay', price: '670', payMethod: 'wise' },
      { firstName: 'Kay', lastName: 'Enk', price: '690', payMethod: 'bank' },
    ],
  });
  assert.equal(merged.guests[0].payMethod, 'wise');
  assert.equal(merged.guests[1].payMethod, 'bank');
  assert.equal(merged.guests[0].price, '670');
  assert.equal(BE.payMethodSummary(merged.guests), 'Jennifer Lindsay Wise, Kay Enk Bank transfer');
  assert.equal(BE.payMethodSummary([{ firstName: 'Kay', lastName: 'Enk', payMethod: 'wise' }]), '');
  assert.equal(BE.methodLabel('bank'), 'Bank transfer');
});

test('the payment row has a price and the same paid-via choices as the booking', () => {
  assert.match(formSrc, /class="member-price"/);
  assert.match(formSrc, /Paid via/);
  assert.match(formSrc, /aria-label="Paid via"/);
  assert.match(formSrc, /value="wise"/);
  assert.match(formSrc, /value="bank"/);
  assert.match(formSrc, /perGuestMoney/);
  const method = formSrc.slice(formSrc.indexOf('id="t${t}_pay_method"'), formSrc.indexOf('id="t${t}_pay_method"') + 400);
  assert.match(method, /Bank transfer/);
  assert.match(method, /Wise/);
});
