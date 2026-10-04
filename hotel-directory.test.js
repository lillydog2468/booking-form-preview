const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

require('./hotel-directory.js');

const HD = globalThis.HotelDirectory;

test('groups Park hotel with Parkhotel Smržovka and keeps the hotel-list name', () => {
  const hotels = HD.buildDirectory({
    catalogue: [{ name: 'Park hotel' }, { name: 'day trip' }],
    places: [
      {
        client_id: 'ht01',
        name: 'Park hotel',
        place_type: 'hotel',
        address: 'Kostelní 892, 468 51 Smržovka, Czech Republic',
        notes: 'Beading-area tour hotel.',
        contact_method: null,
        contact_detail: null
      },
      {
        client_id: 'kr05',
        name: 'Park hotel',
        place_type: 'hotel',
        address: 'Kostelní 892, 468 51 Smržovka, Czech Republic',
        notes: 'Food / hotel dining — Parkhotel Smržovka.',
        contact_method: null,
        contact_detail: null
      }
    ],
    stays: [
      {
        key: '1|tour|park hotel',
        hotelName: 'Park hotel',
        role: 'tour',
        groupName: 'Lesley Thomas',
        arrivalDate: '2026-05-04',
        departureDate: '2026-05-06',
        booked: true,
        bookingStatus: '',
        bookingId: 16,
        guests: ['Lesley Thomas', 'Ann Guest'],
        headcount: '2'
      },
      {
        key: '2|tour|parkhotel',
        hotelName: 'Parkhotel Smržovka',
        role: 'tour',
        groupName: 'Older group',
        arrivalDate: '2018-06-01',
        departureDate: '2018-06-05',
        booked: false,
        bookingStatus: '',
        bookingId: 80,
        guests: ['Pat Example']
      },
      {
        key: '3|tour|park hotel',
        hotelName: 'Park hotel',
        role: 'tour',
        groupName: 'Cancelled group',
        arrivalDate: '2026-10-04',
        departureDate: '2026-10-08',
        booked: true,
        bookingStatus: 'cancelled',
        bookingId: 22,
        guests: ['Karen Poll']
      }
    ]
  });
  assert.equal(hotels.length, 1);
  const park = hotels[0];
  assert.equal(park.name, 'Park hotel');
  assert.ok(park.aliases.indexOf('Parkhotel Smržovka') !== -1);
  assert.equal(park.times, 2);
  assert.equal(park.cancelled, 1);
  assert.equal(park.nightsKnown, 2 + 4);
  assert.equal(park.bookedCount, 1);
  assert.equal(park.address, 'Kostelní 892, 468 51 Smržovka, Czech Republic');
  assert.equal(park.note, 'Beading-area tour hotel.');
  assert.equal(park.website, '');
  assert.equal(park.place.client_id, 'ht01');
  const older = park.stays.find(stay => stay.bookingId === 80);
  assert.deepEqual(older.guests, ['Pat Example']);
  assert.equal(older.nights, 4);
  assert.equal(park.peopleCount, 3);
  assert.ok(park.people.indexOf('Karen Poll') === -1);
});

test('leaves address and website empty when nothing is stored', () => {
  const hotels = HD.buildDirectory({
    catalogue: [{ name: 'golden lion' }],
    places: [],
    stays: [{
      key: '13|tour|golden lion',
      hotelName: 'golden lion',
      role: 'tour',
      groupName: 'Doris group',
      arrivalDate: '2026-05-21',
      departureDate: '2026-05-29',
      booked: false,
      bookingId: 13,
      guests: []
    }]
  });
  assert.equal(hotels[0].address, '');
  assert.equal(hotels[0].website, '');
  assert.equal(hotels[0].note, '');
  assert.equal(hotels[0].nightsKnown, 8);
  assert.equal(hotels[0].peopleCount, 0);
});

