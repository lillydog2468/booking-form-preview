/*
 * Pure rules for the week planner.
 * Any saved booking can be opened. Booking 310 is only the sample week.
 * Times use the Overview clock (8:00–18:00, 15-minute snap).
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

  function bookingNumber(id) {
    var text = String(id == null ? '' : id).trim();
    if (!/^\d+$/.test(text)) return null;
    var n = Number(text);
    return n > 0 ? n : null;
  }

  function isAllowedBooking(id) {
    return bookingNumber(id) != null;
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

  /**
   * A finger on a place card is either scrolling the list or starting a drag.
   * Vertical movement scrolls. A sideways move, or a still finger held briefly, drags.
   */
  function pickupRows(day) {
    var rows = [];
    (day && day.blocks || []).forEach(function (stop) {
      if (!stop || typeof stop !== 'object') return;
      var listed = Array.isArray(stop.praguePickups) ? stop.praguePickups : [];
      if (listed.length) {
        listed.forEach(function (row) {
          var point = String((row && (row.address || row.hotel)) || '').trim();
          if (!point) return;
          rows.push({
            time: String((row && row.time) || stop.time || ''),
            label: String((row && row.hotel) || point),
            point: point,
          });
        });
        return;
      }
      var pickup = stop.handoverKind === 'pickup' || stop.autoStop === 'prague-pickup';
      if (!pickup) return;
      var single = String(stop.address || stop.hotelName || '').trim();
      if (!single) return;
      rows.push({
        time: String(stop.time || ''),
        label: String(stop.hotelName || single),
        point: single,
      });
    });
    return rows;
  }

  var AIRPORT_POINT = 'Václav Havel Airport Prague (PRG), Aviatická, 161 00 Prague 6, Czech Republic';

  function dropoffRows(plan) {
    var days = plan && plan.days || [];
    var last = days[days.length - 1] || { blocks: [] };
    var airport = '';
    var hotels = [];
    function addHotel(label, point, time) {
      var text = String(point || label || '').trim();
      if (!text) return;
      if (hotels.some(function (row) { return row.point === text; })) return;
      hotels.push({
        time: String(time || '').trim(),
        label: String(label || text).trim(),
        point: text,
      });
    }
    (last.blocks || []).forEach(function (stop) {
      if (!stop) return;
      var drop = stop.handoverKind === 'dropoff' || stop.autoStop === 'prague-dropoff' || stop.autoStop === 'airport-dropoff';
      if (!drop) return;
      if (stop.placeKind === 'airport' || stop.autoStop === 'airport-dropoff') {
        airport = String(stop.address || AIRPORT_POINT).trim() || AIRPORT_POINT;
        return;
      }
      var listed = Array.isArray(stop.praguePickups) ? stop.praguePickups : [];
      if (listed.length) {
        listed.forEach(function (row) {
          var who = String((row && row.guests) || '').trim();
          var hotel = String((row && row.hotel) || '').trim();
          addHotel([hotel, who].filter(Boolean).join(' · '), (row && (row.address || row.hotel)) || '', (row && row.time) || stop.time);
        });
        return;
      }
      addHotel(stop.hotelName, stop.address || stop.hotelName, stop.time);
    });
    if (!hotels.length && !airport) {
      days.forEach(function (day) {
        pickupRows(day).forEach(function (row) { addHotel(row.label, row.point); });
      });
    }
    return { airport: airport, hotels: hotels };
  }

  function appleStopHref(point) {
    var text = String(point || '').trim();
    if (!text) return '';
    return 'https://maps.apple.com/?daddr=' + encodeURIComponent(text) + '&dirflg=d';
  }

  function googleAllHref(points) {
    var list = (points || []).map(function (point) { return String(point || '').trim(); }).filter(Boolean);
    if (!list.length) return '';
    var url = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(list[list.length - 1]) + '&travelmode=driving';
    var earlier = list.slice(0, -1);
    if (earlier.length) url += '&waypoints=' + earlier.map(function (point) { return encodeURIComponent(point); }).join('|');
    return url;
  }

  function routeHref(points, nav) {
    var apple = true;
    if (nav && typeof nav.prefersApple === 'boolean') apple = nav.prefersApple;
    else if (typeof root.PlacePopup !== 'undefined' && root.PlacePopup.prefersApple) apple = root.PlacePopup.prefersApple();
    return apple ? appleAllHref(points) : googleAllHref(points);
  }

  function appleAllHref(points) {
    var list = (points || []).map(function (point) { return String(point || '').trim(); }).filter(Boolean);
    if (!list.length) return '';
    if (list.length === 1) return appleStopHref(list[0]);
    return 'https://maps.apple.com/?saddr=' + encodeURIComponent('Current Location')
      + '&daddr=' + list.map(function (point) { return encodeURIComponent(point); }).join('+to:')
      + '&dirflg=d';
  }

  function placeGesture(dx, dy, heldMs) {
    var adx = Math.abs(Number(dx) || 0);
    var ady = Math.abs(Number(dy) || 0);
    var held = Number(heldMs) || 0;
    if (ady >= 10 && ady > adx) return 'scroll';
    if (adx >= 14 && adx >= ady) return 'drag';
    if (held >= 320 && adx < 10 && ady < 10) return 'drag';
    return 'wait';
  }

  function primaryType(place) {
    if (place && place.types && place.types.length) return String(place.types[0]);
    return String((place && place.type) || 'other');
  }

  function placeLabel(place) {
    return String(place && place.name || '').trim() || 'Place';
  }

  function displayStopTitle(stop, place) {
    var title = String(stop && stop.title || '').trim();
    var hotel = String(stop && stop.hotelName || '').trim();
    if (!place) return title || hotel;
    var name = String(place.name || '').trim();
    var nick = String(place.nickname || '').trim();
    if (!name) return title || hotel || nick;
    if (!title || title === name || (nick && title === nick)) return name;
    return title;
  }

  function usedPlaceIds(plan) {
    var ids = {};
    (plan && plan.days || []).forEach(function (day) {
      (day && day.blocks || []).forEach(function (stop) {
        var id = stop && (stop.placeId || stop.place_id);
        if (!id) return;
        var key = String(id);
        ids[key] = (ids[key] || 0) + 1;
      });
    });
    return ids;
  }

  function placeUseMark(count) {
    var n = Number(count) || 0;
    if (n >= 2) return 'many';
    if (n === 1) return 'once';
    return 'none';
  }

  var GROUP_ORDER = ['hotel', 'factory', 'shop', 'antique', 'restaurant', 'snack', 'experience', 'museum', 'school', 'viewpoint', 'other'];

  function groupPlaces(places, query, typeId) {
    var buckets = {};
    filterPlaces(places, query, typeId).forEach(function (place) {
      var id = primaryType(place);
      if (!buckets[id]) buckets[id] = [];
      buckets[id].push(place);
    });
    var keys = GROUP_ORDER.filter(function (id) { return buckets[id]; });
    Object.keys(buckets).forEach(function (id) {
      if (keys.indexOf(id) === -1) keys.push(id);
    });
    return keys.map(function (id) {
      return { id: id, places: buckets[id] };
    });
  }

  function chosenTypes(typeId) {
    var list = Array.isArray(typeId) ? typeId : [typeId];
    var out = [];
    list.forEach(function (item) {
      var id = String(item == null ? '' : item).trim();
      if (!id || id === 'all' || out.indexOf(id) !== -1) return;
      out.push(id);
    });
    return out;
  }

  function placeHasType(place, type) {
    var types = place.types && place.types.length ? place.types : [place.type || 'other'];
    return types.indexOf(type) !== -1 || place.type === type;
  }

  function filterPlaces(places, query, typeId) {
    var q = String(query || '').trim().toLowerCase();
    var chosen = chosenTypes(typeId);
    return (places || []).filter(function (place) {
      if (!place || !place.name) return false;
      if (chosen.length && !chosen.some(function (type) { return placeHasType(place, type); })) return false;
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

  function isoDay(value) {
    var match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value == null ? '' : value).trim());
    return match ? match[1] : '';
  }

  function bookingSpan(booking) {
    var row = booking || {};
    var arrival = isoDay(row.tour_arrival_date != null && String(row.tour_arrival_date).trim() !== '' ? row.tour_arrival_date : row.arrivalDate);
    var departure = isoDay(row.departure_date != null && String(row.departure_date).trim() !== '' ? row.departure_date : row.departureDate);
    if (!arrival && !departure) return null;
    if (!arrival) arrival = departure;
    if (!departure) departure = arrival;
    return { arrival: arrival, departure: departure, dates: enumerateDates(arrival, departure) };
  }

  /**
   * The bookings row owns the tour dates. A saved plan may be stale
   * (booking 292 had departureDate equal to arrival and days: []).
   * Fill a day for every date in the booking range and keep blocks
   * already stored on those dates.
   */
  function alignPlanToBooking(plan, booking) {
    if (!plan || typeof plan !== 'object') return plan;
    var span = bookingSpan(booking);
    if (!span) return plan;
    var byDate = {};
    (Array.isArray(plan.days) ? plan.days : []).forEach(function (day) {
      var date = day && isoDay(day.date);
      if (date && !byDate[date]) byDate[date] = day;
    });
    plan.arrivalDate = span.arrival;
    plan.departureDate = span.departure;
    plan.days = span.dates.map(function (date) {
      var kept = byDate[date];
      if (!kept) return { date: date, blocks: [] };
      kept.date = date;
      if (!Array.isArray(kept.blocks)) kept.blocks = [];
      return kept;
    });
    return plan;
  }

  function planDatesMatchBooking(plan, booking) {
    var span = bookingSpan(booking);
    if (!span) return true;
    if (!plan) return false;
    if (isoDay(plan.arrivalDate) !== span.arrival || isoDay(plan.departureDate) !== span.departure) return false;
    var have = (plan.days || []).map(function (day) { return day && isoDay(day.date); });
    if (have.length !== span.dates.length) return false;
    var i;
    for (i = 0; i < span.dates.length; i += 1) {
      if (have[i] !== span.dates[i]) return false;
    }
    return true;
  }

  function emptyPlanFromBooking(booking) {
    var row = booking || {};
    var arrival = String(row.tour_arrival_date || row.arrivalDate || '').slice(0, 10);
    var departure = String(row.departure_date || row.departureDate || '').slice(0, 10);
    var hotel = (row.hotels && row.hotels.name) || row.hotel_name || '';
    return {
      bookingKey: String(bookingNumber(row.id) || ''),
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
            { id: 'pick', type: 'handover', handoverKind: 'pickup', placeKind: 'hotel', time: '08:00', autoStop: 'prague-pickup', hotelName: 'U Obecního dvora 7, Prague 1', title: 'Pick-up · Prague hotels', guestIds: ['g1', 'g2', 'g3'], praguePickups: [
              { time: '08:00', hotel: 'U Obecního dvora 7, Prague 1' },
              { time: '08:05', hotel: 'Hotel Atlantic, Na Poříčí 9, Prague 1' },
            ] },
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
    bookingNumber: bookingNumber,
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
    groupPlaces: groupPlaces,
    placeLabel: placeLabel,
    displayStopTitle: displayStopTitle,
    usedPlaceIds: usedPlaceIds,
    placeUseMark: placeUseMark,
    primaryType: primaryType,
    placeGesture: placeGesture,
    pickupRows: pickupRows,
    dropoffRows: dropoffRows,
    appleStopHref: appleStopHref,
    appleAllHref: appleAllHref,
    googleAllHref: googleAllHref,
    routeHref: routeHref,
    guestLine: guestLine,
    enumerateDates: enumerateDates,
    alignPlanToBooking: alignPlanToBooking,
    planDatesMatchBooking: planDatesMatchBooking,
    emptyPlanFromBooking: emptyPlanFromBooking,
    samplePlan: samplePlan,
    samplePlaces: samplePlaces,
  };
}(typeof window !== 'undefined' ? window : globalThis));
