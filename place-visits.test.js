const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

require('./place-visits.js');
const PV = globalThis.PlaceVisits;

function demoPlans() {
  return {
    '501': {
      bookingKey: '501',
      groupName: 'Beading week demo',
      organiserName: 'Ada Organiser',
      organiserPersonId: 'person_ada',
      arrivalDate: '2024-05-13',
      departureDate: '2024-05-17',
      tourHotelName: 'Park Hotel Demo',
      guests: [
        { name: 'Bea Guest', personId: 'person_bea' },
        { name: 'Cleo Guest', personId: 'person_cleo' }
      ],
      days: [
        {
          date: '2024-05-13',
          blocks: [{ time: '15:00', title: 'Arrival hotel', type: 'hotel' }]
        },
        null,
        {
          date: '2024-05-15',
          blocks: [
            null,
            { time: '09:30', title: 'Matubo', type: 'factory', placeId: 'kf02' },
            { time: '15:00', title: 'Antik Zdeněk', type: 'shop', placeId: 'ks01' },
            { time: '17:00', title: 'Drive back', type: 'travel' }
          ]
        }
      ]
    },
    '502': {
      bookingKey: '502',
      groupName: 'Second demo group',
      organiserName: 'Ned Organiser',
      organiserPersonId: 'person_ned',
      arrivalDate: '2024-09-02',
      departureDate: '2024-09-06',
      tourHotelName: 'Lion Hotel Demo',
      guests: [{ name: 'Bea Guest', personId: 'person_bea' }],
      days: [
        {
          date: '2024-09-03',
          blocks: [
            { time: '11:00', title: 'Antik shop beads', type: 'shop' }
          ]
        }
      ]
    },
    '503': {
      bookingKey: '503',
      groupName: 'Next year group',
      organiserName: 'Ada Organiser',
      organiserPersonId: 'person_ada',
      arrivalDate: '2025-06-01',
      departureDate: '2025-06-05',
      tourHotelName: 'Park Hotel Demo',
      guests: [],
      days: [
        { date: '2025-06-02', blocks: [{ time: '10:00', title: 'Antik shop beads', placeId: 'ks01' }] }
      ]
    }
  };
}

const bookings = [
  {
    id: 501,
    group_name: 'Beading week demo',
    tour_arrival_date: '2024-05-13',
    departure_date: '2024-05-17',
    hotel_name: 'Park Hotel Demo',
    no_people: 8
  }
];

test('a year and place lists each group, with the stop and the other stops that day', () => {
  const plans = demoPlans();
  const before = JSON.stringify(plans);
  const visits = PV.collectPlaceVisits({
    plans: plans,
    bookings: bookings,
    placeId: 'ks01',
    placeName: 'Antik shop beads',
    names: ['Antik shop beads', 'Antik Zdeněk'],
    year: '2024'
  });
  assert.equal(JSON.stringify(plans), before);
  assert.equal(plans['501'].days[1], null);
  assert.equal(visits.length, 2);
  assert.equal(visits[0].groupName, 'Beading week demo');
  assert.equal(visits[0].organiserName, 'Ada Organiser');
  assert.equal(visits[0].organiserPersonId, 'person_ada');
  assert.equal(visits[0].guestCount, 8);
  assert.deepEqual(visits[0].guests.map(g => g.name), ['Bea Guest', 'Cleo Guest']);
  assert.equal(visits[0].hotelName, 'Park Hotel Demo');
  assert.equal(visits[0].arrivalDate, '2024-05-13');
  assert.equal(visits[0].departureDate, '2024-05-17');
  assert.equal(visits[0].days.length, 1);
  assert.equal(visits[0].days[0].date, '2024-05-15');
  assert.equal(visits[0].days[0].matches[0].time, '15:00');
  assert.equal(visits[0].days[0].matches[0].title, 'Antik Zdeněk');
  assert.deepEqual(visits[0].days[0].otherStops.map(s => s.title), ['Matubo', 'Drive back']);
  assert.equal(visits[1].groupName, 'Second demo group');
  assert.equal(visits[1].days[0].matches[0].time, '11:00');
});

test('null days and null stops are skipped and left as they were', () => {
  const plans = { '9': { bookingKey: '9', groupName: 'Holes', arrivalDate: '2024-01-01', days: [null, { date: '2024-01-02', blocks: null }, { date: '2024-01-03', blocks: [null, { title: 'Antik shop beads', time: '12:00' }] }] } };
  const snapshot = JSON.stringify(plans);
  const visits = PV.collectPlaceVisits({ plans: plans, placeName: 'Antik shop beads', year: 2024 });
  assert.equal(JSON.stringify(plans), snapshot);
  assert.equal(visits.length, 1);
  assert.equal(visits[0].days[0].date, '2024-01-03');
  assert.equal(visits[0].guestCount, 0);
});

