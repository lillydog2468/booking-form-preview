/*
 * Check a Prague hotel name against hotels Keith already knows.
 * A match is a quiet green line. Anything else asks him to tick an address.
 * Nothing is saved until he ticks a candidate. "None of these" saves nothing.
 */
(function (root) {
  'use strict';

  var GAP_MS = 1100;
  var BLUR_MS = 400;
  var cache = Object.create(null);
  var lastRun = 0;
  var client = null;
  var fetchImpl = null;
  var places = [];
  var slotSeq = 0;

  function fold(text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function hotelKey(text) {
    if (root.PragueExit && PragueExit.hotelKey) return PragueExit.hotelKey(text);
    return fold(text).replace(/\b(hotel|the)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function titleCase(name) {
    return String(name || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean).map(function (word) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function matchHotel(name) {
    if (root.PragueExit && PragueExit.matchHotel) return PragueExit.matchHotel(name);
    return null;
  }

  function matchedLine(match) {
    if (!match) return '';
    var name = String(match.name || '').trim() || 'Hotel';
    var address = String(match.address || '').trim();
    if (name && address.toLowerCase().indexOf(name.toLowerCase()) === 0) {
      address = address.slice(name.length).replace(/^[\s,]+/, '');
    }
    return address ? ('Matched: ' + name + ', ' + address) : ('Matched: ' + name);
  }

  function stayAddLabel(count) {
    return count > 0 ? 'Add another stay' : 'Add a stay';
  }

  function addressScope(samePrague) {
    return samePrague
      ? { shared: true, guest: false, groupEditor: true }
      : { shared: false, guest: true, groupEditor: false };
  }

  function groupLineOpensEditor(samePrague) {
    return samePrague === true;
  }

  function extraAddressActive(kind, pickupPoint) {
    if (kind === 'prague-hotel') return true;
    if (kind === 'pickup') return pickupPoint === 'prague_hotel';
    return false;
  }

  function shouldSearchOnInput() { return false; }
  function shouldSearchOnBlur() { return true; }

  function nominatimUrl(name, bounded) {
    var query = String(name || '').trim();
    if (!/,/.test(query)) query = query + ', Prague, Czechia';
    var box = bounded === false ? '' : '&bounded=1&viewbox=14.22,50.18,14.71,49.94';
    return 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5'
      + '&accept-language=en&countrycodes=cz' + box
      + '&q=' + encodeURIComponent(query);
  }

  function photonUrl(name) {
    return 'https://photon.komoot.io/api/?lang=en&limit=5&lat=50.087&lon=14.421&q='
      + encodeURIComponent(String(name || '').trim());
  }

  function strippedHotelName(name) {
    return String(name || '').replace(/\b(hotel|the)\b/ig, ' ').replace(/\s+/g, ' ').trim();
  }

  function searchPlan(name) {
    var raw = String(name || '').trim().replace(/\s+/g, ' ');
    var stripped = strippedHotelName(raw);
    var steps = [];
    function add(kind, url) {
      if (!url || steps.some(function (step) { return step.url === url; })) return;
      steps.push({ kind: kind, url: url });
    }
    if (!raw) return steps;
    add('nominatim', nominatimUrl(raw + ', Prague, Czechia', true));
    add('nominatim', nominatimUrl(raw + ', Praha', false));
    if (stripped && fold(stripped) !== fold(raw)) {
      add('nominatim', nominatimUrl(stripped + ', Praha', false));
      add('nominatim', nominatimUrl(stripped + ', Prague, Czechia', false));
    }
    add('photon', photonUrl(raw));
    if (stripped && fold(stripped) !== fold(raw)) add('photon', photonUrl(stripped));
    return steps;
  }

  function outcomeMessage(list, anyOk) {
    if (list && list.length) return '';
    if (!anyOk) return 'Could not look up addresses. Try again in a moment.';
    return 'No matches, try a different spelling';
  }

  function mapHref(candidate) {
    if (!candidate) return '';
    var lat = Number(candidate.lat);
    var lng = Number(candidate.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
    var label = String(candidate.label || candidate.address || 'Hotel').trim();
    return 'https://maps.apple.com/?ll=' + lat + ',' + lng + '&q=' + encodeURIComponent(label);
  }

  function candidatesFromNominatim(rows) {
    var out = [];
    if (!Array.isArray(rows)) return out;
    rows.forEach(function (row) {
      if (out.length >= 5 || !row) return;
      var lat = Number(row.lat);
      var lng = Number(row.lon != null ? row.lon : row.lng);
      var label = String(row.display_name || '').trim();
      if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
      out.push({ label: label, lat: lat, lng: lng });
    });
    return out;
  }

  function candidatesFromPhoton(data) {
    var out = [];
    var features = data && Array.isArray(data.features) ? data.features : [];
    features.forEach(function (feature) {
      if (out.length >= 5 || !feature) return;
      var coords = feature.geometry && feature.geometry.coordinates;
      var lng = coords ? Number(coords[0]) : NaN;
      var lat = coords ? Number(coords[1]) : NaN;
      var props = feature.properties || {};
      var street = [props.street, props.housenumber].filter(Boolean).join(' ');
      var label = [props.name, street, props.city || props.locality || props.district, props.postcode, props.country]
        .map(function (part) { return String(part || '').trim(); })
        .filter(Boolean)
        .join(', ');
      if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
      out.push({ label: label, lat: lat, lng: lng });
    });
    return out;
  }

  function newPlaceId() {
    return 'place_' + Math.random().toString(36).slice(2, 9);
  }

  function buildPlaceInsert(typedName, candidate, now) {
    var name = titleCase(typedName);
    var when = now || new Date().toISOString();
    return {
      client_id: newPlaceId(),
      name: name || 'Hotel',
      place_type: 'hotel',
      place_types: ['hotel'],
      address: candidate ? String(candidate.label || candidate.address || '').trim() || null : null,
      notes: null,
      nickname: null,
      icon: null,
      sort_order: 200,
      visit_count: 0,
      visit_years: [],
      pin_lat: candidate ? Number(candidate.lat) : null,
      pin_lng: candidate ? Number(candidate.lng) : null,
      pin_set_at: when,
      updated_at: when,
    };
  }

  function choiceResult(choice, typedName, candidate, now) {
    if (!choice || choice === 'none') {
      return { save: false, note: 'address not confirmed', row: null };
    }
    return { save: true, note: '', row: buildPlaceInsert(typedName, candidate, now) };
  }

  function rememberPlace(row) {
    if (!row) return;
    places = places.concat([row]);
    if (root.PragueExit && PragueExit.rememberHotels) PragueExit.rememberHotels(places);
  }

  function setPlaces(rows) {
    places = (rows || []).slice();
    if (root.PragueExit && PragueExit.rememberHotels) PragueExit.rememberHotels(places);
  }

  function setClient(sb) { client = sb || null; }

  function setFetch(fn) { fetchImpl = fn || null; }

  function fetcher() {
    if (fetchImpl) return fetchImpl;
    if (typeof fetch === 'function') return fetch;
    return null;
  }

  function readBody(res, kind) {
    if (!res || !res.ok) return Promise.resolve(null);
    return Promise.resolve(res.json ? res.json() : []).then(function (body) {
      var list = kind === 'photon' ? candidatesFromPhoton(body) : candidatesFromNominatim(body);
      return { ok: true, list: list };
    }).catch(function () { return null; });
  }

  function pause(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function search(name) {
    var key = hotelKey(name);
    var raw = String(name || '').trim();
    if (!raw) return Promise.resolve({ list: [], message: '', failed: false });
    if (Object.prototype.hasOwnProperty.call(cache, key)) {
      return Promise.resolve({ list: cache[key], message: '', failed: false });
    }
    var steps = searchPlan(raw);
    var go = fetcher();
    if (!go || !steps.length) {
      return Promise.resolve({ list: [], message: outcomeMessage([], false), failed: true });
    }
    var anyOk = false;
    function stepAt(index) {
      if (index >= steps.length) {
        return { list: [], message: outcomeMessage([], anyOk), failed: !anyOk };
      }
      var step = steps[index];
      var wait = index === 0 ? 0 : Math.max(0, GAP_MS - (Date.now() - lastRun));
      return pause(wait).then(function () {
        lastRun = Date.now();
        return Promise.resolve(go(step.url, {
          headers: {
            Accept: 'application/json',
            'Accept-Language': 'en',
          },
        })).then(function (res) {
          return readBody(res, step.kind);
        }).catch(function () { return null; });
      }).then(function (parsed) {
        if (parsed && parsed.ok) anyOk = true;
        if (parsed && parsed.list && parsed.list.length) {
          cache[key] = parsed.list;
          return { list: parsed.list, message: '', failed: false };
        }
        return stepAt(index + 1);
      });
    }
    return stepAt(0);
  }

  function lookup(name) {
    return search(name).then(function (result) { return result.list; });
  }

  function clearCache() {
    cache = Object.create(null);
  }

  async function loadPlaces() {
    if (!client || !client.from) return places;
    try {
      var res = await client.from('planner_places').select('client_id, name, nickname, address, place_type, place_types, pin_lat, pin_lng, pin_set_at');
      if (res && !res.error && Array.isArray(res.data)) setPlaces(res.data);
    } catch (err) { /* the form still matches the built-in list */ }
    return places;
  }

  async function savePlace(typedName, candidate) {
    var built = choiceResult('pick', typedName, candidate);
    if (!built.save || !built.row) return { saved: false, row: null, error: 'nothing to save' };
    if (!client || !client.from) return { saved: false, row: built.row, error: 'not signed in' };
    try {
      var res = await client.from('planner_places').insert(built.row).select('client_id');
      if (res && res.error) {
        var msg = String(res.error.message || res.error.details || '');
        if (/pin_lat|pin_lng|pin_set_at|schema cache|permission|grant/i.test(msg)) {
          return { saved: false, row: null, error: 'The hotel list cannot store a map pin yet, so this address was not saved.' };
        }
        return { saved: false, row: null, error: 'Could not save this address.' };
      }
      rememberPlace(built.row);
      return { saved: true, row: built.row, error: '' };
    } catch (err) {
      return { saved: false, row: null, error: 'Could not save this address.' };
    }
  }

  function slotOf(input) {
    return input && input._pragueSlot;
  }

  function ensureSlot(input) {
    var slot = slotOf(input);
    if (slot && slot.isConnected) return slot;
    if (typeof document === 'undefined') return null;
    slot = document.createElement('div');
    slot.className = 'prague-address-slot';
    slot.dataset.slotId = 'prague-slot-' + (++slotSeq);
    var field = input.closest ? (input.closest('.field') || input) : input;
    if (field.insertAdjacentElement) field.insertAdjacentElement('afterend', slot);
    input._pragueSlot = slot;
    slot._pragueInput = input;
    slot.addEventListener('mousedown', function (event) {
      if (event.target.closest && event.target.closest('input, textarea, select, a, button')) return;
      event.preventDefault();
    });
    return slot;
  }

  function paint(input) {
    var slot = ensureSlot(input);
    if (!slot) return;
    if (input.dataset.pragueActive !== '1') {
      slot.hidden = true;
      return;
    }
    slot.hidden = false;
    var name = String(input.value || '').trim();
    var key = hotelKey(name);
    if (!name) {
      slot.innerHTML = '';
      slot.dataset.query = '';
      slot.dataset.choice = '';
      slot._candidates = null;
      return;
    }
    var known = matchHotel(name);
    if (known) {
      slot.innerHTML = '<p class="prague-matched">' + esc(matchedLine(known)) + '</p>';
      return;
    }
    if (slot.dataset.query === key && slot.dataset.choice === 'none') {
      slot.innerHTML = askHtml(slot, null, true);
      bindAsk(input, slot);
      return;
    }
    if (slot.dataset.query === key && slot._candidates) {
      slot.innerHTML = askHtml(slot, slot._candidates, false);
      bindAsk(input, slot);
      return;
    }
    if (slot.dataset.query === key && slot.dataset.busy === '1') {
      slot.innerHTML = '<div class="prague-address-ask"><p>Which address is right?</p><p class="prague-address-status">Looking up addresses…</p></div>';
      return;
    }
    slot.innerHTML = '<div class="prague-address-ask"><p>Which address is right?</p><button type="button" class="prague-find">Find address</button></div>';
    bindAsk(input, slot);
  }

  function askHtml(slot, candidates, noneChosen) {
    var html = '<div class="prague-address-ask"><p>Which address is right?</p>';
    (candidates || []).forEach(function (candidate, index) {
      var href = mapHref(candidate);
      html += '<label class="prague-address-choice"><input type="radio" name="' + esc(slot.dataset.slotId) + '" value="' + index + '"> '
        + '<span>' + esc(candidate.label) + '</span>'
        + (href ? ' <a class="prague-map-link" href="' + esc(href) + '" target="_blank" rel="noopener">open map</a>' : '')
        + '</label>';
    });
    html += '<label class="prague-address-choice"><input type="radio" name="' + esc(slot.dataset.slotId) + '" value="none"' + (noneChosen ? ' checked' : '') + '> <span>None of these</span></label>';
    if (noneChosen) html += '<p class="prague-address-note">address not confirmed</p>';
    if (candidates && !candidates.length && slot.dataset.note) html += '<p class="prague-address-note">' + esc(slot.dataset.note) + '</p>';
    html += '<button type="button" class="prague-find">Find address</button>';
    if (slot.dataset.error) html += '<p class="prague-address-note">' + esc(slot.dataset.error) + '</p>';
    html += '</div>';
    return html;
  }

  function bindAsk(input, slot) {
    var button = slot.querySelector('.prague-find');
    if (button) button.addEventListener('click', function () { searchNow(input); });
    slot.querySelectorAll('input[type="radio"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        if (!radio.checked) return;
        if (radio.value === 'none') {
          slot.dataset.choice = 'none';
          slot.dataset.query = hotelKey(input.value);
          slot.dataset.error = '';
          paint(input);
          return;
        }
        var candidate = (slot._candidates || [])[Number(radio.value)];
        if (!candidate) return;
        slot.dataset.busy = '1';
        slot.dataset.error = '';
        savePlace(input.value, candidate).then(function (result) {
          slot.dataset.busy = '';
          if (!result.saved) {
            slot.dataset.error = result.error || 'Could not save this address.';
            radio.checked = false;
            paint(input);
            return;
          }
          refreshAll();
        });
      });
    });
  }

  function searchNow(input) {
    var slot = slotOf(input);
    if (!slot || input.dataset.pragueActive !== '1') return;
    if (slot._blurTimer) {
      clearTimeout(slot._blurTimer);
      slot._blurTimer = null;
    }
    var name = String(input.value || '').trim();
    if (!name || matchHotel(name)) {
      paint(input);
      return;
    }
    var key = hotelKey(name);
    var generation = (Number(slot.dataset.generation) || 0) + 1;
    slot.dataset.generation = String(generation);
    slot.dataset.query = key;
    slot.dataset.choice = '';
    slot.dataset.busy = '1';
    slot.dataset.error = '';
    slot.dataset.note = '';
    slot._candidates = null;
    paint(input);
    search(name).then(function (result) {
      if (String(generation) !== slot.dataset.generation) return;
      if (hotelKey(input.value) !== key) return;
      slot.dataset.busy = '';
      slot._candidates = result.list || [];
      slot.dataset.query = key;
      slot.dataset.note = result.message || '';
      paint(input);
    });
  }

  function onType(event) {
    var input = event.currentTarget;
    var slot = slotOf(input);
    if (!slot) return;
    if (slot._blurTimer) {
      clearTimeout(slot._blurTimer);
      slot._blurTimer = null;
    }
    var key = hotelKey(input.value);
    if (slot.dataset.query && slot.dataset.query !== key) {
      slot.dataset.query = '';
      slot.dataset.choice = '';
      slot.dataset.error = '';
      slot._candidates = null;
    }
    if (!shouldSearchOnInput()) paint(input);
  }

  function onBlur(event) {
    var input = event.currentTarget;
    if (!shouldSearchOnBlur() || input.dataset.pragueActive !== '1') return;
    var slot = slotOf(input);
    if (!slot) return;
    if (slot._blurTimer) clearTimeout(slot._blurTimer);
    slot._blurTimer = setTimeout(function () {
      slot._blurTimer = null;
      if (document.activeElement === input) return;
      searchNow(input);
    }, BLUR_MS);
  }

  function watch(input, options) {
    if (!input) return;
    var active = !options || options.active !== false;
    input.dataset.pragueActive = active ? '1' : '0';
    ensureSlot(input);
    if (!input.dataset.pragueBound) {
      input.dataset.pragueBound = '1';
      input.addEventListener('input', onType);
      input.addEventListener('change', onType);
      input.addEventListener('blur', onBlur);
    }
    paint(input);
  }

  function unwatch(input) {
    if (!input) return;
    input.dataset.pragueActive = '0';
    var slot = slotOf(input);
    if (slot) slot.hidden = true;
  }

  function refreshAll() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('[data-prague-bound="1"]').forEach(function (input) {
      paint(input);
    });
  }

  root.PragueHotelMatch = {
    hotelKey: hotelKey,
    titleCase: titleCase,
    matchHotel: matchHotel,
    matchedLine: matchedLine,
    stayAddLabel: stayAddLabel,
    addressScope: addressScope,
    groupLineOpensEditor: groupLineOpensEditor,
    extraAddressActive: extraAddressActive,
    shouldSearchOnInput: shouldSearchOnInput,
    shouldSearchOnBlur: shouldSearchOnBlur,
    nominatimUrl: nominatimUrl,
    photonUrl: photonUrl,
    search: search,
    searchPlan: searchPlan,
    outcomeMessage: outcomeMessage,
    candidatesFromPhoton: candidatesFromPhoton,
    mapHref: mapHref,
    candidatesFromNominatim: candidatesFromNominatim,
    buildPlaceInsert: buildPlaceInsert,
    choiceResult: choiceResult,
    lookup: lookup,
    clearCache: clearCache,
    setPlaces: setPlaces,
    setClient: setClient,
    setFetch: setFetch,
    loadPlaces: loadPlaces,
    savePlace: savePlace,
    watch: watch,
    unwatch: unwatch,
    refreshAll: refreshAll,
    searchNow: searchNow,
  };
})(typeof window !== 'undefined' ? window : globalThis);
