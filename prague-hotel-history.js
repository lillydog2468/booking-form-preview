/*
 * Prague hotel history from members.prague_stays, joined to bookings.
 * Read-only grouping, plus Keith's ratings on hotels he has used.
 * Cancelled bookings are left out. Nothing here is for guests to fill in.
 */
(function (root) {
  'use strict';

  var TOP = 5;
  var STYLE_ID = 'prague-hotel-history-style';
  var SKIP = {
    'day trip': true,
    'still to be decided': true,
    'still not booked': true,
    'just for me': true,
  };

  function fold(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Case-insensitive, the word "hotel" removed, trimmed, spaces collapsed. */
  function hotelKey(name) {
    return fold(name).replace(/\bhotel\b/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function knownSignature(name) {
    if (!root.PragueExit || typeof PragueExit.coordFor !== 'function') return '';
    var coord = PragueExit.coordFor(String(name || ''));
    if (!coord || !isFinite(coord.lat) || !isFinite(coord.lng)) return '';
    return Number(coord.lat).toFixed(5) + ',' + Number(coord.lng).toFixed(5);
  }

  function isPlaceholder(name) {
    var n = fold(name);
    if (!n) return true;
    if (SKIP[n]) return true;
    if (n.indexOf('name not in notes') !== -1) return true;
    if (n.indexOf('not named') !== -1) return true;
    return false;
  }

  function usableName(name) {
    if (isPlaceholder(name)) return false;
    return !!(hotelKey(name) || knownSignature(name));
  }

  function isHotelPlace(place) {
    if (!place) return false;
    if (String(place.place_type || place.placeType || '').toLowerCase() === 'hotel') return true;
    var list = place.place_types || place.placeTypes || place.types;
    if (!Array.isArray(list)) return false;
    return list.some(function (item) { return String(item || '').toLowerCase() === 'hotel'; });
  }

  function isoDay(value) {
    var s = String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  }

  function nightsBetween(checkIn, checkOut) {
    var a = isoDay(checkIn);
    var b = isoDay(checkOut);
    if (!a || !b) return 0;
    var start = Date.parse(a + 'T00:00:00Z');
    var end = Date.parse(b + 'T00:00:00Z');
    if (!isFinite(start) || !isFinite(end) || end < start) return 0;
    var nights = Math.round((end - start) / 86400000);
    if (nights > 60) return 0;
    return nights;
  }

  function formatDMY(iso) {
    if (root.BookingFormat && typeof BookingFormat.formatDateDMY === 'function') {
      var shown = BookingFormat.formatDateDMY(iso);
      if (shown) return shown;
    }
    var day = isoDay(iso);
    if (!day) return '';
    return day.slice(8, 10) + '/' + day.slice(5, 7) + '/' + day.slice(0, 4);
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function personName(member) {
    var row = member || {};
    return [row.first_name || row.firstName, row.last_name || row.lastName]
      .map(function (part) { return String(part || '').trim(); })
      .filter(Boolean)
      .join(' ');
  }

  function cancelled(booking) {
    return String(booking && booking.status || '').trim().toLowerCase() === 'cancelled';
  }

  function stayRows(members, bookings) {
    var byId = new Map();
    (bookings || []).forEach(function (booking) {
      if (booking && booking.id != null) byId.set(String(booking.id), booking);
    });
    var rows = [];
    (members || []).forEach(function (member) {
      if (!member) return;
      var booking = byId.get(String(member.booking_id != null ? member.booking_id : member.bookingId));
      if (booking && cancelled(booking)) return;
      var stays = member.prague_stays || member.pragueStays;
      if (typeof stays === 'string') {
        try { stays = JSON.parse(stays); } catch (err) { stays = []; }
      }
      if (!Array.isArray(stays)) return;
      stays.forEach(function (stay, index) {
        var hotel = String((stay && (stay.hotel || stay.hotelName)) || '').trim();
        if (!usableName(hotel)) return;
        var checkIn = isoDay(stay && (stay.check_in || stay.checkIn));
        var checkOut = isoDay(stay && (stay.check_out || stay.checkOut));
        var guest = personName(member);
        var memberId = member.id != null && member.id !== '' ? member.id : null;
        var bookingId = booking ? booking.id : (member.booking_id != null ? member.booking_id : member.bookingId);
        var guestKey = memberId != null
          ? 'm:' + memberId
          : (guest ? 'n:' + bookingId + ':' + guest.toLowerCase() : 'row:' + bookingId + ':' + index + ':' + hotelKey(hotel));
        rows.push({
          hotel: hotel,
          checkIn: checkIn,
          checkOut: checkOut,
          note: String((stay && stay.note) || '').trim(),
          nights: nightsBetween(checkIn, checkOut),
          memberId: memberId,
          guestKey: guestKey,
          guestName: guest || 'Guest',
          bookingId: bookingId,
          groupName: booking ? String(booking.group_name || booking.groupName || '').trim() : '',
          tourDate: booking ? isoDay(booking.tour_arrival_date || booking.tourArrivalDate) : '',
        });
      });
    });
    return rows;
  }

  function makeNodes() {
    var nodes = [];
    function make() {
      var id = nodes.length;
      nodes.push(id);
      return id;
    }
    function find(id) {
      var p = id;
      while (nodes[p] !== p) p = nodes[p];
      var x = id;
      while (nodes[x] !== p) {
        var next = nodes[x];
        nodes[x] = p;
        x = next;
      }
      return p;
    }
    function union(a, b) {
      var pa = find(a);
      var pb = find(b);
      if (pa !== pb) nodes[pb] = pa;
    }
    return { make: make, find: find, union: union };
  }

  function choosePlace(places) {
    var list = (places || []).slice().sort(function (a, b) {
      var aa = String(a.address || '').trim() ? 0 : 1;
      var bb = String(b.address || '').trim() ? 0 : 1;
      if (aa !== bb) return aa - bb;
      return Number(a.id || 0) - Number(b.id || 0);
    });
    return list[0] || null;
  }

  function chooseDisplayName(stays, place) {
    if (place && String(place.name || '').trim()) return String(place.name).trim();
    var counts = new Map();
    (stays || []).forEach(function (stay) {
      var raw = String(stay.hotel || '').trim();
      if (!raw) return;
      counts.set(raw, (counts.get(raw) || 0) + 1);
    });
    var best = '';
    var bestN = -1;
    counts.forEach(function (count, raw) {
      if (count > bestN || (count === bestN && raw.length > best.length)) {
        best = raw;
        bestN = count;
      }
    });
    return best;
  }

  function laterDate(a, b) {
    if (!a) return b || '';
    if (!b) return a;
    return a > b ? a : b;
  }

  function buildHistory(members, bookings, places) {
    var stays = stayRows(members, bookings);
    var sets = makeNodes();
    var keyOwner = new Map();
    var knownOwner = new Map();
    function absorb(id, raw) {
      var key = hotelKey(raw);
      var known = knownSignature(raw);
      if (key) {
        if (keyOwner.has(key)) sets.union(id, keyOwner.get(key));
        else keyOwner.set(key, id);
      }
      if (known) {
        if (knownOwner.has(known)) sets.union(id, knownOwner.get(known));
        else knownOwner.set(known, id);
      }
    }

    var placeNodes = [];
    (places || []).filter(isHotelPlace).forEach(function (place) {
      var id = sets.make();
      placeNodes.push({ id: id, place: place });
      absorb(id, place.name);
      if (String(place.nickname || '').trim()) absorb(id, place.nickname);
    });
    var stayNodes = [];
    stays.forEach(function (stay) {
      var id = sets.make();
      stayNodes.push({ id: id, stay: stay });
      absorb(id, stay.hotel);
    });

    var groups = new Map();
    stayNodes.forEach(function (item) {
      var id = sets.find(item.id);
      if (!groups.has(id)) groups.set(id, { stays: [], places: [] });
      groups.get(id).stays.push(item.stay);
    });
    placeNodes.forEach(function (item) {
      var id = sets.find(item.id);
      if (!groups.has(id)) return;
      groups.get(id).places.push(item.place);
    });

    var hotels = [];
    groups.forEach(function (group) {
      var place = choosePlace(group.places);
      var name = chooseDisplayName(group.stays, place);
      if (!name) return;
      var guests = new Set();
      var tours = new Map();
      var spanSeen = new Set();
      var nights = 0;
      var last = '';
      var aliases = new Map();
      group.stays.forEach(function (stay) {
        guests.add(stay.guestKey);
        var raw = String(stay.hotel || '').trim();
        if (raw && fold(raw) !== fold(name)) aliases.set(fold(raw), raw);
        var end = stay.checkOut || stay.checkIn || stay.tourDate;
        last = laterDate(last, end);
        var span = String(stay.bookingId) + '|' + stay.checkIn + '|' + stay.checkOut;
        if (!spanSeen.has(span)) {
          spanSeen.add(span);
          nights += stay.nights;
        }
        var tourKey = String(stay.bookingId == null ? stay.groupName : stay.bookingId);
        if (!tours.has(tourKey)) {
          tours.set(tourKey, {
            bookingId: stay.bookingId,
            groupName: stay.groupName || (stay.bookingId != null ? 'Booking ' + stay.bookingId : 'Prague stay'),
            tourDate: stay.tourDate,
            spans: new Map(),
          });
        }
        var tour = tours.get(tourKey);
        if (stay.tourDate && !tour.tourDate) tour.tourDate = stay.tourDate;
        var spanKey = stay.checkIn + '|' + stay.checkOut;
        if (!tour.spans.has(spanKey)) {
          tour.spans.set(spanKey, {
            checkIn: stay.checkIn,
            checkOut: stay.checkOut,
            guests: [],
            guestIds: [],
            notes: [],
          });
        }
        var spanRow = tour.spans.get(spanKey);
        if (spanRow.guests.indexOf(stay.guestName) === -1) spanRow.guests.push(stay.guestName);
        if (stay.memberId != null && !spanRow.guestIds.some(function (guest) { return String(guest.id) === String(stay.memberId); })) {
          spanRow.guestIds.push({ id: stay.memberId, name: stay.guestName });
        }
        if (stay.note && spanRow.notes.indexOf(stay.note) === -1) spanRow.notes.push(stay.note);
      });
      var tourList = Array.from(tours.values()).map(function (tour) {
        var spans = Array.from(tour.spans.values());
        spans.sort(function (a, b) { return String(b.checkIn || b.checkOut).localeCompare(String(a.checkIn || a.checkOut)); });
        return {
          bookingId: tour.bookingId,
          groupName: tour.groupName,
          tourDate: tour.tourDate,
          spans: spans,
          guests: spans.reduce(function (all, span) {
            span.guests.forEach(function (guest) { if (all.indexOf(guest) === -1) all.push(guest); });
            return all;
          }, []),
        };
      });
      tourList.sort(function (a, b) {
        var da = a.tourDate || (a.spans[0] && (a.spans[0].checkIn || a.spans[0].checkOut)) || '';
        var db = b.tourDate || (b.spans[0] && (b.spans[0].checkIn || b.spans[0].checkOut)) || '';
        if (da !== db) return da < db ? 1 : -1;
        return String(a.groupName).localeCompare(String(b.groupName));
      });
      hotels.push({
        key: hotelKey(name) || knownSignature(name) || fold(name),
        name: name,
        aliases: Array.from(aliases.values()),
        placeId: place && place.id != null ? place.id : null,
        address: place ? String(place.address || '').trim() : '',
        guestCount: guests.size,
        tourCount: tourList.length,
        nights: nights,
        lastStayed: last,
        tours: tourList,
        ratings: [],
      });
    });
    hotels.sort(function (a, b) {
      if (b.guestCount !== a.guestCount) return b.guestCount - a.guestCount;
      if (b.tourCount !== a.tourCount) return b.tourCount - a.tourCount;
      return String(a.name).localeCompare(String(b.name));
    });
    return hotels;
  }

  function namesMatch(ratingName, hotel) {
    if (!ratingName || !hotel) return false;
    var left = hotelKey(ratingName);
    if (left && left === hotelKey(hotel.name)) return true;
    if (left && (hotel.aliases || []).some(function (alias) { return hotelKey(alias) === left; })) return true;
    var known = knownSignature(ratingName);
    if (!known) return false;
    if (knownSignature(hotel.name) === known) return true;
    return (hotel.aliases || []).some(function (alias) { return knownSignature(alias) === known; });
  }

  function attachRatings(hotels, ratings) {
    (hotels || []).forEach(function (hotel) { hotel.ratings = []; });
    var extras = [];
    (ratings || []).forEach(function (rating) {
      if (!rating) return;
      var hotel = (hotels || []).find(function (item) {
        if (rating.place_id != null && item.placeId != null && String(rating.place_id) === String(item.placeId)) return true;
        return namesMatch(rating.hotel_name, item);
      });
      if (hotel) {
        hotel.ratings.push(rating);
        return;
      }
      var name = String(rating.hotel_name || '').trim();
      if (!name) return;
      var existing = extras.find(function (item) { return namesMatch(name, item); });
      if (!existing) {
        existing = {
          key: hotelKey(name) || knownSignature(name) || fold(name),
          name: name,
          aliases: [],
          placeId: rating.place_id != null ? rating.place_id : null,
          address: '',
          guestCount: 0,
          tourCount: 0,
          nights: 0,
          lastStayed: '',
          tours: [],
          ratings: [],
        };
        extras.push(existing);
      }
      existing.ratings.push(rating);
    });
    (hotels || []).concat(extras).forEach(function (hotel) {
      hotel.ratings.sort(function (a, b) {
        return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      });
      var sum = hotel.ratings.reduce(function (total, rating) { return total + Number(rating.stars || 0); }, 0);
      hotel.ratingCount = hotel.ratings.length;
      hotel.average = hotel.ratingCount ? sum / hotel.ratingCount : null;
    });
    return { hotels: hotels || [], extras: extras };
  }

  function popularHotels(hotels, limit) {
    var cap = limit == null ? TOP : limit;
    return (hotels || []).filter(function (hotel) { return hotel.ratingCount > 0; }).sort(function (a, b) {
      if (b.average !== a.average) return b.average - a.average;
      if (b.guestCount !== a.guestCount) return b.guestCount - a.guestCount;
      return String(a.name).localeCompare(String(b.name));
    }).slice(0, cap);
  }

  function starLabel(average) {
    if (average == null || !isFinite(average)) return '';
    var rounded = Math.round(average * 10) / 10;
    return (rounded % 1 === 0 ? String(rounded.toFixed(0)) : rounded.toFixed(1)) + (rounded === 1 ? ' star' : ' stars');
  }

  function nightLabel(nights) {
    return nights === 1 ? '1 night' : nights + ' nights';
  }

  function guestLabel(count) {
    return count === 1 ? '1 guest' : count + ' guests';
  }

  function dateSpan(span, tourDate) {
    var start = formatDMY(span && span.checkIn);
    var end = formatDMY(span && span.checkOut);
    if (start && end) return start + ' – ' + end;
    if (start || end) return start || end;
    var tour = formatDMY(tourDate);
    return tour ? 'Tour date ' + tour : 'Dates not recorded';
  }

  function knownMatchHooks(input) {
    var hooks = [];
    if (root.PragueHotelMatch && typeof root.PragueHotelMatch.watch === 'function') hooks.push(function (field) {
      root.PragueHotelMatch.watch(field, { active: true });
    });
    if (typeof root.showKnownHotelMatch === 'function') hooks.push(root.showKnownHotelMatch);
    if (typeof root.noteKnownPragueHotel === 'function') hooks.push(root.noteKnownPragueHotel);
    if (root.PragueHotelMatch && typeof root.PragueHotelMatch.note === 'function') hooks.push(root.PragueHotelMatch.note);
    if (root.PragueHotelMatch && typeof root.PragueHotelMatch.show === 'function') hooks.push(root.PragueHotelMatch.show);
    hooks.forEach(function (fn) {
      try { fn(input); } catch (err) { /* the other page's match line is optional */ }
    });
    return hooks.length;
  }

  function fillHotelInput(input, name) {
    if (!input) return { value: '', events: [] };
    input.value = name;
    ['input', 'change'].forEach(function (type) {
      if (typeof input.dispatchEvent !== 'function') return;
      try {
        var event = typeof Event === 'function' ? new Event(type, { bubbles: true }) : { type: type, bubbles: true };
        input.dispatchEvent(event);
      } catch (err) { /* a test double may not construct events */ }
    });
    knownMatchHooks(input);
    return { value: input.value, events: ['input', 'change'] };
  }

  function suggestionsHtml(hotels) {
    var list = popularHotels(hotels);
    if (!list.length) {
      return '<details class="prague-popular"><summary>Popular with past guests</summary><p class="prague-popular-empty">No ratings yet.</p></details>';
    }
    var chips = list.map(function (hotel) {
      var address = hotel.address ? '<span class="prague-popular-address">' + esc(hotel.address) + '</span>' : '';
      return '<button type="button" class="prague-popular-chip" data-hotel-name="' + esc(hotel.name) + '">'
        + '<span class="prague-popular-name">' + esc(hotel.name) + '</span>'
        + '<span class="prague-popular-meta">' + esc(starLabel(hotel.average)) + ' · ' + esc(guestLabel(hotel.guestCount)) + '</span>'
        + address
        + '</button>';
    }).join('');
    return '<details class="prague-popular"><summary>Popular with past guests</summary><div class="prague-popular-list">' + chips + '</div></details>';
  }

  function latestNotes(hotel) {
    return (hotel.ratings || []).filter(function (rating) { return String(rating.note || '').trim(); }).slice(0, 3);
  }

  function ratingRowHtml(rating) {
    var when = formatDMY(rating.created_at) || '';
    var note = String(rating.note || '').trim();
    return '<li class="ph-rating-row" data-rating-id="' + esc(rating.id) + '">'
      + '<span>' + esc(starLabel(Number(rating.stars))) + (note ? ' — ' + esc(note) : '') + (when ? ' · ' + esc(when) : '') + '</span>'
      + '<span class="ph-rating-actions">'
      + '<button type="button" data-rate-edit="' + esc(rating.id) + '">Edit</button>'
      + '<button type="button" data-rate-delete="' + esc(rating.id) + '">Delete</button>'
      + '</span></li>';
  }

  function tourOptions(hotel, selected) {
    var options = '<option value="">No particular tour</option>';
    (hotel.tours || []).forEach(function (tour) {
      if (tour.bookingId == null || tour.bookingId === '') return;
      var label = tour.groupName;
      var when = formatDMY(tour.tourDate);
      if (when) label += ' · ' + when;
      var value = String(tour.bookingId);
      options += '<option value="' + esc(value) + '"' + (String(selected || '') === value ? ' selected' : '') + '>' + esc(label) + '</option>';
    });
    return options;
  }

  function guestOptions(hotel, bookingId, selected) {
    var options = '<option value="">No particular guest</option>';
    var seen = new Set();
    (hotel.tours || []).forEach(function (tour) {
      if (bookingId && String(tour.bookingId) !== String(bookingId)) return;
      (tour.spans || []).forEach(function (span) {
        (span.guestIds || []).forEach(function (guest, index) {
          var id = guest && guest.id != null ? String(guest.id) : '';
          var name = guest && guest.name ? guest.name : (span.guests[index] || '');
          if (!name || seen.has(id || name)) return;
          seen.add(id || name);
          if (!id) return;
          options += '<option value="' + esc(id) + '"' + (String(selected || '') === id ? ' selected' : '') + '>' + esc(name) + '</option>';
        });
      });
    });
    return options;
  }

  function cardHtml(hotel, editing) {
    var alias = hotel.aliases && hotel.aliases.length
      ? '<p class="ph-alias">Also recorded as ' + esc(hotel.aliases.join(', ')) + '</p>'
      : '';
    var address = hotel.address ? '<p class="ph-address">' + esc(hotel.address) + '</p>' : '';
    var last = hotel.lastStayed ? 'last stayed ' + formatDMY(hotel.lastStayed) : 'no stay date';
    var nightsText = hotel.nights > 0 ? nightLabel(hotel.nights) : 'nights not recorded';
    var ratingLine = hotel.ratingCount
      ? '<p class="ph-rating">' + esc(starLabel(hotel.average)) + ' from ' + hotel.ratingCount + (hotel.ratingCount === 1 ? ' rating' : ' ratings') + '</p>'
      : '<p class="ph-rating">No rating yet</p>';
    var notes = latestNotes(hotel).map(function (rating) {
      return '<li>' + esc(starLabel(Number(rating.stars))) + ' — ' + esc(String(rating.note).trim()) + '</li>';
    }).join('');
    var noteBlock = notes ? '<ul class="ph-notes">' + notes + '</ul>' : '';
    var rows = (hotel.ratings || []).map(ratingRowHtml).join('');
    var rowBlock = rows ? '<ul class="ph-rating-rows">' + rows + '</ul>' : '';
    var edit = editing || null;
    var selectedTour = edit ? edit.booking_id : '';
    var selectedGuest = edit ? edit.member_id : '';
    var form = '<details class="ph-rate" data-key="rate:' + esc(hotel.key) + '"' + (edit ? ' open' : '') + '>'
      + '<summary>' + (edit ? 'Edit rating' : 'Add rating') + '</summary>'
      + '<div class="ph-rate-form" data-editing="' + esc(edit ? edit.id : '') + '">'
      + '<div class="ph-stars" role="group" aria-label="Stars">'
      + [1, 2, 3, 4, 5].map(function (n) {
        var on = edit && Number(edit.stars) === n ? ' aria-pressed="true"' : ' aria-pressed="false"';
        return '<button type="button" data-rate-star="' + n + '"' + on + '>' + n + '</button>';
      }).join('')
      + '</div>'
      + '<input type="hidden" data-rate-stars value="' + esc(edit ? edit.stars : '') + '">'
      + '<label>Note <input type="text" data-rate-note maxlength="240" value="' + esc(edit ? edit.note || '' : '') + '" placeholder="Short note"></label>'
      + '<label>Tour <select data-rate-tour>' + tourOptions(hotel, selectedTour) + '</select></label>'
      + '<label>Guest <select data-rate-guest>' + guestOptions(hotel, selectedTour, selectedGuest) + '</select></label>'
      + '<div class="ph-rate-actions">'
      + '<button type="button" data-rate-save>' + (edit ? 'Save rating' : 'Save rating') + '</button>'
      + (edit ? '<button type="button" data-rate-cancel>Cancel</button>' : '')
      + '</div>'
      + '<p class="ph-error" data-rate-error hidden></p>'
      + '</div></details>';
    var tours = (hotel.tours || []).map(function (tour) {
      var spans = (tour.spans || []).map(function (span) {
        var who = (span.guests || []).join(', ');
        var note = (span.notes || []).filter(Boolean).join(' · ');
        return '<p class="ph-span"><span class="ph-when">' + esc(dateSpan(span, tour.tourDate)) + '</span>'
          + (who ? ' <span class="ph-who">' + esc(who) + '</span>' : '')
          + (note ? ' <span class="ph-stay-note">' + esc(note) + '</span>' : '')
          + '</p>';
      }).join('');
      return '<li><p class="ph-group">' + esc(tour.groupName) + '</p>' + spans + '</li>';
    }).join('');
    var tourBlock = '<details class="ph-tours" data-key="tours:' + esc(hotel.key) + '">'
      + '<summary>' + hotel.tourCount + (hotel.tourCount === 1 ? ' tour' : ' tours') + '</summary>'
      + '<ul>' + tours + '</ul></details>';
    return '<article class="ph-card" data-key="' + esc(hotel.key) + '">'
      + '<h3>' + esc(hotel.name) + '</h3>'
      + alias
      + '<p class="ph-stats">' + esc(guestLabel(hotel.guestCount)) + ' · ' + hotel.tourCount + (hotel.tourCount === 1 ? ' tour' : ' tours')
      + ' · ' + esc(nightsText) + ' · ' + esc(last) + '</p>'
      + address
      + ratingLine
      + noteBlock
      + rowBlock
      + form
      + tourBlock
      + '</article>';
  }

  function withGuestIds(hotels) {
    (hotels || []).forEach(function (hotel) {
      (hotel.tours || []).forEach(function (tour) {
        (tour.spans || []).forEach(function (span) {
          span.guestIds = span.guestIds || [];
        });
      });
    });
    return hotels;
  }

  function rememberGuests(hotels, members) {
    var byId = new Map();
    (members || []).forEach(function (member) {
      if (member && member.id != null) byId.set(String(member.id), personName(member));
    });
    (hotels || []).forEach(function (hotel) {
      (hotel.tours || []).forEach(function (tour) {
        (tour.spans || []).forEach(function (span) {
          if (span.guestIds && span.guestIds.length) return;
          span.guestIds = [];
          (members || []).forEach(function (member) {
            var bookingId = member.booking_id != null ? member.booking_id : member.bookingId;
            if (String(bookingId) !== String(tour.bookingId)) return;
            var name = personName(member);
            if (!name || (span.guests || []).indexOf(name) === -1) return;
            if (span.guestIds.some(function (guest) { return String(guest.id) === String(member.id); })) return;
            span.guestIds.push({ id: member.id, name: name });
          });
        });
      });
    });
    return hotels;
  }

  function ensureStyles() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    var css = ''
      + '.ph-card{background:var(--surface,#fff);border:1px solid var(--border,#e2e4e9);border-radius:14px;padding:14px 16px;margin:0 0 12px;box-shadow:var(--shadow,0 1px 3px rgba(0,0,0,.08));}'
      + '.ph-card h3{font-size:22px;font-weight:800;letter-spacing:-.02em;line-height:1.2;margin:0;}'
      + '.ph-alias,.ph-address,.ph-stats,.ph-rating{margin:6px 0 0;font-size:14px;font-weight:700;color:var(--text-secondary,#6b7280);}'
      + '.ph-card h3,.ph-group{color:var(--text,#1a1d26);}'
      + '.ph-notes,.ph-rating-rows,.ph-tours ul{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:6px;}'
      + '.ph-rating-row{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;font-size:14px;}'
      + '.ph-rating-actions{display:flex;gap:6px;}'
      + '.ph-rating-actions button,.ph-rate-actions button,.ph-stars button,.prague-popular-chip{font:inherit;cursor:pointer;touch-action:manipulation;}'
      + '.ph-stars{display:flex;gap:6px;flex-wrap:wrap;}'
      + '.ph-stars button{min-width:44px;min-height:44px;border:1px solid var(--border,#e2e4e9);border-radius:10px;background:var(--surface,#fff);color:var(--text,#1a1d26);font-weight:800;}'
      + '.ph-stars button[aria-pressed="true"]{background:var(--accent,#4f46e5);border-color:var(--accent,#4f46e5);color:#fff;}'
      + '.ph-rate,.ph-tours{margin-top:10px;}'
      + '.ph-rate summary,.ph-tours summary,.prague-popular summary{cursor:pointer;font-weight:800;min-height:44px;display:flex;align-items:center;}'
      + '.ph-rate-form{display:grid;gap:8px;margin-top:8px;}'
      + '.ph-rate-form label{display:grid;gap:4px;font-size:12px;font-weight:800;color:var(--text-secondary,#6b7280);}'
      + '.ph-rate-form input,.ph-rate-form select{font:inherit;font-size:16px;min-height:44px;padding:8px 10px;border:1px solid var(--border,#e2e4e9);border-radius:8px;background:var(--input-bg,#fff);color:var(--text,#1a1d26);width:100%;}'
      + '.ph-rate-actions{display:flex;gap:8px;flex-wrap:wrap;}'
      + '.ph-rate-actions button{min-height:44px;padding:8px 14px;border-radius:10px;border:1px solid var(--border,#e2e4e9);background:var(--surface,#fff);color:var(--text,#1a1d26);font-weight:800;}'
      + '.ph-error{color:#b91c1c;font-size:13px;font-weight:700;margin:0;}'
      + '.ph-group{font-weight:800;margin:0;}'
      + '.ph-span{margin:2px 0 0;font-size:14px;}'
      + '.ph-when{font-weight:800;}'
      + '.prague-popular{flex:1 1 100%;margin:4px 0 8px;}'
      + '.prague-popular summary{font-size:13px;}'
      + '.prague-popular-list{display:flex;flex-direction:column;gap:6px;}'
      + '.prague-popular-chip{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;min-height:44px;padding:8px 10px;border-radius:10px;border:1px solid var(--border,#e2e4e9);background:var(--surface,#fff);color:var(--text,#1a1d26);max-width:100%;}'
      + '.prague-popular-name{font-weight:800;}'
      + '.prague-popular-meta,.prague-popular-address,.prague-popular-empty{font-size:12px;font-weight:700;color:var(--text-secondary,#6b7280);}'
      + '.prague-popular-empty{margin:4px 0 8px;}'
      + '@media (min-width:900px){.prague-popular-list{flex-direction:row;flex-wrap:wrap;}.prague-popular-chip{width:auto;max-width:280px;}}'
      + '@media (max-width:760px){.ph-card h3{font-size:20px;}.ph-card{padding:12px;}}';
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function openOnWide(box) {
    if (!box || typeof window === 'undefined' || !window.matchMedia) return;
    if (window.matchMedia('(min-width: 900px)').matches) box.open = true;
  }

  var suggestState = { hotels: [], ready: false };
  var suggestBoxes = [];

  function paintSuggestions(box) {
    if (!box) return;
    var open = box.open;
    var fresh = suggestionsHtml(suggestState.hotels);
    var wrap = document.createElement('div');
    wrap.innerHTML = fresh;
    var next = wrap.firstElementChild;
    if (!next) return;
    if (open) next.open = true;
    else openOnWide(next);
    box.replaceWith(next);
    var index = suggestBoxes.indexOf(box);
    if (index !== -1) suggestBoxes[index] = next;
    bindSuggestion(next);
  }

  function suggestionAnchor(input) {
    if (input.classList && input.classList.contains('guest-stay-hotel') && input.closest) {
      return input.closest('.guest-prague-stay') || input.closest('.field') || input.parentElement;
    }
    if (input.closest) return input.closest('.field') || input.parentElement;
    return input.parentElement;
  }

  function bindSuggestion(box) {
    if (!box || box.dataset.bound === '1') return;
    box.dataset.bound = '1';
    box.addEventListener('click', function (event) {
      var chip = event.target.closest('[data-hotel-name]');
      if (!chip || !box.contains(chip)) return;
      var parent = box.parentElement;
      var input = parent && parent.querySelector
        ? parent.querySelector('input.guest-stay-hotel, input[id$="_prague_hotel"]')
        : null;
      fillHotelInput(input, chip.getAttribute('data-hotel-name') || '');
    });
  }

  function attachSuggestions(input) {
    if (!input || typeof document === 'undefined') return null;
    ensureStyles();
    var anchor = suggestionAnchor(input);
    if (!anchor) return null;
    var box = anchor.querySelector ? anchor.querySelector(':scope > .prague-popular') : null;
    if (!box) {
      anchor.insertAdjacentHTML('beforeend', suggestionsHtml(suggestState.hotels));
      box = anchor.querySelector(':scope > .prague-popular');
      openOnWide(box);
      suggestBoxes.push(box);
    }
    bindSuggestion(box);
    return box;
  }

  function refreshSuggestions() {
    suggestBoxes.slice().forEach(paintSuggestions);
  }

  async function fetchAll(sb, table, columns) {
    var rows = [];
    var from = 0;
    var size = 1000;
    while (from < 20000) {
      var res = await sb.from(table).select(columns).range(from, from + size - 1);
      if (res.error) throw res.error;
      var batch = res.data || [];
      rows = rows.concat(batch);
      if (batch.length < size) break;
      from += size;
    }
    return rows;
  }

  async function loadSources(sb) {
    var bookings = await fetchAll(sb, 'bookings', 'id, group_name, tour_arrival_date, status');
    var members = await fetchAll(sb, 'members', 'id, booking_id, first_name, last_name, prague_stays');
    var places = await fetchAll(sb, 'planner_places', 'id, name, nickname, place_type, place_types, address');
    var ratings = [];
    try {
      ratings = await root.PragueHotelRatings.list(sb);
    } catch (err) {
      ratings = [];
    }
    var hotels = rememberGuests(buildHistory(members, bookings, places), members);
    var attached = attachRatings(hotels, ratings);
    return { hotels: attached.hotels, all: attached.hotels.concat(attached.extras), ratings: ratings };
  }

  async function preload(sb) {
    if (!sb) return;
    try {
      var loaded = await loadSources(sb);
      suggestState.hotels = loaded.all;
      suggestState.ready = true;
      refreshSuggestions();
    } catch (err) {
      suggestState.ready = false;
    }
  }

  function renderInto(el, hotels, editing) {
    var open = new Set();
    el.querySelectorAll('details[open][data-key]').forEach(function (node) { open.add(node.dataset.key); });
    if (!hotels.length) {
      el.innerHTML = '<p class="empty">No Prague hotel stays on bookings that are still going ahead.</p>';
      return;
    }
    el.innerHTML = hotels.map(function (hotel) {
      var edit = editing && editing.hotelKey === hotel.key ? editing.rating : null;
      return cardHtml(hotel, edit);
    }).join('');
    el.querySelectorAll('details[data-key]').forEach(function (node) {
      if (open.has(node.dataset.key)) node.open = true;
    });
  }

  function hotelFromCard(state, card) {
    return (state.hotels || []).find(function (hotel) { return hotel.key === card.dataset.key; });
  }

  function setStars(form, stars) {
    form.querySelector('[data-rate-stars]').value = String(stars);
    form.querySelectorAll('[data-rate-star]').forEach(function (button) {
      button.setAttribute('aria-pressed', button.getAttribute('data-rate-star') === String(stars) ? 'true' : 'false');
    });
  }

  function showError(form, message) {
    var node = form.querySelector('[data-rate-error]');
    if (!node) return;
    node.hidden = !message;
    node.textContent = message || '';
  }

  async function commitDelete(sb, id, confirmFn) {
    var ask = confirmFn || function (message) { return root.confirm(message); };
    if (!ask('Delete this rating?')) return { deleted: false };
    await root.PragueHotelRatings.remove(sb, id);
    return { deleted: true };
  }

  async function mount(el, options) {
    if (!el) return;
    ensureStyles();
    var opts = options || {};
    var sb = opts.sb;
    var gen = (Number(el.dataset.pragueGen) || 0) + 1;
    el.dataset.pragueGen = String(gen);
    if (!sb) {
      el.innerHTML = '<p class="empty">Sign in to see Prague hotel history.</p>';
      return;
    }
    el.innerHTML = '<p class="empty">Loading Prague hotels…</p>';
    var state = { sb: sb, hotels: [], all: [], editing: null };
    el.__pragueState = state;
    if (el.dataset.bound !== '1') {
      el.dataset.bound = '1';
      el.addEventListener('click', function (event) { onHistoryClick(el, event); });
      el.addEventListener('change', function (event) { onHistoryChange(el, event); });
    }
    try {
      var loaded = await loadSources(sb);
      if (el.dataset.pragueGen !== String(gen)) return;
      state.hotels = loaded.hotels;
      state.all = loaded.all;
      suggestState.hotels = loaded.all;
      suggestState.ready = true;
      renderInto(el, state.hotels, null);
      refreshSuggestions();
    } catch (err) {
      if (el.dataset.pragueGen !== String(gen)) return;
      el.innerHTML = '<p class="empty">Could not load Prague hotels. ' + esc(err && err.message ? err.message : '') + '</p>';
    }
  }

  function onHistoryChange(el, event) {
    var tour = event.target.closest('[data-rate-tour]');
    if (!tour) return;
    var card = tour.closest('.ph-card');
    var state = el.__pragueState;
    var hotel = hotelFromCard(state, card);
    if (!hotel) return;
    var guest = card.querySelector('[data-rate-guest]');
    var current = guest ? guest.value : '';
    if (guest) guest.innerHTML = guestOptions(hotel, tour.value, current);
  }

  async function onHistoryClick(el, event) {
    var state = el.__pragueState;
    if (!state) return;
    var star = event.target.closest('[data-rate-star]');
    var card = event.target.closest('.ph-card');
    if (star && card) {
      setStars(star.closest('.ph-rate-form'), star.getAttribute('data-rate-star'));
      return;
    }
    var save = event.target.closest('[data-rate-save]');
    if (save && card) {
      event.preventDefault();
      await saveRating(el, card);
      return;
    }
    var edit = event.target.closest('[data-rate-edit]');
    if (edit && card) {
      var hotel = hotelFromCard(state, card);
      var rating = (hotel.ratings || []).find(function (item) { return String(item.id) === String(edit.getAttribute('data-rate-edit')); });
      state.editing = rating ? { hotelKey: hotel.key, rating: rating } : null;
      renderInto(el, state.hotels, state.editing);
      return;
    }
    var cancel = event.target.closest('[data-rate-cancel]');
    if (cancel) {
      state.editing = null;
      renderInto(el, state.hotels, null);
      return;
    }
    var del = event.target.closest('[data-rate-delete]');
    if (del && card) {
      var result = await commitDelete(state.sb, del.getAttribute('data-rate-delete'));
      if (!result.deleted) return;
      await mount(el, { sb: state.sb });
    }
  }

  async function saveRating(el, card) {
    var state = el.__pragueState;
    var form = card.querySelector('.ph-rate-form');
    var hotel = hotelFromCard(state, card);
    showError(form, '');
    var payload = {
      hotel_name: hotel.name,
      place_id: hotel.placeId,
      stars: form.querySelector('[data-rate-stars]').value,
      note: form.querySelector('[data-rate-note]').value,
      booking_id: form.querySelector('[data-rate-tour]').value,
      member_id: form.querySelector('[data-rate-guest]').value,
    };
    var editing = form.dataset.editing;
    var button = form.querySelector('[data-rate-save]');
    if (button) button.disabled = true;
    try {
      if (editing) await root.PragueHotelRatings.update(state.sb, editing, payload);
      else await root.PragueHotelRatings.create(state.sb, payload);
      state.editing = null;
      await mount(el, { sb: state.sb });
    } catch (err) {
      if (button) button.disabled = false;
      showError(form, err && err.message ? err.message : 'Could not save the rating.');
    }
  }

  root.PragueHotelHistory = {
    hotelKey: hotelKey,
    knownSignature: knownSignature,
    nightsBetween: nightsBetween,
    buildHistory: buildHistory,
    attachRatings: attachRatings,
    popularHotels: popularHotels,
    starLabel: starLabel,
    fillHotelInput: fillHotelInput,
    suggestionsHtml: suggestionsHtml,
    commitDelete: commitDelete,
    attachSuggestions: attachSuggestions,
    preload: preload,
    mount: mount,
    TOP: TOP,
  };
})(typeof window !== 'undefined' ? window : globalThis);
