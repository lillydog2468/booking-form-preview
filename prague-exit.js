/*
 * Order Prague hotel pick-ups so the drive leaves toward Jablonec.
 * The last stop is the hotel nearest the D10 at Vysočany (about 50.1055, 14.5490).
 * Earlier stops are the shortest chain that still ends there.
 * The Maps link itself still starts at the phone's current location.
 */
(function (root) {
  'use strict';

  var EXIT = { lat: 50.1055, lng: 14.5490 };
  // Street addresses are what Keith sees. The coordinates sit on the building,
  // not a nearby bus station or a namesake office.
  var KNOWN = [
    { test: /hilton prague atrium|\bprague atrium\b/, name: 'Hilton Prague Atrium', address: 'Pobřežní 1, Praha 8', street: 'Pobřežní', house: '1', lat: 50.0933467, lng: 14.4396649 },
    { test: /\baxa\b|na porici 40\b/, name: 'Hotel AXA', address: 'Na Poříčí 40, Praha 1', street: 'Na Poříčí', house: '40', lat: 50.0898903, lng: 14.435736 },
    { test: /\batlantic\b|na porici 9\b/, name: 'Hotel Atlantic', address: 'Na Poříčí 9, Praha 1', street: 'Na Poříčí', house: '9', lat: 50.0898424, lng: 14.4316578 },
    { test: /\bjosef\b|\brybna\b/, name: 'Hotel Josef', address: 'Rybná 20, Praha 1', street: 'Rybná', house: '20', lat: 50.0900889, lng: 14.4264446 },
    { test: /obecniho domu|namesti republiky/, name: 'Obecní dům', address: 'náměstí Republiky 5, Praha 1', street: 'náměstí Republiky', house: '5', lat: 50.0877557, lng: 14.4277637 },
    { test: /obecniho dvora/, name: 'U Obecního dvora', address: 'U Obecního dvora 7, Praha 1', street: 'U Obecního dvora', house: '7', lat: 50.0912537, lng: 14.4230426 },
  ];
  var remembered = [];

  function fold(text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function hotelKey(text) {
    return fold(text).replace(/\b(hotel|the)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function isHotelPlace(place) {
    if (!place) return false;
    var type = String(place.place_type || place.type || '').toLowerCase();
    if (type === 'hotel') return true;
    var types = place.place_types || place.types || [];
    var i;
    for (i = 0; i < types.length; i++) {
      if (String(types[i]).toLowerCase() === 'hotel') return true;
    }
    return false;
  }

  function finiteCoord(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function rememberHotels(places) {
    remembered = [];
    (places || []).forEach(function (place) {
      if (!isHotelPlace(place)) return;
      var name = String(place.name || '').trim();
      var nick = String(place.nickname || '').trim();
      var keys = [];
      [name, nick].forEach(function (part) {
        var key = hotelKey(part);
        if (key && keys.indexOf(key) < 0) keys.push(key);
      });
      if (!keys.length) return;
      var lat = finiteCoord(place.pin_lat != null ? place.pin_lat : place.pinLat);
      var lng = finiteCoord(place.pin_lng != null ? place.pin_lng : place.pinLng);
      remembered.push({
        keys: keys,
        name: name,
        address: String(place.address || '').trim(),
        lat: lat,
        lng: lng,
      });
    });
  }

  function rememberedMatch(text) {
    var key = hotelKey(text);
    if (!key) return null;
    var i;
    for (i = 0; i < remembered.length; i++) {
      if (remembered[i].keys.indexOf(key) >= 0) {
        return {
          name: remembered[i].name,
          address: remembered[i].address,
          lat: remembered[i].lat,
          lng: remembered[i].lng,
          source: 'place',
        };
      }
    }
    return null;
  }

  function knownListMatch(text) {
    var folded = fold(text);
    if (!folded) return null;
    var i;
    for (i = 0; i < KNOWN.length; i++) {
      if (KNOWN[i].test.test(folded)) {
        return {
          name: KNOWN[i].name || '',
          address: KNOWN[i].address || '',
          lat: KNOWN[i].lat,
          lng: KNOWN[i].lng,
          source: 'known',
        };
      }
    }
    return null;
  }

  function matchHotel(text) {
    return rememberedMatch(text) || knownListMatch(text);
  }

  function haversine(a, b) {
    var r = 6371;
    var p1 = a.lat * Math.PI / 180;
    var p2 = b.lat * Math.PI / 180;
    var dLat = (b.lat - a.lat) * Math.PI / 180;
    var dLng = (b.lng - a.lng) * Math.PI / 180;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function matchKnown(text) {
    var folded = fold(text);
    if (!folded) return null;
    var i;
    for (i = 0; i < KNOWN.length; i++) {
      if (KNOWN[i].test.test(folded)) return KNOWN[i];
    }
    return null;
  }

  function placeFor(text) {
    var source = text;
    if (source && typeof source === 'object') {
      source = source.hotel || source.name || source.nickname || source.label || source.address || source.point || '';
    }
    var hit = matchKnown(source);
    if (!hit) return null;
    return { lat: hit.lat, lng: hit.lng, address: hit.address, street: hit.street, house: hit.house || '' };
  }

  function bareCoordinates(text) {
    return /^[+-]?\d+(?:\.\d+)?\s*,\s*[+-]?\d+(?:\.\d+)?$/.test(String(text || '').trim());
  }

  /** Street name, and a house number when the address has one. A postcode is never part of it. */
  function streetParts(address) {
    var raw = String(address || '').trim();
    if (!raw || bareCoordinates(raw)) return null;
    var known = matchKnown(raw);
    if (known && known.street) return { street: known.street, house: known.house || '', address: known.address };
    var head = raw.split(',')[0].trim();
    head = head.replace(/\b\d{3}\s?\d{2}\b/g, '');
    head = head.replace(/\b(praha|prague|czechia|czech republic|cesko)\b/ig, '');
    head = head.replace(/[,\s]+$/g, '').replace(/\s{2,}/g, ' ').trim();
    if (!head) return null;
    var house = '';
    var split = /^(.*\D)\s+(\d+[a-zA-Z]?(?:\/\d+[a-zA-Z]?)?)$/.exec(head);
    if (split && split[1].trim()) {
      house = split[2];
      head = split[1].trim();
    }
    return { street: head, house: house, address: raw };
  }

  function savedPin(text) {
    var saved = rememberedMatch(text);
    if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lng)) return { lat: saved.lat, lng: saved.lng };
    return null;
  }

  function coordFor(point) {
    if (point && typeof point === 'object') {
      var savedObj = savedPin(point.hotel || point.name || point.nickname || point.label || point.address || point.point || '');
      if (savedObj) return savedObj;
      var named = matchKnown(point.hotel || point.name || point.nickname || point.label || '');
      if (!named) named = matchKnown(point.address || point.point || '');
      if (named) return { lat: named.lat, lng: named.lng };
      var lat = Number(point.lat != null ? point.lat : point.pinLat);
      var lng = Number(point.lng != null ? point.lng : point.pinLng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat: lat, lng: lng };
      point = point.point || point.address || point.hotel || point.label || '';
    }
    var saved = savedPin(point);
    if (saved) return saved;
    var hit = matchKnown(point);
    return hit ? { lat: hit.lat, lng: hit.lng } : null;
  }

  function permutations(items) {
    if (items.length <= 1) return [items.slice()];
    var out = [];
    items.forEach(function (item, index) {
      permutations(items.slice(0, index).concat(items.slice(index + 1))).forEach(function (rest) {
        out.push([item].concat(rest));
      });
    });
    return out;
  }

  function order(points, opts) {
    var list = (points || []).map(function (point) { return String(point || '').trim(); }).filter(Boolean);
    var options = opts || {};
    if (list.length < 2) return { points: list.slice(), fallback: false, reason: '' };
    var coords = list.map(coordFor);
    if (coords.some(function (coord) { return !coord; })) {
      return { points: list.slice(), fallback: true, reason: 'Kept the listed order — no map pin for every hotel' };
    }
    var lastIndex = 0;
    var nearest = Infinity;
    coords.forEach(function (coord, index) {
      var distance = haversine(coord, EXIT);
      if (distance < nearest) {
        nearest = distance;
        lastIndex = index;
      }
    });
    var rest = [];
    list.forEach(function (_, index) { if (index !== lastIndex) rest.push(index); });
    var start = options.start && Number.isFinite(Number(options.start.lat)) ? options.start : null;
    var best = rest;
    var bestLength = Infinity;
    var candidates = rest.length <= 5 ? permutations(rest) : [rest.slice().sort(function (a, b) {
      return haversine(coords[b], EXIT) - haversine(coords[a], EXIT);
    })];
    candidates.forEach(function (perm) {
      var path = [];
      if (start) path.push(start);
      perm.forEach(function (index) { path.push(coords[index]); });
      path.push(coords[lastIndex]);
      path.push(EXIT);
      var length = 0;
      var i;
      for (i = 1; i < path.length; i++) length += haversine(path[i - 1], path[i]);
      if (length < bestLength) {
        bestLength = length;
        best = perm;
      }
    });
    var ordered = best.map(function (index) { return list[index]; });
    ordered.push(list[lastIndex]);
    if (options.towardExit === false) ordered.reverse();
    return {
      points: ordered,
      fallback: false,
      reason: '',
      first: ordered[0],
      last: ordered[ordered.length - 1],
    };
  }

  root.PragueExit = {
    EXIT: EXIT,
    KNOWN: KNOWN,
    haversine: haversine,
    coordFor: coordFor,
    placeFor: placeFor,
    streetParts: streetParts,
    order: order,
    hotelKey: hotelKey,
    rememberHotels: rememberHotels,
    matchHotel: matchHotel,
  };
})(typeof window !== 'undefined' ? window : globalThis);
