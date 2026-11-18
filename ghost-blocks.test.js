const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

require('./booking-format.js');
require('./booking-extras.js');
require('./phone-week.js');

const planner = fs.readFileSync(path.join(__dirname, 'tour-planner.js'), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing ' + name);
  let i = source.indexOf('{', start);
  let depth = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

function loadPlanner() {
  const ctx = {
    BookingFormat: global.BookingFormat,
    state: { plan: null, catalogue: [] },
    PRAGUE_AIRPORT_NAME: 'Václav Havel Airport Prague (PRG)',
    PRAGUE_AIRPORT_ADDRESS: 'Aviatická, 161 00 Prague 6, Czech Republic',
    PRAGUE_CLEAR_MIN: 85,
    PRAGUE_TRAFFIC_MIN: 105,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext([
    'var state = this.state;',
    'var PRAGUE_CLEAR_MIN = 85;',
    'var PRAGUE_TRAFFIC_MIN = 105;',
    extractFunction(planner, 'uid'),
    extractFunction(planner, 'parseISODateUTC'),
    extractFunction(planner, 'toISODateUTC'),
    extractFunction(planner, 'formatDateDMY'),
    extractFunction(planner, 'todayISO'),
    extractFunction(planner, 'timeToMinutes'),
    extractFunction(planner, 'periodForTime'),
    extractFunction(planner, 'isRealBlock'),
    extractFunction(planner, 'dropUnrealBlocks'),
    extractFunction(planner, 'emptyStoredDay'),
    extractFunction(planner, 'storedPlanDay'),
    extractFunction(planner, 'ensureStopTicks'),
    extractFunction(planner, 'placeTypesOf'),
    extractFunction(planner, 'placeHasType'),
    extractFunction(planner, 'placeById'),
    extractFunction(planner, 'placeNameKey'),
    extractFunction(planner, 'notesAreFlagged'),
    extractFunction(planner, 'guestNameIsMissing'),
    extractFunction(planner, 'tourHotelIsMissing'),
    extractFunction(planner, 'organiserPersonIsMissing'),
    extractFunction(planner, 'isSkeletonStop'),
    extractFunction(planner, 'isRoughSystemStop'),
    extractFunction(planner, 'stopNeedsPlaceLink'),
    extractFunction(planner, 'planShowsEmptyMarkers'),
    extractFunction(planner, 'syncPayloadIssues'),
    extractFunction(planner, 'collectPlanIssues'),
    extractFunction(planner, 'roughTravelMinutes'),
    extractFunction(planner, 'looksLikePragueText'),
    extractFunction(planner, 'looksLikeBeadingAreaText'),
    extractFunction(planner, 'isWeekdayISO'),
    extractFunction(planner, 'isMorningStopTime'),
    extractFunction(planner, 'resolveStopAddress'),
    extractFunction(planner, 'isArrivalDayIndex'),
    extractFunction(planner, 'hasAirportArrivalOption'),
    extractFunction(planner, 'effectiveDay1OriginType'),
    extractFunction(planner, 'day1OriginAddress'),
    extractFunction(planner, 'day1PickupTime'),
    extractFunction(planner, 'day1OriginLabel'),
    extractFunction(planner, 'travelFromAddress'),
    extractFunction(planner, 'isPraguePickupStop'),
    extractFunction(planner, 'isPragueBeadingTravel'),
    extractFunction(planner, 'suggestedTravelMode'),
    extractFunction(planner, 'minutesForTravelMode'),
    extractFunction(planner, 'blockIndexForTravel'),
    extractFunction(planner, 'seedTravelMinutes'),
  ].join('\n'), ctx);
  return ctx;
}

function dayWithGhost() {
  return {
    date: '2027-05-10',
    blocks: [
      { id: 'a', type: 'pickup', title: 'Airport pick-up', time: '08:00', period: 'Morning', address: 'Prague airport', travelMinutes: 105, travelMode: 'traffic' },
      { id: 'b', type: 'factory', title: 'Matubo', time: '08:00', address: 'Jablonec nad Nisou' },
      { time: '08:00', period: 'Morning', travelMode: 'traffic', travelMinutes: 105 },
      { travelMinutes: 85 },
    ],
  };
}

test('a deleted stop plus the travel update does not leave a ghost', () => {
  const ctx = loadPlanner();
  const day = dayWithGhost();
  ctx.state.plan = {
    days: [day],
    arrivalDate: '2027-05-10',
    departureDate: '2027-05-14',
    pragueHotel: { name: 'Hotel Axa', address: 'Prague', pickupTime: '08:00' },
  };
  day.blocks = day.blocks.filter(block => ctx.isRealBlock(block) && block.id !== 'a');
  ctx.seedTravelMinutes(day, 0);
  ctx.seedTravelMinutes(day, 'b');
  ctx.seedTravelMinutes(day, 4);
  assert.equal(day.blocks.length, 1);
  assert.equal(day.blocks[0].id, 'b');
  assert.equal(day.blocks[0].title, 'Matubo');
  assert.equal(day.blocks.some(block => !ctx.isRealBlock(block)), false);
  assert.equal(typeof day.blocks[0].travelMinutes === 'number' || day.blocks[0].travelMinutes == null, true);
});

test('loading, tidying and merging drop blocks with no id, title or type', () => {
  const ctx = loadPlanner();
  const stored = ctx.storedPlanDay(dayWithGhost(), '2027-05-10');
  assert.deepEqual(stored.blocks.map(block => block.id), ['a', 'b']);

  const plan = {
    days: [dayWithGhost()],
  };
  ctx.dropUnrealBlocks(plan);
  assert.equal(plan.days[0].blocks.length, 2);
  assert.equal(plan.days[0].blocks.some(block => !block.id), false);
});

test('a local and cloud merge does not bring a deleted stop back as a blank block', () => {
  const shell = { time: '08:00', period: 'Morning', travelMode: 'traffic', travelMinutes: 105 };
  const kept = { id: 'b', type: 'factory', title: 'Matubo', time: '11:00', travelMinutes: 20 };
  const removed = { id: 'a', type: 'pickup', title: 'Airport pick-up', time: '08:00', period: 'Morning', travelMinutes: 105, travelMode: 'traffic' };
  const server = { days: [{ date: '2027-05-10', blocks: [removed, kept, { travelMinutes: 85 }] }] };
  const baseline = JSON.parse(JSON.stringify(server));
  const current = { days: [{ date: '2027-05-10', blocks: [shell, JSON.parse(JSON.stringify(kept))] }] };
  const patched = BookingExtras.applyEditedPatch(server, baseline, current);
  const blocks = patched.value.days[0].blocks;
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].id, 'b');
  assert.equal(blocks[0].title, 'Matubo');
  assert.equal(blocks[0].travelMinutes, 20);
  assert.equal(blocks.some(block => !BookingExtras.isRealBlock(block)), false);

  const ctx = loadPlanner();
  const cleaned = ctx.storedPlanDay(patched.value.days[0], '2027-05-10');
  assert.equal(cleaned.blocks.length, 1);
  assert.equal(cleaned.blocks[0].id, 'b');
});