test('another year, another person, and another hotel stay out of the list', () => {
  const plans = demoPlans();
  const names = ['Antik shop beads', 'Antik Zdeněk'];
  assert.equal(PV.collectPlaceVisits({ plans: plans, placeId: 'ks01', year: '2025' }).length, 1);
  assert.equal(PV.collectPlaceVisits({ plans: plans, placeId: 'ks01', names: names, year: '2024', personId: 'person_ned' })[0].groupName, 'Second demo group');
  assert.equal(PV.collectPlaceVisits({ plans: plans, placeId: 'ks01', names: names, year: '2024', hotelName: 'Lion Hotel Demo' }).length, 1);
  assert.equal(PV.collectPlaceVisits({ plans: plans, year: '2024', placeId: 'missing' }).length, 0);
});

test('cloud plan rows and booking ids still match', () => {
  const visits = PV.collectPlaceVisits({
    plans: [{
      booking_id: 77,
      payload: {
        days: [{ date: '2023-04-02', blocks: [{ place_id: 'ks01', time: '14:00', title: 'Shop' }] }]
      }
    }],
    bookings: [{ id: '77', group_name: 'Cloud group', no_people: 3 }]
  });
  assert.equal(visits[0].bookingKey, '77');
  assert.equal(visits[0].groupName, 'Cloud group');
  assert.equal(visits[0].guestCount, 3);
  assert.equal(PV.bookingPlanHref('77'), 'tour-planner.html?booking=77');
  assert.equal(PV.personTabHref('person_ada'), 'tour-planner.html?tab=people&person=person_ada');
  assert.match(PV.visitsTabHref({ year: '2024', placeId: 'ks01', placeName: 'Antik shop beads' }), /tab=visits/);
});

test('the catalogue is the place list and notes are not places', () => {
  assert.equal(PV.foldLoose('Křišťálový ráj'), 'kristalovy raj');
  const catalogue = [
    { client_id: 'kf03', name: 'GB Beads', nickname: 'GB', place_type: 'factory', place_types: ['factory', 'shop'], sort_order: 1 },
    { client_id: 'ks01', name: 'Antik shop beads', place_type: 'shop', sort_order: 2 },
  ];
  const plans = [{
    booking_id: 310,
    payload: {
      groupName: 'Jennifer Lindsay',
      days: [{
        date: '2027-05-10',
        blocks: [
          { title: 'GB Beads', type: 'factory', placeId: 'kf03' },
          { title: 'GB', type: 'shop' },
          { title: 'Drop-off', type: 'handover', handoverKind: 'dropoff' },
          { title: 'Drive', type: 'travel' },
          { title: 'Mystery kiln', type: 'factory' },
          { title: 'Mystery kiln', type: 'experience' },
        ],
      }],
    },
  }];
  const summary = PV.summariseCatalogue(catalogue, plans);
  assert.equal(summary.places.length, 2);
  assert.equal(summary.places.find(place => place.id === 'kf03').visits, 2);
  assert.equal(summary.places.find(place => place.id === 'ks01').visits, 0);
  assert.equal(summary.unmatched.length, 1);
  assert.equal(summary.unmatched[0].visits, 2);
  assert.equal(summary.placeCounts.factory, 1);
  assert.deepEqual(PV.categoriesOf({
    name: 'bakery Držkov',
    place_type: 'restaurant',
    place_types: ['snack'],
    types: ['restaurant', 'shop'],
    icon: '🥐',
  }), ['snack']);
  assert.deepEqual(PV.categoriesOf({
    name: 'Antique Shop Beads',
    place_type: 'shop',
    place_types: ['antique'],
  }), ['antique']);
  assert.deepEqual(PV.categoriesOf({ place_type: 'factory', place_types: null }), ['factory']);
  assert.equal(summary.placeCounts.shop, 2);
  assert.equal(summary.visitCounts.factory, 2);
  const copies = PV.catalogueDuplicates([
    { client_id: 'a', name: 'GB Beads' },
    { client_id: 'b', name: 'GB Beads shop' },
  ]);
  assert.equal(copies.length, 1);
  assert.equal(copies[0].leftId, 'a');
});

test('the planner, places stats, and hotel directory link years, groups, and people', () => {
  const planner = require('./test-page').pageSource(path.join(__dirname, 'tour-planner.html'), 'utf8');
  assert.match(planner, /data-open-visit-year/);
  assert.match(planner, /data-main-tab="visits"/);
  assert.match(planner, /function openPlanFromVisit/);
  assert.match(planner, /planViewOnly/);
  const start = planner.indexOf('async function openPlanFromVisit');
  const end = planner.indexOf('\n  function setMainTab', start);
  const openPlan = planner.slice(start, end);
  assert.ok(openPlan.includes('planViewOnly'));
  assert.doesNotMatch(openPlan, /persist\(/);
  assert.doesNotMatch(openPlan, /scheduleAutoSave\(/);
  assert.doesNotMatch(openPlan, /absorbGuestsFromPlan\(/);

  const stats = fs.readFileSync(path.join(__dirname, 'places-stats.html'), 'utf8');
  assert.match(stats, /tour-planner\.html\?tab=visits/);
  assert.match(stats, /booking2\.html\?booking=/);

  const directory = fs.readFileSync(path.join(__dirname, 'hotel-directory.js'), 'utf8');
  assert.match(directory, /tab=visits/);
  assert.match(directory, /tab=people/);
});
