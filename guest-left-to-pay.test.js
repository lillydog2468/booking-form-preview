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

test('booking 310 leaves Jennifer 570, Gail 570, Kay 590 and Maggie 690', () => {
  const BE = loadExtras();
  const split = BE.guestLeftToPay([
    { firstName: 'Jennifer', price: '670', payMethod: 'wise', deposit: '100', finalPayment: '' },
    { firstName: 'Gail', price: '670', payMethod: 'wise', deposit: '100', finalPayment: '' },
    { firstName: 'Kay', price: '690', payMethod: 'bank', deposit: '100', finalPayment: '' },
    { firstName: 'Maggie', price: '690', payMethod: 'bank', deposit: '', finalPayment: '' },
  ], '670');
  assert.equal(split.rows.map(row => row.name + ' ' + row.left).join(', '), 'Jennifer 570, Gail 570, Kay 590, Maggie 690');
  assert.equal(split.left, 2420);
  assert.equal(BE.perGuestMoney([
    { price: '670', deposit: '100' },
    { price: '670', deposit: '100' },
    { price: '690', deposit: '100' },
    { price: '690', deposit: '' },
  ], '670').left, 2420);
});

test('a one-payer group with the same price stays quiet', () => {
  const BE = loadExtras();
  assert.equal(BE.guestLeftToPay([
    { firstName: 'Ann', price: '', payMethod: '', deposit: '', finalPayment: '' },
    { firstName: 'Bob', price: '', payMethod: '', deposit: '', finalPayment: '' },
  ], '200'), null);
  assert.equal(BE.guestLeftToPay([
    { firstName: 'Ann', price: '200', payMethod: 'bank', deposit: '', finalPayment: '' },
    { firstName: 'Bob', price: '200', payMethod: 'bank', deposit: '', finalPayment: '' },
  ], '200'), null);
});

test('a deposit, a different method, or a zero and an overpayment still shows', () => {
  const BE = loadExtras();
  const deposit = BE.guestLeftToPay([
    { firstName: 'Ann', price: '', deposit: '50', finalPayment: '' },
    { firstName: 'Bob', price: '', deposit: '', finalPayment: '' },
  ], '200');
  assert.equal(deposit.rows[0].left, 150);
  assert.equal(deposit.rows[1].left, 200);
  assert.equal(deposit.left, 350);
  const methods = BE.guestLeftToPay([
    { firstName: 'Ann', payMethod: 'wise', deposit: '', finalPayment: '' },
    { firstName: 'Bob', payMethod: 'bank', deposit: '', finalPayment: '' },
  ], '100');
  assert.equal(methods.left, 200);
  const settled = BE.guestLeftToPay([
    { firstName: 'Ann', price: '100', deposit: '40', finalPayment: '60' },
    { firstName: 'Bob', price: '100', deposit: '120', finalPayment: '' },
  ], '100');
  assert.equal(settled.rows[0].left, 0);
  assert.equal(settled.rows[1].left, -20);
  assert.equal(settled.left, -20);
});

test('the payment row says Left to pay and the folded summary lists each guest', () => {
  assert.match(formSrc, /Left to pay /);
  assert.match(formSrc, /Paid in full/);
  assert.match(formSrc, /Overpaid /);
  assert.match(formSrc, /guestLeftToPay/);
  assert.match(formSrc, /guestSplit\.rows\.map/);
  assert.match(formSrc, /\.member-balance\.is-clear/);
  assert.match(formSrc, /\.member-balance\.is-over/);
});
