/*
 * Read-only place visits.
 *
 * Lists groups that stopped at a place. Nothing here writes a booking or a plan,
 * and nothing here sorts or rewrites the days on the plan it was given.
 */
(function (root) {
  'use strict';

  function fold(value) {
    return String(value == null ? '' : value).trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function yearOf(value) {
    var match = /^(\d{4})/.exec(String(value == null ? '' : value).trim());
    if (!match) return '';
    var year = Number(match[1]);
    if (year < 1990 || year > 2100) return '';
    return String(year);
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function eachPlan(plans, fn) {
    if (!plans) return;
    if (Array.isArray(plans)) {
      plans.forEach(function (row, index) {
        if (!row || typeof row !== 'object') return;
        if (row.payload && typeof row.payload === 'object') {
          fn(row.payload, text(row.booking_id || row.client_key || row.id || index));
        } else {
          fn(row, text(row.bookingKey || row.id || index));
        }
      });
      return;
    }
    if (typeof plans !== 'object') return;
    Object.keys(plans).forEach(function (key) {
      var plan = plans[key];
      if (!plan || typeof plan !== 'object') return;
      fn(plan, text(plan.bookingKey || key));
    });
  }

  function bookingFor(bookings, key) {
    if (!bookings || !key) return null;
    if (Array.isArray(bookings)) {
      for (var i = 0; i < bookings.length; i++) {
        var row = bookings[i];
        if (row && String(row.id) === String(key)) return row;
      }
      return null;
    }
    if (typeof bookings === 'object') return bookings[key] || bookings[String(key)] || null;
    return null;
  }

  function pushPerson(list, seen, name, personId) {
    var clean = text(name);
    var id = text(personId);
    if (!clean && !id) return;
    var key = id ? ('id:' + id) : ('name:' + fold(clean));
    if (seen[key]) {
      if (clean && !seen[key].name) seen[key].name = clean;
      return;
    }
    var row = { name: clean || 'Unnamed', personId: id };
    seen[key] = row;
    list.push(row);
  }

  function guestsOf(plan, booking) {
    var list = [];
    var seen = {};
    (plan && plan.guests || []).forEach(function (guest) {
      if (!guest || typeof guest !== 'object') return;
      var name = text(guest.name) || [guest.firstName, guest.lastName].filter(Boolean).join(' ');
      pushPerson(list, seen, name, guest.personId);
    });
    var details = plan && plan.bookingDetails;
    (details && details.guests || []).forEach(function (guest) {
      if (!guest || typeof guest !== 'object') return;
      pushPerson(list, seen, [guest.firstName, guest.lastName].filter(Boolean).join(' '), guest.personId);
    });
    (booking && booking._members || []).forEach(function (member) {
      if (!member || typeof member !== 'object') return;
      pushPerson(list, seen, [member.first_name, member.last_name].filter(Boolean).join(' '), member.person_id || member.personId);
    });
    return list;
  }

  function organiserOf(plan) {
    var name = text(plan && plan.organiserName);
    var personId = text(plan && plan.organiserPersonId);
    var organiser = plan && plan.bookingDetails && plan.bookingDetails.organiser;
    if (organiser && typeof organiser === 'object') {
      var full = text([organiser.firstName, organiser.lastName].filter(Boolean).join(' '));
      if (!name && full) name = full;
      if (!personId) personId = text(organiser.personId);
    }
    return { name: name, personId: personId };
  }

  function hotelOf(plan, booking) {
    var name = '';
    if (booking && typeof booking === 'object') {
      name = text((booking.hotels && booking.hotels.name) || booking.hotel_name);
    }
    if (!name && plan) name = text(plan.tourHotelName);
    return name;
  }

  function hotelNames(plan, booking) {
    var names = [];
    function add(value) {
      var clean = text(value);
      if (!clean) return;
      if (!names.some(function (existing) { return fold(existing) === fold(clean); })) names.push(clean);
    }
    add(hotelOf(plan, booking));
    if (plan && plan.pragueHotel) add(plan.pragueHotel.name);
    (plan && plan.hotels || []).forEach(function (row) {
      if (row && typeof row === 'object') add(row.hotelName || row.name);
    });
    return names;
  }

  function arrivalOf(plan, booking) {
    return text((booking && (booking.tour_arrival_date || booking.arrivalDate)) || (plan && plan.arrivalDate));
  }

  function departureOf(plan, booking) {
    return text((booking && (booking.departure_date || booking.departureDate)) || (plan && plan.departureDate));
  }

  function groupOf(plan, booking, key) {
    return text((booking && booking.group_name) || (plan && plan.groupName)) || (key ? ('Booking #' + key) : 'Untitled group');
  }

  function namesOf(query) {
    var names = [];
    function add(value) {
      var clean = text(value);
      if (!clean) return;
      if (!names.some(function (existing) { return fold(existing) === fold(clean); })) names.push(clean);
    }
    (query && query.names || []).forEach(add);
    add(query && query.placeName);
    return names;
  }

  function titleMatches(title, names) {
    var wanted = fold(title);
    if (!wanted) return false;
    return names.some(function (name) {
      var folded = fold(name);
      if (!folded) return false;
      if (wanted === folded) return true;
      if (folded.length < 4 || wanted.length < 4) return false;
      return wanted.indexOf(folded) !== -1 || folded.indexOf(wanted) !== -1;
    });
  }

  function stopPlaceId(stop) {
    if (!stop || typeof stop !== 'object') return '';
    return text(stop.placeId || stop.place_id);
  }

  function stopMatches(stop, placeId, names) {
    if (!stop || typeof stop !== 'object') return false;
    var id = stopPlaceId(stop);
    if (placeId && id && id === placeId) return true;
    if (names.length && titleMatches(stop.title, names)) return true;
    return false;
  }

  function isListedStop(stop, placeWanted) {
    if (!stop || typeof stop !== 'object') return false;
    if (placeWanted) return false;
    if (stopPlaceId(stop)) return true;
    var kind = fold(stop.type);
    if (kind === 'travel' || kind === 'pickup') return false;
    return !!text(stop.title);
  }

  function dayYear(day, plan, booking) {
    var fromDay = day && typeof day === 'object' ? yearOf(day.date) : '';
    if (fromDay) return fromDay;
    return yearOf(arrivalOf(plan, booking)) || yearOf(plan && plan.year) || yearOf(booking && booking.tour_arrival_date);
  }

  function copyStop(stop, matched) {
    return {
      time: text(stop.time),
      title: text(stop.title) || 'Untitled stop',
      type: text(stop.type),
      placeId: stopPlaceId(stop),
      isThisPlace: !!matched
    };
  }

  function guestCountOf(booking, named) {
    var head = booking && booking.no_people != null ? Number(booking.no_people) : NaN;
    if (Number.isFinite(head) && head > 0) return head;
    return named;
  }

  function personIncluded(personId, organiser, guests) {
    var wanted = text(personId);
    if (!wanted) return true;
    if (organiser && organiser.personId === wanted) return true;
    return guests.some(function (guest) { return guest.personId === wanted; });
  }

  function hotelIncluded(hotelName, names) {
    var wanted = fold(hotelName);
    if (!wanted) return true;
    return names.some(function (name) { return fold(name) === wanted; });
  }

  /**
   * @param {object} input plans (map, plan list, or cloud rows), bookings, and filters
   * @returns {object[]} one row per group that matches. The input plans are not changed.
   */
  function collectPlaceVisits(input) {
    var source = input || {};
    var query = source.query || source;
    var placeId = text(query.placeId);
    var names = namesOf(query);
    var year = text(query.year);
    var personId = text(query.personId);
    var hotelName = text(query.hotelName);
    var placeWanted = !!(placeId || names.length);
    var visits = [];

    eachPlan(source.plans, function (plan, key) {
      if (!plan || typeof plan !== 'object') return;
      var booking = bookingFor(source.bookings, key);
      var organiser = organiserOf(plan);
      var guests = guestsOf(plan, booking);
      if (!personIncluded(personId, organiser, guests)) return;
      var hotels = hotelNames(plan, booking);
      if (!hotelIncluded(hotelName, hotels)) return;

      var days = Array.isArray(plan.days) ? plan.days : [];
      var matchedDays = [];
      for (var i = 0; i < days.length; i++) {
        var day = days[i];
        if (!day || typeof day !== 'object' || Array.isArray(day)) continue;
        var visitYear = dayYear(day, plan, booking);
        if (year && visitYear !== year) continue;
        var blocks = Array.isArray(day.blocks) ? day.blocks : [];
        var matches = [];
        var others = [];
        for (var b = 0; b < blocks.length; b++) {
          var stop = blocks[b];
          if (!stop || typeof stop !== 'object') continue;
          var matched = placeWanted ? stopMatches(stop, placeId, names) : isListedStop(stop, placeWanted);
          if (matched) matches.push(copyStop(stop, true));
          else if (placeWanted) others.push(copyStop(stop, false));
        }
        if (!matches.length) continue;
        matchedDays.push({
          date: text(day.date),
          year: visitYear,
          matches: matches,
          otherStops: others
        });
      }
      if (!matchedDays.length) return;
      matchedDays.sort(function (a, b) {
        return String(a.date || '9999').localeCompare(String(b.date || '9999'));
      });
      var named = guests.length;
      visits.push({
        bookingKey: key,
        groupName: groupOf(plan, booking, key),
        organiserName: organiser.name,
        organiserPersonId: organiser.personId,
        arrivalDate: arrivalOf(plan, booking),
        departureDate: departureOf(plan, booking),
        guestCount: guestCountOf(booking, named),
        guests: guests,
        hotelName: hotelOf(plan, booking),
        hotelNames: hotels,
        days: matchedDays
      });
    });

    visits.sort(function (a, b) {
      var aDate = (a.days[0] && a.days[0].date) || a.arrivalDate || '';
      var bDate = (b.days[0] && b.days[0].date) || b.arrivalDate || '';
      if (aDate !== bDate) return aDate < bDate ? -1 : 1;
      return a.groupName.localeCompare(b.groupName, 'en-GB');
    });
    return visits;
  }

  function visitsTabHref(query) {
    var q = query || {};
    var parts = ['tab=visits'];
    if (text(q.year)) parts.push('year=' + encodeURIComponent(text(q.year)));
    if (text(q.placeId)) parts.push('place=' + encodeURIComponent(text(q.placeId)));
    if (text(q.placeName)) parts.push('placeName=' + encodeURIComponent(text(q.placeName)));
    if (text(q.personId)) parts.push('person=' + encodeURIComponent(text(q.personId)));
    if (text(q.hotelName)) parts.push('hotel=' + encodeURIComponent(text(q.hotelName)));
    return 'tour-planner.html?' + parts.join('&');
  }

  function bookingPlanHref(bookingKey) {
    var key = text(bookingKey);
    if (!key) return '';
    return 'tour-planner.html?booking=' + encodeURIComponent(key);
  }

  function personTabHref(personId) {
    var id = text(personId);
    if (!id) return '';
    return 'tour-planner.html?tab=people&person=' + encodeURIComponent(id);
  }

  root.PlaceVisits = {
    collectPlaceVisits: collectPlaceVisits,
    visitsTabHref: visitsTabHref,
    bookingPlanHref: bookingPlanHref,
    personTabHref: personTabHref,
    yearOf: yearOf
  };
})(typeof window !== 'undefined' ? window : globalThis);
