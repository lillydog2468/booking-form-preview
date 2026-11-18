/*
 * Standalone test planner for Jennifer Lindsay, booking 310.
 * Wide screens show the whole week. A phone shows one day and swipes.
 * Saves only that booking's planner_plans row. It does not write the bookings table.
 */
(function () {
  'use strict';

  var ONLY = Planner2.BOOKING_ID;
  var state = {
    sample: false,
    plan: null,
    places: [],
    row: null,
    day: 0,
    phone: false,
    tray: false,
    query: '',
    type: 'all',
    selected: null,
    sb: null,
    saving: false,
  };

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function setStatus(text) {
    var el = $('p2Status');
    if (el) el.textContent = text || '';
  }

  function phoneNow() {
    var narrow = window.matchMedia && window.matchMedia('(max-width: ' + Planner2.PHONE_MAX + 'px)').matches;
    state.phone = narrow || Planner2.usesPhoneLayout(window.innerWidth);
    return state.phone;
  }

  function cueFor(stop) {
    if (window.PlaceCategories && PlaceCategories.stopCue) return PlaceCategories.stopCue(stop || {});
    return { id: 'other', emoji: '', label: 'Stop' };
  }

  function hotelFor(date, index) {
    var plan = state.plan || {};
    var days = plan.days || [];
    var last = days.length - 1;
    var prague = plan.pragueHotel && plan.pragueHotel.name;
    var tour = plan.tourHotelName || '';
    if (index === 0) return { night: prague || tour, from: '' };
    if (index === last) return { night: '', from: tour };
    return { night: tour, from: tour };
  }

  function render() {
    var plan = state.plan;
    if (!plan || !window.WeekOverview) return;
    phoneNow();
    var days = plan.days || [];
    if (state.day >= days.length) state.day = Math.max(0, days.length - 1);
    $('p2Title').textContent = plan.groupName || Planner2.GROUP_NAME;
    var dates = [plan.arrivalDate, plan.departureDate].filter(Boolean).join(' – ');
    $('p2Dates').textContent = dates;
    var note = 'This page opens only Jennifer Lindsay’s group, booking 310. The old planner is unchanged.';
    if (state.sample) note = 'Sample week for layout. Nothing is saved. ' + note;
    else if (state.refused) note = 'Other bookings are not opened here. ' + note;
    $('p2Note').textContent = note;
    $('p2Places').classList.toggle('on', state.tray);
    $('p2Tray').hidden = !state.tray;
    var model = WeekOverview.build(plan, {
      today: '',
      focusDay: state.phone ? state.day : null,
      label: function (stop) { return String(stop.title || stop.hotelName || '').trim(); },
      cue: cueFor,
      guests: function (stop) { return Planner2.guestLine(stop, plan.guests); },
      hotel: hotelFor,
    });
    $('p2Scroll').innerHTML = WeekOverview.render(model);
    markLastDay();
    renderDayChips(days);
    renderTray();
    bindGrid();
  }

  function markLastDay() {
    var days = state.plan.days || [];
    var col = document.querySelector('[data-ov-col="' + (days.length - 1) + '"]');
    if (!col) return;
    var mark = document.createElement('div');
    mark.className = 'ov-mark';
    mark.style.top = ((WeekOverview.END_MIN - WeekOverview.START_MIN) * WeekOverview.PX_PER_MIN - 16) + 'px';
    mark.textContent = '16:00 Drop-off';
    col.appendChild(mark);
  }

  function renderDayChips(days) {
    var box = $('p2Days');
    box.innerHTML = days.map(function (day, index) {
      var label = day && day.date ? day.date.slice(5) : ('Day ' + (index + 1));
      return '<button type="button" class="p2-day' + (index === state.day ? ' on' : '') + '" data-day="' + index + '">' + esc(label) + '</button>';
    }).join('');
    box.querySelectorAll('[data-day]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.day = Number(btn.getAttribute('data-day'));
        render();
      });
    });
  }

  function renderTray() {
    var types = [{ id: 'all', singular: 'All' }].concat(
      (window.PlaceCategories && PlaceCategories.CATALOGUE_TYPES) || []
    );
    $('p2Types').innerHTML = types.map(function (type) {
      var label = type.id === 'all' ? 'All' : (type.singular || type.label);
      return '<button type="button" class="p2-chip' + (state.type === type.id ? ' on' : '') + '" data-type="' + esc(type.id) + '">' + esc(label) + '</button>';
    }).join('');
    var list = Planner2.filterPlaces(state.places, state.query, state.type).slice(0, 40);
    $('p2Chips').innerHTML = list.map(function (place) {
      var on = state.selected === place.id ? ' on' : '';
      var name = place.nickname || place.name;
      return '<button type="button" class="p2-chip' + on + '" draggable="true" data-place="' + esc(place.id) + '">' + esc(name) + '</button>';
    }).join('') || '<p class="p2-note">No places.</p>';
    $('p2Types').querySelectorAll('[data-type]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.type = btn.getAttribute('data-type');
        renderTray();
      });
    });
    $('p2Chips').querySelectorAll('[data-place]').forEach(function (chip) {
      var id = chip.getAttribute('data-place');
      chip.addEventListener('click', function () {
        state.selected = state.selected === id ? null : id;
        renderTray();
      });
      chip.addEventListener('dragstart', function (event) {
        event.dataTransfer.setData('text/plain', id);
        event.dataTransfer.effectAllowed = 'copy';
      });
    });
  }

  function afterEdit() {
    render();
    scheduleSave();
  }

  function bindGrid() {
    var root = $('p2Scroll');
    root.querySelectorAll('[data-ov-remove]').forEach(function (btn) {
      btn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (Planner2.removeStop(state.plan, btn.getAttribute('data-ov-remove'))) afterEdit();
      });
    });
    root.querySelectorAll('[data-ov-stop]').forEach(function (card) {
      card.addEventListener('pointerdown', function (event) {
        if (event.button != null && event.button !== 0) return;
        if (event.target.closest && event.target.closest('.ov-x')) return;
        var stopId = card.getAttribute('data-ov-stop');
        var origin = { x: event.clientX, y: event.clientY, moved: false };
        var ghost = null;
        var snap = null;
        function clear() {
          card.classList.remove('dragging');
          root.querySelectorAll('[data-ov-col]').forEach(function (el) { el.classList.remove('is-drop'); });
          if (ghost) ghost.remove();
          if (snap) snap.remove();
        }
        function at(x, y) {
          var under = document.elementFromPoint(x, y);
          var col = under && under.closest ? under.closest('[data-ov-col]') : null;
          if (col) return col;
          var day = under && under.closest ? under.closest('[data-ov-day]') : null;
          return day ? day.querySelector('[data-ov-col]') : null;
        }
        function move(e) {
          if (!origin.moved && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < 8) return;
          origin.moved = true;
          e.preventDefault();
          card.classList.add('dragging');
          if (!ghost) {
            ghost = card.cloneNode(true);
            ghost.classList.add('ov-ghost');
            document.body.appendChild(ghost);
          }
          ghost.style.left = (e.clientX + 8) + 'px';
          ghost.style.top = (e.clientY + 8) + 'px';
          if (snap) { snap.remove(); snap = null; }
          var col = at(e.clientX, e.clientY);
          root.querySelectorAll('[data-ov-col]').forEach(function (el) { el.classList.remove('is-drop'); });
          if (!col) return;
          col.classList.add('is-drop');
          var mins = minutesOn(col, e.clientY);
          snap = document.createElement('div');
          snap.className = 'ov-snap';
          snap.style.top = ((mins - WeekOverview.START_MIN) * WeekOverview.PX_PER_MIN) + 'px';
          snap.textContent = WeekOverview.formatMinutes(mins);
          col.appendChild(snap);
        }
        function up(e) {
          card.removeEventListener('pointermove', move);
          card.removeEventListener('pointerup', up);
          card.removeEventListener('pointercancel', up);
          var moved = origin.moved;
          var col = moved ? at(e.clientX, e.clientY) : null;
          var mins = col ? minutesOn(col, e.clientY) : null;
          clear();
          if (!moved) { openEditor(stopId); return; }
          if (!col || mins == null) return;
          if (Planner2.placeStop(state.plan, stopId, Number(col.getAttribute('data-ov-col')), WeekOverview.formatMinutes(mins))) afterEdit();
        }
        card.addEventListener('pointermove', move);
        card.addEventListener('pointerup', up);
        card.addEventListener('pointercancel', up);
      });
    });
    root.querySelectorAll('[data-ov-col]').forEach(function (col) {
      col.addEventListener('dragover', function (event) { event.preventDefault(); });
      col.addEventListener('drop', function (event) {
        event.preventDefault();
        var id = event.dataTransfer.getData('text/plain');
        var place = state.places.find(function (item) { return item.id === id; });
        if (!place) return;
        var mins = minutesOn(col, event.clientY);
        if (Planner2.addPlace(state.plan, place, Number(col.getAttribute('data-ov-col')), WeekOverview.formatMinutes(mins))) {
          state.selected = null;
          afterEdit();
        }
      });
      col.addEventListener('click', function (event) {
        if (event.target.closest && event.target.closest('[data-ov-stop]')) return;
        if (!state.selected) return;
        var place = state.places.find(function (item) { return item.id === state.selected; });
        if (!place) return;
        var mins = minutesOn(col, event.clientY);
        if (Planner2.addPlace(state.plan, place, Number(col.getAttribute('data-ov-col')), WeekOverview.formatMinutes(mins))) {
          state.selected = null;
          afterEdit();
        }
      });
    });
    bindSwipe(root);
  }

  function minutesOn(col, clientY) {
    var rect = col.getBoundingClientRect();
    var raw = WeekOverview.minutesFromOffset(
      clientY - rect.top,
      WeekOverview.START_MIN,
      WeekOverview.PX_PER_MIN,
      WeekOverview.END_MIN
    );
    return WeekOverview.clampPlannedMinutes(raw, Number(col.getAttribute('data-ov-col')));
  }

  function bindSwipe(root) {
    if (!state.phone) return;
    var startX = 0;
    var startY = 0;
    var track = false;
    root.addEventListener('touchstart', function (event) {
      if (event.target.closest && event.target.closest('[data-ov-stop], button, input')) { track = false; return; }
      track = true;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    }, { passive: true });
    root.addEventListener('touchend', function (event) {
      if (!track) return;
      var dx = event.changedTouches[0].clientX - startX;
      var dy = event.changedTouches[0].clientY - startY;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
      var next = state.day + (dx < 0 ? 1 : -1);
      var days = state.plan.days || [];
      if (next < 0 || next >= days.length) return;
      state.day = next;
      render();
    }, { passive: true });
  }

  function openEditor(stopId) {
    var found = Planner2.findStop(state.plan, stopId);
    if (!found) return;
    var stop = found.stop;
    $('p2SheetTitle').textContent = stop.title || 'Stop';
    $('p2SheetBody').innerHTML = ''
      + '<label class="p2-field">Time<input type="time" id="p2EditTime" value="' + esc(stop.time || '') + '"></label>'
      + '<label class="p2-field">Name<input type="text" id="p2EditTitle" value="' + esc(stop.title || '') + '"></label>'
      + '<label class="p2-field">Notes<input type="text" id="p2EditNotes" value="' + esc(stop.notes || '') + '"></label>'
      + '<label class="p2-field">Address<input type="text" id="p2EditAddress" value="' + esc(stop.address || stop.hotelName || '') + '"></label>'
      + '<div class="p2-sheet-actions"><button type="button" class="p2-btn" id="p2EditSave">Save</button>'
      + '<button type="button" class="p2-btn danger" id="p2EditRemove">Remove</button></div>';
    $('p2Sheet').hidden = false;
    $('p2EditSave').addEventListener('click', function () {
      Planner2.editStop(state.plan, stopId, {
        time: $('p2EditTime').value,
        title: $('p2EditTitle').value,
        notes: $('p2EditNotes').value,
        address: $('p2EditAddress').value,
      });
      closeEditor();
      afterEdit();
    });
    $('p2EditRemove').addEventListener('click', function () {
      Planner2.removeStop(state.plan, stopId);
      closeEditor();
      afterEdit();
    });
  }

  function closeEditor() { $('p2Sheet').hidden = true; }

  var saveTimer = null;
  function scheduleSave() {
    if (state.sample) { setStatus('Sample — nothing is saved'); return; }
    setStatus('Waiting to save…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(savePlan, 1200);
  }

  async function savePlan() {
    if (state.sample || !state.sb || !Planner2.canSave(state.plan) || state.saving) return;
    state.saving = true;
    setStatus('Saving…');
    var payload = JSON.parse(JSON.stringify(state.plan));
    payload.bookingKey = String(ONLY);
    delete payload.sample;
    var updatedAt = new Date().toISOString();
    try {
      if (!state.row || !state.row.id) {
        var inserted = await state.sb.from('planner_plans').insert({
          payload: payload,
          updated_at: updatedAt,
          booking_id: ONLY,
          client_key: 'booking:' + ONLY,
        }).select('id, updated_at, booking_id').single();
        if (inserted.error) throw inserted.error;
        if (Number(inserted.data.booking_id) !== ONLY) throw new Error('Refused a write that was not booking 310');
        state.row = inserted.data;
      } else {
        var query = state.sb.from('planner_plans').update({
          payload: payload,
          updated_at: updatedAt,
        }).eq('id', state.row.id).eq('booking_id', 310);
        if (state.row.updated_at) query = query.eq('updated_at', state.row.updated_at);
        var updated = await query.select('id, updated_at, booking_id');
        if (updated.error) throw updated.error;
        if (!updated.data || !updated.data.length) {
          setStatus('The plan changed elsewhere. Reload before editing again.');
          state.saving = false;
          return;
        }
        state.row = updated.data[0];
      }
      setStatus('Saved booking 310');
    } catch (err) {
      console.warn(err);
      setStatus('Could not save');
    }
    state.saving = false;
  }

  function placeFromRow(row) {
    var type = row.place_type || 'other';
    var types = Array.isArray(row.place_types) && row.place_types.length ? row.place_types : [type];
    return {
      id: row.client_id || String(row.id),
      name: row.name || '',
      nickname: row.nickname || '',
      type: type,
      types: types,
      address: row.address || '',
    };
  }

  async function loadLive() {
    setStatus('Loading booking 310…');
    var booking = await state.sb.from('bookings')
      .select('id, group_name, tour_arrival_date, departure_date, hotels(name)')
      .eq('id', ONLY)
      .maybeSingle();
    if (booking.error) throw booking.error;
    var planRow = await state.sb.from('planner_plans')
      .select('id, payload, updated_at, booking_id')
      .eq('booking_id', 310)
      .maybeSingle();
    if (planRow.error) throw planRow.error;
    state.row = planRow.data || null;
    if (state.row && state.row.payload) {
      state.plan = state.row.payload;
      state.plan.bookingKey = String(ONLY);
      if (!Array.isArray(state.plan.days)) state.plan.days = [];
    } else {
      state.plan = Planner2.emptyPlanFromBooking(booking.data || { id: ONLY, group_name: Planner2.GROUP_NAME });
    }
    if (booking.data && booking.data.group_name) state.plan.groupName = booking.data.group_name;
    var places = await state.sb.from('planner_places')
      .select('id, client_id, name, place_type, place_types, nickname, address')
      .order('name', { ascending: true });
    if (!places.error && places.data) state.places = places.data.map(placeFromRow);
    setStatus(state.row ? 'Booking 310 loaded' : 'No saved plan yet — edits will create one');
    render();
  }

  function bootSample() {
    state.sample = true;
    state.plan = Planner2.samplePlan();
    state.places = Planner2.samplePlaces();
    setStatus('Sample — nothing is saved');
    render();
  }

  $('p2Places').addEventListener('click', function () {
    state.tray = !state.tray;
    render();
  });
  $('p2Search').addEventListener('input', function (event) {
    state.query = event.target.value;
    renderTray();
  });
  $('p2SheetClose').addEventListener('click', closeEditor);
  $('p2Sheet').addEventListener('click', function (event) {
    if (event.target.id === 'p2Sheet') closeEditor();
  });
  window.addEventListener('resize', function () {
    var was = state.phone;
    if (phoneNow() !== was) render();
  });
  if (window.matchMedia) {
    window.matchMedia('(max-width: ' + Planner2.PHONE_MAX + 'px)').addEventListener('change', function () {
      render();
    });
  }

  var params = new URLSearchParams(location.search);
  state.refused = params.get('booking') && !Planner2.isAllowedBooking(params.get('booking'));
  if (/(?:\?|&)preview=mock(?:&|$)/.test(location.search)) {
    bootSample();
  } else {
    const SUPABASE_URL = BOOKING_SUPABASE_URL;
    const SUPABASE_ANON_KEY = BOOKING_SUPABASE_ANON_KEY;
    state.sb = AuthGate.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    AuthGate.require(state.sb, { title: 'Jennifer Lindsay planner' }).then(function (session) {
      if (!session) {
        setStatus('Sign in to open booking 310');
        return;
      }
      loadLive().catch(function (err) {
        console.warn(err);
        setStatus('Could not load booking 310');
      });
    });
  }
}());