test('a ghost at the same time is not flagged as a conflict', () => {
  const ctx = loadPlanner();
  const plan = {
    source: 'booking',
    bookingKey: '315',
    arrivalDate: '2027-05-10',
    departureDate: '2027-05-14',
    days: [dayWithGhost()],
  };
  const issues = ctx.collectPlanIssues(plan);
  const conflicts = issues.filter(item => item.kind === 'conflict');
  assert.equal(conflicts.length, 0);
  ctx.dropUnrealBlocks(plan);
  const real = plan.days[0].blocks.filter(block => block.time === '08:00');
  assert.equal(real.length, 2);
  assert.equal(ctx.collectPlanIssues(plan).some(item => item.kind === 'conflict' && /share 08:00/.test(item.message)), false);
});

test('phone week, rough plan, full planner and week view all ignore a blank block', () => {
  const built = WeekNote.build({
    groupName: 'Gail',
    arrivalDate: '2027-05-10',
    departureDate: '2027-05-10',
    days: [{
      date: '2027-05-10',
      blocks: [
        { id: 'b', type: 'factory', title: 'Matubo', time: '11:00' },
        { time: '08:00', period: 'Morning', travelMode: 'traffic', travelMinutes: 105 },
      ],
    }],
  });
  assert.equal(built.days[0].stops.length, 1);
  assert.equal(built.days[0].stops[0].place, 'Matubo');

  assert.match(planner, /function isRealBlock\(/);
  const rough = extractFunction(planner, 'renderRoughDayLane');
  const glance = extractFunction(planner, 'renderDayGlance');
  const timeline = extractFunction(planner, 'renderTimeline');
  const week = extractFunction(planner, 'weekLookStops');
  [rough, glance, timeline, week].forEach(fn => assert.match(fn, /isRealBlock\(/));
  assert.match(extractFunction(planner, 'collectPlanIssues'), /isRealBlock\(/);
  assert.match(extractFunction(planner, 'seedTravelMinutes'), /blockIndexForTravel\(/);
  assert.match(extractFunction(planner, 'preferRicherPlan'), /dropUnrealBlocks\(/);
  assert.match(extractFunction(planner, 'removeStop'), /isRealBlock\(/);
  assert.match(fs.readFileSync(path.join(__dirname, 'booking-form.js'), 'utf8'), /dropUnrealBlocks/);
});
