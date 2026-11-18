const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('node:vm');

const html = require('./test-page').pageSource(path.join(__dirname, 'tour-planner.html'), 'utf8');

function extractFunction(name) {
  const start = html.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing ' + name);
  let i = html.indexOf('{', start);
  let depth = 0;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

function loadEnds() {
  const ctx = {
    window: {},
    PRAGUE_AIRPORT_NAME: 'Václav Havel Airport Prague (PRG)',
    PRAGUE_AIRPORT_ADDRESS: 'Aviatická, 161 00 Prague 6, Czech Republic',
  };
  let n = 0;
  ctx.uid = function (prefix) { n += 1; return (prefix || 'id') + n; };
  vm.createContext(ctx);
  vm.runInContext([
    extractFunction('addMinutes'),
    extractFunction('keepFinalDropoffsLast'),
    extractFunction('timeToMinutes'),
    extractFunction('compareStopTime'),
    extractFunction('sortDayBlocks'),
    extractFunction('isoDateUtc'),
    extractFunction('isoTextUtc'),
    extractFunction('shiftIsoDay'),
    extractFunction('hotelNightsCount'),
    extractFunction('bookingHotelStays'),
    extractFunction('hotelNightMap'),
    extractFunction('dayHotelEnds'),
    extractFunction('catalogueHotel'),
    extractFunction('pinFromHotelPlace'),
    extractFunction('hotelNameKey'),
    extractFunction('guestListLabel'),
    extractFunction('guestMatchesStayKey'),
    extractFunction('memberNameRows'),
    extractFunction('guestCarriesMoney'),
    extractFunction('guestRowIsBlank'),
    extractFunction('syncPlanGuestNames'),
    extractFunction('plannerGuestList'),
    extractFunction('readHotelStayers'),
    extractFunction('bookingStaySlots'),
    extractFunction('guestsOnHotelSlot'),
    extractFunction('pragueNights'),
    extractFunction('hotelsOnNight'),
    extractFunction('stopHasHotel'),
    extractFunction('hotelStopDismissed'),
    extractFunction('forgetDismissedHotelStop'),
    extractFunction('pragueEndPeriod'),
    extractFunction('pragueEndGroups'),
    extractFunction('pragueMissingNote'),
    extractFunction('placeDayOnePickups'),
    extractFunction('findPragueEndStop'),
    extractFunction('praguePickupSchedule'),
    extractFunction('pragueHotelAddress'),
    extractFunction('isSeparatePraguePickup'),
    extractFunction('combinedPraguePickupStop'),
    extractFunction('placeCombinedPraguePickup'),
    extractFunction('placePragueEnds'),
    extractFunction('addPragueEnds'),
    extractFunction('isRealBlock'),
    extractFunction('dropUnrealBlocks'),
    extractFunction('escapeHtml'),
    extractFunction('cleanMapsQuery'),
    extractFunction('routeQueryText'),
    extractFunction('routePointForStop'),
    extractFunction('routePointsForStop'),
    extractFunction('dayRouteStops'),
    extractFunction('googleMapsDirectionsUrl'),
    extractFunction('pragueRoutePoints'),
    extractFunction('pragueMapsForDay'),
    extractFunction('pragueDayHasCombinedRoute'),
    extractFunction('pragueRouteLinkHtml'),
    extractFunction('rememberDismissedHotelStop'),
    extractFunction('skeletonDismissKey'),
    extractFunction('rememberDismissedSkeleton'),
    extractFunction('filterDismissedSkeletons'),
    extractFunction('lastTourDayIso'),
    extractFunction('guestHotelsInOrder'),
    extractFunction('lastDayDropoffGroups'),
    extractFunction('hotelMapHref'),
    extractFunction('hotelBookendStop'),
    extractFunction('flightClock'),
    extractFunction('memberFlightFields'),
    extractFunction('tourHotelNames'),
    extractFunction('isAutoTourHotelBookend'),
    extractFunction('stripDayAutoTourHotels'),
    extractFunction('stripAutoTourHotelStops'),
    extractFunction('normalisePragueStayRow'),
    extractFunction('pragueStayCoversNight'),
    extractFunction('pragueHotelBeforeTour'),
    extractFunction('pragueHotelAfterTour'),
    extractFunction('guestArrivesOnDay'),
    extractFunction('guestDepartsOnDay'),
    extractFunction('flightInfoText'),
    extractFunction('autoAirportStop'),
    extractFunction('dayAlreadyHasEdgeStop'),
    extractFunction('prefillEmptyDayWithHotel'),
    extractFunction('isAutoHotelHandover'),
    extractFunction('repairAutoHotelTimes'),
    extractFunction('prefillEmptyPlanDays'),
  ].join('\n'), ctx);
  return ctx;
}

const axa = { id: 'axa', name: 'Hotel Axa', address: 'Na Poříčí 40, Prague', pinLat: 50.09, pinLng: 14.43, pinSetAt: '2026-05-01' };
const park = { id: 'park', name: 'Park Hotel', address: 'Smržovka 12', pinLat: 50.72, pinLng: 15.25 };

test('a middle day at the Park Hotel gets no automatic pick-up or drop-off', () => {
  const api = loadEnds();
  const booking = {
    hotel_name: 'Park Hotel',
    hotel_id: 4,
    other_hotel_nights: '3',
    tour_arrival_date: '2027-05-10',
    departure_date: '2027-05-13',
  };
  const plan = { arrivalDate: '2027-05-10', departureDate: '2027-05-13', tourHotelName: 'Park Hotel' };
  const day = {
    date: '2027-05-11',
    blocks: [
      { id: 'shop', type: 'shop', title: 'Vlad antik', time: '11:00' },
      { id: 'auto-in', type: 'handover', handoverKind: 'pickup', placeKind: 'hotel', hotelName: 'Park Hotel', time: '08:00', title: 'Pick-up · Park Hotel', notes: '' },
      { id: 'auto-out', type: 'handover', handoverKind: 'dropoff', placeKind: 'hotel', hotelName: 'Park Hotel', time: '17:00', title: 'Drop-off · Park Hotel', notes: '', tourFinalDropoff: true },
      { id: 'kept', type: 'handover', handoverKind: 'pickup', placeKind: 'hotel', hotelName: 'Park Hotel', time: '09:30', title: 'Pick-up · Park Hotel', notes: 'Keith wrote this' },
    ],
  };
  assert.equal(api.prefillEmptyDayWithHotel(day, plan, booking, [park]), true);
  assert.equal(day.blocks.some(stop => stop.id === 'auto-in' || stop.id === 'auto-out'), false);
  assert.equal(day.blocks.some(stop => stop.id === 'shop'), true);
  assert.equal(day.blocks.some(stop => stop.id === 'kept'), true);
  assert.equal(day.blocks.some(stop => stop.hotelName === 'Park Hotel' && !stop.notes), false);
});

test('the first day picks up from the Prague hotel or the arrival flight, and sharers share one stop', () => {
  const api = loadEnds();
  const booking = {
    hotel_name: 'Park Hotel',
    tour_arrival_date: '2027-05-10',
    departure_date: '2027-05-13',
    _members: [
      { id: 1, first_name: 'Jennifer', last_name: 'Lindsay', prague_stays: [{ hotel: 'Hotel Axa', check_in: '2027-05-09', check_out: '2027-05-10' }] },
      { id: 2, first_name: 'Kay', last_name: 'Brown', prague_stays: [{ hotel: 'Hotel Axa', check_in: '2027-05-09', check_out: '2027-05-10' }] },
      { id: 3, first_name: 'Ann', last_name: 'Cole', arrival_flight: 'BA858', arrival_date: '2027-05-10', arrival_time: '14:20', flight_note: 'Terminal 1' },
      { id: 4, first_name: 'Gail', last_name: 'Berglund', arrival_flight: 'KL1353', arrival_date: '2027-05-10', arrival_time: '16:05' },
    ],
  };
  const plan = {
    arrivalDate: '2027-05-10',
    departureDate: '2027-05-13',
    tourHotelName: 'Park Hotel',
    guests: [
      { id: 'g1', name: 'Jennifer Lindsay' },
      { id: 'g2', name: 'Kay Brown' },
      { id: 'g3', name: 'Ann Cole' },
      { id: 'g4', name: 'Gail Berglund' },
    ],
  };
  const day = { date: '2027-05-10', blocks: [{ id: 'place', type: 'factory', title: 'Rutkovsky', time: '18:00' }] };
  api.prefillEmptyDayWithHotel(day, plan, booking, [axa, park]);
  const axaPickup = day.blocks.find(stop => stop.hotelName === 'Hotel Axa');
  assert.ok(axaPickup);
  assert.equal(axaPickup.handoverKind, 'pickup');
  assert.equal(axaPickup.time, '08:00');
  assert.equal(axaPickup.address, axa.address);
  assert.equal(axaPickup.pinLat, 50.09);
  assert.equal(JSON.stringify(axaPickup.guestIds), JSON.stringify(['g1', 'g2']));
  const airports = day.blocks.filter(stop => stop.placeKind === 'airport');
  assert.equal(airports.length, 2);
  const ann = airports.find(stop => stop.flightNumber === 'BA858');
  const gail = airports.find(stop => stop.flightNumber === 'KL1353');
  assert.equal(ann.time, '14:20');
  assert.match(ann.flightInfo, /BA858/);
  assert.match(ann.flightInfo, /Terminal 1/);
  assert.equal(JSON.stringify(ann.guestIds), JSON.stringify(['g3']));
  assert.equal(gail.time, '16:05');
  assert.equal(day.blocks.some(stop => stop.hotelName === 'Park Hotel'), false);
  assert.equal(day.blocks.map(stop => stop.time).join(','), '08:00,14:20,16:05,18:00');
  assert.equal(api.hotelMapHref('Hotel Axa', axa.address, { lat: 50.09, lng: 14.43 }), 'https://maps.apple.com/?ll=50.09,14.43&q=Hotel%20Axa');
});

test('the last day drops flyers at the airport and everyone else at their Prague hotel', () => {
  const api = loadEnds();
  const booking = {
    hotel_name: 'Park Hotel',
    tour_arrival_date: '2027-05-10',
    departure_date: '2027-05-13',
    _members: [
      { id: 1, first_name: 'Jennifer', last_name: 'Lindsay', departure_flight: 'BA859', departure_date: '2027-05-13', departure_time: '11:10' },
      { id: 2, first_name: 'Kay', last_name: 'Brown', departure_flight: 'BA859', departure_date: '2027-05-13', departure_time: '11:10' },
      { id: 3, first_name: 'Ann', last_name: 'Cole', prague_stays: [{ hotel: 'Hotel Axa', check_in: '2027-05-13', check_out: '2027-05-14' }] },
    ],
  };
  const plan = {
    arrivalDate: '2027-05-10',
    departureDate: '2027-05-13',
    tourHotelName: 'Park Hotel',
    guests: [
      { id: 'g1', name: 'Jennifer Lindsay' },
      { id: 'g2', name: 'Kay Brown' },
      { id: 'g3', name: 'Ann Cole' },
    ],
  };
  const day = { date: '2027-05-13', blocks: [{ id: 'visit', title: 'Matubo', type: 'factory', time: '09:00' }] };
  api.prefillEmptyDayWithHotel(day, plan, booking, [axa, park]);
  const flight = day.blocks.find(stop => stop.placeKind === 'airport');
  assert.ok(flight);
  assert.equal(flight.handoverKind, 'dropoff');
  assert.equal(flight.time, '11:10');
  assert.match(flight.flightInfo, /BA859/);
  assert.equal(JSON.stringify(flight.guestIds), JSON.stringify(['g1', 'g2']));
  const axaDrop = day.blocks.find(stop => stop.hotelName === 'Hotel Axa');
  assert.ok(axaDrop);
  assert.equal(axaDrop.time, '17:00');
  assert.equal(axaDrop.address, axa.address);
  assert.equal(JSON.stringify(axaDrop.guestIds), JSON.stringify(['g3']));
  assert.equal(day.blocks.some(stop => stop.hotelName === 'Park Hotel'), false);
  assert.equal(day.blocks.map(stop => stop.time).join(','), '09:00,11:10,17:00');
});

test('deleting an automatic Prague pick-up keeps it from coming back', () => {
  const api = loadEnds();
  const booking = {
    hotel_name: 'Park Hotel',
    tour_arrival_date: '2027-05-10',
    departure_date: '2027-05-13',
    _members: [
      { id: 1, first_name: 'Jennifer', last_name: 'Lindsay', prague_stays: [{ hotel: 'Hotel Axa', check_in: '2027-05-09', check_out: '2027-05-10' }] },
    ],
  };
  const plan = {
    arrivalDate: '2027-05-10',
    departureDate: '2027-05-13',
    tourHotelName: 'Park Hotel',
    guests: [{ id: 'g1', name: 'Jennifer Lindsay' }],
  };
  const day = { date: '2027-05-10', blocks: [] };
  api.prefillEmptyDayWithHotel(day, plan, booking, [axa]);
  const pickup = day.blocks.find(stop => stop.hotelName === 'Hotel Axa');
  assert.ok(pickup);
  api.rememberDismissedHotelStop(day, pickup);
  day.blocks = day.blocks.filter(stop => stop.id !== pickup.id);
  assert.equal(api.prefillEmptyDayWithHotel(day, plan, booking, [axa]), false);
  assert.equal(day.blocks.some(stop => stop.hotelName === 'Hotel Axa'), false);
  assert.match(html, /class="stop-delete"/);
  assert.match(html, /\.stop-delete \{[^}]*width:\s*16px/);
  assert.match(html, /\.stop-delete \{[^}]*opacity:\s*\.4/);
  const remove = extractFunction('removeStop');
  assert.match(remove, /rememberDismissedHotelStop\(day, stop\)/);
  assert.match(remove, /rememberDismissedSkeleton\(day, stop\)/);
  assert.match(remove, /scheduleAutoSave\(\)/);
  assert.equal(remove.includes('confirm('), false);
  const bar = extractFunction('renderHandoverBar');
  assert.match(bar, /stopDeleteButton\(stop\.id\)/);
  const glance = extractFunction('renderDayGlance');
  assert.match(glance, /stopDeleteButton\(s\.id\)/);
  assert.match(extractFunction('renderHandoverArticle'), /stop-actions[\s\S]*stopDeleteButton\(s\.id\)/);
});

test('booking 315 does not grow a Park Hotel pick-up on every day', () => {
  const api = loadEnds();
  const booking = {
    hotel_name: 'Park hotel',
    hotel_id: 3,
    other_hotel_nights: '4',
    tour_arrival_date: '2027-05-31',
    departure_date: '2027-06-04',
  };
  const plan = {
    arrivalDate: '2027-05-31',
    departureDate: '2027-06-04',
    tourHotelName: 'Park hotel',
    guests: [{ id: 'g1', name: 'Gail Berglund' }],
    days: [],
  };
  const start = Date.parse('2027-05-31T00:00:00Z');
  const end = Date.parse('2027-06-04T00:00:00Z');
  for (let t = start; t <= end; t += 86400000) {
    const date = new Date(t).toISOString().slice(0, 10);
    plan.days.push({
      date,
      blocks: date === '2027-06-01'
        ? [
          { id: 'shop', type: 'shop', title: 'Vlad antik', time: '11:00' },
          { id: 'old', type: 'handover', handoverKind: 'pickup', placeKind: 'hotel', hotelName: 'Park hotel', time: '08:00', title: 'Pick-up · Park hotel', notes: '' },
        ]
        : [],
    });
  }
  api.prefillEmptyPlanDays(plan, booking, [park]);
  plan.days.forEach(day => {
    assert.equal(day.blocks.some(stop => stop.hotelName === 'Park hotel'), false, day.date);
  });
  const june = plan.days.find(day => day.date === '2027-06-01');
  assert.equal(june.blocks.length, 1);
  assert.equal(june.blocks[0].id, 'shop');
});

test('a dismissed arrival pick-up is not put back', () => {
  const api = loadEnds();
  const day = { blocks: [], dismissedAutoStops: [] };
  const pickup = { type: 'pickup', title: 'Airport pick-up — Václav Havel Airport Prague (PRG)' };
  const drive = { type: 'travel', title: 'Drive to the beading area (Jablonec nad Nisou)' };
  api.rememberDismissedSkeleton(day, pickup);
  const kept = api.filterDismissedSkeletons(day, [pickup, drive, { type: 'shop', title: 'Vlad' }]);
  assert.equal(kept.length, 2);
  assert.equal(kept.some(stop => stop.type === 'pickup'), false);
  assert.equal(kept.some(stop => stop.type === 'travel'), true);
  assert.equal(kept.some(stop => stop.title === 'Vlad'), true);
  api.rememberDismissedSkeleton(day, drive);
  const none = api.filterDismissedSkeletons(day, [pickup, drive]);
  assert.equal(none.length, 0);
});

test('the Prague button adds an 08:00 pick-up and an 18:00 drop-off, and puts a dismissed one back', () => {
  const api = loadEnds();
  const booking = {
    tour_arrival_date: '2027-05-10',
    departure_date: '2027-05-13',
    _members: [
      { id: 1, first_name: 'Jennifer', last_name: 'Lindsay', prague_stays: [{ hotel: 'Hotel Axa' }] },
      { id: 2, first_name: 'Kay', last_name: 'Brown', prague_stays: [{ hotel: 'Hotel Axa' }] },
    ],
  };
  const plan = {
    arrivalDate: '2027-05-10',
    departureDate: '2027-05-13',
    days: [
      { date: '2027-05-10', blocks: [], dismissedHotelStops: [{ hotel: 'Hotel Axa', kind: 'pickup' }] },
      { date: '2027-05-11', blocks: [{ id: 'shop', type: 'shop', title: 'Vlad antik', time: '11:00' }] },
      {
        date: '2027-05-13',
        blocks: [{
          id: 'already',
          type: 'handover',
          handoverKind: 'dropoff',
          placeKind: 'hotel',
          hotelName: 'Hotel Axa',
          title: 'Drop-off · Hotel Axa',
          time: '17:00',
        }],
      },
    ],
  };
  const touched = api.addPragueEnds(plan, booking, [axa]);
  assert.ok(touched >= 2);
  const first = plan.days[0].blocks.filter(stop => stop.hotelName === 'Hotel Axa' && stop.handoverKind === 'pickup');
  assert.equal(first.length, 1);
  assert.equal(first[0].time, '08:00');
  assert.equal(first[0].type, 'handover');
  assert.ok(String(first[0].id || '').trim());
  assert.match(first[0].title, /Pick-up/);
  assert.match(first[0].title, /Hotel Axa/);
  assert.match(first[0].title, /Jennifer/);
  assert.match(first[0].title, /Kay/);
  assert.equal(plan.days[0].dismissedHotelStops.some(row => row.kind === 'pickup'), false);
  assert.equal(plan.days[1].blocks.length, 1);
  assert.equal(plan.days[1].blocks[0].id, 'shop');
  const last = plan.days[2].blocks.filter(stop => stop.hotelName === 'Hotel Axa');
  assert.equal(last.length, 1);
  assert.equal(last[0].id, 'already');
  assert.equal(last[0].time, '18:00');
  assert.equal(last[0].type, 'handover');
  const again = api.addPragueEnds(plan, booking, [axa]);
  assert.equal(plan.days[0].blocks.filter(stop => stop.handoverKind === 'pickup').length, 1);
  assert.equal(plan.days[0].blocks.find(stop => stop.handoverKind === 'pickup').id, first[0].id);
  assert.equal(plan.days[2].blocks.filter(stop => stop.handoverKind === 'dropoff').length, 1);
  assert.ok(again >= 2);
});

test('day one pick-ups are one stop with times five minutes apart, and a second press replaces the old separate stops', () => {
  const api = loadEnds();
  const booking = {
    tour_arrival_date: '2027-05-10',
    departure_date: '2027-05-13',
    _members: [
      { id: 1, first_name: 'Jennifer', last_name: 'Lindsay', prague_stays: [{ hotel: 'Hotel Axa' }] },
      { id: 2, first_name: 'Kay', last_name: 'Brown', prague_stays: [{ hotel: 'U Obecního dvora' }] },
    ],
  };
  const plan = {
    arrivalDate: '2027-05-10',
    departureDate: '2027-05-13',
    days: [
      {
        date: '2027-05-10',
        blocks: [
          { id: 'old-a', type: 'handover', handoverKind: 'pickup', placeKind: 'hotel', hotelName: 'Hotel Axa', autoStop: 'prague-pickup', time: '08:00', title: 'Pick-up · Hotel Axa' },
          { id: 'old-b', type: 'handover', handoverKind: 'pickup', placeKind: 'hotel', hotelName: 'U Obecního dvora', autoStop: 'prague-pickup', time: '08:00', title: 'Pick-up · U Obecního dvora' },
          { id: 'shop', type: 'shop', title: 'Vlad antik', time: '11:00' },
        ],
      },
      { date: '2027-05-13', blocks: [] },
    ],
  };
  api.addPragueEnds(plan, booking, [axa]);
  const pickups = plan.days[0].blocks.filter(stop => stop.handoverKind === 'pickup');
  assert.equal(pickups.length, 1);
  assert.equal(pickups[0].time, '08:00');
  assert.equal(pickups[0].praguePickups.map(row => row.time).join(','), '08:00,08:05');
  assert.equal(pickups[0].praguePickups.map(row => row.hotel).join('|'), 'Hotel Axa|U Obecního dvora');
  assert.equal(plan.days[0].blocks.some(stop => stop.id === 'shop'), true);
  assert.equal(plan.days[0].blocks.some(stop => stop.id === 'old-a' || stop.id === 'old-b'), false);
  const keptId = pickups[0].id;
  api.addPragueEnds(plan, booking, [axa]);
  const again = plan.days[0].blocks.filter(stop => stop.handoverKind === 'pickup');
  assert.equal(again.length, 1);
  assert.equal(again[0].id, keptId);
  const dropoffs = plan.days[1].blocks.filter(stop => stop.handoverKind === 'dropoff');
  assert.equal(dropoffs.length, 2);
  assert.equal(dropoffs.every(stop => stop.time === '18:00'), true);
});

test('booking 310 uses the members stays, so Atlantic and U Obecního dvora are both pick-ups', () => {
  const api = loadEnds();
  const obecni = 'U Obecního dvora 7, Prague 1 – Staré Město, 110 00';
  const atlantic = 'Hotel Atlantic, Na Poříčí 9, Prague 1';
  const booking = {
    id: 310,
    tour_arrival_date: '2027-05-10',
    departure_date: '2027-05-14',
    _members: [
      { id: 5633, first_name: 'Jennifer', last_name: 'Lindsay', prague_stays: [{ hotel: obecni, check_in: '', check_out: '' }] },
      { id: 5634, first_name: 'Gail', last_name: 'DeLuca', prague_stays: [{ hotel: obecni, check_in: '', check_out: '' }] },
      { id: 5635, first_name: 'Kay', last_name: 'Enk', prague_stays: [{ hotel: atlantic, check_in: '2027-05-09', check_out: '2027-05-10' }] },
      { id: 5636, first_name: 'Maggie', last_name: 'Cox', prague_stays: [{ hotel: atlantic, check_in: '2027-05-09', check_out: '2027-05-10' }] },
      { id: 5637, first_name: 'Karen', last_name: 'Poll', prague_stays: null },
    ],
  };
  const plan = {
    bookingKey: '310',
    arrivalDate: '2027-05-10',
    departureDate: '2027-05-14',
    guests: [
      { id: 'g1', name: 'Jennifer Lindsay', loans: [{ id: 'l1', amount: 20 }] },
      { id: 'g2', name: 'Gail DeLuca' },
      { id: 'g3', name: 'Karen Poll' },
      { id: 'g4', name: '', email: '' },
    ],
    days: [
      { date: '2027-05-10', blocks: [] },
      { date: '2027-05-14', blocks: [] },
    ],
  };
  api.addPragueEnds(plan, booking, []);
  const pickups = plan.days[0].blocks.filter(stop => stop.handoverKind === 'pickup');
  assert.equal(pickups.length, 1);
  assert.equal(pickups[0].time, '08:00');
  assert.equal(pickups[0].praguePickups.map(row => row.time).join(','), '08:00,08:05');
  assert.equal(pickups[0].praguePickups.map(row => row.hotel).join('|'), obecni + '|' + atlantic);
  assert.match(pickups[0].title, /Jennifer/);
  assert.match(pickups[0].title, /Gail/);
  assert.match(pickups[0].title, /Kay/);
  assert.match(pickups[0].title, /Maggie/);
  assert.equal(pickups[0].missingPragueNote, '1 guest with no Prague hotel yet (Karen Poll)');
  assert.equal(/Karen/.test(pickups[0].title), false);
  const dropoffs = plan.days[1].blocks.filter(stop => stop.handoverKind === 'dropoff');
  assert.equal(dropoffs.length, 1);
  assert.equal(dropoffs[0].hotelName, obecni);
  assert.equal(dropoffs[0].time, '18:00');
  const synced = api.syncPlanGuestNames(plan.guests, booking._members, null);
  assert.equal(synced.map(guest => guest.name).join('|'), 'Jennifer Lindsay|Gail DeLuca|Kay Enk|Maggie Cox|Karen Poll');
  assert.equal(synced[0].id, 'g1');
  assert.equal(synced[0].loans[0].amount, 20);
  assert.equal(synced.some(guest => !String(guest.name || '').trim() && !String(guest.email || '').trim()), false);
  assert.match(api.pragueRouteLinkHtml(plan.days[0], 'pickup'), />Open in Maps \(all hotels\)</);
  const maps = api.pragueMapsForDay(plan.days[0], 'pickup');
  assert.equal(maps.individuals.length, 2);
  maps.individuals.forEach(url => {
    const one = new URL(url).searchParams;
    assert.equal(one.get('origin'), null);
    assert.ok(one.get('destination'));
  });
  assert.equal(maps.individuals[0], api.googleMapsDirectionsUrl([obecni]));
  assert.equal(maps.individuals[1], api.googleMapsDirectionsUrl([atlantic]));
  const combined = new URL(maps.combined).searchParams;
  assert.equal(combined.get('origin'), null);
  assert.equal(combined.get('waypoints'), 'U Obecního dvora 7, Praha');
  assert.equal(combined.get('destination'), 'Hotel Atlantic, Na Poříčí 9, Praha');
});

test('a third Prague hotel adds a third Maps link and a third combined segment', () => {
  const api = loadEnds();
  const obecni = 'U Obecního dvora 7, Prague 1 – Staré Město, 110 00';
  const atlantic = 'Hotel Atlantic, Na Poříčí 9, Prague 1';
  const josef = 'Hotel Josef, Prague';
  const booking = {
    id: 310,
    tour_arrival_date: '2027-05-10',
    departure_date: '2027-05-14',
    _members: [
      { id: 5633, first_name: 'Jennifer', last_name: 'Lindsay', prague_stays: [{ hotel: obecni }] },
      { id: 5635, first_name: 'Kay', last_name: 'Enk', prague_stays: [{ hotel: atlantic, check_in: '2027-05-09', check_out: '2027-05-10' }] },
      { id: 5638, first_name: 'Ann', last_name: 'Cole', prague_stays: [{ hotel: josef }] },
    ],
  };
  const plan = {
    arrivalDate: '2027-05-10',
    departureDate: '2027-05-14',
    days: [{ date: '2027-05-10', blocks: [] }, { date: '2027-05-14', blocks: [] }],
  };
  api.addPragueEnds(plan, booking, []);
  const maps = api.pragueMapsForDay(plan.days[0], 'pickup');
  assert.equal(maps.individuals.length, 3);
  maps.individuals.forEach(url => {
    assert.equal(new URL(url).searchParams.get('origin'), null);
  });
  assert.equal(maps.individuals.join('|'), [obecni, atlantic, josef].map(hotel => api.googleMapsDirectionsUrl([hotel])).join('|'));
  const params = new URL(maps.combined).searchParams;
  assert.equal(params.get('origin'), null);
  assert.equal(params.get('waypoints'), 'U Obecního dvora 7, Praha|Hotel Atlantic, Na Poříčí 9, Praha');
  assert.equal(params.get('destination'), 'Hotel Josef, Praha');
  const drop = api.pragueMapsForDay(plan.days[1], 'dropoff');
  assert.ok(drop.individuals.length >= 1);
  assert.equal(drop.combined.indexOf('https://www.google.com/maps/dir/?api=1'), 0);
});

test('separate Prague pick-ups still get one all-hotels link, and the button collapses duplicates without deleting other stops', () => {
  const api = loadEnds();
  const obecni = 'U Obecního dvora 7, Prague 1 – Staré Město, 110 00';
  const atlantic = 'Hotel Atlantic, Na Poříčí 9, Prague 1';
  const dayOne = {
    date: '2027-05-10',
    blocks: [
      { time: '08:00', period: 'Morning', travelMode: 'traffic', travelMinutes: 105 },
      { id: 's_zhmgwxm', time: '11:00', type: 'factory', title: 'Pass', placeId: 'c_jv4yy71' },
      { id: 's_crk0mw6', time: '09:30', type: 'factory', title: 'Rutkovsky', placeId: 'kf01' },
      { id: 's_tdsd2p4', time: '11:30', type: 'museum', title: 'Glass and jewellery museum in Jablonec', placeId: 'km01' },
      { time: '12:30', period: 'Afternoon', travelMinutes: 85 },
      { id: 's_6z0w0xp', time: '12:30', type: 'restaurant', title: 'Snack at supermarket', placeId: 'kr06' },
      { id: 's_3ymlfug', type: 'handover', handoverKind: 'pickup', placeKind: 'hotel', autoStop: 'prague-pickup', time: '08:00', hotelName: obecni, title: 'Pick-up · 08:00 ' + obecni + ' – Jennifer Lindsay and Gail DeLuca', pragueLine: '08:00 ' + obecni },
      { id: 's_sdls2nm', type: 'handover', handoverKind: 'pickup', placeKind: 'hotel', autoStop: 'prague-pickup', time: '08:05', hotelName: atlantic, title: 'Pick-up · 08:05 ' + atlantic + ' – Kay Enk and Maggie Cox' },
      { id: 's_d4ox8k3', type: 'handover', handoverKind: 'pickup', placeKind: 'hotel', autoStop: 'prague-pickup', time: '08:05', hotelName: atlantic, title: 'Pick-up · ' + atlantic + ' · Kay Enk, Maggie Cox' },
    ],
  };
  const plan = {
    arrivalDate: '2027-05-10',
    departureDate: '2027-05-14',
    days: [
      dayOne,
      { date: '2027-05-11', blocks: [{ id: 's_mmhtkpn', time: '09:30', type: 'factory', title: 'GB Beads' }, { id: 's_lh7u1b5', time: '13:00', type: 'factory', title: 'Ralton' }, { id: 's_1b4ruom', time: '15:00', type: 'shop', title: 'Antik shop beads' }] },
      { date: '2027-05-12', blocks: [{ id: 's_e2fi1pw', time: '09:30', type: 'factory', title: 'Matubo' }, { id: 's_mpt3a2t', time: '11:00', type: 'factory', title: 'Beads for You — Lucka' }] },
      { date: '2027-05-13', blocks: [{ id: 's_65o9h0r', time: '14:00', type: 'shop', title: 'Bijou Non Stop' }, { id: 's_5unbmnr', time: '09:30', type: 'factory', title: 'Pegasus Production' }] },
      { date: '2027-05-14', blocks: [{ id: 's_q1eoxgj', time: '09:30', type: 'factory', title: 'Glass beads family Clever' }, { id: 's_sgqc739', time: '12:30', type: 'restaurant', title: 'Na Baště' }] },
    ],
  };
  const before = api.pragueRouteLinkHtml(plan.days[0], 'pickup');
  assert.match(before, />Open in Maps \(all hotels\)</);
  const beforeSegments = before.match(/href="([^"]+)"/)[1].split('?')[0].split('/').filter(Boolean);
  assert.ok(beforeSegments.length >= 2);
  const booking = {
    tour_arrival_date: '2027-05-10',
    departure_date: '2027-05-14',
    _members: [
      { id: 5633, first_name: 'Jennifer', last_name: 'Lindsay', prague_stays: [{ hotel: obecni }] },
      { id: 5634, first_name: 'Gail', last_name: 'DeLuca', prague_stays: [{ hotel: obecni }] },
      { id: 5635, first_name: 'Kay', last_name: 'Enk', prague_stays: [{ hotel: atlantic, check_in: '2027-05-09', check_out: '2027-05-10' }] },
      { id: 5636, first_name: 'Maggie', last_name: 'Cox', prague_stays: [{ hotel: atlantic, check_in: '2027-05-09', check_out: '2027-05-10' }] },
      { id: 5637, first_name: 'Karen', last_name: 'Poll', prague_stays: null },
    ],
  };
  const guestCopy = [{ id: 'g1', name: 'Jennifer Lindsay' }];
  api.syncPlanGuestNames(guestCopy, booking._members, null);
  api.addPragueEnds(plan, booking, []);
  assert.equal(plan.days[0].blocks.filter(stop => stop.id === 's_zhmgwxm' || stop.id === 's_crk0mw6' || stop.id === 's_tdsd2p4' || stop.id === 's_6z0w0xp').length, 4);
  assert.equal(plan.days[1].blocks.map(stop => stop.id).join(','), 's_mmhtkpn,s_lh7u1b5,s_1b4ruom');
  assert.equal(plan.days[2].blocks.map(stop => stop.id).join(','), 's_e2fi1pw,s_mpt3a2t');
  assert.equal(plan.days[3].blocks.map(stop => stop.id).join(','), 's_65o9h0r,s_5unbmnr');
  assert.equal(plan.days[4].blocks.filter(stop => stop.type !== 'handover').map(stop => stop.id).join(','), 's_q1eoxgj,s_sgqc739');
  const pickups = plan.days[0].blocks.filter(stop => stop.autoStop === 'prague-pickup' || (stop.praguePickups && stop.praguePickups.length));
  assert.equal(pickups.length, 1);
  assert.equal(pickups[0].praguePickups.map(row => row.hotel).join('|'), obecni + '|' + atlantic);
  assert.match(api.pragueRouteLinkHtml(plan.days[0], 'pickup'), />Open in Maps \(all hotels\)</);
  const ghostPlan = { days: [{ blocks: plan.days[0].blocks.slice() }] };
  ghostPlan.days[0].blocks.push({ time: '08:00', period: 'Morning', travelMinutes: 105 });
  api.dropUnrealBlocks(ghostPlan);
  assert.equal(ghostPlan.days[0].blocks.some(stop => stop.id === 's_zhmgwxm'), true);
  assert.equal(ghostPlan.days[0].blocks.some(stop => !stop.id && !stop.title && !stop.type), false);
});
