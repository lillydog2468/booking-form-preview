const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('./place-categories.js');
require('./week-overview.js');

const WO = globalThis.WeekOverview;
const planner = fs.readFileSync(path.join(__dirname, 'tour-planner.js'), 'utf8');
const plannerHtml = fs.readFileSync(path.join(__dirname, 'tour-planner.html'), 'utf8');
const plannerCss = fs.readFileSync(path.join(__dirname, 'tour-planner.css'), 'utf8');

test('a pointer offset snaps to the quarter hour inside the visible day', () => {
  assert.equal(WO.minutesOf('07:00'), 7 * 60);
  assert.equal(WO.minutesOf(''), null);
  assert.equal(WO.minutesOf('25:00'), null);
  assert.equal(WO.formatMinutes(WO.snapMinutes(9 * 60 + 7)), '09:00');
  assert.equal(WO.formatMinutes(WO.snapMinutes(9 * 60 + 8)), '09:15');
  assert.equal(WO.START_MIN, 8 * 60);
  assert.equal(WO.END_MIN, 16 * 60);
  assert.equal(WO.PLACE_FLOOR_MIN, 9 * 60 + 15);
  assert.equal(WO.minutesFromOffset(0, 8 * 60, 1, 16 * 60), 8 * 60);
  assert.equal(WO.formatMinutes(WO.minutesFromOffset(90, 8 * 60, 1, 16 * 60)), '09:30');
  assert.equal(WO.formatMinutes(WO.minutesFromOffset(8, 8 * 60, 1, 16 * 60)), '08:15');
  assert.equal(WO.formatMinutes(WO.minutesFromOffset(9999, 8 * 60, 1, 16 * 60)), '16:00');
  assert.equal(WO.formatMinutes(WO.minutesFromOffset(-40, 8 * 60, 1, 16 * 60)), '08:00');
  assert.equal(WO.clampPlannedMinutes(8 * 60, 0), 8 * 60);
  assert.equal(WO.clampPlannedMinutes(8 * 60 + 30, 1), 9 * 60 + 15);
  assert.equal(WO.clampPlannedMinutes(9 * 60, 2), 9 * 60 + 15);
  assert.equal(WO.clampPlannedMinutes(9 * 60 + 15, 2), 9 * 60 + 15);
  assert.equal(WO.clampPlannedMinutes(18 * 60, 4), 16 * 60);
  assert.equal(WO.clampPlannedMinutes(11 * 60, 3), 11 * 60);
});

test('stops sit on a shared clock, side by side when they overlap, and untimed stays off the grid', () => {
  const range = WO.weekBounds([
    { time: '09:00', type: 'factory' },
    { time: '09:30', type: 'shop' },
    { time: '13:00', type: 'restaurant', title: 'Lunch' },
    { time: '06:10', type: 'experience' },
    { time: '18:00', type: 'handover' },
  ]);
  assert.equal(range.start, 8 * 60);
  assert.equal(range.end, 16 * 60);
  const laid = WO.layoutDay([
    { id: 'a', time: '09:00', type: 'factory', title: 'Matubo' },
    { id: 'b', time: '09:30', type: 'shop', title: 'Antik' },
    { id: 'c', time: '13:00', type: 'restaurant', title: 'Lunch' },
    { id: 'd', title: 'Somewhere later', type: 'other' },
    null,
  ], { start: range.start, end: range.end, px: 1 });
  assert.equal(laid.blocks.length, 3);
  assert.equal(laid.blocks[0].start, 9 * 60);
  assert.equal(laid.blocks[0].duration, 60);
  assert.equal(laid.blocks[0].top, (9 * 60) - range.start);
  assert.equal(laid.blocks[0].height, 60);
  assert.equal(laid.blocks[0].lane, 0);
  assert.equal(laid.blocks[0].lanes, 2);
  assert.equal(laid.blocks[1].lane, 1);
  assert.equal(laid.blocks[1].lanes, 2);
  assert.equal(laid.blocks[2].lane, 0);
  assert.equal(laid.blocks[2].lanes, 1);
  assert.equal(laid.blocks[2].duration, 75);
  assert.equal(laid.untimed.length, 1);
  assert.equal(WO.durationOf({ type: 'handover', handoverKind: 'pickup' }), 25);
  assert.equal(WO.durationOf({ type: 'factory', durationMinutes: 90 }), 90);
  assert.equal(WO.durationOf({ type: 'snack' }), 30);
});

test('a stop outside 8:00–16:00 stays on the day, pinned off the clock, and a pickup stays short', () => {
  const bounds = WO.weekBounds([{ time: '22:10', type: 'handover' }]);
  assert.equal(bounds.start, 8 * 60);
  assert.equal(bounds.end, 16 * 60);
  const laid = WO.layoutDay([
    { id: 'early', time: '07:30', type: 'factory', title: 'Press' },
    { id: 'drop', time: '18:00', type: 'handover', handoverKind: 'dropoff', title: 'Drop-off' },
    { id: 'four', time: '16:00', type: 'viewpoint', title: 'Tower' },
  ], { start: bounds.start, end: bounds.end, px: 1 });
  assert.equal(laid.early.length, 1);
  assert.equal(laid.early[0].id, 'early');
  assert.equal(laid.late.length, 1);
  assert.equal(laid.late[0].time, '18:00');
  assert.equal(laid.blocks.length, 1);
  assert.equal(laid.blocks[0].stop.id, 'four');
  assert.equal(laid.blocks[0].start, 16 * 60);
  assert.equal(WO.durationOf({ type: 'handover', handoverKind: 'dropoff' }), 25);
});

