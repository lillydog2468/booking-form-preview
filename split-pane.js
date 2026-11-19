/*
 * Width of the places column beside the week.
 * The number is stored on this device. A finger and a mouse keep separate widths.
 * Nothing here talks to the network.
 */
(function (root) {
  'use strict';

  var DEFAULT_PX = 380;
  var MIN_PLACES = 220;
  var MIN_WEEK = 420;
  var STORAGE_KEY = 'booking_places_width_v1';

  function clamp(width, total, handle) {
    var room = Math.max(0, Number(total) - (Number(handle) || 0));
    var minPlaces = MIN_PLACES;
    var minWeek = MIN_WEEK;
    if (room > 0 && room < minPlaces + minWeek) {
      minPlaces = Math.max(160, Math.floor(room * 0.34));
      minWeek = Math.max(0, room - minPlaces);
    }
    var places = Number(width);
    if (!Number.isFinite(places)) places = DEFAULT_PX;
    if (places < minPlaces) places = minPlaces;
    if (room > 0 && places > room - minWeek) places = Math.max(minPlaces, room - minWeek);
    return Math.round(places);
  }

  function storageKey(pointer) {
    return STORAGE_KEY + (pointer === 'touch' ? ':touch' : ':mouse');
  }

  function pointerKind(info) {
    var coarse = info && info.coarse;
    var points = Number(info && info.maxTouchPoints);
    return coarse || points > 1 ? 'touch' : 'mouse';
  }

  function read(storage, key) {
    if (!storage || !key) return null;
    try {
      var n = Number(storage.getItem(key));
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch (_) {
      return null;
    }
  }

  function write(storage, key, width) {
    if (!storage || !key) return;
    try { storage.setItem(key, String(Math.round(width))); } catch (_) { /* private mode */ }
  }

  function clear(storage, key) {
    if (!storage || !key) return;
    try { storage.removeItem(key); } catch (_) { /* private mode */ }
  }

  root.SplitPane = {
    DEFAULT_PX: DEFAULT_PX,
    MIN_PLACES: MIN_PLACES,
    MIN_WEEK: MIN_WEEK,
    STORAGE_KEY: STORAGE_KEY,
    clamp: clamp,
    storageKey: storageKey,
    pointerKind: pointerKind,
    read: read,
    write: write,
    clear: clear,
  };
}(typeof window !== 'undefined' ? window : globalThis));
