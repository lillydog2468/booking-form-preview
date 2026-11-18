/*
 * Rough-week draft and Prague hotel bookends for the booking 310 planner.
 * The place slots are the same list the old planner uses in roughWeekPlaceSlots.
 * Day one still starts with the hotel pick-up at 08:00. Later days leave the
 * hotel at 09:00 on the clock, and the first place is never before 09:15.
 * Place visits stop around 16:00. The last-day drop-off is 18:00.
 */
(function (root) {
  'use strict';

  var SLOTS = {
    day1: [
      { time: '09:30', ref: { ids: ['kf01'], names: ['Rutkovsky'] } },
      { time: '11:00', ref: { ids: ['pass01'], names: ['Pass'] } },
      { time: '12:30', ref: { ids: ['kr06'], names: ['Snack at supermarket'] } },
      { time: '15:00', ref: { ids: ['ks03'], names: ['Vlad antik'] } },
    ],
    later: [
      [
        { time: '09:30', ref: { ids: ['kf07'], names: ['Ralton'] } },
        { time: '13:00', ref: { ids: ['kf03'], names: ['GB Beads'] } },
        { time: '15:00', ref: { ids: ['ks01'], names: ['Antik shop beads', 'Antik shop'] } },
      ],
      [
        { time: '09:30', ref: { ids: ['kf02'], names: ['Matubo'] } },
        { time: '11:00', ref: { ids: ['kf04'], names: ['Beads for You — Lucka', 'Beads for You'] } },
      ],
      [
        { time: '09:30', ref: { ids: ['kf05'], names: ['Pegasus Production', 'Pegasus'] } },
        { time: '11:30', ref: { ids: ['km01'], names: ['Glass and jewellery museum in Jablonec'] } },
        { time: '14:00', ref: { ids: ['ks04'], names: ['Bijou Non Stop'] } },
      ],
      [
        { time: '09:30', ref: { ids: ['kf06'], names: ['Glass beads family Clever'] } },
        { time: '12:30', ref: { ids: ['kr03'], names: ['Na Baště', 'Na Basta'] } },
        { time: '14:30', ref: { ids: ['ks05'], names: ['Bijou Components'] } },
      ],
      [
        { time: '09:30', ref: { ids: ['kf08'], names: ['Oliver Glass'] } },
        { time: '13:00', ref: { ids: ['ks02'], names: ['Small antik shop in Držkov'] } },
      ],
      [
        { time: '09:30', ref: { ids: ['kf12'], names: ['Button factory'] } },
        { time: '11:30', ref: { ids: ['ke03'], names: ['Koralex bead press house', 'Koralex'] } },
        { time: '14:00', ref: { ids: ['ks06'], names: ['Křišťálový ráj'] } },
      ],
    ],
  };

  var AIRPORT = 'Václav Havel Airport Prague (PRG), Aviatická, 161 00 Prague 6, Czech Republic';

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function keyOf(value) {
    return text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function minutes(value) {
    var match = /^(\d{1,2}):(\d{2})/.exec(text(value));
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function format(mins) {
    var hour = Math.floor(mins / 60);
    var minute = mins % 60;
    return (hour < 10 ? '0' : '') + hour + ':' + (minute < 10 ? '0' : '') + minute;
  }

  function addMinutes(hhmm, extra) {
    var at = minutes(hhmm);
    if (at == null) at = 8 * 60;
    return format(at + extra);
  }

  function nextId() {
    return 's_' + Math.random().toString(36).slice(2, 9);
  }

  function placeId(place) {
    return text(place && (place.client_id || place.id));
  }

  function findPlace(places, ref) {
    var list = places || [];
    var ids = ref && ref.ids || [];
    var names = ref && ref.names || [];
    var i;
    for (i = 0; i < ids.length; i += 1) {
      var hit = list.find(function (place) { return placeId(place) === String(ids[i]); });
      if (hit) return hit;
    }
    for (i = 0; i < names.length; i += 1) {
      var want = keyOf(names[i]);
      var named = list.find(function (place) {
        return keyOf(place.name) === want || keyOf(place.nickname) === want || keyOf(place.name).indexOf(want) >= 0;
      });
      if (named) return named;
    }
    return null;
  }

  function isHandover(stop) {
    if (!stop) return false;
    var type = text(stop.type);
    return type === 'handover' || type === 'pickup' || type === 'travel' || stop.handoverKind === 'dropoff' || stop.handoverKind === 'pickup';
  }

  function busyDays(plan) {
    var found = [];
    (plan && plan.days || []).forEach(function (day, index) {
      var count = (day && day.blocks || []).filter(function (stop) { return stop && !isHandover(stop); }).length;
      if (count >= 2) found.push(index + 1);
    });
    return found;
  }

  function hasEnds(plan) {
    var found = false;
    (plan && plan.days || []).forEach(function (day) {
      (day && day.blocks || []).forEach(function (stop) {
        if (!stop) return;
        if (stop.autoStop === 'prague-pickup' || stop.autoStop === 'prague-dropoff' || stop.autoStop === 'airport-dropoff') found = true;
        if (Array.isArray(stop.praguePickups) && stop.praguePickups.length) found = true;
      });
    });
    return found;
  }

  function slotTime(time) {
    var at = minutes(time);
    if (at == null) return null;
    if (at < 9 * 60 + 15) at = 9 * 60 + 15;
    if (at > 16 * 60) return null;
    return format(at);
  }

  function stopFromPlace(place, time) {
    return {
      id: nextId(),
      time: time,
      timeApprox: false,
      type: place.type || place.place_type || 'other',
      title: place.name || 'Place',
      notes: 'Rough draft — edit times and stops as you like.',
      address: text(place.address),
      placeId: placeId(place),
    };
  }

  function sortDay(day) {
    day.blocks.sort(function (a, b) {
      return (minutes(a && a.time) == null ? 9999 : minutes(a.time)) - (minutes(b && b.time) == null ? 9999 : minutes(b.time));
    });
  }

  function apply(plan, places, opts) {
    var options = opts || {};
    var days = plan && plan.days || [];
    var used = {};
    var filled = 0;
    var skipped = 0;
    days.forEach(function (day, index) {
      if (!day || typeof day !== 'object') return;
      if (!Array.isArray(day.blocks)) day.blocks = [];
      var count = day.blocks.filter(function (stop) { return stop && !isHandover(stop); }).length;
      if (count >= 2 && !options.replaceBusy) {
        skipped += 1;
        day.blocks.forEach(function (stop) {
          if (stop && stop.placeId) used[String(stop.placeId)] = true;
        });
        return;
      }
      var kept = day.blocks.filter(isHandover);
      var slots = index === 0 ? SLOTS.day1 : SLOTS.later[(index - 1) % SLOTS.later.length];
      var added = [];
      (slots || []).forEach(function (slot) {
        var when = slotTime(slot.time);
        if (!when) return;
        var place = findPlace(places, slot.ref);
        if (!place) return;
        var id = placeId(place);
        if (used[id]) return;
        used[id] = true;
        added.push(stopFromPlace(place, when));
      });
      day.blocks = kept.concat(added);
      sortDay(day);
      filled += 1;
    });
    return { filled: filled, skipped: skipped };
  }

  function stayRow(row) {
    return {
      hotel: text(row && (row.hotel || row.name)),
      check_in: text(row && (row.check_in || row.checkIn)).slice(0, 10),
      check_out: text(row && (row.check_out || row.checkOut)).slice(0, 10),
    };
  }

  function coversNight(stay, night) {
    if (!stay || !night || !stay.hotel) return false;
    if (!stay.check_in && !stay.check_out) return false;
    if (stay.check_in && stay.check_in > night) return false;
    if (stay.check_out && stay.check_out <= night) return false;
    return true;
  }

  function shiftDay(iso, delta) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(iso));
    if (!match) return '';
    var dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    dt.setUTCDate(dt.getUTCDate() + delta);
    return dt.toISOString().slice(0, 10);
  }

  function hotelBefore(person, arrival) {
    var night = shiftDay(arrival, -1);
    var stays = (person && person.prague_stays || []).map(stayRow).filter(function (stay) { return stay.hotel; });
    var covering = stays.filter(function (stay) { return coversNight(stay, night); });
    if (covering.length) return covering[0].hotel;
    var undated = stays.filter(function (stay) { return !stay.check_in && !stay.check_out; });
    return undated.length ? undated[0].hotel : '';
  }

  function hotelAfter(person, departure) {
    var stays = (person && person.prague_stays || []).map(stayRow).filter(function (stay) { return stay.hotel; });
    var covering = stays.filter(function (stay) { return coversNight(stay, departure); });
    if (covering.length) return covering[covering.length - 1].hotel;
    var starting = stays.filter(function (stay) { return stay.check_in === departure; });
    if (starting.length) return starting[starting.length - 1].hotel;
    var undated = stays.filter(function (stay) { return !stay.check_in && !stay.check_out; });
    return undated.length ? undated[undated.length - 1].hotel : '';
  }

  function personName(person) {
    return text(person && (person.name || [person.first_name, person.last_name].filter(Boolean).join(' ')));
  }

  function groupsFor(people, kind, dayIso) {
    var groups = [];
    (people || []).forEach(function (person) {
      var hotel = kind === 'dropoff' ? hotelAfter(person, dayIso) : hotelBefore(person, dayIso);
      var name = text(hotel);
      if (!name) return;
      var key = keyOf(name);
      var group = groups.find(function (row) { return row.key === key; });
      if (!group) {
        group = { key: key, hotel: name, guests: [] };
        groups.push(group);
      }
      var who = personName(person);
      if (who && group.guests.indexOf(who) < 0) group.guests.push(who);
    });
    return groups;
  }

  function guestLeavesThatDay(person, dayIso) {
    var date = text(person && person.departure_date).slice(0, 10);
    return !!date && date === dayIso;
  }

  function addEnds(plan, people) {
    var days = plan && plan.days || [];
    if (!days.length) return { pickups: 0, dropoffs: 0 };
    var first = days[0];
    var last = days[days.length - 1];
    var arrival = text(plan.arrivalDate || (first && first.date)).slice(0, 10);
    var departure = text(plan.departureDate || (last && last.date)).slice(0, 10);
    if (!Array.isArray(first.blocks)) first.blocks = [];
    if (!Array.isArray(last.blocks)) last.blocks = [];
    first.blocks = first.blocks.filter(function (stop) {
      if (!stop) return false;
      if (Array.isArray(stop.praguePickups) && stop.praguePickups.length && stop.handoverKind !== 'dropoff') return false;
      return stop.autoStop !== 'prague-pickup';
    });
    last.blocks = last.blocks.filter(function (stop) {
      if (!stop) return false;
      return stop.autoStop !== 'prague-dropoff' && stop.autoStop !== 'airport-dropoff';
    });
    var pickups = groupsFor(people, 'pickup', arrival);
    var dropoffs = [];
    var airportGuests = [];
    (people || []).forEach(function (person) {
      if (guestLeavesThatDay(person, departure)) {
        var who = personName(person);
        if (who) airportGuests.push(who);
        return;
      }
      var hotel = hotelAfter(person, departure);
      if (!hotel) return;
      var key = keyOf(hotel);
      var group = dropoffs.find(function (row) { return row.key === key; });
      if (!group) {
        group = { key: key, hotel: hotel, guests: [] };
        dropoffs.push(group);
      }
      var name = personName(person);
      if (name && group.guests.indexOf(name) < 0) group.guests.push(name);
    });
    if (pickups.length) {
      var rows = pickups.map(function (group, index) {
        return {
          hotel: group.hotel,
          time: addMinutes('08:00', index * 5),
          address: '',
          guests: group.guests.join(' and '),
        };
      });
      var schedule = rows.map(function (row) {
        return row.time + ' ' + row.hotel + (row.guests ? (' · ' + row.guests) : '');
      }).join(' · ');
      first.blocks.unshift({
        id: nextId(),
        type: 'handover',
        handoverKind: 'pickup',
        placeKind: 'hotel',
        autoStop: 'prague-pickup',
        time: '08:00',
        hotelName: rows[0].hotel,
        address: rows[0].hotel,
        title: 'Pick-up · ' + schedule,
        praguePickups: rows,
      });
      sortDay(first);
    }
    dropoffs.forEach(function (group) {
      var who = group.guests.join(' and ');
      last.blocks.push({
        id: nextId(),
        type: 'handover',
        handoverKind: 'dropoff',
        placeKind: 'hotel',
        autoStop: 'prague-dropoff',
        time: '18:00',
        hotelName: group.hotel,
        address: group.hotel,
        title: 'Drop-off · 18:00 ' + group.hotel + (who ? (' – ' + who) : ''),
      });
    });
    if (airportGuests.length) {
      last.blocks.push({
        id: nextId(),
        type: 'handover',
        handoverKind: 'dropoff',
        placeKind: 'airport',
        autoStop: 'airport-dropoff',
        time: '18:00',
        hotelName: '',
        address: AIRPORT,
        title: 'Drop-off · ' + AIRPORT + (airportGuests.length ? (' – ' + airportGuests.join(' and ')) : ''),
      });
    }
    if (dropoffs.length || airportGuests.length) sortDay(last);
    return { pickups: pickups.length, dropoffs: dropoffs.length + (airportGuests.length ? 1 : 0) };
  }

  root.RoughWeek = {
    SLOTS: SLOTS,
    AIRPORT: AIRPORT,
    busyDays: busyDays,
    hasEnds: hasEnds,
    apply: apply,
    addEnds: addEnds,
    hotelBefore: hotelBefore,
    hotelAfter: hotelAfter,
    slotTime: slotTime,
  };
}(typeof window !== 'undefined' ? window : globalThis));