test('the week render places each stop at its time and names the hotel night', () => {
  const model = WO.build({
    days: [
      {
        date: '2027-05-10',
        blocks: [
          { id: 'pick', time: '08:00', type: 'handover', handoverKind: 'pickup', title: 'Pick-up · Axa', guestIds: ['g1'] },
          { id: 'pass', time: '11:00', type: 'factory', title: 'Pass' },
          { id: 'later', type: 'museum', title: 'Museum' },
        ],
      },
      { date: '2027-05-11', blocks: [{ id: 'gb', time: '09:30', type: 'factory', title: 'GB Beads' }] },
    ],
  }, {
    px: 1,
    today: '2027-05-11',
    label: function (stop) { return stop.title; },
    cue: function (stop) { return PlaceCategories.stopCue(stop); },
    guests: function (stop) { return stop.id === 'pick' ? 'Jennifer, Gail' : ''; },
    hotel: function (date) {
      if (date === '2027-05-10') return { night: 'Hotel Axa', from: '' };
      return { night: 'Park Hotel', from: 'Hotel Axa' };
    },
  });
  assert.equal(model.days.length, 2);
  assert.equal(model.days[0].blocks[0].time, '08:00');
  assert.equal(model.days[0].blocks[0].tone, 'pickup');
  assert.equal(model.days[0].blocks[0].guests, 'Jennifer, Gail');
  assert.equal(model.days[0].untimed[0].label, 'Museum');
  assert.equal(model.days[1].today, true);
  assert.equal(model.days[0].night, 'Hotel Axa');
  assert.equal(model.days[1].from, 'Hotel Axa');
  assert.equal(model.days[1].night, 'Park Hotel');
  const html = WO.render(model);
  assert.match(html, /data-ov-stop="pass"/);
  assert.match(html, /stop-tone-factory/);
  assert.match(html, /stop-tone-pickup/);
  assert.match(html, /Night · Hotel Axa/);
  assert.match(html, /From · Hotel Axa/);
  assert.match(html, /Night · Park Hotel/);
  assert.match(html, /Today · Tuesday/);
  assert.match(html, /Jennifer, Gail/);
  assert.match(html, /data-ov-col="0"/);
  assert.match(html, /data-ov-col="1"/);
  assert.match(html, /data-ov-start="480"/);
  assert.match(html, /data-ov-end="960"/);
  assert.match(html, /08:00 Prague pick-up/);
  assert.match(html, /09:00 Leave hotel/);
  assert.equal(model.start, 8 * 60);
  assert.equal(model.end, 16 * 60);
  const focused = WO.build({
    days: [
      { date: '2027-05-10', blocks: [{ id: 'a', time: '09:00', type: 'shop', title: 'Antik' }] },
      { date: '2027-05-11', blocks: [{ id: 'b', time: '10:00', type: 'museum', title: 'Museum' }] },
    ],
  }, { focusDay: 1, cue: function (stop) { return PlaceCategories.stopCue(stop); } });
  assert.equal(focused.days.length, 1);
  assert.equal(focused.days[0].index, 1);
  assert.match(WO.render(focused), /data-ov-col="1"/);
  assert.doesNotMatch(WO.render(focused), /data-ov-col="0"/);
});

test('overview is a new view and a drag writes the time through the existing save path', () => {
  assert.match(plannerHtml, /id="btnOverview"/);
  assert.match(plannerHtml, /src="week-overview\.js"/);
  assert.match(planner, /function placeOverviewStop\(/);
  assert.match(planner, /commitStopTime\(stopId, WeekOverview\.formatMinutes\(snapped\)/);
  const body = planner.slice(planner.indexOf('function placeOverviewStop('), planner.indexOf('function addOverviewHandover('));
  assert.equal(body.includes('redistributeBlockTimes'), false);
  assert.match(planner, /viewPref === 'overview'/);
  assert.match(planner, /preview=mock/);
  assert.match(planner, /clampPlannedMinutes/);
  const slots = planner.slice(planner.indexOf('function roughWeekPlaceSlots'), planner.indexOf('function buildRoughDayBlocks'));
  const times = Array.from(slots.matchAll(/time: '(\d{2}:\d{2})'/g)).map(function (match) { return match[1]; });
  assert.ok(times.length > 0);
  times.forEach(function (time) {
    const mins = WO.minutesOf(time);
    assert.ok(mins >= WO.PLACE_FLOOR_MIN && mins <= WO.END_MIN, time);
  });
  assert.match(plannerCss, /\.ov-grid/);
  assert.match(plannerCss, /\.ov-stop/);
  assert.match(fs.readFileSync(path.join(__dirname, 'place-categories.js'), 'utf8'), /\.ov-stop/);
});
