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
    { test: /\baxa\b|na porici 40\b/, address: 'Na Poříčí 40, Praha 1', street: 'Na Poříčí', house: '40', lat: 50.0898903, lng: 14.435736 },
    { test: /\batlantic\b|na porici 9\b/, address: 'Na Poříčí 9, Praha 1', street: 'Na Poříčí', house: '9', lat: 50.0898424, lng: 14.4316578 },
    { test: /\bjosef\b|\brybna\b/, address: 'Rybná 20, Praha 1', street: 'Rybná', house: '20', lat: 50.0900889, lng: 14.4264446 },
    { test: /obecniho domu|namesti republiky/, address: 'náměstí Republiky 5, Praha 1', street: 'náměstí Republiky', house: '5', lat: 50.0877557, lng: 14.4277637 },
    { test: /obecniho dvora/, address: 'U Obecního dvora 7, Praha 1', street: 'U Obecního dvora', house: '7', lat: 50.0912537, lng: 14.4230426 },
  ];

  function fold(text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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

  function coordFor(point) {
    if (point && typeof point === 'object') {
      var named = matchKnown(point.hotel || point.name || point.nickname || point.label || '');
      if (!named) named = matchKnown(point.address || point.point || '');
      if (named) return { lat: named.lat, lng: named.lng };
      var lat = Number(point.lat != null ? point.lat : point.pinLat);
      var lng = Number(point.lng != null ? point.lng : point.pinLng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat: lat, lng: lng };
      point = point.point || point.address || point.hotel || point.label || '';
    }
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
  };
})(typeof window !== 'undefined' ? window : globalThis);
