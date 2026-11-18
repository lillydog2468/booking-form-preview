/*
 * Order Prague hotel pick-ups so the drive leaves toward Jablonec.
 * The last stop is the hotel nearest the D10 at Vysočany (about 50.1055, 14.5490).
 * Earlier stops are the shortest chain that still ends there.
 * The Maps link itself still starts at the phone's current location.
 */
(function (root) {
  'use strict';

  var EXIT = { lat: 50.1055, lng: 14.5490 };
  var KNOWN = [
    { test: /obecniho/, lat: 50.09086, lng: 14.41855 },
    { test: /na porici 40|\baxa\b/, lat: 50.0894, lng: 14.4392 },
    { test: /na porici 9|\batlantic\b/, lat: 50.08995, lng: 14.4331 },
    { test: /josef|rybna/, lat: 50.08955, lng: 14.4259 },
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

  function coordFor(point) {
    if (point && typeof point === 'object') {
      var lat = Number(point.lat != null ? point.lat : point.pinLat);
      var lng = Number(point.lng != null ? point.lng : point.pinLng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat: lat, lng: lng };
      point = point.point || point.address || point.hotel || point.label || '';
    }
    var text = fold(point);
    if (!text) return null;
    var i;
    for (i = 0; i < KNOWN.length; i++) {
      if (KNOWN[i].test.test(text)) return { lat: KNOWN[i].lat, lng: KNOWN[i].lng };
    }
    return null;
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
    haversine: haversine,
    coordFor: coordFor,
    order: order,
  };
})(typeof window !== 'undefined' ? window : globalThis);