test('uses one stored Prague address and keeps conflicting addresses off the field', () => {
  const agreed = HD.buildDirectory({
    stays: [{
      key: 'a',
      hotelName: 'Hotel Maximillian',
      role: 'prague',
      groupName: 'Group A',
      arrivalDate: '2024-05-01',
      departureDate: '2024-05-06',
      recordedAddress: 'Haštalská 14, Prague 1',
      bookingId: 1,
      guests: ['Ada Guest']
    }]
  });
  assert.equal(agreed[0].address, 'Haštalská 14, Prague 1');
  assert.equal(agreed[0].nightsKnown, 0);
  assert.equal(agreed[0].stays[0].nights, null);

  const clash = HD.buildDirectory({
    stays: [
      {
        key: 'a',
        hotelName: 'Art Deco Imperial Hotel',
        role: 'prague',
        groupName: 'Group A',
        arrivalDate: '2024-05-01',
        departureDate: '2024-05-02',
        recordedAddress: 'Prague',
        bookingId: 1
      },
      {
        key: 'b',
        hotelName: 'Art Deco Imperial Hotel',
        role: 'prague',
        groupName: 'Group B',
        arrivalDate: '2023-05-01',
        departureDate: '2023-05-02',
        recordedAddress: 'Na Porici 15, Prague 11000',
        bookingId: 2
      }
    ]
  });
  assert.equal(clash[0].address, '');
  assert.equal(clash[0].addressConflict, true);
});

test('does not count companion, duplicate, unconfirmed, or day trip labels', () => {
  const hotels = HD.buildDirectory({
    catalogue: [{ name: 'still to be decided' }, { name: 'Na Basta' }],
    stays: [
      {
        key: 'main',
        hotelName: 'Na Basta',
        role: 'tour',
        groupName: 'Jenny Playford',
        arrivalDate: '2015-08-10',
        departureDate: '2015-08-15',
        bookingId: 253,
        guests: ['Jenny Playford'],
        explicitNights: ''
      },
      {
        key: 'comp',
        hotelName: 'Na Basta',
        role: 'tour',
        groupName: 'Ruth Halden',
        arrivalDate: '2015-08-10',
        departureDate: '2015-08-15',
        bookingStatus: 'companion',
        bookingId: 254,
        guests: ['Ruth Halden']
      },
      {
        key: 'day',
        hotelName: 'day trip',
        role: 'tour',
        groupName: 'Day people',
        arrivalDate: '2026-06-06',
        departureDate: '2026-06-06',
        bookingId: 9
      }
    ]
  });
  assert.equal(hotels.length, 1);
  assert.equal(hotels[0].name, 'Na Basta');
  assert.equal(hotels[0].times, 1);
  assert.equal(hotels[0].companion, 1);
  assert.equal(hotels[0].nightsKnown, 5);
  assert.deepEqual(hotels[0].people.sort(), ['Jenny Playford', 'Ruth Halden']);
});

test('reads a website only from a website contact and saves without wiping a phone', () => {
  const hotels = HD.buildDirectory({
    places: [{
      client_id: 'c_asenh0z',
      name: 'petrin',
      place_type: 'hotel',
      address: 'https://maps.apple.com/frame?center=50.71,15.17',
      notes: '',
      contact_method: 'phone',
      contact_detail: null
    }],
    stays: [{
      key: 'p',
      hotelName: 'petrin',
      role: 'tour',
      groupName: 'A group',
      arrivalDate: '2022-01-01',
      departureDate: '2022-01-03',
      bookingId: 4
    }],
    deviceWebsites: { petrin: 'https://example.test/petrin' }
  });
  assert.equal(hotels[0].website, 'https://example.test/petrin');
  assert.equal(hotels[0].websiteOnDevice, true);
  assert.equal(HD.looksLikeWebsite(hotels[0].address), false);
  const plan = HD.savePlan(hotels[0], {
    address: hotels[0].address,
    website: 'https://example.test/petrin',
    note: 'Short note'
  });
  assert.equal(plan.action, 'update');
  assert.equal(plan.clientId, 'c_asenh0z');
  assert.equal(plan.patch.notes, 'Short note');
  assert.equal(plan.patch.contact_method, undefined);
  assert.equal(plan.patch.contact_detail, undefined);
  assert.equal(plan.deviceWebsite, 'https://example.test/petrin');

  const fresh = HD.savePlan({ name: 'Familia', place: null }, {
    address: 'A street',
    website: 'https://familia.example',
    note: ''
  }, []);
  assert.equal(fresh.action, 'insert');
  assert.equal(fresh.insert.place_type, 'hotel');
  assert.equal(fresh.insert.contact_method, 'website');
  assert.equal(fresh.insert.contact_detail, 'https://familia.example');
  assert.equal(fresh.insert.address, 'A street');

  const empty = HD.savePlan({ name: 'Familia', place: null }, { address: '', website: '', note: '' }, []);
  assert.equal(empty.action, 'none');
});

