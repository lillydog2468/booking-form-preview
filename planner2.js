/*
 * Week planner for the booking named in the address.
 * Wide screens show the whole week. A phone shows one day and swipes.
 * Saves that booking's planner_plans row when the week is edited. It does not write the bookings table. Opening a booking with no plan keeps an empty week on screen until an edit is saved.
 */
(function () {
  'use strict';

  function bookingId() {
    if (state.bookingId) return state.bookingId;
    var params = new URLSearchParams(location.search);
    var named = params.get('booking');
    if (named) return Planner2.bookingNumber(named);
    return Planner2.BOOKING_ID;
  }

  var state = {
    sample: false,
    plan: null,
    places: [],
    members: [],
    row: null,
    day: 0,
    phone: false,
    tray: false,
    query: '',
    types: [],
    selected: null,
    sb: null,
    saving: false,
    embedded: false,
    started: false,
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

  function paintSaveStatus(kind, plan) {
    var el = $('planSaveStatus');
    state.unsaved = kind === 'unsaved';
    if (!el || !window.PlanSync) return;
    el.hidden = false;
    el.className = 'plan-save-status' + (kind === 'unsaved' ? ' is-unsaved' : kind === 'newer' ? ' is-newer' : ' is-current');
    if (kind === 'unsaved') el.textContent = PlanSync.UNSAVED;
    else if (kind === 'newer') el.textContent = PlanSync.NEWER;
    else el.textContent = PlanSync.currentLine((plan && plan.lastSavedAt) || state.seenUpdatedAt, (plan && plan.lastSavedFrom) || PlanSync.deviceLabel());
  }

  function phoneNow() {
    var width = window.innerWidth;
    if (window.visualViewport && window.visualViewport.width) width = Math.min(width, window.visualViewport.width);
    var narrow = window.matchMedia && window.matchMedia('(max-width: ' + Planner2.PHONE_MAX + 'px)').matches;
    state.phone = narrow || Planner2.usesPhoneLayout(width);
    return state.phone;
  }

  function cueFor(stop) {
    var base = (window.PlaceCategories && PlaceCategories.stopCue) ? PlaceCategories.stopCue(stop || {}) : { id: 'other', emoji: '', label: 'Stop' };
    var place = (state.places || []).find(function (item) { return stop && String(item.id) === String(stop.placeId || ''); });
    var icon = place && String(place.icon || '').trim();
    return icon ? Object.assign({}, base, { emoji: icon }) : base;
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
    if (!state.embedded) {
      var title = $('p2Title');
      if (title) title.textContent = plan.groupName || Planner2.GROUP_NAME;
      var datesEl = $('p2Dates');
      if (datesEl) datesEl.textContent = [plan.arrivalDate, plan.departureDate].filter(Boolean).join(' – ');
      var noteEl = $('p2Note');
      if (noteEl) {
        var note = 'Booking details are read-only. The week plan is on this page.';
        if (state.sample) note = 'Sample week for layout. Nothing is saved. ' + note;
        else if (state.refused) note = 'Other bookings are not opened here. ' + note;
        noteEl.textContent = note;
      }
    }
    var placesBtn = $('p2Places');
    if (placesBtn) placesBtn.classList.toggle('on', state.tray);
    var tray = $('p2Tray');
    if (tray) tray.hidden = state.phone && !state.tray;
    var model = WeekOverview.build(plan, {
      today: '',
      focusDay: state.phone ? state.day : null,
      label: function (stop) {
        return Planner2.displayStopTitle(stop, cataloguePlace(stop && stop.placeId));
      },
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
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'ov-mark ov-mark-btn';
    button.setAttribute('data-ov-marker', 'dropoff');
    button.style.top = ((WeekOverview.END_MIN - WeekOverview.START_MIN) * WeekOverview.PX_PER_MIN) + 'px';
    button.textContent = '18:00 Drop-off';
    col.appendChild(button);
  }

  function renderDayChips(days) {
    var box = $('p2Days');
    if (!box) return;
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

  function placeTone(place) {
    var cue = cueFor({ type: Planner2.primaryType(place), title: place.name, name: place.name });
    var palette = window.PlaceCategories && PlaceCategories.paletteFor ? PlaceCategories.paletteFor(cue.id) : null;
    return { cue: cue, palette: palette };
  }

  function renderTray() {
    var types = [{ id: 'all', singular: 'All' }].concat(
      (window.PlaceCategories && PlaceCategories.CATALOGUE_TYPES) || []
    );
    $('p2Types').innerHTML = types.map(function (type) {
      var label = type.id === 'all' ? 'All' : (type.singular || type.label);
      var on = type.id === 'all' ? !state.types.length : state.types.indexOf(type.id) !== -1;
      return '<button type="button" class="p2-chip' + (on ? ' on' : '') + '" data-type="' + esc(type.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(label) + '</button>';
    }).join('');
    var used = Planner2.usedPlaceIds(state.plan);
    var groups = Planner2.groupPlaces(state.places, state.query, state.types);
    $('p2Chips').innerHTML = groups.length ? groups.map(function (group) {
      var heading = window.PlaceCategories && PlaceCategories.groupLabel
        ? PlaceCategories.groupLabel(group.id)
        : group.id;
      var cards = group.places.map(function (place) {
        var on = state.selected === place.id ? ' on' : '';
        var count = used[String(place.id)] || 0;
        var use = Planner2.placeUseMark(count);
        var useClass = use === 'once' ? ' is-used-once' : (use === 'many' ? ' is-used-many' : '');
        var label = Planner2.placeLabel(place);
        var hint = label;
        if (count === 1) hint += ' · used once';
        else if (count > 1) hint += ' · used ' + count + ' times';
        return '<div role="button" tabindex="0" class="p2-card' + on + useClass + '" data-place="' + esc(place.id) + '" data-used="' + count + '" title="' + esc(hint) + '">'
          + '<span class="p2-grip" aria-hidden="true"></span>'
          + '<span class="p2-card-name">' + esc(label) + '</span></div>';
      }).join('');
      return '<section class="p2-group"><h3>' + esc(heading) + '</h3>' + cards + '</section>';
    }).join('') : '<p class="p2-note">No places.</p>';
    $('p2Chips').querySelectorAll('.p2-card').forEach(function (card) {
      var place = state.places.find(function (item) { return item.id === card.getAttribute('data-place'); });
      var tone = place ? placeTone(place) : null;
      var count = Number(card.getAttribute('data-used')) || 0;
      if (count >= 2) {
        card.style.background = '#b42318';
        card.style.color = '#fff';
        card.style.boxShadow = 'none';
      } else if (count === 1 && tone && tone.palette) {
        card.style.background = 'linear-gradient(90deg, ' + tone.palette.wash + ' 0 50%, #f4c7c7 50% 100%)';
        card.style.color = '#1c1b19';
        card.style.boxShadow = 'inset 4px 0 0 ' + tone.palette.stripe;
      } else if (tone && tone.palette) {
        card.style.background = tone.palette.wash;
        card.style.color = '';
        card.style.boxShadow = 'inset 4px 0 0 ' + tone.palette.stripe;
      }
      bindPlacePointer(card);
    });
    $('p2Types').querySelectorAll('[data-type]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-type');
        if (!id || id === 'all') {
          state.types = [];
        } else {
          var at = state.types.indexOf(id);
          if (at === -1) state.types.push(id);
          else state.types.splice(at, 1);
        }
        renderTray();
      });
    });
  }

  function cardFacts(card, place) {
    if (place) {
      var tone = placeTone(place);
      return {
        icon: tone && tone.cue && tone.cue.emoji ? tone.cue.emoji : '',
        name: Planner2.placeLabel(place),
        time: '',
      };
    }
    var emoji = card.querySelector('.ov-emoji');
    var nameEl = card.querySelector('.ov-name');
    var timeEl = card.querySelector('.ov-time');
    var name = nameEl ? nameEl.textContent : '';
    if (emoji && emoji.textContent) name = name.split(emoji.textContent).join(' ').replace(/\s+/g, ' ').trim();
    var time = timeEl ? timeEl.textContent.replace('≈', '').trim() : '';
    return { icon: emoji ? emoji.textContent : '', name: name || 'Stop', time: time };
  }

  function showDragLabel(current, facts, x, y) {
    var label = current;
    if (!label && window.DragLabel) label = DragLabel.create(facts);
    if (label && window.DragLabel) DragLabel.move(label, x, y);
    return label;
  }

  function fillDropPreview(snap, facts, time) {
    snap.className = 'ov-snap ov-drop-preview';
    snap.replaceChildren();
    if (facts.icon) {
      var icon = document.createElement('span');
      icon.className = 'drag-label-icon';
      icon.textContent = facts.icon;
      snap.appendChild(icon);
    }
    var name = document.createElement('span');
    name.className = 'drag-label-name';
    name.textContent = facts.name || '';
    snap.appendChild(name);
    var clock = document.createElement('span');
    clock.className = 'drag-label-time';
    clock.textContent = time || facts.time || '';
    snap.appendChild(clock);
  }

  function bindPlacePointer(card) {
    card.addEventListener('pointerdown', function (event) {
      if (event.button != null && event.button !== 0) return;
      if (event.pointerType === 'mouse') event.preventDefault();
      var id = card.getAttribute('data-place');
      var pointer = event.pointerId;
      var origin = { x: event.clientX, y: event.clientY, t: Date.now(), decided: '' };
      var ghost = null;
      var snap = null;
      var facts = cardFacts(card, state.places.find(function (item) { return item.id === id; }));
      var hold = setTimeout(function () {
        if (origin.decided) return;
        if (Planner2.placeGesture(0, 0, Date.now() - origin.t) === 'drag') beginDrag(origin.x, origin.y);
      }, 320);
      var lastX = origin.x;
      var lastY = origin.y;
      function columnAt(x, y) {
        var previous = card.style.pointerEvents;
        card.style.pointerEvents = 'none';
        if (ghost) ghost.style.pointerEvents = 'none';
        document.querySelectorAll('.drag-label').forEach(function (el) { el.style.pointerEvents = 'none'; });
        var under = document.elementFromPoint(x, y);
        card.style.pointerEvents = previous;
        if (!under || !under.closest) return null;
        return under.closest('[data-ov-col]');
      }
      function follow(x, y) {
        ghost = showDragLabel(ghost, facts, x, y);
        if (snap) { snap.remove(); snap = null; }
        document.querySelectorAll('[data-ov-col]').forEach(function (el) { el.classList.remove('is-drop'); });
        var col = columnAt(x, y);
        if (!col) return;
        col.classList.add('is-drop');
        var mins = minutesOn(col, y);
        snap = document.createElement('div');
        snap.style.top = ((mins - WeekOverview.START_MIN) * WeekOverview.PX_PER_MIN) + 'px';
        fillDropPreview(snap, facts, WeekOverview.formatMinutes(mins));
        col.appendChild(snap);
      }
      function beginDrag(x, y) {
        if (origin.decided === 'scroll') return;
        origin.decided = 'drag';
        clearTimeout(hold);
        document.body.classList.add('is-dragging');
        try { card.setPointerCapture(pointer); } catch (_) { /* a scroll already owns the finger */ }
        follow(x, y);
      }
      function clearDrag() {
        clearTimeout(hold);
        document.body.classList.remove('is-dragging');
        document.querySelectorAll('[data-ov-col]').forEach(function (el) { el.classList.remove('is-drop'); });
        if (window.DragLabel) DragLabel.remove(ghost);
        else if (ghost) ghost.remove();
        if (snap) snap.remove();
        ghost = null;
        snap = null;
      }
      function detach() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      }
      function move(e) {
        if (e.pointerId !== pointer || origin.decided === 'scroll') return;
        lastX = e.clientX;
        lastY = e.clientY;
        if (origin.decided === 'drag') {
          if (e.cancelable) e.preventDefault();
          follow(e.clientX, e.clientY);
          return;
        }
        if (e.pointerType === 'mouse' && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) >= 6) {
          beginDrag(e.clientX, e.clientY);
          return;
        }
        var gesture = Planner2.placeGesture(e.clientX - origin.x, e.clientY - origin.y, Date.now() - origin.t);
        if (gesture === 'scroll') {
          origin.decided = 'scroll';
          clearTimeout(hold);
          return;
        }
        if (gesture === 'drag') beginDrag(e.clientX, e.clientY);
      }
      function up(e) {
        if (e.pointerId !== pointer) return;
        detach();
        var decided = origin.decided;
        var x = e && Number.isFinite(e.clientX) ? e.clientX : lastX;
        var y = e && Number.isFinite(e.clientY) ? e.clientY : lastY;
        var col = decided === 'drag' ? columnAt(x, y) : null;
        var mins = col ? minutesOn(col, y) : null;
        clearDrag();
        if (decided === 'scroll') return;
        if (decided !== 'drag') {
          var tapped = state.places.find(function (item) { return item.id === id; });
          if (tapped && window.PlaceEditor) {
            PlaceEditor.open({
              sb: state.sb,
              place: tapped,
              readOnly: state.sample,
              onSaved: function (saved) {
                tapped.place_type = saved.place_type;
                tapped.type = saved.place_type;
                tapped.place_types = (saved.place_types || []).slice();
                tapped.types = tapped.place_types.slice();
                tapped.name = saved.name;
                tapped.nickname = saved.nickname;
                tapped.notes = saved.notes;
                tapped.icon = saved.icon;
                tapped.address = saved.address;
                tapped.updated_at = saved.updated_at;
                renderTray();
              }
            });
          }
          return;
        }
        if (!col || mins == null) return;
        var place = state.places.find(function (item) { return item.id === id; });
        if (place && Planner2.addPlace(state.plan, place, Number(col.getAttribute('data-ov-col')), WeekOverview.formatMinutes(mins))) {
          state.selected = null;
          afterEdit();
        }
      }
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });
  }

  function afterEdit() {
    state.unsaved = true;
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
        if (event.pointerType === 'mouse') event.preventDefault();
        if (event.target.closest && event.target.closest('.ov-x')) return;
        var stopId = card.getAttribute('data-ov-stop');
        var pointerId = event.pointerId;
        var touch = event.pointerType !== 'mouse';
        var origin = { x: event.clientX, y: event.clientY };
        var lastX = event.clientX;
        var lastY = event.clientY;
        var lifted = false;
        var ghost = null;
        var snap = null;
        var facts = cardFacts(card);
        var finished = false;
        function columnAt(x, y) {
          var hidden = [];
          function cover(el) {
            if (!el || hidden.some(function (pair) { return pair[0] === el; })) return;
            hidden.push([el, el.style.pointerEvents]);
            el.style.pointerEvents = 'none';
          }
          cover(card);
          document.querySelectorAll('.ov-ghost, .drag-label, .ov-drop-preview').forEach(cover);
          var under = null;
          try { under = document.elementFromPoint(x, y); } catch (_) { under = null; }
          hidden.forEach(function (pair) { pair[0].style.pointerEvents = pair[1]; });
          if (!under || !under.closest) return null;
          var col = under.closest('[data-ov-col]');
          if (col) return col;
          var day = under.closest('[data-ov-day]');
          return day ? day.querySelector('[data-ov-col]') : null;
        }
        function clearMarks() {
          card.classList.remove('dragging');
          card.style.pointerEvents = '';
          root.querySelectorAll('[data-ov-col]').forEach(function (el) { el.classList.remove('is-drop'); });
          if (window.DragLabel) DragLabel.remove(ghost);
          else if (ghost) ghost.remove();
          if (snap) snap.remove();
          ghost = null;
          snap = null;
        }
        function follow(x, y) {
          card.classList.add('dragging');
          card.style.pointerEvents = 'none';
          ghost = showDragLabel(ghost, facts, x, y);
          var scroller = document.getElementById('p2Scroll');
          if (scroller) {
            var rect = scroller.getBoundingClientRect();
            if (x < rect.left + 56) scroller.scrollLeft -= 24;
            else if (x > rect.right - 56) scroller.scrollLeft += 24;
            if (y < rect.top + 56) scroller.scrollTop -= 16;
            else if (y > rect.bottom - 56) scroller.scrollTop += 16;
          }
          if (snap) { snap.remove(); snap = null; }
          root.querySelectorAll('[data-ov-col]').forEach(function (el) { el.classList.remove('is-drop'); });
          var col = columnAt(x, y);
          if (!col) return;
          col.classList.add('is-drop');
          var mins = minutesOn(col, y);
          snap = document.createElement('div');
          snap.style.top = ((mins - WeekOverview.START_MIN) * WeekOverview.PX_PER_MIN) + 'px';
          fillDropPreview(snap, facts, WeekOverview.formatMinutes(mins));
          col.appendChild(snap);
        }
        function lift(x, y) {
          if (lifted) return;
          lifted = true;
          clearTimeout(hold);
          try { card.setPointerCapture(pointerId); } catch (_) { /* the finger can still move */ }
          follow(x, y);
        }
        var hold = touch ? setTimeout(function () { lift(lastX, lastY); }, 300) : null;
        function move(e) {
          if (e.pointerId !== pointerId) return;
          lastX = e.clientX;
          lastY = e.clientY;
          var dist = Math.hypot(e.clientX - origin.x, e.clientY - origin.y);
          if (!lifted) {
            if (!touch && dist >= 6) lift(e.clientX, e.clientY);
            else if (touch && dist > 14 && Math.abs(e.clientY - origin.y) > Math.abs(e.clientX - origin.x)) {
              clearTimeout(hold);
              finished = true;
              detach();
            }
            return;
          }
          if (e.cancelable) e.preventDefault();
          follow(e.clientX, e.clientY);
        }
        function finish(e) {
          if (finished || (e && e.pointerId != null && e.pointerId !== pointerId)) return;
          finished = true;
          detach();
          var x = e && Number.isFinite(e.clientX) ? e.clientX : lastX;
          var y = e && Number.isFinite(e.clientY) ? e.clientY : lastY;
          var col = lifted ? columnAt(x, y) : null;
          var mins = col ? minutesOn(col, y) : null;
          clearMarks();
          if (!lifted) { openEditor(stopId); return; }
          if (!col || mins == null) return;
          if (Planner2.placeStop(state.plan, stopId, Number(col.getAttribute('data-ov-col')), WeekOverview.formatMinutes(mins))) afterEdit();
        }
        function detach() {
          clearTimeout(hold);
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', finish);
          window.removeEventListener('pointercancel', finish);
        }
        window.addEventListener('pointermove', move, { passive: false });
        window.addEventListener('pointerup', finish);
        window.addEventListener('pointercancel', finish);
      });
    });
    root.querySelectorAll('[data-ov-marker="pickup"]').forEach(function (mark) {
      mark.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        var day = mark.closest('[data-ov-day]');
        openPickup(day ? Number(day.getAttribute('data-ov-day')) : 0);
      });
    });
    root.querySelectorAll('[data-ov-marker="dropoff"]').forEach(function (mark) {
      mark.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        openDropoff();
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

  function mapsPref() {
    var apple = !(window.PlacePopup && PlacePopup.prefersApple) || PlacePopup.prefersApple();
    return { prefersApple: apple };
  }

  function hotelNavHtml(list, towardExit, emptyNote) {
    var rows = list || [];
    if (!rows.length) return '<p class="p2-note">' + esc(emptyNote || 'No hotels on this stop.') + '</p>';
    var ordered = window.PragueExit
      ? PragueExit.order(rows.map(function (row) { return row.point; }), { towardExit: towardExit !== false })
      : { points: rows.map(function (row) { return row.point; }), reason: '' };
    var byPoint = {};
    rows.forEach(function (row) { byPoint[row.point] = row; });
    var html = '';
    if (ordered.points.length > 1) {
      var all = Planner2.routeHref(ordered.points, mapsPref());
      var note = ordered.reason ? ' title="' + esc(ordered.reason) + '"' : '';
      if (all) html += '<a class="p2-nav" href="' + esc(all) + '"' + note + ' target="_blank" rel="noopener">Navigate to all hotels</a>';
    }
    html += '<p class="p2-nav-label">Navigate to each hotel separately</p>';
    ordered.points.forEach(function (point) {
      var row = byPoint[point] || { point: point, label: point };
      var href = Planner2.routeHref([point], mapsPref());
      var label = [row.time, row.label].filter(Boolean).join(' · ');
      html += '<a class="p2-nav" href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(label || 'Hotel') + '</a>';
    });
    return html;
  }

  function pickupNavHtml(rows) {
    return hotelNavHtml(rows, true, 'No hotel pick-ups on this day.');
  }

  function dropoffNavHtml(info) {
    var data = info || { airport: '', hotels: [] };
    if (data.airport && !(data.hotels || []).length) {
      var href = Planner2.routeHref([data.airport], mapsPref());
      return '<a class="p2-nav" href="' + esc(href) + '" target="_blank" rel="noopener">Navigate to the airport</a>';
    }
    var html = hotelNavHtml(data.hotels, false, 'No Prague hotel on this drop-off.');
    if (data.airport) {
      var airportHref = Planner2.routeHref([data.airport], mapsPref());
      html += '<a class="p2-nav" href="' + esc(airportHref) + '" target="_blank" rel="noopener">Navigate to the airport</a>';
    }
    return html;
  }

  function openPickup(dayIndex) {
    var day = (state.plan && state.plan.days || [])[dayIndex] || { blocks: [] };
    $('p2SheetTitle').textContent = 'Prague pick-up';
    $('p2SheetBody').innerHTML = pickupNavHtml(Planner2.pickupRows(day));
    $('p2Sheet').hidden = false;
  }

  function openDropoff() {
    $('p2SheetTitle').textContent = 'Prague drop-off';
    $('p2SheetBody').innerHTML = dropoffNavHtml(Planner2.dropoffRows(state.plan));
    $('p2Sheet').hidden = false;
  }

  function cataloguePlace(id) {
    if (!id) return null;
    return (state.places || []).find(function (item) { return String(item.id) === String(id); }) || null;
  }

  function placeForStop(stop) {
    if (!stop || !stop.placeId) return null;
    return (state.places || []).find(function (place) {
      return String(place.id) === String(stop.placeId);
    }) || {
      name: stop.title || '',
      address: stop.address || '',
      notes: stop.notes || '',
      pin_lat: stop.pinLat,
      pin_lng: stop.pinLng,
    };
  }

  function bindPlacePopup(root) {
    if (!root) return;
    var add = root.querySelector('[data-add-contact]');
    var form = root.querySelector('[data-contact-form]');
    if (add && form) {
      add.addEventListener('click', function () {
        add.hidden = true;
        form.hidden = false;
      });
    }
    if (!form) return;
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var place = form._place;
      if (!place || !window.PlacePopup || !state.sb) return;
      var patch = PlacePopup.contactPatch(
        form.querySelector('[data-contact-name]').value,
        form.querySelector('[data-contact-phone]').value
      );
      var id = String(place.client_id || place.id || '');
      state.sb.from('planner_places').update(patch).eq('client_id', id).then(function (res) {
        if (res && res.error) {
          setStatus(res.error.message || 'Could not save the contact');
          return;
        }
        place.contact_name = patch.contact_name;
        place.contact_phone = patch.contact_phone;
        if (state.editingStop) openEditor(state.editingStop);
      });
    });
    form._place = root._place;
  }

  function openEditor(stopId) {
    var found = Planner2.findStop(state.plan, stopId);
    if (!found) return;
    var stop = found.stop;
    state.editingStop = stopId;
    var rows = Planner2.pickupRows({ blocks: [stop] });
    var drop = stop.handoverKind === 'dropoff' || stop.autoStop === 'prague-dropoff' || stop.autoStop === 'airport-dropoff';
    var place = stop.placeId ? placeForStop(stop) : null;
    var pop = place && window.PlacePopup ? PlacePopup.popupHtml(place) : '';
    var nav = drop ? dropoffNavHtml(Planner2.dropoffRows(state.plan)) : (rows.length ? pickupNavHtml(rows) : '');
    var shown = Planner2.displayStopTitle(stop, stop.placeId ? cataloguePlace(stop.placeId) : null);
    $('p2SheetTitle').textContent = drop ? 'Prague drop-off' : (rows.length > 1 ? 'Prague pick-up' : (shown || 'Stop'));
    $('p2SheetBody').innerHTML = nav
      + pop
      + '<label class="p2-field">Time<input type="time" id="p2EditTime" value="' + esc(stop.time || '') + '"></label>'
      + '<label class="p2-field">Name<input type="text" id="p2EditTitle" value="' + esc(shown || '') + '"></label>'
      + '<label class="p2-field">Notes<input type="text" id="p2EditNotes" value="' + esc(stop.notes || '') + '"></label>'
      + '<label class="p2-field">Address<input type="text" id="p2EditAddress" value="' + esc(stop.address || stop.hotelName || '') + '"></label>'
      + '<div class="p2-sheet-actions"><button type="button" class="p2-btn" id="p2EditSave">Save</button>'
      + '<button type="button" class="p2-btn danger" id="p2EditRemove">Remove</button></div>';
    $('p2Sheet').hidden = false;
    var popRoot = $('p2SheetBody').querySelector('.place-pop');
    if (popRoot) {
      popRoot._place = place;
      bindPlacePopup(popRoot);
    }
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
    var id = bookingId();
    payload.bookingKey = String(id);
    if (state.bookingRow) {
      Planner2.alignPlanToBooking(payload, state.bookingRow);
      Planner2.alignPlanToBooking(state.plan, state.bookingRow);
      if (!Planner2.planDatesMatchBooking(payload, state.bookingRow)) {
        state.saving = false;
        paintSaveStatus('unsaved');
        setStatus('Not saved — the tour dates do not match the booking');
        return;
      }
    }
    delete payload.sample;
    if (window.PlanSync) PlanSync.stamp(payload);
    var updatedAt = new Date().toISOString();
    try {
      if (!state.row || !state.row.id) {
        var inserted = await state.sb.from('planner_plans').insert({
          payload: payload,
          updated_at: updatedAt,
          booking_id: id,
          client_key: 'booking:' + id,
        }).select('id, updated_at, booking_id').single();
        if (inserted.error) throw inserted.error;
        if (Number(inserted.data.booking_id) !== id) throw new Error('Refused a write for a different booking');
        state.row = inserted.data;
      } else {
        var query = state.sb.from('planner_plans').update({
          payload: payload,
          updated_at: updatedAt,
        }).eq('id', state.row.id).eq('booking_id', id);
        if (state.row.updated_at) query = query.eq('updated_at', state.row.updated_at);
        var updated = await query.select('id, updated_at, booking_id');
        if (updated.error) throw updated.error;
        if (!updated.data || !updated.data.length) {
          paintSaveStatus('unsaved');
          state.saving = false;
          return;
        }
        state.row = updated.data[0];
      }
      state.plan.lastSavedAt = payload.lastSavedAt;
      state.plan.lastSavedFrom = payload.lastSavedFrom;
      state.seenUpdatedAt = (state.row && state.row.updated_at) || updatedAt;
      state.savedPlan = JSON.parse(JSON.stringify(state.plan));
      state.unsaved = false;
      paintSaveStatus('current', state.plan);
      setStatus('Saved booking ' + id);
    } catch (err) {
      console.warn(err);
      paintSaveStatus('unsaved');
      setStatus('Could not save');
    }
    state.saving = false;
  }

  function placeFromRow(row) {
    var type = row.place_type || 'other';
    var types = Array.isArray(row.place_types) && row.place_types.length ? row.place_types : [type];
    var place = Object.assign({}, row);
    place.id = row.client_id || String(row.id);
    place.client_id = place.id;
    place.name = row.name || '';
    place.nickname = row.nickname || '';
    place.type = type;
    place.place_type = type;
    place.types = types.slice();
    place.place_types = types.slice();
    place.address = row.address || '';
    return place;
  }

  async function loadLive() {
    var id = bookingId();
    if (!id) {
      setStatus('This address does not name a booking');
      return;
    }
    state.bookingId = id;
    setStatus('Loading booking ' + id + '…');
    var booking = await state.sb.from('bookings')
      .select('id, group_name, tour_arrival_date, departure_date, hotels(name)')
      .eq('id', id)
      .maybeSingle();
    if (booking.error) throw booking.error;
    var planRow = await state.sb.from('planner_plans')
      .select('id, payload, updated_at, booking_id')
      .eq('booking_id', id)
      .maybeSingle();
    if (planRow.error) throw planRow.error;
    state.row = planRow.data || null;
    state.bookingRow = booking.data || null;
    if (state.row && state.row.payload) {
      state.plan = state.row.payload;
      state.plan.bookingKey = String(id);
      if (!Array.isArray(state.plan.days)) state.plan.days = [];
    } else {
      state.plan = Planner2.emptyPlanFromBooking(booking.data || { id: id, group_name: 'Booking ' + id });
    }
    if (state.bookingRow) Planner2.alignPlanToBooking(state.plan, state.bookingRow);
    if (booking.data && booking.data.group_name) state.plan.groupName = booking.data.group_name;
    var members = await state.sb.from('members')
      .select('id, first_name, last_name, prague_stays, arrival_date, departure_date, arrival_flight, departure_flight, arrival_time, departure_time')
      .eq('booking_id', id);
    state.members = !members.error && members.data ? members.data : [];
    var places = await state.sb.from('planner_places')
      .select('*')
      .order('sort_order', { ascending: true });
    if (!places.error && places.data) state.places = places.data.map(placeFromRow);
    state.savedPlan = JSON.parse(JSON.stringify(state.plan));
    state.seenUpdatedAt = state.row && state.row.updated_at;
    setStatus(state.row ? ('Booking ' + id + ' loaded') : 'No saved plan yet — edits will create one');
    paintSaveStatus('current', state.plan);
    watchPlan();
    render();
  }

  function planIsDirty() {
    if (state.unsaved) return true;
    if (!state.savedPlan || !window.PlanSync) return false;
    return !PlanSync.sameSchedule(state.savedPlan, state.plan);
  }

  function applyRemoteRow(row) {
    if (!row || !row.payload || (row.updated_at && row.updated_at === state.seenUpdatedAt)) return;
    var remote = row.payload;
    remote.bookingKey = String(bookingId());
    if (state.bookingRow) Planner2.alignPlanToBooking(remote, state.bookingRow);
    state.seenUpdatedAt = row.updated_at || state.seenUpdatedAt;
    if (planIsDirty() && window.PlanSync && !PlanSync.sameSchedule(state.plan, remote)) {
      paintSaveStatus('unsaved');
      return;
    }
    if (window.PlanSync && PlanSync.sameSchedule(state.plan, remote)) {
      state.plan.lastSavedAt = remote.lastSavedAt;
      state.plan.lastSavedFrom = remote.lastSavedFrom;
      paintSaveStatus('current', remote);
      return;
    }
    state.plan = remote;
    state.savedPlan = JSON.parse(JSON.stringify(remote));
    state.row = row;
    state.unsaved = false;
    render();
    paintSaveStatus('newer', remote);
  }

  async function pollPlan() {
    if (state.sample || !state.sb || !state.plan) return;
    if (document.visibilityState === 'hidden') return;
    try {
      var res = await state.sb.from('planner_plans').select('id, booking_id, updated_at, payload').eq('booking_id', bookingId()).maybeSingle();
      if (!res.error && res.data) applyRemoteRow(res.data);
    } catch (err) { console.warn(err); }
  }

  function watchPlan() {
    if (state.stopWatch) state.stopWatch();
    state.stopWatch = null;
    if (state.sample || !state.sb || !window.PlanSync) return;
    state.stopWatch = PlanSync.watch(state.sb, bookingId(), { onRow: applyRemoteRow, poll: pollPlan });
  }

  function bootSample() {
    state.sample = true;
    state.plan = Planner2.samplePlan();
    state.places = Planner2.samplePlaces();
    setStatus('Sample — nothing is saved');
    render();
  }

  function wideLayout() {
    if (state.phone) return false;
    return window.matchMedia && window.matchMedia('(min-width: 761px)').matches;
  }

  function splitPointer() {
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var points = navigator.maxTouchPoints || 0;
    return SplitPane.pointerKind({ coarse: coarse, maxTouchPoints: points });
  }

  function applyPlacesWidth(px) {
    var main = document.querySelector('.p2-main');
    if (!main) return;
    main.style.setProperty('--p2-places', px + 'px');
  }

  function bindSplit() {
    var handle = $('p2Split');
    var main = document.querySelector('.p2-main');
    if (!handle || !main || !window.SplitPane || handle.dataset.splitBound) return;
    handle.dataset.splitBound = '1';
    var key = SplitPane.storageKey(splitPointer());
    function total() { return main.getBoundingClientRect().width; }
    function applySaved() {
      if (!wideLayout()) return;
      var saved = SplitPane.read(window.localStorage, key);
      var width = SplitPane.clamp(saved == null ? SplitPane.DEFAULT_PX : saved, total(), handle.offsetWidth || 12);
      applyPlacesWidth(width);
    }
    applySaved();
    window.addEventListener('resize', applySaved);
    handle.addEventListener('pointerdown', function (event) {
      if (!wideLayout()) return;
      if (event.button != null && event.button !== 0) return;
      event.preventDefault();
      var pointer = event.pointerId;
      var startX = event.clientX;
      var startW = SplitPane.clamp(parseFloat(getComputedStyle(main).getPropertyValue('--p2-places')) || main.querySelector('.p2-tray').getBoundingClientRect().width, total(), handle.offsetWidth || 12);
      try { handle.setPointerCapture(pointer); } catch (_) { /* the finger can still move */ }
      document.body.classList.add('is-resizing');
      function move(e) {
        if (e.pointerId !== pointer) return;
        if (e.cancelable) e.preventDefault();
        applyPlacesWidth(SplitPane.clamp(startW + (e.clientX - startX), total(), handle.offsetWidth || 12));
      }
      function end(e) {
        if (e.pointerId !== pointer) return;
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', end);
        handle.removeEventListener('pointercancel', end);
        document.body.classList.remove('is-resizing');
        var width = parseFloat(getComputedStyle(main).getPropertyValue('--p2-places'));
        if (Number.isFinite(width)) SplitPane.write(window.localStorage, key, width);
      }
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    });
    handle.addEventListener('dblclick', function () {
      if (!wideLayout()) return;
      SplitPane.clear(window.localStorage, key);
      applyPlacesWidth(SplitPane.clamp(SplitPane.DEFAULT_PX, total(), handle.offsetWidth || 12));
    });
  }

  var chromeBound = false;
  function bindChrome() {
    if (chromeBound) return;
    chromeBound = true;
    bindSplit();
    var placesBtn = $('p2Places');
    if (placesBtn) {
      placesBtn.addEventListener('click', function () {
        state.tray = !state.tray;
        render();
      });
    }
    var suggest = $('b2Suggest');
    if (suggest) {
      suggest.addEventListener('click', function () {
        if (!window.RoughWeek || !state.plan) return;
        var busy = RoughWeek.busyDays(state.plan);
        var replaceBusy = true;
        if (busy.length) {
          replaceBusy = window.confirm('Day ' + busy.join(', ') + ' already has several stops.\n\nOK replaces those days with the rough draft.\nCancel only fills the quieter days.');
        }
        RoughWeek.apply(state.plan, state.places || [], { replaceBusy: replaceBusy });
        afterEdit();
      });
    }
    var ends = $('b2PragueEnds');
    if (ends) {
      ends.addEventListener('click', function () {
        if (!window.RoughWeek || !state.plan) return;
        if (RoughWeek.hasEnds(state.plan)) {
          var ok = window.confirm('This replaces the Prague pick-ups and drop-offs already on the week. Other appointments stay.');
          if (!ok) return;
        }
        var result = RoughWeek.addEnds(state.plan, state.members || []);
        if (!result.pickups && !result.dropoffs) {
          setStatus('No Prague hotel on this booking');
          return;
        }
        afterEdit();
      });
    }
    var search = $('p2Search');
    if (search) {
      search.addEventListener('input', function (event) {
        state.query = event.target.value;
        renderTray();
      });
    }
    var saveLine = $('planSaveStatus');
    if (saveLine) saveLine.addEventListener('click', function () {
      if (!state.unsaved) return;
      savePlan();
    });
    var close = $('p2SheetClose');
    if (close) close.addEventListener('click', closeEditor);
    var sheet = $('p2Sheet');
    if (sheet) {
      sheet.addEventListener('click', function (event) {
        if (event.target.id === 'p2Sheet') closeEditor();
      });
    }
    document.addEventListener('selectstart', function (event) {
      if (event.target.closest && event.target.closest('.p2-card, .ov-stop, .p2-scroll, .ov-grid')) event.preventDefault();
    });
    document.addEventListener('mousedown', function (event) {
      if (event.target.closest && event.target.closest('input, textarea, [contenteditable]')) return;
      if (!event.target.closest || !event.target.closest('.p2-tray, .p2-scroll, .ov-grid, .ov-stop, .p2-card')) return;
      var sel = window.getSelection && window.getSelection();
      if (sel && sel.removeAllRanges) sel.removeAllRanges();
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
  }

  function mount(options) {
    options = options || {};
    if (state.started) return;
    state.started = true;
    state.embedded = !!document.getElementById('b2Summary');
    if (options.sb) state.sb = options.sb;
    bindChrome();
    var params = new URLSearchParams(location.search);
    state.refused = params.get('booking') && !Planner2.isAllowedBooking(params.get('booking'));
    if (options.sample || /(?:\?|&)preview=mock(?:&|$)/.test(location.search)) {
      bootSample();
      return;
    }
    if (!state.sb) {
      const SUPABASE_URL = BOOKING_SUPABASE_URL;
      const SUPABASE_ANON_KEY = BOOKING_SUPABASE_ANON_KEY;
      state.sb = AuthGate.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      AuthGate.require(state.sb, { title: 'Jennifer Lindsay planner' }).then(function (session) {
        if (!session) {
          setStatus('Sign in to open this booking');
          return;
        }
        loadLive().catch(function (err) {
          console.warn(err);
          setStatus('Could not load this booking');
        });
      });
      return;
    }
    loadLive().catch(function (err) {
      console.warn(err);
      setStatus('Could not load this booking');
    });
  }

  window.Planner2Page = { mount: mount };
  if (document.getElementById('p2Scroll') && !document.getElementById('b2Summary')) mount();
}());
