/*
 * Read-only booking page for Jennifer Lindsay, booking 310.
 * ?preview=mock edits sample figures in memory only. No table is written.
 */
(function () {
  'use strict';

  var ONLY = Booking2.BOOKING_ID;
  var state = { view: null, sample: false, refused: false };

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
    var nights = view.nights == null ? '' : (view.nights + (view.nights === 1 ? ' night' : ' nights'));
    $('b2Dates').textContent = [view.arrival, view.departure].filter(Boolean).join(' – ') + (nights ? ' · ' + nights : '');
    var note = 'This page opens only Jennifer Lindsay’s group, booking 310. The real booking is read-only.';
    if (state.sample) note = 'Sample booking. Edits stay on this screen and are not saved. ' + note;
    else if (state.refused) note = 'Other bookings are not opened here. ' + note;
    $('b2Note').textContent = note;
    var plan = state.sample ? 'planner2.html?preview=mock' : 'planner2.html';
    $('b2Plan').setAttribute('href', plan);
    $('b2Side').innerHTML = sideHtml(view);
    $('b2Body').innerHTML = bodyHtml(view);
    if (state.sample) bindSampleEdits();
  }

  function sideHtml(view) {
    var guests = (view.guests || []).map(function (guest) {
      return '<li><a href="#guest-' + esc(guest.id) + '">' + esc(guest.name) + '</a></li>';
    }).join('') || '<li class="b2-meta">No guests yet</li>';
    return '<h2>Guests</h2><ul class="b2-guests">' + guests + '</ul>'
      + '<h2>Sections</h2><ul class="b2-nav">'
      + '<li><a href="#group">Group</a></li>'
      + '<li><a href="#hotels">Hotels</a></li>'
      + '<li><a href="#guests">Guests</a></li>'
      + '<li><a href="#money">Money</a></li>'
      + '<li><a href="#flights">Flights</a></li>'
      + '<li><a href="#notes">Notes</a></li>'
      + '</ul>';
  }

  function bodyHtml(view) {
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
      ? '<label class="b2-field">Notes<textarea id="b2Notes" rows="4">' + esc(view.notes || '') + '</textarea></label>'
      : '<p class="b2-notes">' + (view.notes ? esc(view.notes) : '—') + '</p>';
    return ''
      + '<section class="b2-card" id="group"><h2>Group</h2><div class="b2-grid">'
      + cell('Group', view.groupName) + cell('Organiser', view.organiser) + cell('Status', view.status)
      + cell('Headcount', view.headcount) + cell('Arrival', view.arrival) + cell('Departure', view.departure)
      + cell('Nights', view.nights == null ? '' : String(view.nights))
      + '<div class="b2-span"><span class="b2-label">Rooms</span><div class="b2-value">' + dash(roomBits) + '</div></div>'
      + '</div></section>'
      + '<section class="b2-card" id="hotels"><h2>Hotels</h2>' + hotels + '</section>'
      + '<section class="b2-card" id="guests"><h2>Guests</h2>' + guests + '</section>'
      + '<section class="b2-card" id="flights"><h2>Flights</h2>' + flights + '</section>'
      + '<section class="b2-card b2-money" id="money"><h2>Money</h2><div class="b2-grid">'
      + cell('Price per person', money.price) + cell('Tour total', money.total)
      + cell('Deposits paid', money.deposit) + cell('Deposit date', money.depositDate)
      + cell('Final payment', money.finalPayment) + cell('Left to pay', money.left)
      + '</div></section>'
      + '<section class="b2-card" id="notes"><h2>Notes</h2>' + notes + '</section>';
  }

  function cell(label, value) {
    return '<div><span class="b2-label">' + esc(label) + '</span><div class="b2-value">' + dash(value) + '</div></div>';
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
    setStatus(view.readOnly ? 'Read only' : 'Sample — nothing is saved');
    render();
  }

  async function loadLive() {
    const SUPABASE_URL = BOOKING_SUPABASE_URL;
    const SUPABASE_ANON_KEY = BOOKING_SUPABASE_ANON_KEY;
    var sb = AuthGate.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    var session = await AuthGate.require(sb, { title: 'Jennifer Lindsay booking' });
    if (!session) {
      setStatus('Sign in to read booking 310');
      return;
    }
    setStatus('Loading booking 310…');
    var booking = await sb.from('bookings').select('*, hotels(name)').eq('id', 310).maybeSingle();
    if (booking.error) throw booking.error;
    var members = await sb.from('members').select('*').eq('booking_id', ONLY).order('id');
    var flights = await sb.from('flights').select('*').eq('booking_id', ONLY).order('id');
    var hotels = await sb.from('booking_hotels').select('*, hotels(name)').eq('booking_id', ONLY).order('sort_order');
    var extras = {};
    var notes = '';
    var organiser = '';
    if (window.BookingExtras && booking.data) {
      var split = BookingExtras.splitNotesAndExtras(booking.data.extra_notes);
      extras = split.extras || {};
      notes = split.notes || '';
      organiser = BookingExtras.organiserFullName(extras);
    }
    show(Booking2.present({
      booking: booking.data || { id: ONLY, group_name: Booking2.GROUP_NAME },
      members: members.data || [],
      flights: flights.data || [],
      hotels: hotels.data || [],
      extras: extras,
      notes: notes,
      organiser: organiser,
    }));
    setStatus('Read only');
  }

  var params = new URLSearchParams(location.search);
  state.refused = params.get('booking') && !Booking2.isAllowedBooking(params.get('booking'));
  if (/(?:\?|&)preview=mock(?:&|$)/.test(location.search)) {
    state.sample = true;
    show(Booking2.sample());
  } else {
    loadLive().catch(function (err) {
      console.warn(err);
      setStatus('Could not read booking 310');
    });
  }
}());
