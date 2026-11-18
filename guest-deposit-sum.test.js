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

const booking310 = [
  { firstName: 'Jennifer', price: '670', payMethod: 'wise', deposit: '100', finalPayment: '' },
  { firstName: 'Gail', price: '670', payMethod: 'wise', deposit: '100', finalPayment: '' },
  { firstName: 'Kay', price: '690', payMethod: 'bank', deposit: '100', finalPayment: '' },
  { firstName: 'Maggie', price: '690', payMethod: 'bank', deposit: '', finalPayment: '' },
];

test('booking 310 deposits add up to 300 and the finals add up to 0', () => {
  const BE = loadExtras();
  const totals = BE.guestPaymentTotals(booking310);
  assert.equal(totals.anyPayment, true);
  assert.equal(totals.anyDeposit, true);
  assert.equal(totals.anyFinal, false);
  assert.equal(totals.deposit, 300);
  assert.equal(totals.finalPayment, 0);
  assert.equal(BE.guestLeftToPay(booking310, '670').left, 2420);
});

test('a final payment is included, and a group with no per-person amounts is not', () => {
  const BE = loadExtras();
  const finals = BE.guestPaymentTotals([
    { deposit: '', final_payment: '40' },
    { deposit: '', paid: '60.5' },
  ]);
  assert.equal(finals.anyPayment, true);
  assert.equal(finals.deposit, 0);
  assert.equal(finals.finalPayment, 100.5);
  const quiet = BE.guestPaymentTotals([
    { deposit: '', finalPayment: '' },
    { deposit: '   ', finalPayment: null },
  ]);
  assert.equal(quiet.anyPayment, false);
  assert.equal(quiet.deposit, 0);
  assert.equal(quiet.finalPayment, 0);
});

test('distinct paid-via values read Wise / bank transfer, in the order guests were entered', () => {
  const BE = loadExtras();
  assert.equal(BE.combinedPayMethod(booking310), 'Wise / bank transfer');
  assert.equal(BE.combinedPayMethod([{ payMethod: 'wise' }, { payMethod: 'wise' }]), 'wise');
  assert.equal(BE.combinedPayMethod([{ payMethod: '' }]), '');
  assert.equal(BE.combinedPayMethod([
    { payMethod: 'bank' },
    { payMethod: 'paypal' },
  ]), 'Bank transfer / paypal');
  assert.equal(BE.payMethodText('Wise / bank transfer'), 'Wise / bank transfer');
  assert.equal(BE.payMethodText('wise'), 'Wise');
  const merged = BE.merge({ money: { method: 'Wise / bank transfer', depositAmount: '300' } });
  assert.equal(merged.money.method, 'Wise / bank transfer');
  assert.equal(merged.money.depositAmount, '300');
});

test('a blank main method is filled from guests, and a stored method is never replaced by blank', () => {
  const BE = loadExtras();
  assert.equal(BE.resolvePayMethod('', 'Wise / bank transfer', '', ''), 'Wise / bank transfer');
  assert.equal(BE.resolvePayMethod('', '', 'Wise / bank transfer', ''), 'Wise / bank transfer');
  assert.equal(BE.resolvePayMethod('cash', 'Wise / bank transfer', 'Wise / bank transfer', 'typed'), 'cash');
  assert.equal(BE.resolvePayMethod('', 'wise', '', 'guests'), 'wise');
  assert.equal(BE.resolvePayMethod('', '', 'cash', 'guests'), 'cash');
  assert.equal(BE.resolvePayMethod('', 'Wise / bank transfer', 'cash', ''), 'cash');
  assert.equal(BE.resolvePayMethod('', '', '', ''), '');
});

test('the main deposit and final fields are filled from guests and a blank method cannot wipe a saved one', () => {
  assert.match(formSrc, /guestPaymentTotals/);
  assert.match(formSrc, /combinedPayMethod/);
  assert.match(formSrc, /resolvePayMethod/);
  assert.match(formSrc, /syncMainPaymentsFromGuests\(tabId\)/);
  assert.match(formSrc, /input\.readOnly = true/);
  assert.match(formSrc, /is-auto-money/);
  assert.match(formSrc, /dataset\.resolvedMethod/);
  assert.match(formSrc, /existing && existing\.payment_method/);
  assert.match(formSrc, /Payment method: /);
  const save = formSrc.slice(formSrc.indexOf('function bookingColumnsFromExtras'), formSrc.indexOf('function isMissingColumnError'));
  assert.match(save, /payment_method: method/);
  assert.doesNotMatch(save, /payment_method: m\.method \|\| null/);
});
