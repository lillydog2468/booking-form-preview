/*
 * Pure rules for the new test planner.
 * It opens one booking only: Jennifer Lindsay, booking 310.
 * Times use the Overview clock (8:00–16:00, 15-minute snap).
 * Nothing here talks to the network.
 */
(function (root) {
  'use strict';

  var BOOKING_ID = 310;
  var GROUP_NAME = 'Jennifer Lindsay';
  var PHONE_MAX = 760;

  function clock() {
    return root.WeekOverview;
  }

  function isAllowedBooking(id) {
    return String(id == null ? '' : id).trim() === String(BOOKING_ID);
  }

  function canSave(plan) {
    return !!(plan && isAllowedBooking(plan.bookingKey));
  }

  function usesPhoneLayout(width) {
    var n = Number(width);
    if (!Number.isFinite(n)) return false;
    return n <= PHONE_MAX;
  }

  function minutesOf(value) {
    var api = clock();
    if (!api) return null;
    return api.minutesOf(value);
  }

  function formatMinutes(mins) {
    var api = clock();
    return api ? api.formatMinutes(mins) : '';
  }

  function plannedTime(hhmm, dayIndex) {
    var api = clock();
    if (!api) return '';
    var mins = api.clampPlannedMinutes(api.minutesOf(hhmm), dayIndex);
    return api.formatMinutes(mins);
  }

  function sortDay(day) {
    if (!day || !Array.isArray(day.blocks)) return;
    var timed = [];
    var untimed = [];
    day.blocks.forEach(function (stop) {
      if (!stop) return;
      if (minutesOf(stop.time) == null) untimed.push(stop);
      else timed.push(stop);
    });
    timed.sort(function (a, b) {
      return minutesOf(a.time) - minutesOf(b.time);
    });
    day.blocks = timed.concat(untimed);
  }

  function findStop(plan, stopId) {
    var days = plan && plan.days || [];
    var dayIndex, at;
    for (dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
      var blocks = days[dayIndex] && days[dayIndex].blocks || [];
      for (at = 0; at < blocks.length; at += 1) {
        if (blocks[at] && String(blocks[at].id) === String(stopId)) {
          return { dayIndex: dayIndex, index: at, stop: blocks[at], day: days[dayIndex] };
        }
      }
    }
    return null;
  }

  /**
   * Move a stop to a day and time. Other stops keep the times they already have.
   * Returns false when the booking is not 310 or the stop cannot move.
   */
  function placeStop(plan, stopId, dayIndex, hhmm) {
    if (!canSave(plan) && !(plan && plan.sample)) return false;
    var found = findStop(plan, stopId);
    var dest = plan.days && plan.days[dayIndex];
    if (!found || !dest || typeof dest !== 'object') return false;
    var time = plannedTime(hhmm, dayIndex);
    if (!time) return false;
    if (found.dayIndex !== dayIndex) {
      found.day.blocks.splice(found.index, 1);
      if (!Array.isArray(dest.blocks)) dest.blocks = [];
      dest.blocks.push(found.stop);
      sortDay(found.day);
    }
    found.stop.time = time;
    found.stop.timeApprox = false;
    sortDay(dest);
    return true;
  }

  function editStop(plan, stopId, patch) {
    if (!canSave(plan) && !(plan && plan.sample)) return null;
    var found = findStop(plan, stopId);
    if (!found) return null;
    var next = patch || {};
    if (Object.prototype.hasOwnProperty.call(next, 'title')) found.stop.title = String(next.title || '');
    if (Object.prototype.hasOwnProperty.call(next, 'notes')) found.stop.notes = String(next.notes || '');
    if (Object.prototype.hasOwnProperty.call(next, 'address')) found.stop.address = String(next.address || '');
    if (Object.prototype.hasOwnProperty.call(next, 'time')) {
      var time = String(next.time || '').trim();
      if (!time) found.stop.time = '';
      else found.stop.time = plannedTime(time, found.dayIndex);
      found.stop.timeApprox = false;
      sortDay(found.day);
    }
    return found.stop;
  }

  function removeStop(plan, stopId) {
    if (!canSave(plan) && !(plan && plan.sample)) return false;
    var found = findStop(plan, stopId);
    if (!found) return false;
    found.day.blocks.splice(found.index, 1);
    return true;
  }

  var seq = 1;
  function nextId(prefix) {
    seq += 1;
    return prefix + '-' + seq.toString(36);
  }

  function addPlace(plan, place, dayIndex, hhmm) {
    if ((!canSave(plan) && !(plan && plan.sample)) || !place) return null;
    var day = plan.days && plan.days[dayIndex];
    if (!day || typeof day !== 'object') return null;
    if (!Array.isArray(day.blocks)) day.blocks = [];
    var stop = {
      id: nextId('s'),
      time: plannedTime(hhmm, dayIndex),
      timeApprox: false,
      type: place.type || 'other',
      title: place.name || 'Place',
      notes: '',
      address: place.address || '',
      placeId: place.id || '',
    };
    day.blocks.push(stop);
    sortDay(day);
    return stop;
  }

  function addHandover(plan, kind, dayIndex, hhmm) {
    if (!canSave(plan) && !(plan && plan.sample)) return null;
    var day = plan.days && plan.days[dayIndex];
    if (!day || typeof day !== 'object') return null;
    if (!Array.isArray(day.blocks)) day.blocks = [];
    var dropoff = kind === 'dropoff';
    var hotel = dropoff
      ? (plan.pragueHotel && plan.pragueHotel.name) || 'Prague hotel'
      : (dayIndex === 0 ? ((plan.pragueHotel && plan.pragueHotel.name) || 'Prague hotel') : (plan.tourHotelName || 'Hotel'));
    var stop = {
      id: nextId('s'),
      type: 'handover',
      handoverKind: dropoff ? 'dropoff' : 'pickup',
      placeKind: 'hotel',
      time: plannedTime(hhmm, dayIndex),
      timeApprox: false,
      hotelName: hotel,
      title: (dropoff ? 'Drop-off · ' : 'Pick-up · ') + hotel,
      guestIds: (plan.guests || []).map(function (guest) { return guest && guest.id; }).filter(Boolean),
    };
    day.blocks.push(stop);
    sortDay(day);
    return stop;
  }

  function filterPlaces(places, query, typeId) {
    var q = String(query || '').trim().toLowerCase();
    var type = String(typeId || 'all');
    return (places || []).filter(function (place) {
      if (!place || !place.name) return false;
      if (type !== 'all') {
        var types = place.types && place.types.length ? place.types : [place.type || 'other'];
        if (types.indexOf(type) === -1 && place.type !== type) return false;
      }
      if (!q) return true;
      var hay = [place.name, place.nickname, place.address].join(' ').toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function guestLine(stop, guests) {
    var names = [];
    (stop && stop.guestIds || []).forEach(function (id) {
      var guest = (guests || []).find(function (item) { return item && String(item.id) === String(id); });
      var name = guest && String(guest.name || '').trim();
      if (name && names.indexOf(name) === -1) names.push(name);
    });
    if (names.length > 2) return names.slice(0, 2).join(', ') + ' +' + (names.length - 2);
    return names.join(', ');
  }

  function enumerateDates(arrival, departure) {
    var start = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(arrival || ''));
    if (!start) return [];
    var end = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(departure || '')) || start;
    var cursor = Date.UTC(Number(start[1]), Number(start[2]) - 1, Number(start[3]));
    var last = Date.UTC(Number(end[1]), Number(end[2]) - 1, Number(end[3]));
    if (last < cursor) last = cursor;
    var out = [];
    while (cursor <= last && out.length < 21) {
      var dt = new Date(cursor);
      var month = String(dt.getUTCMonth() + 1);
      var day = String(dt.getUTCDate());
      if (month.length < 2) month = '0' + month;
      if (day.length < 2) day = '0' + day;
      out.push(dt.getUTCFullYear() + '-' + month + '-' + day);
      cursor += 86400000;
    }
    return out;
  }

  function emptyPlanFromBooking(booking) {
    var row = booking || {};
    var arrival = String(row.tour_arrival_date || row.arrivalDate || '').slice(0, 10);
    var departure = String(row.departure_date || row.departureDate || '').slice(0, 10);
    var hotel = (row.hotels && row.hotels.name) || row.hotel_name || '';
    return {
      bookingKey: String(BOOKING_ID),
      groupName: row.group_name || GROUP_NAME,
      arrivalDate: arrival,
      departureDate: departure,
      tourHotelName: hotel,
      pragueHotel: { name: '', address: '', pickupTime: '08:00' },
      guests: [],
      days: enumerateDates(arrival, departure).map(function (date) {
        return { date: date, blocks: [] };
      }),
    };
  }

  function samplePlan() {
    return {
      sample: true,
      bookingKey: String(BOOKING_ID),
      groupName: GROUP_NAME,
      arrivalDate: '2027-05-10',
      departureDate: '2027-05-14',
      tourHotelName: 'Park Hotel',
      pragueHotel: { name: 'Hotel Axa', address: 'Na Poříčí 9, Prague', pickupTime: '08:00' },
      roughNotes: 'Sample week. Nothing is saved.',
      guests: [
        { id: 'g1', name: 'Jennifer Lindsay' },
        { id: 'g2', name: 'Gail DeLuca' },
        { id: 'g3', name: 'Kay Enk' },
      ],
      days: [
        {
          date: '2027-05-10',
          blocks: [
            { id: 'pick', type: 'handover', handoverKind: 'pickup', placeKind: 'hotel', time: '08:00', hotelName: 'Hotel Axa', title: 'Pick-up · Hotel Axa', guestIds: ['g1', 'g2', 'g3'] },
            { id: 'pass', type: 'factory', time: '11:00', title: 'Matubo', placeId: 'kf02' },
            { id: 'lunch1', type: 'restaurant', time: '13:00', title: 'Lunch', placeId: 'kr05' },
            { id: 'antik1', type: 'shop', time: '15:15', title: 'Antik', placeId: 'ks01' },
          ],
        },
        {
          date: '2027-05-11',
          blocks: [
            { id: 'gb', type: 'factory', time: '09:15', title: 'GB Beads', placeId: 'kf03' },
            { id: 'glass', type: 'factory', time: '09:45', title: 'Matubo', placeId: 'kf02' },
            { id: 'museum', type: 'museum', time: '11:30', title: 'Museum of glass', placeId: 'km01' },
            { id: 'lunch2', type: 'restaurant', time: '13:15', title: 'Lunch', placeId: 'kr05' },
          ],
        },
        {
          date: '2027-05-12',
          blocks: [
            { id: 'untimed', type: 'experience', title: 'Town walk' },
            { id: 'snack', type: 'snack', time: '12:00', title: 'Snack', placeId: 'kr06' },
            { id: 'school', type: 'school', time: '14:30', title: 'Bead school' },
          ],
        },
        {
          date: '2027-05-13',
          blocks: [
            { id: 'quiet', type: 'shop', time: '10:30', title: 'Antik', placeId: 'ks01' },
            { id: 'late', type: 'experience', time: '15:00', title: 'Free afternoon' },
          ],
        },
        {
          date: '2027-05-14',
          blocks: [
            { id: 'last', type: 'factory', time: '09:30', title: 'GB Beads', placeId: 'kf03' },
            { id: 'drop', type: 'handover', handoverKind: 'dropoff', placeKind: 'hotel', time: '18:00', hotelName: 'Hotel Axa', title: 'Drop-off · Hotel Axa', guestIds: ['g1', 'g2', 'g3'] },
          ],
        },
      ],
    };
  }

  function samplePlaces() {
    return [
      { id: 'kf02', name: 'Matubo', nickname: 'Mat', type: 'factory', types: ['factory'] },
      { id: 'kf03', name: 'GB Beads', nickname: 'GB', type: 'factory', types: ['factory'] },
      { id: 'ks01', name: 'Antik shop beads', nickname: 'Antik', type: 'shop', types: ['shop'] },
      { id: 'km01', name: 'Museum of glass', nickname: 'Museum', type: 'museum', types: ['museum'] },
      { id: 'kr05', name: 'Park hotel dining', nickname: 'Lunch', type: 'restaurant', types: ['restaurant'] },
      { id: 'kr06', name: 'Snack at supermarket', nickname: 'Snack', type: 'snack', types: ['snack'] },
      { id: 'kr01', name: 'Černá Studnice', nickname: 'Tower', type: 'viewpoint', types: ['viewpoint'] },
    ];
  }

  root.Planner2 = {
    BOOKING_ID: BOOKING_ID,
    GROUP_NAME: GROUP_NAME,
    PHONE_MAX: PHONE_MAX,
    isAllowedBooking: isAllowedBooking,
    canSave: canSave,
    usesPhoneLayout: usesPhoneLayout,
    plannedTime: plannedTime,
    findStop: findStop,
    placeStop: placeStop,
    editStop: editStop,
    removeStop: removeStop,
    addPlace: addPlace,
    addHandover: addHandover,
    filterPlaces: filterPlaces,
    guestLine: guestLine,
    enumerateDates: enumerateDates,
    emptyPlanFromBooking: emptyPlanFromBooking,
    samplePlan: samplePlan,
    samplePlaces: samplePlaces,
  };
}(typeof window !== 'undefined' ? window : globalThis));
