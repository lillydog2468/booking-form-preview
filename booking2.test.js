const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

require('./booking2-model.js');

const B = globalThis.Booking2;
const html = fs.readFileSync(path.join(__dirname, 'booking2.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'booking2.css'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, 'booking2.js'), 'utf8');
const plannerHtml = fs.readFileSync(path.join(__dirname, 'planner2.html'), 'utf8');
const form = fs.readFileSync(path.join(__dirname, 'booking-form.html'), 'utf8');
const oldPlanner = fs.readFileSync(path.join(__dirname, 'tour-planner.html'), 'utf8');

test('any numbered booking opens, and a blank id does not', () => {
  assert.equal(B.isAllowedBooking(310), true);
  assert.equal(B.isAllowedBooking('310'), true);
  assert.equal(B.isAllowedBooking(28), true);
  assert.equal(B.isAllowedBooking(''), false);
  const other = B.present({ booking: { id: 28, group_name: 'Sharon Harris' } });
  assert.equal(other.refused, false);
  assert.equal(other.id, 28);
  assert.equal(other.groupName, 'Sharon Harris');
  const refused = B.present({ booking: { id: 'nope', group_name: 'Someone else' } });
  assert.equal(refused.refused, true);
  assert.equal(B.usesPhoneLayout(390), true);
  assert.equal(B.usesPhoneLayout(768), false);
  assert.equal(B.usesPhoneLayout(1440), false);
});

test('dates, hotel strips and money come from the booking', () => {
  assert.equal(B.nightsBetween('2027-05-10', '2027-05-16'), 6);
  const ranges = B.stayRanges('2027-05-10', '2027-05-16', [1, 5]);
  assert.equal(B.formatStay(ranges[0]), '10–11 May');
  assert.equal(B.formatStay(ranges[1]), '11–16 May');
  const view = B.sample();
  assert.equal(view.readOnly, false);
  assert.equal(view.groupName, 'Jennifer Lindsay');
  assert.equal(view.organiser, 'Jennifer Lindsay');
  assert.equal(view.nights, 6);
  assert.equal(view.headcount, '8');
  assert.equal(view.money.price, '£1895.00');
  assert.equal(view.money.deposit, '£1600.00');
  assert.equal(view.money.left, '£13560.00');
  assert.equal(view.hotels[0].name, 'Hotel Axa');
  assert.equal(view.hotels[0].strip, '10–11 May');
  assert.equal(view.hotels[1].name, 'Park Hotel');
  assert.equal(view.hotels[1].strip, '11–16 May');
  assert.equal(view.guests[0].name, 'Jennifer Lindsay');
  assert.equal(view.guests[0].arrivalFlight, 'BA854');
  assert.equal(view.flights[0].number, 'BA854');
  const live = B.present({
    booking: { id: 310, group_name: 'Jennifer Lindsay', price_per_person: 10, depositmade: 2, left_to_pay: 8 },
  });
  assert.equal(live.readOnly, true);
  assert.equal(live.money.left, '£8.00');
});

test('the real booking is never written, and the old pages stay put', () => {
  assert.equal(/\.(update|insert|delete)\s*\(/.test(app), false);
  assert.match(app, /\.select\(/);
  assert.match(app, /eq\('id', id\)/);
  assert.equal(app.includes("eq('id', 310)"), false);
  assert.match(app, /preview=mock/);
  assert.match(html, /planner2\.js/);
  assert.match(html, /id="b2Summary"/);
  assert.match(html, /id="p2Tray"/);
  assert.equal(html.includes('href="planner2.html"'), false);
  assert.match(html, /id="b2Home"/);
  assert.match(html, /booking-form\.html/);
  assert.match(css, /\.b2-home/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.b2-summary/);
  assert.match(app, /Planner2Page\.mount/);
  assert.match(plannerHtml, /location\.replace\('booking2\.html'/);
  assert.match(form, /href="booking2\.html"/);
  assert.equal(form.includes('booking2.js'), false);
  assert.match(oldPlanner, /href="booking2\.html"/);
  assert.equal(oldPlanner.includes('booking2.js'), false);
});
