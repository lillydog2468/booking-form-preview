/*
 * Pick-up and drop-off stops on a planner day.
 *
 * People come from the tour's named guests. Hotels come from bookings.
 * An airport pick-up starts from a flight arrival already on the booking.
 * Keith can move that time earlier or later; the plan shows the time he set.
 */
(function (root) {
  'use strict';

  function guestNameMissing(name) {
    var n = String(name || '').trim();
    if (!n) return true;
    return /^(unnamed(\s+guest)?|guest(\s*\d+)?|lady|unknown|n\/?a|-+|\.+)$/i.test(n);
  }

  function namedGuests(guests) {
    return (guests || []).filter(function (g) {
      return g && g.id && !guestNameMissing(g.name);
    });
  }

  /** Names already on the tour, in guest-list order. Unknown ids are left out. */
  function peopleNames(guestIds, guests) {
    var wanted = {};
    (guestIds || []).forEach(function (id) {
      if (id != null && String(id) !== '') wanted[String(id)] = true;
    });
    return namedGuests(guests).filter(function (g) {
      return wanted[String(g.id)];
    }).map(function (g) {
      return String(g.name).trim();
    });
  }

  function hotelKey(name) {
    return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function hotelRejected(name) {
    var n = hotelKey(name);
    if (!n) return true;
    if (n === 'day trip' || n === 'day trips') return true;
    if (n === 'still to be decided' || n === 'still not booked' || n === 'just for me') return true;
    if (n.indexOf('name not in notes') !== -1) return true;
    if (n.indexOf('not named') !== -1) return true;
    return false;
  }

  /**
   * Hotels booked for this group, then other hotels that appear on bookings.
   * Names that are not on either list are not added.
   */
  function orderHotels(groupNames, otherNames, sameName) {
    var same = typeof sameName === 'function'
      ? sameName
      : function (a, b) { return hotelKey(a) === hotelKey(b); };
    var out = [];
    function add(list, group) {
      (list || []).forEach(function (raw) {
        var name = String(raw || '').trim().replace(/\s+/g, ' ');
        if (hotelRejected(name)) return;
        if (out.some(function (row) { return same(row.name, name); })) return;
        out.push({ name: name, key: hotelKey(name), group: group });
      });
    }
    add(groupNames, 'this');
    add(otherNames, 'other');
    return out;
  }

  function clockMinutes(hhmm) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || '').trim());
    if (!m) return null;
    var h = Number(m[1]);
    var min = Number(m[2]);
    if (!isFinite(h) || !isFinite(min) || h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  function clockFromMinutes(total) {
    var mins = ((total % 1440) + 1440) % 1440;
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  /** HH:MM from a booking time. Blank when the value is not a clock time. */
  function normaliseClock(raw) {
    var mins = clockMinutes(raw);
    if (mins == null) return '';
    return clockFromMinutes(mins);
  }

  /** 21:15 → "9:15 pm". Empty when the time is not a clock time. */
  function clockTalk(hhmm) {
    var mins = clockMinutes(hhmm);
    if (mins == null) return '';
    var h24 = Math.floor(mins / 60);
    var m = mins % 60;
    var suffix = h24 >= 12 ? 'pm' : 'am';
    var h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ':' + String(m).padStart(2, '0') + ' ' + suffix;
  }

  /**
   * Arrival times already stored on the booking. Nothing is filled in
   * when the booking has no arrival time.
   */
  function arrivalTimes(flights, fallbackTimes) {
    var out = [];
    var seen = {};
    function add(raw, label) {
      var time = normaliseClock(raw);
      if (!time || seen[time]) return;
      seen[time] = true;
      out.push({ time: time, label: label || time });
    }
    (flights || []).forEach(function (f) {
      if (!f || !f.arrival_time) return;
      var time = normaliseClock(f.arrival_time);
      var bits = [];
      if (f.flight_number) bits.push(String(f.flight_number).trim());
      if (time) bits.push(clockTalk(time) ? (time + ' (' + clockTalk(time) + ')') : time);
      add(f.arrival_time, bits.filter(Boolean).join(' · '));
    });
    if (!out.length) {
      (fallbackTimes || []).forEach(function (t) {
        var time = normaliseClock(t);
        if (!time) return;
        var spoken = clockTalk(time);
        add(t, spoken ? (time + ' (' + spoken + ')') : time);
      });
    }
    return out;
  }

  /**
   * Starting pick-up time when the booking has one arrival.
   * Several arrivals are offered individually — this does not choose one.
   * No arrival returns a blank time.
   */
  function airportStartTime(arrivals) {
    var list = arrivals || [];
    if (list.length !== 1) return '';
    return normaliseClock(list[0] && list[0].time);
  }

  function adjustTime(current, deltaMinutes) {
    var base = clockMinutes(current);
    if (base == null) return '';
    var delta = Number(deltaMinutes);
    if (!isFinite(delta)) return clockFromMinutes(base);
    return clockFromMinutes(base + delta);
  }

  /**
   * Move the pick-up earlier or later. Uses the time already on the plan,
   * or the flight arrival when the plan time is still blank.
   * The returned time is what the plan should show. It is not snapped
   * back to the flight minute.
   */
  function nudgeFrom(shownTime, arrivalTime, deltaMinutes) {
    var base = normaliseClock(shownTime) || normaliseClock(arrivalTime);
    if (!base) return '';
    return adjustTime(base, deltaMinutes);
  }

  function kindLabel(kind) {
    return kind === 'dropoff' ? 'Drop-off' : 'Pick-up';
  }

  /** Airport stops are Terminal 1 unless he has chosen Terminal 2. Never blank. */
  function terminalNumber(stop) {
    if (!stop || stop.placeKind !== 'airport') return '';
    return String(stop.terminal) === '2' ? '2' : '1';
  }

  function placeLabel(stop) {
    if (!stop) return 'Place not set';
    if (stop.placeKind === 'airport') return 'Airport, Terminal ' + terminalNumber(stop);
    if (stop.placeKind === 'note') {
      var note = String(stop.placeNote || '').trim();
      return note || 'Place not set';
    }
    var name = String(stop.hotelName || '').trim();
    return name || 'Hotel not set';
  }

  function summary(stop, guests) {
    if (!stop) return '';
    var bits = [kindLabel(stop.handoverKind), placeLabel(stop)];
    var people = peopleNames(stop.guestIds, guests);
    if (people.length) bits.push(people.join(', '));
    return bits.join(' · ');
  }

  root.HandoverStops = {
    guestNameMissing: guestNameMissing,
    namedGuests: namedGuests,
    peopleNames: peopleNames,
    hotelKey: hotelKey,
    hotelRejected: hotelRejected,
    orderHotels: orderHotels,
    normaliseClock: normaliseClock,
    clockTalk: clockTalk,
    arrivalTimes: arrivalTimes,
    airportStartTime: airportStartTime,
    adjustTime: adjustTime,
    nudgeFrom: nudgeFrom,
    kindLabel: kindLabel,
    terminalNumber: terminalNumber,
    placeLabel: placeLabel,
    summary: summary,
  };
})(typeof window !== 'undefined' ? window : globalThis);
