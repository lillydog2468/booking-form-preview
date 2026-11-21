/*
 * Read-only booking summary for whichever tour is open.
 * Booking 310 is the sample. Nothing here writes.
 * Sample mode (?preview=mock) may be edited in memory. Nothing here writes.
 */
(function (root) {
  'use strict';

  var BOOKING_ID = 310;
  var GROUP_NAME = 'Jennifer Lindsay';
  var PHONE_MAX = 760;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var TONES = [
    { bg: '#fbf3e4', border: '#e0b56a', ink: '#5c3d12' },
    { bg: '#e7f2fb', border: '#7eb0d6', ink: '#1a3d5c' },
    { bg: '#f3eefb', border: '#b59ad6', ink: '#3d2a5c' },
    { bg: '#e8f6f2', border: '#7eb8a8', ink: '#164838' },
    { bg: '#fbeee8', border: '#e0a08a', ink: '#6a3220' },
    { bg: '#e8f0ff', border: '#8aade0', ink: '#1c3a6e' },
  ];

  function bookingNumber(id) {
    var text = String(id == null ? '' : id).trim();
    if (!/^\d+$/.test(text)) return null;
    var n = Number(text);
    return n > 0 ? n : null;
  }

  function isAllowedBooking(id) {
    return bookingNumber(id) != null;
  }

  function usesPhoneLayout(width) {
    var n = Number(width);
    return Number.isFinite(n) && n <= PHONE_MAX;
  }

  function isoDate(value) {
    var match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value || '').trim());
    return match ? match[1] : '';
  }

  function utcDate(iso) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate(iso));
    if (!match) return null;
    var dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (dt.getUTCFullYear() !== Number(match[1]) || dt.getUTCMonth() !== Number(match[2]) - 1) return null;
    return dt;
  }

  function nightsBetween(arrival, departure) {
    var start = utcDate(arrival);
    var end = utcDate(departure);
    if (!start || !end) return null;
    return Math.round((end.getTime() - start.getTime()) / 86400000);
  }

  function nightCount(value) {
    var match = /^(\d+)/.exec(String(value == null ? '' : value).trim());
    if (!match) return null;
    var n = Number(match[1]);
    return Number.isFinite(n) ? n : null;
  }

  function stayRanges(arrival, departure, nightsList) {
    var list = Array.isArray(nightsList) ? nightsList : [];
    var start = utcDate(arrival);
    if (!start) return list.map(function () { return null; });
    var cursor = start.getTime();
    var endLimit = utcDate(departure);
    var departMs = endLimit ? endLimit.getTime() : NaN;
    var blocked = false;
    return list.map(function (nights, index) {
      if (blocked) return null;
      var known = typeof nights === 'number' && Number.isFinite(nights) && nights >= 0;
      if (known) {
        var from = new Date(cursor);
        var to = new Date(cursor + nights * 86400000);
        cursor = to.getTime();
        return { start: from, end: to };
      }
      var last = index === list.length - 1;
      if ((list.length === 1 || last) && Number.isFinite(departMs) && departMs >= cursor) {
        var open = new Date(cursor);
        var close = new Date(departMs);
        cursor = departMs;
        return { start: open, end: close };
      }
      blocked = true;
      return null;
    });
  }

  function formatStay(range) {
    if (!range || !range.start || !range.end) return '';
    var a = range.start;
    var b = range.end;
    var day = function (d) { return String(d.getUTCDate()); };
    var mon = function (d) { return MONTHS[d.getUTCMonth()]; };
    if (a.getTime() === b.getTime()) return day(a) + ' ' + mon(a);
    if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()) {
      return day(a) + '–' + day(b) + ' ' + mon(a);
    }
    return day(a) + ' ' + mon(a) + ' – ' + day(b) + ' ' + mon(b);
  }

  function todayIso(now) {
    var date = now instanceof Date ? now : new Date();
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1);
    var d = String(date.getDate());
    if (m.length < 2) m = '0' + m;
    if (d.length < 2) d = '0' + d;
    return y + '-' + m + '-' + d;
  }

  function isCancelledStatus(status) {
    var text = String(status || '').trim().toLowerCase();
    return text === 'cancelled' || text === 'canceled';
  }

  function endIso(row) {
    return isoDate(row && row.departure_date) || isoDate(row && row.tour_arrival_date);
  }

  function startIso(row) {
    return isoDate(row && row.tour_arrival_date) || isoDate(row && row.departure_date);
  }

  function isUpcoming(row, today) {
    if (!row || bookingNumber(row.id) == null) return false;
    if (isCancelledStatus(row.status)) return false;
    var end = endIso(row);
    var day = isoDate(today);
    if (!end || !day) return false;
    return end >= day;
  }

  function upcomingBookings(rows, today) {
    return (Array.isArray(rows) ? rows : []).filter(function (row) {
      return isUpcoming(row, today);
    }).sort(function (a, b) {
      var startA = startIso(a);
      var startB = startIso(b);
      if (startA !== startB) return startA < startB ? -1 : 1;
      var endA = endIso(a);
      var endB = endIso(b);
      if (endA !== endB) return endA < endB ? -1 : 1;
      return bookingNumber(a.id) - bookingNumber(b.id);
    });
  }

  function choosePlanningBooking(rows, preferredId, today) {
    var upcoming = upcomingBookings(rows, today);
    var preferred = bookingNumber(preferredId);
    var kept = upcoming.find(function (row) { return bookingNumber(row.id) === preferred; });
    if (kept) return bookingNumber(kept.id);
    if (!upcoming.length) return null;
    return bookingNumber(upcoming[0].id);
  }

  function formatTourDates(arrival, departure) {
    var start = utcDate(arrival);
    var end = utcDate(departure);
    var one = function (date) {
      return date.getUTCDate() + ' ' + MONTHS[date.getUTCMonth()] + ' ' + date.getUTCFullYear();
    };
    if (start && end) {
      var sameMonth = start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();
      if (sameMonth && start.getUTCDate() === end.getUTCDate()) return one(start);
      if (sameMonth) {
        return start.getUTCDate() + '–' + end.getUTCDate() + ' ' + MONTHS[start.getUTCMonth()] + ' ' + start.getUTCFullYear();
      }
      if (start.getUTCFullYear() === end.getUTCFullYear()) {
        return start.getUTCDate() + ' ' + MONTHS[start.getUTCMonth()] + ' – '
          + end.getUTCDate() + ' ' + MONTHS[end.getUTCMonth()] + ' ' + start.getUTCFullYear();
      }
      return one(start) + ' – ' + one(end);
    }
    if (start || end) return one(start || end);
    return '';
  }

  function headcountLabel(value) {
    var text = String(value == null ? '' : value).trim();
    if (!text) return '';
    var n = Number(text);
    if (!Number.isFinite(n)) return text;
    return n + (n === 1 ? ' person' : ' people');
  }

  function groupLabel(row) {
    var id = bookingNumber(row && row.id);
    var name = String(row && row.group_name || '').trim();
    return name || (id ? ('Booking ' + id) : 'Group');
  }

  function describeUpcoming(rows, today) {
    return upcomingBookings(rows, today).map(function (row) {
      var dates = formatTourDates(row.tour_arrival_date, row.departure_date);
      var headcount = headcountLabel(row.no_people);
      return {
        id: bookingNumber(row.id),
        name: groupLabel(row),
        dates: dates,
        headcount: headcount,
        meta: [dates, headcount].filter(Boolean).join(' · '),
      };
    });
  }

  function planningTarget(search) {
    var text = String(search || '');
    if (/(?:\?|&|^)preview=mock(?:&|$)/.test(text)) return { mode: 'sample' };
    var params = new URLSearchParams(text.charAt(0) === '?' ? text : ('?' + text));
    var raw = params.get('booking');
    if (params.get('home') === '1') return { mode: 'resolve' };
    if (raw && bookingNumber(raw) == null) return { mode: 'refused' };
    var named = bookingNumber(raw);
    if (named) return { mode: 'booking', id: named };
    return { mode: 'resolve' };
  }

  function money(value) {
    if (value == null || String(value).trim() === '') return '';
    var n = Number(value);
    if (!Number.isFinite(n)) return '';
    return '£' + n.toFixed(2);
  }

  function guestName(member) {
    return [member && member.first_name, member && member.last_name].map(function (part) {
      return String(part || '').trim();
    }).filter(Boolean).join(' ');
  }

  function clock(value) {
    var match = /^(\d{1,2}):(\d{2})/.exec(String(value || '').trim());
    if (!match) return '';
    var hour = String(Number(match[1]));
    if (hour.length < 2) hour = '0' + hour;
    return hour + ':' + match[2];
  }

  function present(input) {
    var src = input || {};
    var booking = src.booking || {};
    var sample = !!src.sample;
    var id = bookingNumber(booking.id);
    if (!sample && id == null) {
      return { refused: true, readOnly: true, id: null, groupName: GROUP_NAME };
    }
    var arrival = isoDate(booking.tour_arrival_date || booking.arrivalDate);
    var departure = isoDate(booking.departure_date || booking.departureDate);
    var primaryName = (booking.hotels && booking.hotels.name) || booking.hotel_name || '';
    var stays = [];
    if (primaryName) stays.push({ name: primaryName, nights: nightCount(booking.other_hotel_nights), price: booking.hotel_price, paid: booking.main_hotel_paid || '' });
    (src.hotels || []).forEach(function (row) {
      if (!row) return;
      var name = (row.hotels && row.hotels.name) || row.custom_hotel_name || row.name || '';
      if (!name) return;
      stays.push({ name: name, nights: nightCount(row.nights), price: row.price, paid: row.paid || '' });
    });
    var ranges = stayRanges(arrival, departure, stays.map(function (stay) { return stay.nights; }));
    stays.forEach(function (stay, index) {
      stay.strip = formatStay(ranges[index]);
      stay.tone = TONES[index % TONES.length];
    });
    var guests = (src.members || []).map(function (member, index) {
      var prague = member && member.prague_stays;
      if (typeof prague === 'string') {
        try { prague = JSON.parse(prague); } catch (_) { prague = []; }
      }
      return {
        id: member && member.id != null ? member.id : index,
        name: guestName(member) || 'Guest',
        deposit: member && member.deposit,
        depositDate: isoDate(member && member.deposit_date),
        finalPayment: member && (member.final_payment != null ? member.final_payment : member.finalPayment),
        arrivalFlight: (member && member.arrival_flight) || '',
        arrivalDate: isoDate(member && member.arrival_date),
        arrivalTime: clock(member && member.arrival_time),
        departureFlight: (member && member.departure_flight) || '',
        departureDate: isoDate(member && member.departure_date),
        departureTime: clock(member && member.departure_time),
        flightNote: (member && member.flight_note) || '',
        prague: Array.isArray(prague) ? prague : [],
      };
    }).filter(function (guest) { return guest.name; });
    var flights = (src.flights || []).map(function (flight) {
      return {
        number: (flight && flight.flight_number) || '',
        arrivalDate: isoDate(flight && flight.arrival_date),
        arrivalTime: clock(flight && flight.arrival_time),
        departureDate: isoDate(flight && flight.departure_date),
        departureTime: clock(flight && flight.departure_time),
        comments: (flight && flight.comments) || '',
      };
    }).filter(function (flight) {
      return flight.number || flight.arrivalDate || flight.departureDate || flight.comments;
    });
    var extras = src.extras || {};
    var organiser = src.organiser || '';
    var rooms = (extras.rooms) || src.rooms || {};
    return {
      refused: false,
      readOnly: !sample,
      sample: sample,
      id: id || BOOKING_ID,
      groupName: booking.group_name || GROUP_NAME,
      organiser: organiser,
      arrival: arrival,
      departure: departure,
      nights: nightsBetween(arrival, departure),
      status: String(booking.status || '').trim() || 'Booked',
      headcount: booking.no_people == null ? '' : String(booking.no_people),
      guests: guests,
      flights: flights,
      hotels: stays,
      rooms: {
        singles: rooms.singles || '',
        twins: rooms.twins || '',
        doubles: rooms.doubles || '',
        keithRoom: rooms.keithRoom,
      },
      money: {
        price: money(booking.price_per_person),
        total: money(booking.beading_tour_price),
        deposit: money(booking.depositmade),
        depositDate: isoDate(booking.deposit_paid_date),
        finalPayment: money(booking.finalpayment),
        left: money(booking.left_to_pay),
      },
      notes: src.notes == null ? String(booking.extra_notes || '') : String(src.notes),
    };
  }

  function sample() {
    return present({
      sample: true,
      organiser: 'Jennifer Lindsay',
      notes: 'Sample only. Nothing is saved.',
      rooms: { singles: '2', twins: '3', doubles: '0', keithRoom: true },
      booking: {
        id: 310,
        group_name: 'Jennifer Lindsay',
        no_people: '8',
        status: '',
        tour_arrival_date: '2027-05-10',
        departure_date: '2027-05-16',
        price_per_person: 1895,
        beading_tour_price: 15160,
        depositmade: 1600,
        deposit_paid_date: '2026-11-02',
        finalpayment: 0,
        left_to_pay: 13560,
        hotel_name: 'Hotel Axa',
        other_hotel_nights: '1',
      },
      hotels: [
        { custom_hotel_name: 'Park Hotel', nights: '5' },
      ],
      members: [
        { id: 1, first_name: 'Jennifer', last_name: 'Lindsay', deposit: 200, deposit_date: '2026-11-02', arrival_flight: 'BA854', arrival_date: '2027-05-10', arrival_time: '11:20', departure_flight: 'BA855', departure_date: '2027-05-16', departure_time: '13:05', prague_stays: [{ hotel: 'Hotel Axa', check_in: '2027-05-09', check_out: '2027-05-10' }] },
        { id: 2, first_name: 'Gail', last_name: 'DeLuca', deposit: 200, arrival_flight: 'BA854', arrival_date: '2027-05-10', arrival_time: '11:20', departure_flight: 'BA855', departure_date: '2027-05-16', departure_time: '13:05' },
        { id: 3, first_name: 'Kay', last_name: 'Enk', deposit: 200, arrival_flight: 'OK654', arrival_date: '2027-05-10', arrival_time: '14:40' },
        { id: 4, first_name: 'Maggie', last_name: 'Cox', deposit: 200 },
      ],
      flights: [
        { flight_number: 'BA854', arrival_date: '2027-05-10', arrival_time: '11:20', comments: 'Most of the group' },
      ],
    });
  }

  root.Booking2 = {
    BOOKING_ID: BOOKING_ID,
    GROUP_NAME: GROUP_NAME,
    PHONE_MAX: PHONE_MAX,
    bookingNumber: bookingNumber,
    isAllowedBooking: isAllowedBooking,
    usesPhoneLayout: usesPhoneLayout,
    nightsBetween: nightsBetween,
    stayRanges: stayRanges,
    formatStay: formatStay,
    money: money,
    present: present,
    sample: sample,
    todayIso: todayIso,
    isCancelledStatus: isCancelledStatus,
    upcomingBookings: upcomingBookings,
    choosePlanningBooking: choosePlanningBooking,
    formatTourDates: formatTourDates,
    headcountLabel: headcountLabel,
    groupLabel: groupLabel,
    describeUpcoming: describeUpcoming,
    planningTarget: planningTarget,
  };
}(typeof window !== 'undefined' ? window : globalThis));
