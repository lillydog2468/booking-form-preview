/**
 * 2027 booking fields that do not have their own columns yet.
 * Stored in bookings.extra_notes between sentinel markers, and copied onto
 * planner_plans.payload.bookingDetails (or localStorage in the planner).
 * Pages keep working if sql/19_2027_booking_fields.sql has not been run.
 */
(function (root) {
  'use strict';

  var START = '<<<BOOKING_EXTRAS_JSON>>>';
  var END = '<<<END_BOOKING_EXTRAS>>>';
  var DEPOSIT_PER_PERSON_GBP = 200;

  var SIDE_PLACES = [
    { place: 'cesky_krumlov', label: 'Český Krumlov' },
    { place: 'tabor', label: 'Tábor' },
    { place: 'kutna_hora', label: 'Kutná Hora' }
  ];

  function knownSidePlace(place) {
    return SIDE_PLACES.some(function (p) { return p.place === place; });
  }

  function sidePlaceLabel(place, placeName) {
    var known = SIDE_PLACES.find(function (p) { return p.place === place; });
    if (known) return known.label;
    return str(placeName).trim();
  }

  /**
   * A saved overnight stay. The three usual places keep their ids.
   * Somewhere else uses place "other" and placeName.
   * A blank draft row is only the one Keith has just added and not filled in.
   * Old unticked places with no hotel and no nights are not stays.
   */
  function normaliseSideTrip(row) {
    if (!isObj(row)) return null;
    var place = str(row.place).trim();
    var placeName = str(row.placeName).trim();
    var hotel = str(row.hotel).trim();
    var nights = str(row.nights).trim();
    var hotelId = row.hotelId == null || row.hotelId === '' ? null : Number(row.hotelId);
    if (!Number.isFinite(hotelId)) hotelId = null;
    var include = row.include === true;
    if (place && place !== 'other' && !knownSidePlace(place)) {
      if (!placeName) placeName = place;
      place = 'other';
    }
    if (!place && placeName) place = 'other';
    if ((knownSidePlace(place) || place === 'other') && (include || hotel || nights || placeName || hotelId != null)) include = true;
    var draft = !place && !placeName && !hotel && !nights && !include && hotelId == null;
    var out = {
      place: place,
      placeName: place === 'other' ? placeName : '',
      include: !!include,
      hotel: hotel,
      nights: nights
    };
    if (hotelId != null) out.hotelId = hotelId;
    if (draft) out.draft = true;
    return out;
  }

  function sideTripKeep(row) {
    if (!row) return false;
    if (row.draft) return true;
    return !!(row.include || row.hotel || row.nights || row.placeName || row.hotelId != null);
  }

  function mergeSideTrips(list) {
    var rows = [];
    (Array.isArray(list) ? list : []).forEach(function (row) {
      var norm = normaliseSideTrip(row);
      if (!sideTripKeep(norm)) return;
      rows.push(norm);
    });
    return rows;
  }

  function empty() {
    return {
      version: 1,
      organiser: { firstName: '', lastName: '', email: '', personId: '' },
      headcount: '',
      guests: [],
      rooms: { singles: '', twins: '', doubles: '', keithRoom: null },
      travel: {
        arrivalTime: '',
        departureTime: '',
        arrivalFlight: '',
        departureFlight: '',
        pickupPoint: '',
        pickupPlace: '',
        pickupTime: ''
      },
      tourHotel: { nights: '', rooms: '', booked: '', paid: '', paidBy: '' },
      extraStays: { pragueNights: '', pragueHotel: '', airportNights: '', airportHotel: '' },
      sideTrips: [],
      money: {
        pricePerPerson: '',
        total: '',
        depositAmount: '',
        depositDate: '',
        method: '',
        balance: '',
        balanceDueDate: '',
        fxNote: ''
      },
      companion: { joining: false, otherBookingId: '', otherGroup: '' },
      interests: { buttons: false, antique: false, lampwork: false, heritage: false, other: '' },
      needs: { dietary: '', mobility: '' },
      consent: { futureOffers: '', contactMethod: '' },
      delayUntilYear: '',
      rescheduledFromId: '',
      dayTrip: null,
      tourPlace: ''
    };
  }

  function normaliseDelayYear(value) {
    var s = str(value).trim();
    if (!/^\d{4}$/.test(s)) return '';
    var n = Number(s);
    if (n < 1990 || n > 2100) return '';
    return String(n);
  }

  function normaliseLinkedBookingId(value) {
    var s = str(value).trim();
    if (!/^\d+$/.test(s)) return '';
    var n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return '';
    return String(n);
  }

  function isObj(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function str(v) {
    return v == null ? '' : String(v);
  }

  function merge(raw) {
    var base = empty();
    var src = isObj(raw) ? raw : {};
    base.version = 1;
    if (isObj(src.organiser)) {
      base.organiser.firstName = str(src.organiser.firstName).trim();
      base.organiser.lastName = str(src.organiser.lastName).trim();
      base.organiser.email = str(src.organiser.email).trim();
      base.organiser.personId = str(src.organiser.personId).trim();
    }
    base.headcount = str(src.headcount).trim();
    base.guests = Array.isArray(src.guests) ? src.guests.map(function (g) {
      var row = isObj(g) ? g : {};
      return {
        firstName: str(row.firstName).trim(),
        lastName: str(row.lastName).trim(),
        email: str(row.email).trim(),
        personId: str(row.personId).trim()
      };
    }).filter(function (g) {
      return g.firstName || g.lastName || g.email || g.personId;
    }) : [];
    if (isObj(src.rooms)) {
      base.rooms.singles = str(src.rooms.singles).trim();
      base.rooms.twins = str(src.rooms.twins).trim();
      base.rooms.doubles = str(src.rooms.doubles).trim();
      base.rooms.keithRoom = explicitKeithRoom(src.rooms);
    }
    if (isObj(src.travel)) {
      Object.keys(base.travel).forEach(function (k) {
        base.travel[k] = str(src.travel[k]).trim();
      });
    }
    if (isObj(src.tourHotel)) {
      base.tourHotel.nights = str(src.tourHotel.nights).trim();
      base.tourHotel.rooms = str(src.tourHotel.rooms).trim();
      base.tourHotel.booked = src.tourHotel.booked === 'yes' || src.tourHotel.booked === 'no' ? src.tourHotel.booked : '';
      base.tourHotel.paid = src.tourHotel.paid === 'advance' || src.tourHotel.paid === 'on_day' ? src.tourHotel.paid : '';
      base.tourHotel.paidBy = str(src.tourHotel.paidBy).trim();
    }
    if (isObj(src.extraStays)) {
      Object.keys(base.extraStays).forEach(function (k) {
        base.extraStays[k] = str(src.extraStays[k]).trim();
      });
    }
    base.sideTrips = mergeSideTrips(src.sideTrips);
    if (isObj(src.money)) {
      Object.keys(base.money).forEach(function (k) {
        base.money[k] = str(src.money[k]).trim();
      });
    }
    if (isObj(src.companion)) {
      base.companion.joining = !!src.companion.joining;
      base.companion.otherBookingId = str(src.companion.otherBookingId).trim();
      base.companion.otherGroup = str(src.companion.otherGroup).trim();
    }
    if (isObj(src.interests)) {
      base.interests.buttons = !!src.interests.buttons;
      base.interests.antique = !!src.interests.antique;
      base.interests.lampwork = !!src.interests.lampwork;
      base.interests.heritage = !!src.interests.heritage;
      base.interests.other = str(src.interests.other).trim();
    }
    if (isObj(src.needs)) {
      base.needs.dietary = str(src.needs.dietary).trim();
      base.needs.mobility = str(src.needs.mobility).trim();
    }
    if (isObj(src.consent)) {
      base.consent.futureOffers = src.consent.futureOffers === 'yes' || src.consent.futureOffers === 'no' ? src.consent.futureOffers : '';
      var method = str(src.consent.contactMethod).trim();
      base.consent.contactMethod = ['email', 'phone', 'whatsapp', 'post'].indexOf(method) >= 0 ? method : '';
    }
    base.delayUntilYear = normaliseDelayYear(src.delayUntilYear);
    base.rescheduledFromId = normaliseLinkedBookingId(src.rescheduledFromId);
    base.dayTrip = src.dayTrip === true ? true : (src.dayTrip === false ? false : null);
    base.tourPlace = src.tourPlace === 'other' ? 'other' : (src.tourPlace === 'beading' ? 'beading' : '');
    return base;
  }

  function hasContent(raw) {
    var x = merge(raw);
    if (x.organiser.firstName || x.organiser.lastName || x.organiser.email || x.organiser.personId) return true;
    if (x.headcount) return true;
    if (x.guests.length) return true;
    if (x.rooms.singles || x.rooms.twins || x.rooms.doubles || x.rooms.keithRoom) return true;
    var travelHit = Object.keys(x.travel).some(function (k) { return !!x.travel[k]; });
    if (travelHit) return true;
    if (x.tourHotel.nights || x.tourHotel.rooms || x.tourHotel.booked || x.tourHotel.paid || x.tourHotel.paidBy) return true;
    var stayHit = Object.keys(x.extraStays).some(function (k) { return !!x.extraStays[k]; });
    if (stayHit) return true;
    if (x.sideTrips.some(function (s) { return !s.draft && (s.include || s.hotel || s.nights || s.placeName); })) return true;
    var moneyHit = Object.keys(x.money).some(function (k) { return !!x.money[k]; });
    if (moneyHit) return true;
    if (x.companion.joining || x.companion.otherBookingId || x.companion.otherGroup) return true;
    if (x.interests.buttons || x.interests.antique || x.interests.lampwork || x.interests.heritage || x.interests.other) return true;
    if (x.needs.dietary || x.needs.mobility) return true;
    if (x.consent.futureOffers || x.consent.contactMethod) return true;
    if (x.delayUntilYear) return true;
    if (x.rescheduledFromId) return true;
    if (x.dayTrip === true || x.dayTrip === false) return true;
    if (x.tourPlace === 'beading' || x.tourPlace === 'other') return true;
    return false;
  }

  function cloneJson(v) {
    if (v == null || typeof v !== 'object') return v;
    try { return JSON.parse(JSON.stringify(v)); }
    catch (err) { return v; }
  }

  function stable(v) {
    if (v === undefined) return 'undefined';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    var keys = Object.keys(v).sort();
    return '{' + keys.map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
  }

  function sameJson(a, b) {
    return stable(a) === stable(b);
  }

  function present(v) {
    return v != null && String(v).trim() !== '';
  }

  function itemKey(item) {
    if (!isObj(item)) return '';
    if (present(item.id)) return 'id:' + String(item.id).trim();
    if (present(item.personId)) return 'person:' + String(item.personId).trim();
    if (present(item.placeId) || present(item.place_id)) return 'place:' + String(item.placeId || item.place_id).trim();
    if (present(item.albumId) || present(item.album_id)) return 'album:' + String(item.albumId || item.album_id).trim();
    if (present(item.url)) return 'url:' + String(item.url).trim().toLowerCase();
    var hotelName = item.hotelName || item.name;
    if (present(item.role) && present(hotelName)) {
      return 'hotel:' + String(item.role).trim() + ':' + String(hotelName).trim().toLowerCase();
    }
    if (present(item.booking_id)) return 'booking:' + String(item.booking_id).trim();
    if (present(item.date)) return 'date:' + String(item.date).trim();
    if (present(item.firstName) || present(item.lastName)) {
      return 'guest:' + String(item.firstName || '').trim().toLowerCase() + '|' + String(item.lastName || '').trim().toLowerCase();
    }
    if (present(item.name)) return 'name:' + String(item.name).trim().toLowerCase();
    return '';
  }

  /**
   * Overlay only the fields that differ between baseline (what the UI loaded)
   * and current (what the UI holds now) onto the latest server value.
   * Untouched keys — including ones the UI never had — stay as they are on the server.
   * No baseline means do not write.
   */
  function applyEditedPatch(server, baseline, current) {
    if (baseline == null || current == null) {
      return { changed: false, value: cloneJson(server) };
    }
    if (sameJson(baseline, current)) {
      return { changed: false, value: cloneJson(server) };
    }
    var merged = applyNode(cloneJson(server), baseline, current);
    return { changed: !sameJson(merged, server), value: merged };
  }

  function applyNode(server, baseline, current) {
    if (Array.isArray(baseline) || Array.isArray(current)) {
      return applyArrayPatch(Array.isArray(server) ? server : [], Array.isArray(baseline) ? baseline : [], Array.isArray(current) ? current : []);
    }
    if (isObj(baseline) && isObj(current)) {
      return applyObjectPatch(isObj(server) ? server : {}, baseline, current);
    }
    return cloneJson(current);
  }

  function overlayKnown(server, current) {
    var out = isObj(server) ? server : {};
    if (!isObj(current)) return cloneJson(current);
    Object.keys(current).forEach(function (k) {
      if (isObj(current[k]) && isObj(out[k]) && !Array.isArray(current[k])) out[k] = overlayKnown(cloneJson(out[k]), current[k]);
      else out[k] = cloneJson(current[k]);
    });
    return out;
  }

  function applyObjectPatch(server, baseline, current) {
    var out = isObj(server) ? server : {};
    var keys = {};
    if (isObj(baseline)) Object.keys(baseline).forEach(function (k) { keys[k] = true; });
    if (isObj(current)) Object.keys(current).forEach(function (k) { keys[k] = true; });
    Object.keys(keys).forEach(function (k) {
      var bHas = isObj(baseline) && Object.prototype.hasOwnProperty.call(baseline, k);
      var cHas = isObj(current) && Object.prototype.hasOwnProperty.call(current, k);
      if (!bHas && cHas) {
        out[k] = cloneJson(current[k]);
        return;
      }
      if (bHas && !cHas) {
        delete out[k];
        return;
      }
      if (!bHas || !cHas || sameJson(baseline[k], current[k])) return;
      out[k] = applyNode(out[k], baseline[k], current[k]);
    });
    return out;
  }

  function keyedItems(arr) {
    var counts = {};
    return arr.map(function (item, i) {
      var raw = itemKey(item) || ('#' + i);
      counts[raw] = (counts[raw] || 0) + 1;
      var key = counts[raw] === 1 ? raw : (raw + '~' + (counts[raw] - 1));
      return { item: item, index: i, key: key, raw: raw };
    });
  }

  function arrayIsPrimitive(list) {
    return list.some(function (item) { return !isObj(item); });
  }

  function applyArrayPatch(serverArr, baselineArr, currentArr) {
    var server = Array.isArray(serverArr) ? serverArr : [];
    var base = Array.isArray(baselineArr) ? baselineArr : [];
    var cur = Array.isArray(currentArr) ? currentArr : [];
    if (arrayIsPrimitive(cur) || arrayIsPrimitive(base) || arrayIsPrimitive(server)) {
      var baseSet = base.map(stable);
      var curSet = cur.map(stable);
      var outPrim = [];
      server.forEach(function (item) {
        var key = stable(item);
        var inBase = baseSet.indexOf(key) >= 0;
        var inCur = curSet.indexOf(key) >= 0;
        if (!inBase || inCur) outPrim.push(cloneJson(item));
      });
      cur.forEach(function (item) {
        var key = stable(item);
        if (baseSet.indexOf(key) === -1 && !outPrim.some(function (have) { return stable(have) === key; })) {
          outPrim.push(cloneJson(item));
        }
      });
      return outPrim;
    }

    var bList = keyedItems(base);
    var cList = keyedItems(cur);
    var sList = keyedItems(server);
    var bByKey = {};
    bList.forEach(function (entry) { bByKey[entry.key] = entry; });
    var usedB = {};
    var usedC = {};
    var paired = [];
    cList.forEach(function (c) {
      var b = bByKey[c.key];
      if (b && !usedB[b.key]) {
        paired.push({ b: b, c: c });
        usedB[b.key] = true;
        usedC[c.key] = true;
      }
    });
    var leftB = bList.filter(function (b) { return !usedB[b.key]; });
    var leftC = cList.filter(function (c) { return !usedC[c.key]; });
    var pairCount = Math.min(leftB.length, leftC.length);
    for (var i = 0; i < pairCount; i++) {
      paired.push({ b: leftB[i], c: leftC[i] });
      usedB[leftB[i].key] = true;
      usedC[leftC[i].key] = true;
    }
    var added = cList.filter(function (c) { return !usedC[c.key]; });
    var baselineRaws = {};
    bList.forEach(function (b) { baselineRaws[b.raw] = (baselineRaws[b.raw] || 0) + 1; });

    function takeServer(entry) {
      var found = sList.find(function (s) { return !s.used && s.key === entry.key; });
      if (!found) found = sList.find(function (s) { return !s.used && s.raw === entry.raw; });
      if (!found && entry.item) {
        var want = itemKey(entry.item);
        if (want) found = sList.find(function (s) { return !s.used && itemKey(s.item) === want; });
      }
      if (!found) found = sList.find(function (s) { return !s.used && s.index === entry.index; });
      if (found) found.used = true;
      return found ? found.item : null;
    }

    var out = [];
    cList.forEach(function (cEntry) {
      var pair = paired.find(function (p) { return p.c === cEntry; });
      if (!pair) return;
      var sItem = takeServer(pair.b);
      if (!sItem) sItem = takeServer(pair.c);
      if (!sItem && sameJson(pair.b.item, pair.c.item)) return;
      out.push(applyObjectPatch(sItem ? cloneJson(sItem) : {}, pair.b.item, pair.c.item));
    });
    added.forEach(function (cEntry) {
      var sItem = takeServer(cEntry);
      out.push(overlayKnown(sItem ? cloneJson(sItem) : {}, cEntry.item));
    });
    var deletedB = bList.filter(function (b) { return !usedB[b.key]; });
    sList.forEach(function (s) {
      if (s.used) return;
      var removed = deletedB.find(function (b) { return sameIdentity(s.item, b.item); });
      if (removed) {
        s.used = true;
        return;
      }
      if (!baselineRaws[s.raw]) out.push(cloneJson(s.item));
    });
    return out;
  }

  function sameIdentity(a, b) {
    if (!isObj(a) || !isObj(b)) return false;
    var ka = itemKey(a);
    var kb = itemKey(b);
    if (ka && kb && ka === kb) return true;
    function eq(field) {
      return present(a[field]) && present(b[field]) && String(a[field]).trim().toLowerCase() === String(b[field]).trim().toLowerCase();
    }
    if (eq('url') || eq('albumId') || eq('album_id') || eq('name') || eq('personId') || eq('id') || eq('date')) return true;
    if (present(a.booking_id) && present(b.booking_id) && String(a.booking_id) === String(b.booking_id)) return true;
    if ((present(a.firstName) || present(a.lastName)) && eq('firstName') && String(a.lastName || '').trim().toLowerCase() === String(b.lastName || '').trim().toLowerCase()) return true;
    var aHotel = a.hotelName || a.name;
    var bHotel = b.hotelName || b.name;
    if (present(a.role) && present(b.role) && String(a.role) === String(b.role) && present(aHotel) && present(bHotel) && String(aHotel).trim().toLowerCase() === String(bHotel).trim().toLowerCase()) return true;
    return false;
  }

  /** Keep personId when a form round-trips guests without showing that field. */
  function copyBlankPersonIds(baseline, current) {
    function fix(b, c) {
      if (!isObj(b) || !isObj(c)) return;
      if (!present(c.personId) && present(b.personId)) c.personId = b.personId;
    }
    if (isObj(baseline) && isObj(current)) fix(baseline.organiser, current.organiser);
    var bGuests = (baseline && baseline.guests) || [];
    var cGuests = (current && current.guests) || [];
    cGuests.forEach(function (c, i) {
      if (!isObj(c) || present(c.personId)) return;
      var named = bGuests.find(function (g) {
        return isObj(g)
          && String(g.firstName || '').trim().toLowerCase() === String(c.firstName || '').trim().toLowerCase()
          && String(g.lastName || '').trim().toLowerCase() === String(c.lastName || '').trim().toLowerCase()
          && present(g.personId);
      });
      var b = named || bGuests[i];
      fix(b, c);
    });
  }

  /**
   * Put edited booking-details fields onto the stored object.
   * Unknown keys, and guest personId values the form does not show, stay.
   */
  function overlayDetails(existing, edited) {
    var server = isObj(existing) ? cloneJson(existing) : {};
    var baseline = merge(existing);
    var current = merge(edited);
    copyBlankPersonIds(baseline, current);
    return applyEditedPatch(server, baseline, current).value;
  }

  function splitNotesAndExtras(raw) {
    var text = str(raw);
    var i = text.indexOf(START);
    if (i < 0) return { notes: text.trim(), extras: empty(), rawExtras: {} };
    var notes = text.slice(0, i).trim();
    var j = text.indexOf(END, i + START.length);
    if (j < 0) return { notes: text.trim(), extras: empty(), rawExtras: {} };
    var json = text.slice(i + START.length, j).trim();
    try {
      var parsed = JSON.parse(json);
      return { notes: notes, extras: merge(parsed), rawExtras: isObj(parsed) ? parsed : {} };
    } catch (err) {
      return { notes: text.trim(), extras: empty(), rawExtras: {} };
    }
  }

  function joinNotesAndExtras(notes, extras, existingRaw) {
    var human = str(notes);
    var cut = human.indexOf(START);
    if (cut >= 0) human = human.slice(0, cut);
    human = human.trim();
    var packed = (arguments.length >= 3) ? overlayDetails(existingRaw, extras) : merge(extras);
    var knownOnly = merge(packed);
    var keepUnknown = arguments.length >= 3 && !sameJson(packed, knownOnly);
    if (!hasContent(packed) && !keepUnknown) return human || null;
    var block = START + '\n' + JSON.stringify(packed) + '\n' + END;
    return human ? (human + '\n\n' + block) : block;
  }

  function num(v) {
    if (v == null || String(v).trim() === '') return 0;
    var n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function roomsOf(source) {
    if (!isObj(source)) return null;
    if (Object.prototype.hasOwnProperty.call(source, 'rooms')) return isObj(source.rooms) ? source.rooms : null;
    if (Object.prototype.hasOwnProperty.call(source, 'keithRoom')
      || Object.prototype.hasOwnProperty.call(source, 'singles')
      || Object.prototype.hasOwnProperty.call(source, 'twins')
      || Object.prototype.hasOwnProperty.call(source, 'doubles')) return source;
    return null;
  }

  /** true or false when a room choice was saved; null when nothing was saved yet. */
  function explicitKeithRoom(rooms) {
    if (!isObj(rooms) || !Object.prototype.hasOwnProperty.call(rooms, 'keithRoom')) return null;
    var v = rooms.keithRoom;
    if (v === true || v === 'true' || v === 1 || v === '1') return true;
    if (v === false || v === 'false' || v === 0 || v === '0') return false;
    return null;
  }

  /**
   * Keith’s own room starts on. A saved false (in the notes or the column) stays off.
   * columnValue is bookings.keith_own_room, used only when the notes have no choice.
   */
  function keithRoomIsOn(source, columnValue) {
    var rooms = roomsOf(source);
    if (rooms) {
      var explicit = explicitKeithRoom(rooms);
      if (explicit === true || explicit === false) return explicit;
    }
    if (columnValue === false || columnValue === 'false' || columnValue === 0 || columnValue === '0') return false;
    if (columnValue === true || columnValue === 'true' || columnValue === 1 || columnValue === '1') return true;
    return true;
  }

  /** Singles, twins, and doubles each count as one room, not as beds. */
  function guestRoomCount(source) {
    var rooms = roomsOf(source) || {};
    return num(rooms.singles) + num(rooms.twins) + num(rooms.doubles);
  }

  function roomsNeeded(source, columnValue) {
    return guestRoomCount(source) + (keithRoomIsOn(source, columnValue) ? 1 : 0);
  }

  function roomsNeededLabel(source, columnValue) {
    var n = roomsNeeded(source, columnValue);
    return n === 1 ? '1 room needed' : (n + ' rooms needed');
  }

  function guestBeds(rooms) {
    var r = roomsOf(rooms) || {};
    return num(r.singles) + num(r.twins) * 2 + num(r.doubles) * 2;
  }

  function roomPlanStarted(rooms) {
    var r = isObj(rooms) ? rooms : {};
    return [r.singles, r.twins, r.doubles].some(function (v) { return str(v).trim() !== ''; });
  }

  function roomWarning(headcount, rooms) {
    if (!roomPlanStarted(rooms)) return '';
    var beds = guestBeds(rooms);
    var people = num(headcount);
    if (people === beds) return '';
    var keith = (rooms && rooms.keithRoom) ? ' Keith\'s own room is separate and is not part of that bed count.' : '';
    var bedWord = beds === 1 ? 'bed' : 'beds';
    if (!people) {
      return 'The room plan has ' + beds + ' guest ' + bedWord + ' and the headcount is still blank.' + keith;
    }
    return 'The room plan has ' + beds + ' guest ' + bedWord + ' and the headcount is ' + people + '. Singles sleep 1; twins and doubles sleep 2.' + keith;
  }

  function guestCountWarning(headcount, namedGuests) {
    var raw = headcount == null ? '' : String(headcount).trim();
    var named = num(namedGuests);
    if (raw === '') {
      if (!named) return '';
      var listed = named === 1 ? '1 guest name is listed' : (named + ' guest names are listed');
      return 'Headcount problem: ' + listed + ', and the headcount is blank.';
    }
    var people = num(raw);
    if (people === named) return '';
    if (!named) {
      return 'Headcount problem: headcount is ' + people + ', and no guest names are listed.';
    }
    var noun = named === 1 ? 'guest name is' : 'guest names are';
    return 'Headcount problem: headcount is ' + people + ', and ' + named + ' ' + noun + ' listed.';
  }

  function suggestedDepositGbp(headcount) {
    var people = num(headcount);
    if (people <= 0) return null;
    return Math.round(people * DEPOSIT_PER_PERSON_GBP * 100) / 100;
  }

  function organiserFullName(extras) {
    var o = (extras && extras.organiser) || {};
    return [o.firstName, o.lastName].map(function (s) { return str(s).trim(); }).filter(Boolean).join(' ');
  }

  function methodLabel(method) {
    var map = { cash: 'Cash', bank: 'Bank transfer', paypal: 'PayPal', wise: 'Wise' };
    return map[method] || '';
  }

  function roomSummary(rooms) {
    if (!isObj(rooms)) return '';
    var parts = [];
    if (str(rooms.singles).trim()) parts.push(str(rooms.singles).trim() + ' single');
    if (str(rooms.twins).trim()) parts.push(str(rooms.twins).trim() + ' twin');
    if (str(rooms.doubles).trim()) parts.push(str(rooms.doubles).trim() + ' double');
    if (rooms.keithRoom) parts.push('Keith\'s room');
    return parts.join(', ');
  }

  function hhmm(t) {
    var s = str(t).trim();
    if (!s) return null;
    return s.length >= 5 ? s.slice(0, 5) : s;
  }

  var HOTELS_USED_KEY = 'keith_hotels_used_v1';

  function hotelUsedKey(name) {
    return str(name).trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function isDayTripHotelName(name) {
    return /^day\s*trips?$/i.test(str(name).trim());
  }

  /** Hotels typed under Other on an overnight stay. Kept even when no booking uses them. */
  function readHotelsUsed() {
    try {
      var raw = JSON.parse(localStorage.getItem(HOTELS_USED_KEY) || '[]');
      if (!Array.isArray(raw)) return [];
      var out = [];
      var seen = {};
      raw.forEach(function (row) {
        if (!row) return;
        var name = str(row.name).trim();
        var key = hotelUsedKey(name);
        if (!key || seen[key] || isDayTripHotelName(name)) return;
        seen[key] = true;
        var id = row.id == null || row.id === '' ? null : Number(row.id);
        if (!Number.isFinite(id)) id = null;
        out.push({ id: id, name: name });
      });
      return out;
    } catch (err) {
      return [];
    }
  }

  function arrivalYear(value) {
    var y = Number(String(value || '').slice(0, 4));
    return (y >= 1990 && y <= 2100) ? String(y) : '';
  }

  function pushUniqueName(list, name) {
    var trimmed = str(name).trim().replace(/\s+/g, ' ');
    if (!trimmed || /^booking #\d+$/i.test(trimmed)) return;
    if (list.some(function (n) { return n.toLowerCase() === trimmed.toLowerCase(); })) return;
    list.push(trimmed);
  }

  function extrasOfBooking(booking) {
    if (!booking) return null;
    if (booking.extra_notes) return splitNotesAndExtras(booking.extra_notes).extras;
    if (isObj(booking._extras)) return merge(booking._extras);
    return null;
  }

  /**
   * People on this booking: members, organiser, guests, then any extra names.
   * The group label is used only when no person name was saved.
   */
  function peopleOnBooking(booking, plan, also) {
    var names = [];
    ((booking && booking._members) || []).forEach(function (m) {
      pushUniqueName(names, [m && m.first_name, m && m.last_name].filter(Boolean).join(' '));
    });
    var extras = extrasOfBooking(booking);
    if (extras) {
      pushUniqueName(names, organiserFullName(extras));
      (extras.guests || []).forEach(function (g) {
        pushUniqueName(names, [g.firstName, g.lastName].filter(Boolean).join(' '));
      });
    }
    if (isObj(plan)) {
      pushUniqueName(names, plan.organiserName);
      (plan.guests || []).forEach(function (g) { pushUniqueName(names, g && g.name); });
      if (isObj(plan.bookingDetails)) {
        pushUniqueName(names, organiserFullName(plan.bookingDetails));
        (plan.bookingDetails.guests || []).forEach(function (g) {
          pushUniqueName(names, [g.firstName, g.lastName].filter(Boolean).join(' '));
        });
      }
    }
    (also || []).forEach(function (n) { pushUniqueName(names, n); });
    if (!names.length) {
      pushUniqueName(names, booking && booking.group_name);
      pushUniqueName(names, plan && plan.groupName);
    }
    return names;
  }

  function hotelOnBooking(booking, plan) {
    var name = '';
    if (booking) name = (booking.hotels && booking.hotels.name) || booking.hotel_name || '';
    if (!str(name).trim() && plan) name = plan.tourHotelName || '';
    name = str(name).trim();
    if (isDayTripHotelName(name)) return '';
    return name;
  }

  function placesOnBooking(booking, plan) {
    var names = [];
    function fromExtras(extras) {
      (extras && extras.sideTrips || []).forEach(function (trip) {
        if (!trip || trip.draft) return;
        pushUniqueName(names, sidePlaceLabel(trip.place, trip.placeName));
      });
    }
    fromExtras(extrasOfBooking(booking));
    if (isObj(plan)) fromExtras(plan.bookingDetails);
    return names;
  }

  function explicitDayTrip(value) {
    if (value === true) return true;
    if (value === false) return false;
    return null;
  }

  function bookingIsDayTrip(booking, plan) {
    var extras = extrasOfBooking(booking);
    var flagged = extras ? explicitDayTrip(extras.dayTrip) : null;
    if (flagged !== null) return flagged;
    var details = plan && isObj(plan.bookingDetails) ? plan.bookingDetails : null;
    flagged = details ? explicitDayTrip(details.dayTrip) : null;
    if (flagged !== null) return flagged;
    var hotel = '';
    if (booking) hotel = (booking.hotels && booking.hotels.name) || booking.hotel_name || '';
    if (!str(hotel).trim() && plan) hotel = plan.tourHotelName || '';
    if (isDayTripHotelName(hotel)) return true;
    var group = (booking && booking.group_name) || (plan && plan.groupName) || '';
    return /\bday trip\b/i.test(str(group)) && !str(hotel).trim();
  }

  /** Who, hotel, place, year, and rooms for one booking. The same facts on every page. */
  function bookingLink(booking, plan) {
    var dayTrip = bookingIsDayTrip(booking, plan);
    var arrival = (booking && (booking.tour_arrival_date || booking.arrivalDate)) || (plan && plan.arrivalDate) || '';
    var source = null;
    var column = booking && booking.keith_own_room;
    if (booking && booking.extra_notes) {
      var split = splitNotesAndExtras(booking.extra_notes);
      source = (split.rawExtras && Object.keys(split.rawExtras).length) ? split.rawExtras : null;
    } else if (booking && isObj(booking._extras)) {
      source = booking._extras;
    } else if (plan && isObj(plan.bookingDetails)) {
      source = plan.bookingDetails;
    }
    return {
      year: arrivalYear(arrival),
      people: peopleOnBooking(booking, plan),
      hotel: hotelOnBooking(booking, plan),
      places: placesOnBooking(booking, plan),
      dayTrip: dayTrip,
      roomsLabel: dayTrip ? '' : roomsNeededLabel(source, column)
    };
  }

  function rememberHotelUsed(hotel) {
    var name = str(hotel && hotel.name).trim();
    var key = hotelUsedKey(name);
    if (!key || isDayTripHotelName(name)) return readHotelsUsed();
    var id = hotel && hotel.id != null && hotel.id !== '' ? Number(hotel.id) : null;
    if (!Number.isFinite(id)) id = null;
    var list = readHotelsUsed();
    var found = null;
    list.forEach(function (row) {
      if (hotelUsedKey(row.name) === key) found = row;
    });
    if (found) {
      if (id != null) found.id = id;
      found.name = name;
    } else {
      list.push({ id: id, name: name });
    }
    try { localStorage.setItem(HOTELS_USED_KEY, JSON.stringify(list)); } catch (err) {}
    return list;
  }

  function mergeTravelIntoFlights(flights, extras, arrivalDate, departureDate) {
    var list = Array.isArray(flights) ? flights.map(function (f) { return Object.assign({}, f); }) : [];
    var tr = (extras && extras.travel) || {};
    var arrF = str(tr.arrivalFlight).trim();
    var depF = str(tr.departureFlight).trim();
    var arrT = hhmm(tr.arrivalTime);
    var depT = hhmm(tr.departureTime);
    var pickupBits = [];
    if (tr.pickupPoint === 'airport') pickupBits.push('Airport');
    else if (tr.pickupPoint === 'prague_hotel') pickupBits.push('Prague hotel');
    if (str(tr.pickupPlace).trim()) pickupBits.push(str(tr.pickupPlace).trim());
    if (hhmm(tr.pickupTime)) pickupBits.push(hhmm(tr.pickupTime));
    var pickup = pickupBits.join(' · ');
    if (!arrF && !depF && !arrT && !depT && !pickup) return list;

    function blankFlight() {
      return {
        id: null,
        flight_number: '',
        arrival_date: arrivalDate || null,
        arrival_time: null,
        departure_date: departureDate || null,
        departure_time: null,
        comments: null
      };
    }

    if (!list.length) {
      var inbound = blankFlight();
      inbound.flight_number = arrF || depF || '';
      inbound.arrival_time = arrT;
      inbound.departure_time = (arrF && depF && arrF !== depF) ? null : depT;
      if (arrF && depF && arrF !== depF) {
        inbound.departure_date = null;
        inbound.departure_time = null;
      }
      if (pickup) inbound.comments = 'Pick-up: ' + pickup;
      list.push(inbound);
      if (arrF && depF && arrF !== depF) {
        var outbound = blankFlight();
        outbound.flight_number = depF;
        outbound.arrival_date = null;
        outbound.arrival_time = null;
        outbound.departure_time = depT;
        list.push(outbound);
      }
      return list;
    }

    var target = list[0];
    if (arrF) {
      var match = list.find(function (f) {
        return str(f.flight_number).trim().toLowerCase() === arrF.toLowerCase();
      });
      if (match) target = match;
    }
    if (!str(target.flight_number).trim() && (arrF || depF)) target.flight_number = arrF || depF;
    if (!target.arrival_time && arrT) target.arrival_time = arrT;
    if (!target.departure_time && depT && !(arrF && depF && arrF !== depF)) target.departure_time = depT;
    if (!target.arrival_date && arrivalDate) target.arrival_date = arrivalDate;
    if (!target.departure_date && departureDate) target.departure_date = departureDate;
    if (pickup && !str(target.comments).trim()) target.comments = 'Pick-up: ' + pickup;
    if (depF && (!arrF || depF.toLowerCase() !== arrF.toLowerCase())) {
      var haveOut = list.some(function (f) {
        return str(f.flight_number).trim().toLowerCase() === depF.toLowerCase();
      });
      if (!haveOut && list.length === 1 && !str(list[0].flight_number).trim()) {
        list[0].flight_number = depF;
        if (!list[0].departure_time && depT) list[0].departure_time = depT;
      } else if (!haveOut) {
        var outRow = blankFlight();
        outRow.flight_number = depF;
        outRow.arrival_date = null;
        outRow.arrival_time = null;
        outRow.departure_time = depT;
        list.push(outRow);
      }
    }
    return list;
  }

  root.BookingExtras = {
    START: START,
    END: END,
    DEPOSIT_PER_PERSON_GBP: DEPOSIT_PER_PERSON_GBP,
    DAY_TRIP_PRICE_GBP: 85,
    SIDE_PLACES: SIDE_PLACES,
    knownSidePlace: knownSidePlace,
    sidePlaceLabel: sidePlaceLabel,
    normaliseSideTrip: normaliseSideTrip,
    empty: empty,
    merge: merge,
    normaliseDelayYear: normaliseDelayYear,
    normaliseLinkedBookingId: normaliseLinkedBookingId,
    hasContent: hasContent,
    splitNotesAndExtras: splitNotesAndExtras,
    joinNotesAndExtras: joinNotesAndExtras,
    cloneJson: cloneJson,
    sameJson: sameJson,
    applyEditedPatch: applyEditedPatch,
    overlayDetails: overlayDetails,
    guestBeds: guestBeds,
    guestRoomCount: guestRoomCount,
    keithRoomIsOn: keithRoomIsOn,
    roomsNeeded: roomsNeeded,
    roomsNeededLabel: roomsNeededLabel,
    roomPlanStarted: roomPlanStarted,
    roomWarning: roomWarning,
    guestCountWarning: guestCountWarning,
    suggestedDepositGbp: suggestedDepositGbp,
    organiserFullName: organiserFullName,
    methodLabel: methodLabel,
    roomSummary: roomSummary,
    mergeTravelIntoFlights: mergeTravelIntoFlights,
    hotelUsedKey: hotelUsedKey,
    isDayTripHotelName: isDayTripHotelName,
    readHotelsUsed: readHotelsUsed,
    rememberHotelUsed: rememberHotelUsed,
    arrivalYear: arrivalYear,
    peopleOnBooking: peopleOnBooking,
    hotelOnBooking: hotelOnBooking,
    placesOnBooking: placesOnBooking,
    bookingIsDayTrip: bookingIsDayTrip,
    bookingLink: bookingLink
  };
})(typeof window !== 'undefined' ? window : globalThis);
