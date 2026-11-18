/*
 * Editor for one planner_places row.
 * Nothing is written until Save. There is no Remove.
 * A phone shows it as a full-screen sheet.
 */
(function (root) {
  'use strict';

  var CONTACT_METHODS = [
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'message', label: 'Message / SMS' },
    { id: 'email', label: 'Email' },
    { id: 'phone', label: 'Phone only' },
  ];
  var LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  var LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  var leafletPromise = null;
  var mapToken = 0;
  var leafletMap = null;
  var openState = null;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function ensureStyle() {
    if (document.getElementById('place-editor-style')) return;
    var style = document.createElement('style');
    style.id = 'place-editor-style';
    style.textContent = [
      '.pe-sheet{position:fixed;inset:0;z-index:80;background:rgba(28,27,25,.35);display:flex;align-items:flex-end;justify-content:center;}',
      '.pe-sheet[hidden]{display:none;}',
      '.pe-card{width:min(560px,100%);max-height:92vh;overflow:auto;background:#fff;color:#1c1b19;border-radius:16px 16px 0 0;padding:0 16px 22px;font-family:"DM Sans",system-ui,sans-serif;}',
      '.pe-head{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;gap:8px;background:#fff;padding:14px 0 10px;}',
      '.pe-head h2{margin:0;font-size:18px;}',
      '.pe-btn{border:1px solid #e2ddd4;background:#fff;border-radius:999px;min-height:34px;padding:4px 12px;font:700 13px/1.2 inherit;cursor:pointer;touch-action:manipulation;}',
      '.pe-btn.primary{background:#1c1b19;color:#fff;border-color:#1c1b19;}',
      '.pe-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin-top:10px;}',
      '.pe-field{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;color:#5c574e;}',
      '.pe-field input,.pe-field select,.pe-field textarea{font:500 15px/1.3 inherit;color:#1c1b19;padding:8px;border-radius:8px;border:1px solid #e2ddd4;background:#faf9f7;}',
      '.pe-checks{display:flex;flex-wrap:wrap;gap:6px 10px;margin-top:6px;}',
      '.pe-checks label{font-size:13px;font-weight:600;color:#1c1b19;}',
      '.pe-readonly{margin:8px 0 0;font-size:13px;color:#5c574e;}',
      '.pe-history{margin-top:12px;border-top:1px solid #eeeae3;padding-top:8px;}',
      '.pe-history summary{cursor:pointer;font-weight:700;font-size:14px;min-height:40px;display:flex;align-items:center;touch-action:manipulation;}',
      '.pe-history ul{margin:6px 0 0;padding-left:18px;font-size:13px;font-weight:500;color:#1c1b19;}',
      '.pe-map{height:220px;border-radius:10px;border:1px solid #e6e1d8;margin-top:6px;}',
      '.pe-status{min-height:1.2em;font-size:12px;color:#6e695f;}',
      '.pe-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;}',
      '@media (max-width:760px){.pe-sheet{align-items:stretch;}.pe-card{width:100%;max-height:none;height:100%;border-radius:0;}.pe-grid{grid-template-columns:1fr;}}',
    ].join('');
    document.head.appendChild(style);
  }

  function categories(place) {
    if (root.PlaceVisits && PlaceVisits.categoriesOf) return PlaceVisits.categoriesOf(place);
    var primary = text(place && (place.place_type || place.type)) || 'other';
    var stored = place && place.place_types;
    if (Array.isArray(stored) && stored.length) return stored.map(text).filter(Boolean);
    return [primary];
  }

  function checksHtml(place) {
    var selected = categories(place);
    var types = (root.PlaceCategories && PlaceCategories.CATALOGUE_TYPES) || [];
    return types.map(function (type) {
      var on = selected.indexOf(type.id) !== -1;
      return '<label><input type="checkbox" data-pe-cat value="' + esc(type.id) + '"' + (on ? ' checked' : '') + '> ' + esc(type.singular || type.label) + '</label>';
    }).join('');
  }

  function contactOptions(selected) {
    var html = '<option value="">Not set yet</option>';
    CONTACT_METHODS.forEach(function (method) {
      html += '<option value="' + method.id + '"' + (selected === method.id ? ' selected' : '') + '>' + esc(method.label) + '</option>';
    });
    return html;
  }

  function yearsText(place) {
    var years = place.visit_years || place.visitYears || [];
    if (!Array.isArray(years) || !years.length) return 'Not recorded yet';
    return years.join(', ');
  }

  function historyHtml(place, history) {
    var extra = history || {};
    var visits = extra.visits != null
      ? extra.visits
      : (place.visit_count != null ? place.visit_count : (place.visitCount || 0));
    var years = extra.years && extra.years.length ? extra.years.join(', ') : yearsText(place);
    var groups = extra.groups || [];
    var lines = groups.map(function (group) {
      var name = group.groupName || group;
      var when = group.years ? Object.keys(group.years).sort().join(', ') : '';
      return '<li>' + esc(name) + (when ? ' · ' + esc(when) : '') + '</li>';
    }).join('');
    return '<details class="pe-history">'
      + '<summary>Visit history</summary>'
      + '<p class="pe-readonly">Visit count ' + esc(visits)
      + ' · First visited ' + esc(firstText(place))
      + ' · Years visited ' + esc(years) + '</p>'
      + (lines ? '<ul>' + lines + '</ul>' : '<p class="pe-readonly">No group list for this place.</p>')
      + '</details>';
  }

  function firstText(place) {
    var value = place.first_visited || place.firstVisited || '';
    return value ? String(value).slice(0, 10) : 'Not recorded yet';
  }

  function navigateHref(place) {
    var pin = root.PlacePin && PlacePin.readPin(place);
    if (pin) return 'https://www.google.com/maps/search/?api=1&query=' + pin.lat + ',' + pin.lng;
    var query = text(place.address) || text(place.name);
    if (!query) return '';
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
  }

  function chosenCategories(card, previous) {
    var checked = Array.prototype.map.call(card.querySelectorAll('[data-pe-cat]:checked'), function (box) {
      return box.value;
    });
    if (!checked.length) checked = ['other'];
    var primary = checked.indexOf(previous) !== -1 ? previous : checked[0];
    return { type: primary, types: [primary].concat(checked.filter(function (id) { return id !== primary; })) };
  }

  function readForm(card, place) {
    var cats = chosenCategories(card, text(place.place_type || place.type) || 'other');
    var next = {
      name: card.querySelector('[data-pe-name]').value,
      type: cats.type,
      types: cats.types,
      contactMethod: card.querySelector('[data-pe-contact]').value,
      contactDetail: card.querySelector('[data-pe-detail]').value,
      contactName: card.querySelector('[data-pe-contact-name]').value,
      contactPhone: card.querySelector('[data-pe-contact-phone]').value,
      address: card.querySelector('[data-pe-address]').value,
      nickname: card.querySelector('[data-pe-nickname]').value,
      icon: card.querySelector('[data-pe-icon]').value,
      notes: card.querySelector('[data-pe-notes]').value,
      pinLat: place.pinLat,
      pinLng: place.pinLng,
      pinSetAt: place.pinSetAt,
    };
    return next;
  }

  function ensureLeaflet() {
    if (root.L && root.L.map) return Promise.resolve(root.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise(function (resolve, reject) {
      if (!document.querySelector('link[data-pe-leaflet]')) {
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = LEAFLET_CSS;
        link.setAttribute('data-pe-leaflet', '1');
        document.head.appendChild(link);
      }
      var script = document.createElement('script');
      script.src = LEAFLET_JS;
      script.onload = function () { resolve(root.L); };
      script.onerror = function () { leafletPromise = null; reject(new Error('map')); };
      document.head.appendChild(script);
    });
    return leafletPromise;
  }

  function destroyMap() {
    mapToken += 1;
    if (leafletMap) {
      try { leafletMap.remove(); } catch (_) { /* already gone */ }
      leafletMap = null;
    }
  }

  function showPinStatus(place) {
    var el = document.querySelector('[data-pe-pin]');
    if (!el) return;
    var pin = root.PlacePin && PlacePin.readPin(place);
    el.textContent = pin ? ('Pin ' + pin.lat + ', ' + pin.lng) : 'Tap the map or drag the pin.';
  }

  async function initMap(canvas, place) {
    var token = mapToken;
    var L;
    try { L = await ensureLeaflet(); } catch (_) {
      var status = document.querySelector('[data-pe-pin]');
      if (status) status.textContent = 'The map could not be loaded.';
      return;
    }
    if (token !== mapToken || !canvas.isConnected || !root.PlacePin) return;
    var centre = PlacePin.centreForPlace(place);
    var map = L.map(canvas, { scrollWheelZoom: false, tap: true }).setView([centre.lat, centre.lng], PlacePin.zoomFor(centre));
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    var marker = L.marker([centre.lat, centre.lng], { draggable: true }).addTo(map);
    leafletMap = map;
    function drop(latlng) {
      if (!latlng || !openState) return;
      marker.setLatLng(latlng);
      PlacePin.writePin(openState.place, latlng.lat, latlng.lng);
      showPinStatus(openState.place);
    }
    marker.on('dragend', function () { drop(marker.getLatLng()); });
    map.on('click', function (event) { drop(event && event.latlng); });
    setTimeout(function () { if (token === mapToken) map.invalidateSize(); }, 80);
  }

  function close() {
    destroyMap();
    var sheet = document.getElementById('placeEditor');
    if (sheet) sheet.hidden = true;
    openState = null;
  }

  function listsEqual(left, right) {
    var a = left || [];
    var b = right || [];
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function formSnapshot(card, place) {
    var next = readForm(card, place);
    var pin = root.PlacePin && PlacePin.readPin(place);
    return {
      name: text(next.name),
      type: next.type,
      types: next.types.slice(),
      contactMethod: text(next.contactMethod),
      contactDetail: text(next.contactDetail),
      contactName: text(next.contactName),
      contactPhone: text(next.contactPhone),
      address: text(next.address),
      nickname: text(next.nickname),
      icon: text(next.icon),
      notes: text(next.notes),
      pinLat: pin ? String(pin.lat) : '',
      pinLng: pin ? String(pin.lng) : '',
    };
  }

  function unchanged(card) {
    var now = formSnapshot(card, openState.place);
    var was = openState.baseline;
    return now.name === was.name
      && now.type === was.type
      && listsEqual(now.types, was.types)
      && now.contactMethod === was.contactMethod
      && now.contactDetail === was.contactDetail
      && now.contactName === was.contactName
      && now.contactPhone === was.contactPhone
      && now.address === was.address
      && now.nickname === was.nickname
      && now.icon === was.icon
      && now.notes === was.notes
      && now.pinLat === was.pinLat
      && now.pinLng === was.pinLng;
  }

  function render(place) {
    ensureStyle();
    var sheet = document.getElementById('placeEditor');
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'placeEditor';
      sheet.className = 'pe-sheet';
      sheet.hidden = true;
      document.body.appendChild(sheet);
      sheet.addEventListener('click', function (event) {
        if (event.target === sheet) saveAndClose();
      });
    }
    var href = navigateHref(place);
    sheet.hidden = false;
    sheet.innerHTML = ''
      + '<div class="pe-card" role="dialog" aria-labelledby="peTitle">'
      + '<div class="pe-head"><h2 id="peTitle">' + esc(place.name || 'Place') + '</h2>'
      + '<button type="button" class="pe-btn primary" data-pe-save>Save and close</button></div>'
      + '<label class="pe-field">Name<input data-pe-name value="' + esc(place.name || '') + '"></label>'
      + '<div class="pe-field">Categories<div class="pe-checks">' + checksHtml(place) + '</div></div>'
      + '<div class="pe-grid">'
      + '<label class="pe-field">How we contact them<select data-pe-contact>' + contactOptions(place.contact_method || place.contactMethod || '') + '</select></label>'
      + '<label class="pe-field">Contact detail<input data-pe-detail value="' + esc(place.contact_detail || place.contactDetail || '') + '"></label>'
      + '<label class="pe-field">Contact name<input data-pe-contact-name value="' + esc(place.contact_name || place.contactName || '') + '"></label>'
      + '<label class="pe-field">Contact phone<input data-pe-contact-phone value="' + esc(place.contact_phone || place.contactPhone || '') + '"></label>'
      + '<label class="pe-field">Address or map link<input data-pe-address value="' + esc(place.address || '') + '"></label>'
      + '</div>'
      + '<div class="pe-field">Map<div class="pe-map" data-pe-map></div><p class="pe-status" data-pe-pin></p></div>'
      + '<div class="pe-actions">'
      + '<button type="button" class="pe-btn" data-pe-clear>Clear pin</button>'
      + (href ? '<a class="pe-btn" data-pe-nav href="' + esc(href) + '" target="_blank" rel="noopener">Navigate</a>' : '')
      + '</div>'
      + '<div class="pe-grid">'
      + '<label class="pe-field">Nickname<input data-pe-nickname value="' + esc(place.nickname || '') + '"></label>'
      + '<label class="pe-field">Icon<input data-pe-icon value="' + esc(place.icon || '') + '" maxlength="8"></label>'
      + '</div>'
      + '<label class="pe-field">Notes<textarea data-pe-notes rows="3">' + esc(place.notes || '') + '</textarea></label>'
      + historyHtml(place, openState && openState.history)
      + '<div class="pe-actions">'
      + '<button type="button" class="pe-btn primary" data-pe-save>Save and close</button>'
      + '</div>'
      + '<p class="pe-status" data-pe-status></p>'
      + '</div>';
    sheet.querySelectorAll('[data-pe-save]').forEach(function (btn) {
      btn.addEventListener('click', function () { saveAndClose(); });
    });
    sheet.querySelector('[data-pe-clear]').addEventListener('click', function () {
      if (root.PlacePin) PlacePin.clearPin(place);
      showPinStatus(place);
    });
    showPinStatus(place);
    var canvas = sheet.querySelector('[data-pe-map]');
    if (canvas && root.PlacePin) initMap(canvas, place);
  }

  async function saveAndClose() {
    var state = openState;
    var sheet = document.getElementById('placeEditor');
    var card = sheet && sheet.querySelector('.pe-card');
    if (!state || !card || state.saving) return;
    var status = card.querySelector('[data-pe-status]');
    if (state.readOnly || !state.sb || unchanged(card)) {
      close();
      return;
    }
    var place = state.place;
    var id = text(place.client_id || place.id);
    if (!id) {
      if (status) status.textContent = 'Could not save';
      return;
    }
    var next = readForm(card, place);
    var patch = {
      name: text(next.name) || 'Untitled place',
      place_type: next.type,
      place_types: next.types.slice(),
      contact_method: next.contactMethod || null,
      contact_detail: text(next.contactDetail) || null,
      contact_name: text(next.contactName) || null,
      contact_phone: text(next.contactPhone) || null,
      address: text(next.address) || null,
      nickname: text(next.nickname) || null,
      icon: text(next.icon) || null,
      notes: text(next.notes) || null,
      updated_at: new Date().toISOString(),
    };
    if (root.PlacePin) Object.assign(patch, PlacePin.pinPatch(state.baselinePin || {}, place));
    state.saving = true;
    if (status) status.textContent = 'Saving…';
    try {
      var query = state.sb.from('planner_places').update(patch).eq('client_id', id);
      if (place.updated_at) query = query.eq('updated_at', place.updated_at);
      var updated = await query.select('client_id, updated_at, place_type, place_types');
      if (updated.error) {
        state.saving = false;
        if (status) status.textContent = 'Could not save';
        return;
      }
      if (!updated.data || !updated.data.length) {
        state.saving = false;
        if (status) status.textContent = 'This place changed elsewhere. It is still open.';
        return;
      }
      var savedTypes = Array.isArray(updated.data[0].place_types) && updated.data[0].place_types.length
        ? updated.data[0].place_types.slice()
        : patch.place_types.slice();
      var savedPrimary = updated.data[0].place_type || patch.place_type;
      place.updated_at = updated.data[0].updated_at;
      place.name = patch.name;
      place.place_type = savedPrimary;
      place.type = savedPrimary;
      place.place_types = savedTypes;
      place.types = savedTypes.slice();
      place.nickname = patch.nickname;
      place.notes = patch.notes;
      place.icon = patch.icon;
      place.address = patch.address;
      place.contact_method = patch.contact_method;
      place.contact_detail = patch.contact_detail;
      place.contact_name = patch.contact_name;
      place.contact_phone = patch.contact_phone;
      if (state.onSaved) state.onSaved(place);
      close();
    } catch (err) {
      state.saving = false;
      if (status) status.textContent = 'Could not save';
    }
  }

  function fromRow(row) {
    var place = Object.assign({}, row || {});
    place.id = text(place.client_id || place.id);
    place.client_id = place.id;
    place.name = text(place.name);
    place.place_type = text(place.place_type || place.type) || 'other';
    place.type = place.place_type;
    if (root.PlacePin) PlacePin.applyRowPin(place, row);
    return place;
  }

  function pinSnapshot(place) {
    var pin = root.PlacePin && PlacePin.readPin(place);
    if (!pin) return {};
    return { pinLat: Number(pin.lat), pinLng: Number(pin.lng), pinSetAt: pin.setAt || '' };
  }

  function open(options) {
    var opts = options || {};
    var place = fromRow(opts.place || {});
    openState = {
      place: place,
      baselinePin: pinSnapshot(place),
      sb: opts.sb || null,
      readOnly: !!opts.readOnly,
      onSaved: opts.onSaved || null,
      history: opts.history || null,
      saving: false,
    };
    render(place);
    var card = document.querySelector('#placeEditor .pe-card');
    if (card) openState.baseline = formSnapshot(card, place);
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && openState) saveAndClose();
    });
  }

  root.PlaceEditor = { open: open, close: close };
}(typeof window !== 'undefined' ? window : globalThis));
