const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const extrasSrc = fs.readFileSync(path.join(__dirname, 'booking-extras.js'), 'utf8');
const form = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');
const sql = fs.readFileSync(path.join(__dirname, 'sql/30_no_deposit_expected.sql'), 'utf8');

function loadExtras() {
  const context = { window: {}, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(extrasSrc, context);
  return context.window.BookingExtras;
}

test('deposits count one guest each, and a lump sum is only the fallback', () => {
  const BE = loadExtras();
  const partial = BE.depositCover({
    headcount: 4,
    hasPerGuest: true,
    guests: [{ deposit: '100' }, { deposit: '' }, { deposit: '0' }, { deposit: '' }],
    depositMade: 400,
  });
  assert.equal(partial.label, 'Deposits 1/4');
  assert.equal(partial.tone, 'amber');
  assert.equal(partial.missing, true);
  assert.equal(partial.paid, 1);

  const oneLarge = BE.depositCover({
    headcount: 4,
    guests: [{ deposit: 400 }, { deposit: '' }, { deposit: '' }, { deposit: '' }],
  });
  assert.equal(oneLarge.paid, 1);
  assert.equal(oneLarge.tone, 'amber');

  const allPaid = BE.depositCover({
    headcount: 4,
    guests: [{ deposit: 100 }, { deposit: 100 }, { deposit: 50 }, { deposit: 100 }],
  });
  assert.equal(allPaid.label, 'Deposits 4/4');
  assert.equal(allPaid.tone, 'green');
  assert.equal(allPaid.missing, false);

  const none = BE.depositCover({
    headcount: 4,
    hasPerGuest: true,
    guests: [{ deposit: null }, { deposit: '' }],
    depositMade: 0,
  });
  assert.equal(none.label, 'Deposits 0/4');
  assert.equal(none.tone, 'red');
  assert.equal(none.mismatch, true);
  assert.equal(none.note, 'Headcount 4, guest list 2');

  const lump = BE.depositCover({ headcount: 4, hasPerGuest: false, guests: [], depositMade: 250 });
  assert.equal(lump.label, 'Deposits 2/4');
  assert.equal(lump.tone, 'amber');
  const lumpFull = BE.depositCover({ headcount: 4, depositmade: 400 });
  assert.equal(lumpFull.label, 'Deposits 4/4');
  assert.equal(lumpFull.tone, 'green');
  const lumpShort = BE.depositCover({ headcount: 4, depositmade: 50 });
  assert.equal(lumpShort.paid, 0);
  assert.equal(lumpShort.tone, 'red');

  const blankGuests = BE.depositCover({
    headcount: 2,
    hasPerGuest: true,
    guests: [{ deposit: null }, { deposit: '' }],
    depositMade: 214,
  });
  assert.equal(blankGuests.label, 'Deposits 2/2');
  assert.equal(blankGuests.tone, 'green');
  assert.equal(blankGuests.mismatch, false);

  const explicitZero = BE.depositCover({
    headcount: 2,
    guests: [{ deposit: '0' }, { deposit: '0' }],
    depositMade: 400,
  });
  assert.equal(explicitZero.paid, 0);
  assert.equal(explicitZero.tone, 'red');
  assert.equal(explicitZero.fullPayment, false);
});

test('a full payment counts as the deposit, including a past booking with no deposit entry', () => {
  const BE = loadExtras();
  const pastFinal = BE.depositCover({
    headcount: 4,
    depositmade: 0,
    finalpayment: 2680,
    beading_tour_price: 2680,
    left_to_pay: 0,
    guests: [{ deposit: '' }, { deposit: '' }, { deposit: '' }, { deposit: '' }],
  });
  assert.equal(pastFinal.label, 'Deposits 4/4');
  assert.equal(pastFinal.tone, 'green');
  assert.equal(pastFinal.missing, false);
  assert.equal(pastFinal.fullPayment, true);

  const leftOnly = BE.depositCover({
    headcount: 2,
    depositmade: null,
    finalpayment: null,
    beading_tour_price: 1340,
    left_to_pay: 0,
  });
  assert.equal(leftOnly.label, 'Deposits 2/2');
  assert.equal(leftOnly.missing, false);

  const blankBooking = BE.depositCover({ headcount: 2, depositmade: 0, left_to_pay: 0 });
  assert.equal(blankBooking.label, 'Deposits 0/2');
  assert.equal(blankBooking.tone, 'red');
  assert.equal(blankBooking.fullPayment, false);

  const oneGuest = BE.depositCover({
    headcount: 3,
    pricePerPerson: 670,
    depositmade: 0,
    finalpayment: 670,
    left_to_pay: 1340,
    beading_tour_price: 2010,
    guests: [
      { deposit: '', finalPayment: 670, price: 670 },
      { deposit: '', finalPayment: '', price: 670 },
      { deposit: '', finalPayment: '', price: 670 },
    ],
  });
  assert.equal(oneGuest.paid, 1);
  assert.equal(oneGuest.tone, 'amber');
  assert.equal(oneGuest.missing, true);
  assert.equal(oneGuest.fullPayment, true);

  const explicitButSettled = BE.depositCover({
    headcount: 2,
    guests: [{ deposit: '0', final_payment: 500, price: 500 }, { deposit: '0', final_payment: 500, price: 500 }],
    depositMade: 0,
    finalpayment: 1000,
    beading_tour_price: 1000,
    left_to_pay: 0,
  });
  assert.equal(explicitButSettled.label, 'Deposits 2/2');
  assert.equal(explicitButSettled.missing, false);

  const stored = BE.depositCoverBooking({
    id: 12,
    group_name: 'Past group',
    no_people: 3,
    depositmade: null,
    finalpayment: 1800,
    beading_tour_price: 1800,
    left_to_pay: 0,
    no_deposit_expected: false,
    extra_notes: '',
  });
  assert.equal(stored.label, 'Deposits 3/3');
  assert.equal(stored.tone, 'green');
  assert.equal(stored.fullPayment, true);
});

test('No deposit expected is grey and is left out of Missing deposits', () => {
  const BE = loadExtras();
  const waived = BE.depositCover({
    no_deposit_expected: true,
    headcount: 4,
    guests: [{ deposit: '' }, { deposit: '' }, { deposit: '' }, { deposit: '' }],
    depositMade: 0,
  });
  assert.equal(waived.waived, true);
  assert.equal(waived.label, 'No deposit expected');
  assert.equal(waived.tone, 'neutral');
  assert.equal(waived.missing, false);
  assert.equal(waived.mismatch, false);

  assert.equal(BE.depositCover({ noDepositExpected: 'true', headcount: 2 }).missing, false);
  assert.equal(BE.depositCover({ no_deposit_expected: false, headcount: 2, hasPerGuest: false, depositMade: 0 }).missing, true);
  assert.equal(BE.depositCover({ headcount: 2, depositmade: 0 }).label, 'Deposits 0/2');
});

test('form, planner, table, year tours, calendar, analytics and tax share the full-payment rule', () => {
  const root = __dirname;
  const form = fs.readFileSync(path.join(root, 'booking-form.js'), 'utf8');
  const planner = fs.readFileSync(path.join(root, 'tour-planner.js'), 'utf8');
  const hotels = fs.readFileSync(path.join(root, 'hotels.js'), 'utf8');
  const analytics = fs.readFileSync(path.join(root, 'analytics.html'), 'utf8');
  const tax = fs.readFileSync(path.join(root, 'tax-summary.js'), 'utf8');
  const taxPage = fs.readFileSync(path.join(root, 'tax-summary.html'), 'utf8');
  assert.match(form, /function depositCoverOf\(record\)/);
  assert.match(form, /BookingExtras\.depositCoverBooking\(record\)/);
  assert.match(form, /finalPayment/);
  assert.match(form, /leftToPay/);
  assert.match(form, /yearTourDepositCover\(tour\)/);
  assert.match(form, /depositCoverOf\(currentBooking\)/);
  assert.match(planner, /BookingExtras\.depositCover\(\{/);
  assert.match(planner, /leftToPay: bd\.money\.balance/);
  assert.match(planner, /data-deposit-status/);
  assert.equal(planner.includes('patch.depositmade = Number(money.depositAmount) &&'), false);
  assert.match(hotels, /BookingExtras\.depositCoverBooking\(booking\)/);
  assert.match(analytics, /function depositGuestCounts/);
  assert.match(analytics, /depositCoverBooking\(booking\)/);
  assert.match(analytics, /every year in view/);
  assert.match(tax, /depositCoverBooking\(booking\)/);
  assert.match(taxPage, /Deposit counted as paid/);
});

test('the checkbox is saved with the booking and the column can be missing', () => {
  assert.match(sql, /ALTER TABLE public\.bookings ADD COLUMN IF NOT EXISTS no_deposit_expected boolean NOT NULL DEFAULT false;/);
  assert.equal(/GRANT/i.test(sql), false);
  const fare = form.slice(form.indexOf('function tourFareHTML('), form.indexOf('function fuelCostFieldHTML('));
  const full = fare.indexOf('id="t${t}_tour_full"');
  const box = fare.indexOf('id="t${t}_no_deposit_expected"');
  const badge = fare.indexOf('id="t${t}_deposit_badge"');
  const unverified = fare.indexOf('id="t${t}_unverified"');
  assert.ok(full > 0 && box > full && badge > box && unverified > badge);
  assert.match(fare, /> No deposit expected</);
  assert.match(form, /data\.no_deposit_expected = !!tEl\(tabId, 'no_deposit_expected'\)\?\.checked/);
  assert.match(form, /optional\.no_deposit_expected = bookingData\.no_deposit_expected === true/);
  assert.match(form, /isMissingColumnError/);
  assert.match(form, /value="missing_deposits">Missing deposits</);
  assert.match(form, /id="missingDepositsButton"/);
  assert.match(form, /if \(filter === 'missing_deposits'\) return depositCoverOf\(b\)\.missing/);
});
