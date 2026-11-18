const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('./week-overview.js');
require('./planner2-model.js');

const P = globalThis.Planner2;
const html = fs.readFileSync(path.join(__dirname, 'planner2.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'planner2.css'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, 'planner2.js'), 'utf8');
const oldHtml = fs.readFileSync(path.join(__dirname, 'tour-planner.html'), 'utf8');
const oldJs = fs.readFileSync(path.join(__dirname, 'tour-planner.js'), 'utf8');

test('the new page opens only Jennifer Lindsay, booking 310', () => {
  assert.equal(P.BOOKING_ID, 310);
  assert.equal(P.GROUP_NAME, 'Jennifer Lindsay');
  assert.equal(P.isAllowedBooking(310), true);
  assert.equal(P.isAllowedBooking('310'), true);
  assert.equal(P.isAllowedBooking(311), false);
  assert.equal(P.isAllowedBooking(''), false);
  assert.equal(P.isAllowedBooking(null), false);
  assert.equal(P.canSave({ bookingKey: '310' }), true);
  assert.equal(P.canSave({ bookingKey: '20' }), false);
  assert.equal(P.canSave(null), false);
  const empty = P.emptyPlanFromBooking({
    id: 310,
    group_name: 'Jennifer Lindsay',
    tour_arrival_date: '2027-05-10',
    departure_date: '2027-05-12',
    hotels: { name: 'Park Hotel' },
  });
  assert.equal(empty.bookingKey, '310');
  assert.equal(empty.days.length, 3);
  assert.equal(empty.tourHotelName, 'Park Hotel');
});

test('iPad and Mac show the week, a phone shows one day', () => {
  assert.equal(P.usesPhoneLayout(390), true);
  assert.equal(P.usesPhoneLayout(700), true);
  assert.equal(P.usesPhoneLayout(768), false);
  assert.equal(P.usesPhoneLayout(1024), false);
  assert.equal(P.usesPhoneLayout(1440), false);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.equal(html.includes('btnLookView'), false);
  assert.equal(html.includes('tour-planner.js'), false);
  assert.equal(html.includes('booking-form.js'), false);
  assert.match(html, /planner2\.js/);
  assert.match(html, /week-overview\.js/);
});

test('dragging keeps other times and follows the day pattern', () => {
  const plan = P.samplePlan();
  const before = plan.days[1].blocks.map(function (stop) { return stop.id + '@' + stop.time; });
  assert.equal(P.placeStop(plan, 'gb', 1, '08:10'), true);
  assert.equal(P.findStop(plan, 'gb').stop.time, '09:15');
  assert.equal(P.findStop(plan, 'glass').stop.time, '09:45');
  assert.equal(P.placeStop(plan, 'pass', 0, '07:40'), true);
  assert.equal(P.findStop(plan, 'pass').stop.time, '08:00');
  assert.equal(P.placeStop(plan, 'museum', 2, '18:30'), true);
  const moved = P.findStop(plan, 'museum');
  assert.equal(moved.dayIndex, 2);
  assert.equal(moved.stop.time, '16:00');
  assert.equal(P.findStop(plan, 'snack').stop.time, '12:00');
  assert.notDeepEqual(plan.days[1].blocks.map(function (stop) { return stop.id + '@' + (stop.time || ''); }), before);
  const other = P.samplePlan();
  other.bookingKey = '20';
  other.sample = false;
  assert.equal(P.placeStop(other, 'gb', 1, '11:00'), false);
  assert.equal(P.findStop(other, 'gb').stop.time, '09:15');
});

test('a new place and a last-day drop-off use the same clock', () => {
  const plan = P.samplePlan();
  const added = P.addPlace(plan, { id: 'kr01', name: 'Černá Studnice', type: 'viewpoint' }, 3, '08:00');
  assert.equal(added.time, '09:15');
  assert.equal(added.placeId, 'kr01');
  const drop = P.addHandover(plan, 'dropoff', 4, '19:00');
  assert.equal(drop.time, '16:00');
  assert.equal(drop.handoverKind, 'dropoff');
  assert.equal(P.editStop(plan, added.id, { title: 'Tower', time: '14:00' }).title, 'Tower');
  assert.equal(P.findStop(plan, added.id).stop.time, '14:00');
  assert.equal(P.removeStop(plan, added.id), true);
  assert.equal(P.findStop(plan, added.id), null);
  const places = P.filterPlaces(P.samplePlaces(), 'antik', 'shop');
  assert.equal(places.length, 1);
  assert.equal(places[0].id, 'ks01');
});

test('the page saves only booking 310 and leaves the old planner alone', () => {
  assert.match(app, /booking_id', 310/);
  assert.match(app, /planner_plans/);
  assert.equal(app.includes(".from('bookings').update"), false);
  assert.equal(app.includes('.from("bookings").update'), false);
  assert.match(app, /preview=mock/);
  assert.match(app, /Jennifer Lindsay/);
  assert.equal(oldHtml.includes('planner2'), false);
  assert.equal(oldJs.includes('planner2'), false);
  const sample = P.samplePlan();
  const model = WeekOverview.build(sample, { px: 1, focusDay: null });
  assert.equal(model.start, 8 * 60);
  assert.equal(model.end, 16 * 60);
  assert.equal(model.days[0].marker.label, 'Prague pick-up');
  assert.equal(model.days[1].marker.label, 'Leave hotel');
  assert.equal(model.days[4].late[0].time, '18:00');
});
