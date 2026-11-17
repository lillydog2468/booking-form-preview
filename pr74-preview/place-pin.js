/*
 * place-pin.js — saved map pins for Places, and where Navigate should go.
 *
 * A pin is two numbers on the place (pinLat, pinLng). The database columns
 * are optional until sql/28_planner_place_pins.sql has been run. Until then
 * the pin stays on this device and is left out of the Supabase write.
 *
 * Nominatim is used only to guess a typed address when the map is opened.
 * One lookup at a time, then a pause, and the answer is remembered.
 */
(function (root) {
  'use strict';

  var JABLONEC = { lat: 50.7243, lng: 15.1711 };
  var DEVICE_KEY = 'planner_place_pins_v1';
  var gapMs = 1100;
  var jobs = [];
  var active = false;
  var geocodeCache = Object.create(null);
  var geocodeWaiting = Object.create(null);
  var columnsAbsent = false;
  var fallbackStore = null;

  function memoryStore() {
    var bag = {};
    return {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(bag, key) ? bag[key] : null; },
      setItem: function (key, value) { bag[key] = String(value); },
    };
  }

  function storeOf(storage) {
    if (storage) return storage;
    try {
      if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
    } catch (e) { /* private mode */ }
    if (!fallbackStore) fallbackStore = memoryStore();
    return fallbackStore;
  }

  function numberOrNull(value) {
    if (value == null) return null;
    if (typeof value === 'string' && !String(value).trim()) return null;
    var n = Number(value);
    if (!isFinite(n)) return null;
    return n;
  }

  function trimCoord(n) {
    return String(Math.round(n * 1e6) / 1e6);
  }

  function readPin(obj) {
    if (!obj || typeof obj !== 'object') return null;
    var lat = numberOrNull(obj.pinLat != null ? obj.pinLat : obj.pin_lat);
    var lng = numberOrNull(obj.pinLng != null ? obj.pinLng : obj.pin_lng);
    if (lat == null || lng == null) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    var setAt = obj.pinSetAt || obj.pin_set_at || '';
    return { lat: trimCoord(lat), lng: trimCoord(lng), setAt: setAt ? String(setAt) : '' };
  }

  function readDevicePins(storage) {
    try {
      var raw = storeOf(storage).getItem(DEVICE_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function writeDevicePins(all, storage) {
    try { storeOf(storage).setItem(DEVICE_KEY, JSON.stringify(all || {})); } catch (e) { /* ignore */ }
  }

  function rememberDevicePin(place, storage) {
    if (!place || place.id == null) return;
    var all = readDevicePins(storage);
    var pin = readPin(place);
    if (!pin) delete all[String(place.id)];
    else all[String(place.id)] = { pinLat: pin.lat, pinLng: pin.lng, pinSetAt: pin.setAt || '' };
    writeDevicePins(all, storage);
  }

  function applyDevicePin(place, storage) {
    if (!place || readPin(place)) return place;
    var saved = readDevicePins(storage)[String(place.id || '')];
    var pin = readPin(saved);
    if (!pin) return place;
    place.pinLat = Number(pin.lat);
    place.pinLng = Number(pin.lng);
    place.pinSetAt = pin.setAt || '';
    return place;
  }

  /**
   * A cloud row wins when it actually has the pin columns.
   * A row without those keys keeps a pin saved on this device.
   */
  function applyRowPin(place, row, storage) {
    if (!place) return place;
    var hasColumn = row && Object.prototype.hasOwnProperty.call(row, 'pin_lat');
    if (hasColumn) {
      var pin = readPin({ pin_lat: row.pin_lat, pin_lng: row.pin_lng, pin_set_at: row.pin_set_at });
      if (pin) {
        place.pinLat = Number(pin.lat);
        place.pinLng = Number(pin.lng);
        place.pinSetAt = pin.setAt || '';
        place.pinNeedsUpload = false;
        rememberDevicePin(place, storage);
        return place;
      }
      // Null on the server means it has not been stored yet. A pin made on
      // this device before the columns existed must not be thrown away.
      var kept = readPin(readDevicePins(storage)[String(place.id || '')]);
      if (kept) {
        place.pinLat = Number(kept.lat);
        place.pinLng = Number(kept.lng);
        place.pinSetAt = kept.setAt || '';
        place.pinNeedsUpload = true;
        return place;
      }
      place.pinLat = null;
      place.pinLng = null;
      place.pinSetAt = '';
      place.pinNeedsUpload = false;
      return place;
    }
    return applyDevicePin(place, storage);
  }

  function normalisePlace(place) {
    if (!place) return place;
    var pin = readPin(place);
    if (pin) {
      place.pinLat = Number(pin.lat);
      place.pinLng = Number(pin.lng);
      place.pinSetAt = pin.setAt || '';
    } else {
      place.pinLat = null;
      place.pinLng = null;
      if (place.pinSetAt == null) place.pinSetAt = '';
    }
    return place;
  }

  function writePin(place, lat, lng, when) {
    if (!place) return null;
    var pin = readPin({ pinLat: lat, pinLng: lng, pinSetAt: when || new Date().toISOString() });
    if (!pin) return null;
    place.pinLat = Number(pin.lat);
    place.pinLng = Number(pin.lng);
    place.pinSetAt = pin.setAt;
    rememberDevicePin(place);
    return pin;
  }

  function clearPin(place) {
    if (!place) return;
    place.pinLat = null;
    place.pinLng = null;
    place.pinSetAt = '';
    rememberDevicePin(place);
  }

  function addressPoint(text) {
    var HS = root.HandoverStops;
    if (!HS || !HS.resolveMapTarget) return null;
    var target = HS.resolveMapTarget(text);
    if (!target || target.mode !== 'directions') return null;
    var found = /daddr=([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)(?:&|$)/.exec(target.https || '');
    if (!found) return null;
    return { lat: Number(found[1]), lng: Number(found[2]) };
  }

  function isMapLinkWithoutCoords(text) {
    var HS = root.HandoverStops;
    if (!HS || !HS.resolveMapTarget) return false;
    var target = HS.resolveMapTarget(text);
    return !!(target && target.mode === 'open');
  }

  function geocodeQuery(address) {
    var text = String(address || '').trim();
    if (!text) return '';
    if (/\bczech\b|\bčesk|\bcesk/i.test(text)) return text;
    return text + ', Czech Republic';
  }

  function cachedGeocode(place) {
    var addr = String(place && place.address || '').trim();
    if (!addr) return null;
    if (place && place.geocodeQuery === addr) {
      var lat = numberOrNull(place.geocodeLat);
      var lng = numberOrNull(place.geocodeLng);
      if (lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat: lat, lng: lng };
      }
    }
    var hit = geocodeCache[geocodeQuery(addr).toLowerCase()];
    return hit || null;
  }

  function centreForPlace(place) {
    var pin = readPin(place);
    if (pin) return { lat: Number(pin.lat), lng: Number(pin.lng), source: 'pin' };
    var addr = String(place && place.address || '').trim();
    var parsed = addr ? addressPoint(addr) : null;
    if (parsed) return { lat: parsed.lat, lng: parsed.lng, source: 'address' };
    var cached = cachedGeocode(place);
    if (cached) return { lat: cached.lat, lng: cached.lng, source: 'geocode' };
    return { lat: JABLONEC.lat, lng: JABLONEC.lng, source: 'jablonec' };
  }

  function zoomFor(centre) {
    if (!centre) return 13;
    if (centre.source === 'pin' || centre.source === 'address') return 16;
    if (centre.source === 'geocode') return 15;
    return 13;
  }

  function needsLookup(place) {
    if (readPin(place)) return false;
    var addr = String(place && place.address || '').trim();
    if (!addr) return false;
    if (addressPoint(addr) || isMapLinkWithoutCoords(addr)) return false;
    if (cachedGeocode(place)) return false;
    return true;
  }

  function nominatimUrl(address) {
    return 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' + encodeURIComponent(geocodeQuery(address));
  }

  function pump() {
    if (active || !jobs.length) return;
    active = true;
    var job = jobs.shift();
    var fetchFn = job.fetch || (typeof fetch === 'function' ? fetch : null);
    var finish = function (point) {
      if (point) geocodeCache[job.key] = point;
      job.resolve(point || null);
      setTimeout(function () {
        active = false;
        pump();
      }, gapMs);
    };
    if (!fetchFn) { finish(null); return; }
    Promise.resolve(fetchFn(job.url, { headers: { Accept: 'application/json' } })).then(function (res) {
      if (!res || !res.ok) return null;
      return res.json ? res.json() : null;
    }).then(function (rows) {
      var row = rows && rows[0];
      var lat = row ? numberOrNull(row.lat) : null;
      var lng = row ? numberOrNull(row.lon != null ? row.lon : row.lng) : null;
      if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) finish(null);
      else finish({ lat: lat, lng: lng });
    }).catch(function () { finish(null); });
  }

  function geocodeAddress(address, options) {
    var query = String(address || '').trim();
    if (!query || isMapLinkWithoutCoords(query) || addressPoint(query)) return Promise.resolve(addressPoint(query));
    var key = geocodeQuery(query).toLowerCase();
    if (geocodeCache[key]) return Promise.resolve(geocodeCache[key]);
    if (geocodeWaiting[key]) return geocodeWaiting[key];
    var waiting = new Promise(function (resolve) {
      jobs.push({
        key: key,
        url: nominatimUrl(query),
        fetch: options && options.fetch,
        resolve: resolve,
      });
      pump();
    });
    geocodeWaiting[key] = waiting;
    waiting.then(function () { delete geocodeWaiting[key]; }, function () { delete geocodeWaiting[key]; });
    return waiting;
  }

  function rememberGeocode(place, point) {
    if (!place || !point) return;
    place.geocodeLat = point.lat;
    place.geocodeLng = point.lng;
    place.geocodeQuery = String(place.address || '').trim();
    var key = geocodeQuery(place.geocodeQuery).toLowerCase();
    if (key) geocodeCache[key] = { lat: point.lat, lng: point.lng };
  }

  function navigationQuery(stop, place, fallback) {
    var stopPin = readPin(stop);
    if (stopPin) return stopPin.lat + ',' + stopPin.lng;
    var placePin = readPin(place);
    if (placePin) return placePin.lat + ',' + placePin.lng;
    return String(fallback || '').trim();
  }

  /** Open Apple Maps on a saved pin, labelled with the place name. */
  function applePinHref(name, pin) {
    var point = readPin(pin) || readPin({ pinLat: pin && pin.lat, pinLng: pin && pin.lng });
    if (!point) return '';
    var label = String(name || '').trim() || 'Pinned location';
    return 'https://maps.apple.com/?ll=' + point.lat + ',' + point.lng + '&q=' + encodeURIComponent(label);
  }

  /**
   * Link for Open in Apple Maps.
   * A saved pin wins. A pasted map link or typed coordinates use the same
   * address Navigate uses. A plain address returns '' so the caller keeps ?q=.
   */
  function openInAppleMapsHref(name, address, place) {
    var pin = readPin(place);
    if (pin) return applePinHref(name || (place && place.name), pin);
    var text = String(address || '').trim();
    var HS = root.HandoverStops;
    if (!text || !HS || !HS.resolveMapTarget) return '';
    var target = HS.resolveMapTarget(text);
    if (target && (target.mode === 'directions' || target.mode === 'open')) return target.https || text;
    return '';
  }

  function pinStatusText(place) {
    var pin = readPin(place);
    if (!pin) return '';
    return 'Pin saved · ' + pin.lat + ', ' + pin.lng;
  }

  function isMissingPinColumn(error) {
    if (!error) return false;
    var code = String(error.code || '');
    var msg = [error.message, error.details, error.hint].map(function (part) { return String(part || ''); }).join(' ');
    if (!/pin_lat|pin_lng|pin_set_at/.test(msg)) return false;
    return code === '42703' || code === 'PGRST204' || /schema cache|does not exist/i.test(msg) || code === '';
  }

  function omitPinColumns(row) {
    var copy = {};
    Object.keys(row || {}).forEach(function (key) {
      if (key === 'pin_lat' || key === 'pin_lng' || key === 'pin_set_at') return;
      copy[key] = row[key];
    });
    return copy;
  }

  function attachPinColumns(row, place) {
    var copy = {};
    Object.keys(row || {}).forEach(function (key) { copy[key] = row[key]; });
    if (columnsAbsent) return copy;
    var pin = readPin(place);
    if (!pin) {
      copy.pin_lat = null;
      copy.pin_lng = null;
      copy.pin_set_at = null;
    } else {
      copy.pin_lat = Number(pin.lat);
      copy.pin_lng = Number(pin.lng);
      copy.pin_set_at = pin.setAt || null;
    }
    return copy;
  }

  function pinChanged(before, after) {
    var a = readPin(before);
    var b = readPin(after);
    if (!a && !b) return false;
    if (!a || !b) return true;
    return a.lat !== b.lat || a.lng !== b.lng || String(a.setAt || '') !== String(b.setAt || '');
  }

  function pinPatch(before, after) {
    if (columnsAbsent || !pinChanged(before, after)) return {};
    var pin = readPin(after);
    if (!pin) return { pin_lat: null, pin_lng: null, pin_set_at: null };
    return {
      pin_lat: Number(pin.lat),
      pin_lng: Number(pin.lng),
      pin_set_at: pin.setAt || null,
    };
  }

  function markColumnsAbsent() {
    columnsAbsent = true;
  }

  function columnsAreAbsent() {
    return columnsAbsent;
  }

  /**
   * Run a Supabase write. If the pin columns are not there yet, write again
   * without them so the rest of the place still saves.
   */
  function writeWithoutMissingPinColumns(row, write) {
    return Promise.resolve().then(function () { return write(row); }).then(function (result) {
      var error = result && result.error;
      if (!isMissingPinColumn(error)) return result;
      markColumnsAbsent();
      return write(omitPinColumns(row));
    }).catch(function (err) {
      if (!isMissingPinColumn(err)) throw err;
      markColumnsAbsent();
      return write(omitPinColumns(row));
    });
  }

  function resetForTests() {
    jobs = [];
    active = false;
    geocodeCache = Object.create(null);
    geocodeWaiting = Object.create(null);
    columnsAbsent = false;
    gapMs = 1100;
  }

  function setGeocodeGap(ms) {
    gapMs = Math.max(0, Number(ms) || 0);
  }

  root.PlacePin = {
    JABLONEC: JABLONEC,
    readPin: readPin,
    writePin: writePin,
    clearPin: clearPin,
    normalisePlace: normalisePlace,
    applyRowPin: applyRowPin,
    applyDevicePin: applyDevicePin,
    rememberDevicePin: rememberDevicePin,
    centreForPlace: centreForPlace,
    zoomFor: zoomFor,
    needsLookup: needsLookup,
    geocodeAddress: geocodeAddress,
    geocodeQuery: geocodeQuery,
    rememberGeocode: rememberGeocode,
    navigationQuery: navigationQuery,
    applePinHref: applePinHref,
    openInAppleMapsHref: openInAppleMapsHref,
    pinStatusText: pinStatusText,
    isMissingPinColumn: isMissingPinColumn,
    omitPinColumns: omitPinColumns,
    attachPinColumns: attachPinColumns,
    pinPatch: pinPatch,
    markColumnsAbsent: markColumnsAbsent,
    columnsAreAbsent: columnsAreAbsent,
    writeWithoutMissingPinColumns: writeWithoutMissingPinColumns,
    setGeocodeGap: setGeocodeGap,
    resetForTests: resetForTests,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
