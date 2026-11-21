/*
 * Booking summary and week plan for the booking in the address.
 * With no booking number, or with ?home=1, open the last upcoming group
 * used on this phone, or the next one to depart. ?preview=mock edits
 * sample figures in memory only. No table is written.
 */
(function () {
  'use strict';

  var LAST_KEY = 'planning_last_booking';

  function bookingId() {
    var params = new URLSearchParams(location.search);
    if (params.get('home') === '1') return null;
    return Booking2.bookingNumber(params.get('booking'));
  }

  function homeEntry() {
    return new URLSearchParams(location.search).get('home') === '1';
  }

  function rememberedId() {
    var fromHistory = null;
    try { fromHistory = history.state && history.state.booking; } catch (err) { fromHistory = null; }
    if (Booking2.bookingNumber(fromHistory)) return Booking2.bookingNumber(fromHistory);
    try { return Booking2.bookingNumber(localStorage.getItem(LAST_KEY)); }
    catch (err) { return null; }
  }

  function rememberBooking(id) {
    var n = Booking2.bookingNumber(id);
    if (!n) return;
    state.currentId = n;
    try { localStorage.setItem(LAST_KEY, String(n)); } catch (err) { /* the address still names the group */ }
  }

  function writeBookingUrl(id, force) {
    var n = Booking2.bookingNumber(id);
    if (!n) return;
    var url = new URL(location.href);
    if (homeEntry() && !force) {
      history.replaceState({ booking: n }, '', url.pathname + url.search);
      return;
    }
    var kept = new URLSearchParams();
    url.searchParams.forEach(function (value, key) {
      if (key === 'home' || key === 'booking') return;
      kept.append(key, value);
    });
    kept.set('booking', String(n));
    history.replaceState({ booking: n }, '', url.pathname + '?' + kept.toString());
  }

  var state = {
    view: null,
    sample: false,
    refused: false,
    sb: null,
    plannerStarted: false,
    currentId: null,
    switching: false,
    rows: null,
  };

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function setStatus(text) {
    var el = $('b2Status');
    if (el) el.textContent = text || '';
  }

  function dash(value) {
    var text = String(value == null ? '' : value).trim();
    return text ? esc(text) : '—';
  }

  function render() {
    var view = state.view;
    if (!view) return;
    $('b2Title').textContent = view.groupName || Booking2.GROUP_NAME;
    document.title = (view.groupName || 'Planning') + ' — Planning';
    var home = $('b2Home');
    if (home) {
      var homeId = view.id || bookingId();
      home.href = homeId ? ('booking-form.html?booking=' + encodeURIComponent(homeId)) : 'booking-form.html';
    }
    var rooms = view.rooms || {};
    var roomCount = function (value) {
      var text = String(value == null ? '' : value).trim();
      return text && text !== '0' ? text : '';
    };
    var roomBits = [
      roomCount(rooms.singles) ? roomCount(rooms.singles) + ' single' : '',
      roomCount(rooms.twins) ? roomCount(rooms.twins) + ' twin' : '',
      roomCount(rooms.doubles) ? roomCount(rooms.doubles) + ' double' : '',
    ].filter(Boolean).join(', ');
    var people = view.headcount ? (view.headcount + (Number(view.headcount) === 1 ? ' person' : ' people')) : '';
    var brief = $('b2Brief');
    if (brief) brief.textContent = [people, roomBits].filter(Boolean).join(' · ');
    var nights = view.nights == null ? '' : (view.nights + (view.nights === 1 ? ' night' : ' nights'));
    $('b2Dates').textContent = [view.arrival, view.departure].filter(Boolean).join(' – ') + (nights ? ' · ' + nights : '');
    var note = 'Booking details are read-only. The week plan is on this page.';
    if (state.sample) note = 'Sample booking. Edits stay on this screen and are not saved. ' + note;
    else if (state.refused) note = 'This address does not name a booking. ' + note;
    $('b2Note').textContent = note;
    $('b2Summary').innerHTML = summaryHtml(view);
    if (state.sample) bindSampleEdits();
  }

  function fact(label, value) {
    return '<div><span class="b2-label">' + esc(label) + '</span><div class="b2-value">' + dash(value) + '</div></div>';
  }

  function summaryHtml(view) {
    var rooms = view.rooms || {};
    var roomCount = function (value) {
      var text = String(value == null ? '' : value).trim();
      return text && text !== '0' ? text : '';
    };
    var roomBits = [
      roomCount(rooms.singles) ? roomCount(rooms.singles) + ' single' : '',
      roomCount(rooms.twins) ? roomCount(rooms.twins) + ' twin' : '',
      roomCount(rooms.doubles) ? roomCount(rooms.doubles) + ' double' : '',
      rooms.keithRoom === true ? 'Keith has his own room' : '',
    ].filter(Boolean).join(' · ');
    var hotels = (view.hotels || []).map(function (hotel) {
      var tone = hotel.tone || {};
      var strip = hotel.strip
        ? '<p class="b2-strip" style="background:' + tone.bg + ';border-color:' + tone.border + ';color:' + tone.ink + '">' + esc(hotel.strip) + '</p>'
        : '';
      var nights = hotel.nights == null ? '' : hotel.nights + (hotel.nights === 1 ? ' night' : ' nights');
      return '<article class="b2-hotel"><h3>' + esc(hotel.name) + '</h3>' + strip
        + '<p class="b2-meta">' + dash(nights) + (hotel.paid ? ' · ' + esc(hotel.paid) : '') + '</p></article>';
    }).join('') || '<p class="b2-meta">No hotel recorded.</p>';
    var guests = (view.guests || []).map(function (guest) {
      var flight = [guest.arrivalFlight, guest.arrivalDate, guest.arrivalTime].filter(Boolean).join(' ');
      var back = [guest.departureFlight, guest.departureDate, guest.departureTime].filter(Boolean).join(' ');
      var prague = (guest.prague || []).map(function (stay) {
        return [stay.hotel, stay.check_in, stay.check_out].filter(Boolean).join(' · ');
      }).filter(Boolean).join('; ');
      var deposit = state.sample
        ? '<label class="b2-field">Deposit<input data-deposit="' + esc(guest.id) + '" value="' + esc(guest.deposit == null ? '' : guest.deposit) + '" inputmode="decimal"></label>'
        : '<p class="b2-meta">Deposit ' + dash(Booking2.money(guest.deposit)) + (guest.depositDate ? ' on ' + esc(guest.depositDate) : '') + '</p>';
      return '<article class="b2-guest" id="guest-' + esc(guest.id) + '"><h3>' + esc(guest.name) + '</h3>'
        + deposit
        + '<p class="b2-meta">Arrives ' + dash(flight) + '</p>'
        + '<p class="b2-meta">Leaves ' + dash(back) + '</p>'
        + (prague ? '<p class="b2-meta">Prague ' + esc(prague) + '</p>' : '')
        + (guest.flightNote ? '<p class="b2-meta">' + esc(guest.flightNote) + '</p>' : '')
        + '</article>';
    }).join('') || '<p class="b2-meta">No guests recorded.</p>';
    var flights = (view.flights || []).map(function (flight) {
      return '<p class="b2-meta"><strong>' + dash(flight.number) + '</strong> · arrives ' + dash([flight.arrivalDate, flight.arrivalTime].filter(Boolean).join(' '))
        + ' · leaves ' + dash([flight.departureDate, flight.departureTime].filter(Boolean).join(' '))
        + (flight.comments ? ' · ' + esc(flight.comments) : '') + '</p>';
    }).join('') || '<p class="b2-meta">No shared flight recorded.</p>';
    var money = view.money || {};
    var notes = state.sample
      ? '<label class="b2-field">Notes<textarea id="b2Notes" rows="3">' + esc(view.notes || '') + '</textarea></label>'
      : '<p class="b2-notes">' + (view.notes ? esc(view.notes) : '—') + '</p>';
    var hotelLine = (view.hotels || []).map(function (hotel) {
      var tone = hotel.tone || {};
      var strip = hotel.strip
        ? '<span class="b2-strip" style="background:' + tone.bg + ';border-color:' + tone.border + ';color:' + tone.ink + '">' + esc(hotel.strip) + '</span>'
        : '';
      return '<span class="b2-hotel-inline"><strong>' + esc(hotel.name) + '</strong>' + strip + '</span>';
    }).join('') || '<span class="b2-meta">No hotel recorded.</span>';
    var guestNames = (view.guests || []).map(function (guest) { return guest.name; }).filter(Boolean).join(', ');
    return ''
      + '<div class="b2-facts">'
      + fact('Organiser', view.organiser)
      + fact('Status', view.status)
      + fact('People', view.headcount)
      + fact('Nights', view.nights == null ? '' : String(view.nights))
      + fact('Rooms', roomBits)
      + '</div>'
      + '<div class="b2-hotels">' + hotelLine + '</div>'
      + '<p class="b2-moneyline">'
      + '<span>Price <strong>' + dash(money.price) + '</strong></span>'
      + '<span>Total <strong>' + dash(money.total) + '</strong></span>'
      + '<span>Paid <strong>' + dash(money.deposit) + '</strong></span>'
      + '<span>Left <strong>' + dash(money.left) + '</strong></span>'
      + '</p>'
      + '<p class="b2-guestline"><span class="b2-label">Guests</span> ' + esc(guestNames || '—') + '</p>'
      + '<details class="b2-more"><summary>Flights, deposits and notes</summary>'
      + '<div class="b2-more-body"><h2>Hotels</h2>' + hotels
      + '<h2>Guests</h2>' + guests
      + '<h2>Flights</h2>' + flights
      + '<h2>Notes</h2>' + notes
      + '</div></details>';
  }

  function bindSampleEdits() {
    var notes = $('b2Notes');
    if (notes) {
      notes.addEventListener('input', function () {
        state.view.notes = notes.value;
        setStatus('Sample — nothing is saved');
      });
    }
    document.querySelectorAll('[data-deposit]').forEach(function (input) {
      input.addEventListener('input', function () {
        var id = input.getAttribute('data-deposit');
        var guest = (state.view.guests || []).find(function (item) { return String(item.id) === String(id); });
        if (guest) guest.deposit = input.value;
        setStatus('Sample — nothing is saved');
      });
    });
  }

  function show(view) {
    state.view = view;
    setStatus('');
    render();
    if (!state.plannerStarted && window.Planner2Page) {
      state.plannerStarted = true;
      Planner2Page.mount({ sample: state.sample, sb: state.sb, bookingId: view.id || state.currentId });
    }
  }

  function client() {
    if (state.sb) return state.sb;
    const SUPABASE_URL = BOOKING_SUPABASE_URL;
    const SUPABASE_ANON_KEY = BOOKING_SUPABASE_ANON_KEY;
    state.sb = AuthGate.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return state.sb;
  }

  async function fetchBookingRows(sb) {
    var today = Booking2.todayIso();
    var cols = 'id, group_name, tour_arrival_date, departure_date, status, no_people';
    async function pull(columns) {
      var byDeparture = await sb.from('bookings').select(columns).gte('departure_date', today);
      var byArrival = await sb.from('bookings').select(columns).gte('tour_arrival_date', today);
      return { byDeparture: byDeparture, byArrival: byArrival };
    }
    var res = await pull(cols);
    var statusMissing = [res.byDeparture.error, res.byArrival.error].some(function (error) {
      return error && /status/i.test(String(error.message || error.code || ''));
    });
    if (statusMissing) res = await pull('id, group_name, tour_arrival_date, departure_date, no_people');
    if (res.byDeparture.error) throw res.byDeparture.error;
    if (res.byArrival.error) throw res.byArrival.error;
    var seen = {};
    var rows = [];
    [res.byDeparture.data, res.byArrival.data].forEach(function (list) {
      (list || []).forEach(function (row) {
        var id = Booking2.bookingNumber(row && row.id);
        if (!id || seen[id]) return;
        seen[id] = true;
        rows.push(row);
      });
    });
    state.rows = rows;
    return rows;
  }

  async function loadBooking(id) {
    var sb = client();
    setStatus('Loading booking ' + id + '…');
    var booking = await sb.from('bookings').select('*, hotels(name)').eq('id', id).maybeSingle();
    if (booking.error) throw booking.error;
    var members = await sb.from('members').select('*').eq('booking_id', id).order('id');
    var flights = await sb.from('flights').select('*').eq('booking_id', id).order('id');
    var hotels = await sb.from('booking_hotels').select('*, hotels(name)').eq('booking_id', id).order('sort_order');
    var extras = {};
    var notes = '';
    var organiser = '';
    if (window.BookingExtras && booking.data) {
      var split = BookingExtras.splitNotesAndExtras(booking.data.extra_notes);
      extras = split.extras || {};
      notes = split.notes || '';
      organiser = BookingExtras.organiserFullName(extras);
    }
    rememberBooking(id);
    var already = state.plannerStarted;
    show(Booking2.present({
      booking: booking.data || { id: id, group_name: 'Booking ' + id },
      members: members.data || [],
      flights: flights.data || [],
      hotels: hotels.data || [],
      extras: extras,
      notes: notes,
      organiser: organiser,
    }));
    if (already && window.Planner2Page && Planner2Page.open) await Planner2Page.open(id);
    setStatus('Read only');
  }

  function showEmpty() {
    state.view = {
      groupName: 'No upcoming group',
      id: null,
      hotels: [],
      guests: [],
      flights: [],
      rooms: {},
      money: {},
    };
    render();
    $('b2Dates').textContent = '';
    $('b2Note').textContent = 'There is no upcoming group. Back to bookings is above.';
    setStatus('');
  }

  async function loadLive() {
    var sb = client();
    var target = Booking2.planningTarget(location.search);
    var session = await AuthGate.require(sb, { title: 'Planning' });
    if (!session) {
      setStatus('Sign in to open planning');
      return;
    }
    if (target.mode === 'refused') {
      state.refused = true;
      setStatus('This address does not name a booking');
      return;
    }
    var id = target.mode === 'booking' ? target.id : null;
    if (!id) {
      setStatus('Finding the next group…');
      var rows = await fetchBookingRows(sb);
      id = Booking2.choosePlanningBooking(rows, rememberedId(), Booking2.todayIso());
      if (!id) {
        showEmpty();
        return;
      }
      if (homeEntry()) history.replaceState({ booking: id }, '', location.pathname + location.search);
      else writeBookingUrl(id, true);
    }
    await loadBooking(id);
  }

  function sampleRows() {
    return [
      { id: 310, group_name: 'Jennifer Lindsay', tour_arrival_date: '2027-05-10', departure_date: '2027-05-16', no_people: 8, status: '' },
      { id: 28, group_name: 'Sharon Harris', tour_arrival_date: '2027-03-02', departure_date: '2027-03-08', no_people: 6, status: 'Booked' },
      { id: 40, group_name: 'Past group', tour_arrival_date: '2024-05-01', departure_date: '2024-05-06', no_people: 4, status: '' },
      { id: 41, group_name: 'Cancelled group', tour_arrival_date: '2027-06-01', departure_date: '2027-06-07', no_people: 5, status: 'cancelled' },
      { id: 42, group_name: 'Autumn group', tour_arrival_date: '2027-09-06', departure_date: '2027-09-12', no_people: 7, status: '' },
      { id: 43, group_name: 'Leaving today', tour_arrival_date: '2026-11-18', departure_date: Booking2.todayIso(), no_people: 3, status: '' },
      { id: 44, group_name: 'June group', tour_arrival_date: '2027-06-14', departure_date: '2027-06-20', no_people: 9, status: '' },
      { id: 45, group_name: 'July group', tour_arrival_date: '2027-07-05', departure_date: '2027-07-11', no_people: 10, status: '' },
      { id: 46, group_name: 'August group', tour_arrival_date: '2027-08-02', departure_date: '2027-08-08', no_people: 11, status: '' },
      { id: 47, group_name: 'October group', tour_arrival_date: '2027-10-04', departure_date: '2027-10-10', no_people: 12, status: '' },
      { id: 48, group_name: 'November group', tour_arrival_date: '2027-11-01', departure_date: '2027-11-07', no_people: 8, status: '' },
      { id: 49, group_name: 'Spring 2028', tour_arrival_date: '2028-04-03', departure_date: '2028-04-09', no_people: 6, status: '' },
    ];
  }

  function currentId() {
    return state.currentId || (state.view && state.view.id) || null;
  }

  function listHtml(described) {
    var current = String(currentId() || '');
    if (!described.length) return '<p class="b2-switch-empty">No upcoming groups.</p>';
    return described.map(function (row) {
      var on = String(row.id) === current;
      return '<button type="button" class="b2-switch-item' + (on ? ' is-current' : '') + '" role="option" data-booking="' + esc(row.id)
        + '" aria-selected="' + (on ? 'true' : 'false') + '"><span>' + esc(row.name) + '</span>'
        + (row.meta ? '<span class="b2-switch-meta">' + esc(row.meta) + '</span>' : '') + '</button>';
    }).join('');
  }

  function closeSwitcher() {
    var box = $('b2Switcher');
    var btn = $('b2TitleBtn');
    if (box) box.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('b2-switcher-open');
    if (btn) btn.focus();
  }

  async function openSwitcher() {
    var box = $('b2Switcher');
    var list = $('b2SwitcherList');
    var btn = $('b2TitleBtn');
    if (!box || !list) return;
    box.hidden = false;
    if (btn) btn.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('b2-switcher-open');
    list.innerHTML = '<p class="b2-switch-empty">Loading…</p>';
    var close = $('b2SwitcherClose');
    if (close) close.focus();
    try {
      var rows = state.sample ? sampleRows() : await fetchBookingRows(client());
      var described = Booking2.describeUpcoming(rows, Booking2.todayIso());
      list.innerHTML = listHtml(described);
      var current = list.querySelector('.is-current');
      if (current && current.scrollIntoView) current.scrollIntoView({ block: 'nearest' });
    } catch (err) {
      console.warn(err);
      list.innerHTML = '<p class="b2-switch-empty">Could not load upcoming groups.</p>';
    }
  }

  async function allowSwitch() {
    if (state.sample) return true;
    if (!window.Planner2Page || typeof Planner2Page.flushSave !== 'function') return true;
    var saved = false;
    try { saved = await Planner2Page.flushSave(); }
    catch (err) { saved = false; }
    if (saved) return true;
    return window.confirm('This plan is not saved to the cloud. Switch group anyway?');
  }

  async function switchTo(id) {
    var next = Booking2.bookingNumber(id);
    if (!next || state.switching) return;
    if (String(next) === String(currentId())) {
      closeSwitcher();
      return;
    }
    state.switching = true;
    try {
      if (!(await allowSwitch())) return;
      if (state.sample) {
        var chosen = Booking2.describeUpcoming(sampleRows(), Booking2.todayIso()).find(function (row) {
          return row.id === next;
        });
        writeBookingUrl(next, true);
        rememberBooking(next);
        if (chosen) {
          $('b2Title').textContent = chosen.name;
          $('b2Dates').textContent = chosen.meta;
        }
        closeSwitcher();
        return;
      }
      writeBookingUrl(next, true);
      closeSwitcher();
      await loadBooking(next);
    } finally {
      state.switching = false;
    }
  }

  function bindSwitcher() {
    var btn = $('b2TitleBtn');
    if (btn) btn.addEventListener('click', function () { openSwitcher(); });
    var close = $('b2SwitcherClose');
    if (close) close.addEventListener('click', closeSwitcher);
    var box = $('b2Switcher');
    if (box) {
      box.addEventListener('click', function (event) {
        if (event.target === box) closeSwitcher();
        var item = event.target.closest && event.target.closest('[data-booking]');
        if (item) switchTo(item.getAttribute('data-booking'));
      });
    }
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && box && !box.hidden) closeSwitcher();
    });
  }

  var detailsBtn = document.getElementById('b2DetailsToggle');
  if (detailsBtn) {
    detailsBtn.addEventListener('click', function () {
      var open = document.body.classList.toggle('b2-details-open');
      detailsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      detailsBtn.textContent = open ? 'Hide details' : 'Show details';
    });
  }

  bindSwitcher();
  var target = Booking2.planningTarget(location.search);
  state.refused = target.mode === 'refused';
  if (target.mode === 'sample' || /(?:\?|&)preview=mock(?:&|$)/.test(location.search)) {
    state.sample = true;
    state.currentId = Booking2.BOOKING_ID;
    show(Booking2.sample());
  } else if (target.mode === 'refused') {
    setStatus('This address does not name a booking');
  } else {
    loadLive().catch(function (err) {
      console.warn(err);
      setStatus('Could not read this booking');
    });
  }
}());