test('counts one booking once when the plan repeats the hotel under a longer name', () => {
  const hotels = HD.buildDirectory({
    catalogue: [{ name: 'Park hotel' }],
    stays: [
      {
        key: '5|tour|park hotel',
        bookingId: 5,
        hotelName: 'Park hotel',
        role: 'tour',
        groupName: 'Denise Carranza',
        arrivalDate: '2026-03-23',
        departureDate: '2026-03-27',
        booked: false,
        guests: ['Denise Carranza']
      },
      {
        key: '5|tour|parkhotel smrzovka',
        bookingId: 5,
        hotelName: 'Parkhotel Smržovka',
        role: 'tour',
        groupName: 'Denise Carranza',
        arrivalDate: '2026-03-23',
        departureDate: '2026-03-27',
        booked: true,
        guests: ['Denise Carranza']
      }
    ]
  });
  assert.equal(hotels.length, 1);
  assert.equal(hotels[0].times, 1);
  assert.equal(hotels[0].bookedCount, 1);
  assert.equal(hotels[0].nightsKnown, 4);
  assert.equal(hotels[0].stays.length, 1);
});

test('does not merge hotels that only share a prefix', () => {
  const hotels = HD.buildDirectory({
    stays: [
      { key: '1', hotelName: 'Hilton Prague Old Town', role: 'prague', groupName: 'A', arrivalDate: '2024-05-01', departureDate: '2024-05-03', bookingId: 1, recordedAddress: 'Old Town square' },
      { key: '2', hotelName: 'Hilton Prague', role: 'prague', groupName: 'B', arrivalDate: '2023-05-01', departureDate: '2023-05-03', bookingId: 2, recordedAddress: 'Pobrezni 1' },
      { key: '3', hotelName: 'Hilton Prague (new / not Old Town)', role: 'prague', groupName: 'C', arrivalDate: '2022-05-01', departureDate: '2022-05-03', bookingId: 3 }
    ]
  });
  assert.equal(hotels.length, 3);
  const oldTown = hotels.find(hotel => hotel.name === 'Hilton Prague Old Town');
  assert.equal(oldTown.address, 'Old Town square');
  assert.equal(oldTown.times, 1);
});

test('booking hotel nights override the date span for an extra stay', () => {
  const nights = HD.stayNights({
    role: 'extra',
    explicitNights: '2',
    arrivalDate: '2026-05-11',
    departureDate: '2026-05-14'
  });
  assert.equal(nights, 2);
  assert.equal(HD.stayNights({ role: 'tour', arrivalDate: '2026-05-11', departureDate: '2026-05-14' }), 3);
});

test('directory markup keeps empty fields empty and the hotels page still has booked ticks', () => {
  const html = HD.renderDirectoryHtml(HD.buildDirectory({
    catalogue: [{ name: 'golden lion' }],
    stays: []
  }), '');
  assert.match(html, /data-profile="address" [^>]*value=""/);
  assert.match(html, /data-profile="website" [^>]*value=""/);
  assert.match(html, /<textarea data-profile="note"/);
  assert.match(html, /Not used on a booking yet/);
  assert.match(html, />Save</);

  const page = fs.readFileSync('hotels.html', 'utf8');
  assert.match(page, /data-field="booked"/);
  assert.match(page, /Booked/);
  assert.match(page, /id="hotelDirectory"/);
  assert.match(page, /id="hotels-used"/);
  assert.match(page, /hotel-directory\.js/);
  assert.match(page, /id="yearFilter"/);
  assert.match(page, /Paid in advance/);
});
