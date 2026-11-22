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
    var described = describeHotel(match.name || match.address || '');
    if (!described) return '';
    return described.address ? (described.name + ', ' + described.address) : described.name;
  }

  function describeHotel(text) {
    var raw = String(text || '').trim().replace(/\s+/g, ' ');
    if (!raw) return null;
    var known = matchHotel(raw);
    if (known && (known.name || known.address)) {
      var knownName = String(known.name || '').trim() || raw;
      var knownAddress = String(known.address || '').trim();
      return { name: knownName, address: knownAddress, source: known.source || 'known' };
    }
    var comma = raw.indexOf(',');
    if (comma > 2) {
      return { name: raw.slice(0, comma).trim(), address: raw.slice(comma + 1).trim(), source: 'typed' };
    }
    return { name: raw, address: '', source: '' };
  }

  function presentCandidate(candidate) {
    var label = String(candidate && (candidate.label || candidate.address) || '').trim();
    var comma = label.indexOf(',');
    var name = comma > 0 ? label.slice(0, comma).trim() : label;
    var address = comma > 0 ? label.slice(comma + 1).trim() : '';
    return {
      name: name || 'Hotel',
      address: address || label,
      lat: candidate ? candidate.lat : null,
      lng: candidate ? candidate.lng : null,
      label: label,
    };
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

  function savedConfirmation(input) {
    var row = input && input.closest && input.closest('.guest-prague-stay');
    if (!row) {
      return {
        address: input && input.dataset ? (input.dataset.confirmedAddress || '') : '',
        confirmed: !!(input && input.dataset && input.dataset.addressConfirmed === '1'),
      };
    }
    return {
      address: (row.querySelector('.guest-stay-address') || {}).value || '',
      confirmed: ((row.querySelector('.guest-stay-confirmed') || {}).value || '') === '1',
    };
  }

  function stayRowsFor(input) {
    var row = input && input.closest && input.closest('.guest-prague-stay');
    if (!row) return [];
    if (row.closest('.guest-prague-list')) return [row];
    var shared = row.closest('[id$="_shared_prague_list"], .guest-prague-group-editor');
    if (!shared) return [row];
    var siblings = shared.querySelectorAll(':scope > .guest-prague-stay');
    var index = Array.prototype.indexOf.call(siblings, row);
    if (index < 0) return [row];
    var rows = [];
    var panel = row.closest('.tab-panel') || document;
    panel.querySelectorAll('[id$="_shared_prague_list"], .guest-prague-group-editor').forEach(function (container) {
      var match = container.querySelectorAll(':scope > .guest-prague-stay')[index];
      if (match && rows.indexOf(match) < 0) rows.push(match);
    });
    return rows.length ? rows : [row];
  }

  function writeConfirmation(input, address, confirmed) {
    stayRowsFor(input).forEach(function (row) {
      var addr = row.querySelector('.guest-stay-address');
      var flag = row.querySelector('.guest-stay-confirmed');
      if (addr) addr.value = address || '';
      if (flag) flag.value = confirmed ? '1' : '';
    });
    if (input && input.dataset) {
      input.dataset.confirmedAddress = confirmed ? (address || '') : '';
      input.dataset.addressConfirmed = confirmed ? '1' : '';
    }
    try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch (err) { /* not in a document */ }
  }

  function currentOffer(input) {
    var name = String(input.value || '').trim();
    var saved = savedConfirmation(input);
    var described = describeHotel(name) || { name: name, address: '' };
    if (saved.confirmed && (saved.address || described.address)) {
      return { name: described.name || name, address: saved.address || described.address, confirmed: true };
    }
    if (described.address) return { name: described.name || name, address: described.address, confirmed: false };
    if (saved.address) return { name: described.name || name, address: saved.address, confirmed: false };
    return { name: described.name || name, address: '', confirmed: false };
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
    var offer = currentOffer(input);
    var candidates = (slot.dataset.query === key && slot._candidates) ? slot._candidates : null;
    var busy = slot.dataset.query === key && slot.dataset.busy === '1';
    slot.innerHTML = addressCardHtml(offer) + (busy ? '<p class="prague-address-status">Looking up addresses…</p>' : '') + (candidates ? askHtml(slot, candidates, slot.dataset.choice === 'none') : '');
    bindCard(input, slot, offer);
  }

  function addressCardHtml(offer) {
    var html = '<div class="prague-address-card' + (offer.confirmed ? ' is-confirmed' : '') + '">';
    html += '<p class="prague-address-name">' + esc(offer.name || 'Hotel') + '</p>';
    if (offer.address) html += '<p class="prague-address-full">' + esc(offer.address) + '</p>';
    else html += '<p class="prague-address-full prague-address-missing">No address yet</p>';
    if (offer.confirmed) {
      html += '<p class="prague-address-confirmed">✓ Address confirmed</p>';
      html += '<button type="button" class="prague-address-change">Change address</button>';
    } else if (offer.address) {
      html += '<button type="button" class="prague-address-yes">Yes, this hotel address is correct</button>';
    }
    html += '<button type="button" class="prague-find">Find address</button>';
    html += '</div>';
    return html;
  }

  function askHtml(slot, candidates, noneChosen) {
    var html = '<div class="prague-address-ask"><p>Other addresses</p>';
    (candidates || []).forEach(function (candidate, index) {
      var shown = presentCandidate(candidate);
      var href = mapHref(candidate);
      html += '<label class="prague-address-choice"><input type="radio" name="' + esc(slot.dataset.slotId) + '" value="' + index + '"> '
        + '<span class="prague-address-name">' + esc(shown.name) + '</span> '
        + '<span class="prague-address-full">' + esc(shown.address) + '</span>'
        + (href ? ' <a class="prague-map-link" href="' + esc(href) + '" target="_blank" rel="noopener">open map</a>' : '')
        + '</label>';
    });
    if (candidates && !candidates.length && slot.dataset.note) html += '<p class="prague-address-note">' + esc(slot.dataset.note) + '</p>';
    html += '<label class="prague-address-choice"><input type="radio" name="' + esc(slot.dataset.slotId) + '" value="none"' + (noneChosen ? ' checked' : '') + '> <span>None of these</span></label>';
    if (noneChosen) html += '<p class="prague-address-note">address not confirmed</p>';
    if (slot.dataset.error) html += '<p class="prague-address-note">' + esc(slot.dataset.error) + '</p>';
    html += '</div>';
    return html;
  }

  function bindCard(input, slot, offer) {
    var yes = slot.querySelector('.prague-address-yes');
    if (yes) yes.addEventListener('click', function () {
      writeConfirmation(input, offer.address, true);
      refreshAll();
    });
    var change = slot.querySelector('.prague-address-change');
    if (change) change.addEventListener('click', function () {
      writeConfirmation(input, offer.address, false);
      refreshAll();
    });
    bindAsk(input, slot);
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
        var shown = presentCandidate(candidate);
        writeConfirmation(input, shown.address, false);
        slot.dataset.busy = '1';
        slot.dataset.error = '';
        savePlace(shown.name || input.value, candidate).then(function (result) {
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
    if (!name) {
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
    describeHotel: describeHotel,
    presentCandidate: presentCandidate,
    writeConfirmation: writeConfirmation,
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
