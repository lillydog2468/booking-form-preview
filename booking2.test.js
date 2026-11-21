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

test('upcoming groups are the ones still to leave, soonest first', () => {
  var today = '2026-11-21';
  assert.equal(B.todayIso(new Date(2026, 10, 21, 15, 30)), '2026-11-21');
  assert.equal(B.isCancelledStatus('Cancelled'), true);
  assert.equal(B.isCancelledStatus(' canceled '), true);
  assert.equal(B.isCancelledStatus('Booked'), false);
  assert.equal(B.isCancelledStatus(''), false);
  var rows = [
    { id: 1, group_name: 'Later', tour_arrival_date: '2027-06-01', departure_date: '2027-06-07', no_people: 4, status: '' },
    { id: 2, group_name: 'Past', tour_arrival_date: '2026-05-01', departure_date: '2026-05-06', no_people: 8, status: '' },
    { id: 3, group_name: 'Cancelled week', tour_arrival_date: '2027-04-01', departure_date: '2027-04-07', no_people: 5, status: 'cancelled' },
    { id: 4, group_name: '', tour_arrival_date: '2026-11-18', departure_date: today, no_people: 1, status: 'Booked' },
    { id: 5, group_name: 'No dates', status: '' },
    { id: 6, group_name: 'Arrives only', tour_arrival_date: '2027-01-04', no_people: '2', status: '' },
    { id: 'nope', group_name: 'Bad id', departure_date: '2027-08-01', status: '' },
    { id: 7, group_name: 'Already left', tour_arrival_date: '2026-11-01', departure_date: '2026-11-20', status: '' },
  ];
  var described = B.describeUpcoming(rows, today);
  assert.deepEqual(described.map(function (row) { return row.id; }), [4, 6, 1]);
  assert.equal(described[0].name, 'Booking 4');
  assert.equal(described[0].headcount, '1 person');
  assert.equal(described[0].dates, '18–21 Nov 2026');
  assert.equal(described[1].meta, '4 Jan 2027 · 2 people');
  assert.equal(described[2].dates, '1–7 Jun 2027');
  assert.equal(B.formatTourDates('2026-12-28', '2027-01-03'), '28 Dec 2026 – 3 Jan 2027');
  assert.equal(B.choosePlanningBooking(rows, 2, today), 4);
  assert.equal(B.choosePlanningBooking(rows, 1, today), 1);
  assert.equal(B.choosePlanningBooking(rows, null, today), 4);
  assert.equal(B.choosePlanningBooking([{ id: 9, group_name: 'Old', departure_date: '2020-01-01', status: 'cancelled' }], null, today), null);
  assert.deepEqual(B.planningTarget('?home=1'), { mode: 'resolve' });
  assert.deepEqual(B.planningTarget('?home=1&booking=310'), { mode: 'resolve' });
  assert.deepEqual(B.planningTarget('?booking=28'), { mode: 'booking', id: 28 });
  assert.deepEqual(B.planningTarget(''), { mode: 'resolve' });
  assert.deepEqual(B.planningTarget('?booking=nope'), { mode: 'refused' });
  assert.deepEqual(B.planningTarget('?preview=mock'), { mode: 'sample' });
  assert.deepEqual(B.planningTarget('?booking=28&preview=mock'), { mode: 'sample' });
});

test('the group name opens upcoming groups and a home screen link stays on planning', () => {
  assert.match(html, /id="b2TitleBtn"/);
  assert.match(html, /id="b2Switcher"/);
  assert.match(html, /id="b2SwitcherClose"/);
  assert.match(html, /Upcoming groups/);
  assert.match(html, /apple-mobile-web-app-title" content="Planning"/);
  assert.match(html, /class="b2-back-link" href="booking-form\.html"/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /-webkit-overflow-scrolling:\s*touch/);
  assert.match(css, /\.b2-switcher-list[\s\S]*overflow:\s*auto/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(min-width: 761px\)/);
  assert.match(css, /\.b2-switch-item\.is-current/);
  assert.match(css, /\.b2-switcher\[hidden\]/);
  assert.match(app, /describeUpcoming/);
  assert.match(app, /choosePlanningBooking/);
  assert.match(app, /writeBookingUrl/);
  assert.match(app, /planning_last_booking/);
  assert.match(app, /Planner2Page\.open/);
  assert.match(app, /Planner2Page\.flushSave/);
  assert.match(app, /This plan is not saved to the cloud\. Switch group anyway\?/);
  assert.match(app, /home=1/);
  assert.equal(app.includes("eq('id', 310)"), false);
  assert.equal(/\.(update|insert|delete)\s*\(/.test(app), false);
  assert.match(form, /href="booking2\.html"/);
  assert.match(plannerHtml, /home=1/);
  assert.match(plannerHtml, /location\.replace\('booking2\.html'/);
});
