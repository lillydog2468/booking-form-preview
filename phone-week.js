/*
 * Read-only phone week and the Notes summary.
 * WeekNote.build(plan) returns { year, group, title, html, text, folder }.
 * Nothing here edits a plan or talks to the network.
 */
(function (root) {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isoDay(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || '').trim());
    if (!match) return '';
    var dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (dt.getUTCFullYear() !== Number(match[1]) || dt.getUTCMonth() !== Number(match[2]) - 1) return '';
    return match[1] + '-' + match[2] + '-' + match[3];
  }

  function shiftIso(iso, days) {
    var day = isoDay(iso);
    if (!day) return '';
    var parts = day.split('-');
    var dt = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    dt.setUTCDate(dt.getUTCDate() + days);
    var month = String(dt.getUTCMonth() + 1).padStart(2, '0');
    var date = String(dt.getUTCDate()).padStart(2, '0');
    return dt.getUTCFullYear() + '-' + month + '-' + date;
  }

  function enumerate(arrival, departure) {
    var start = isoDay(arrival);
    var end = isoDay(departure) || start;
    if (!start) return [];
    if (end < start) end = start;
    var out = [];
    var cursor = start;
    while (cursor && cursor <= end && out.length < 40) {
      out.push(cursor);
      cursor = shiftIso(cursor, 1);
    }
    return out;
  }

  function dayMon(iso) {
    var day = isoDay(iso);
    if (!day) return '';
    var parts = day.split('-');
    return String(Number(parts[2])) + ' ' + MONTHS[Number(parts[1]) - 1];
  }

  function weekday(iso) {
    var day = isoDay(iso);
    if (!day) return '';
    var parts = day.split('-');
    var dt = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    return WEEKDAYS[dt.getUTCDay()];
  }

  function cueFor(stop) {
    if (root.PlaceCategories && PlaceCategories.stopCue) return PlaceCategories.stopCue(stop || {});
    return { id: 'other', emoji: '📍', label: 'Place', tone: 'other' };
  }

  function guestNames(stop, guests) {
    var byId = {};
    (guests || []).forEach(function (guest) {
      if (!guest || guest.id == null) return;
      var name = String(guest.name || '').trim();
      if (name) byId[String(guest.id)] = name;
    });
    var names = [];
    (stop && stop.guestIds || []).forEach(function (id) {
      var name = byId[String(id)];
      if (name && names.indexOf(name) === -1) names.push(name);
    });
    (stop && stop.guestNames || []).forEach(function (name) {
      var clean = String(name || '').trim();
      if (clean && names.indexOf(clean) === -1) names.push(clean);
    });
    return names;
  }

  function placeText(stop) {
    var title = String(stop && stop.title || '').trim();
    var hotel = String(stop && (stop.hotelName || stop.address) || '').trim();
    var shown = title || hotel || cueFor(stop).label;
    var HS = root.HandoverStops;
    if (HS && HS.mapFieldLabel && (title || hotel)) return HS.mapFieldLabel(shown);
    return shown;
  }

  function linkedPlace(stop, places) {
    var id = stop && (stop.placeId || stop.place_id);
    if (!id || !places) return null;
    var i;
    for (i = 0; i < places.length; i++) {
      if (places[i] && String(places[i].id) === String(id)) return places[i];
    }
    return null;
  }

  function mapQuery(stop, places) {
    var fallback = String((stop && (stop.address || stop.hotelName || stop.title)) || '').trim();
    var place = linkedPlace(stop, places);
    if (!fallback && place) fallback = String(place.address || '').trim();
    var PP = root.PlacePin;
    if (PP && PP.navigationQuery) return PP.navigationQuery(stop, place, fallback);
    return fallback;
  }

  function mapUrls(stop, places) {
    var query = mapQuery(stop, places);
    var HS = root.HandoverStops;
    if (HS && HS.appleDirectionsUrl) return HS.appleDirectionsUrl(query);
    if (!query) return { scheme: '', https: '' };
    var encoded = encodeURIComponent(query);
    return {
      scheme: 'maps://?daddr=' + encoded + '&dirflg=d',
      https: 'https://maps.apple.com/?daddr=' + encoded + '&dirflg=d',
    };
  }

  function mapLink(stop, places) {
    return mapUrls(stop, places).https || '';
  }

  function mapScheme(stop, places) {
    return mapUrls(stop, places).scheme || '';
  }

  function isRealBlock(block) {
    if (!block || typeof block !== 'object' || Array.isArray(block)) return false;
    if (root.BookingExtras && typeof root.BookingExtras.isRealBlock === 'function') return root.BookingExtras.isRealBlock(block);
    var id = block.id == null ? '' : String(block.id).trim();
    var title = block.title == null ? '' : String(block.title).trim();
    if (!title && block.name != null) title = String(block.name).trim();
    var type = block.type == null ? '' : String(block.type).trim();
    return !!(id || title || type);
  }

  function stopRows(day, guests, places) {
    return ((day && day.blocks) || []).filter(function (stop) {
      return isRealBlock(stop) && (stop.type === 'handover' || String(stop.title || '').trim() || String(stop.time || '').trim() || String(stop.hotelName || '').trim());
    }).map(function (stop) {
      var cue = cueFor(stop);
      return {
        time: String(stop.time || '').trim(),
        place: placeText(stop),
        guests: guestNames(stop, guests),
        cue: cue,
        map: mapLink(stop, places),
        scheme: mapScheme(stop, places),
      };
    });
  }

  function weekModel(plan, options) {
    var source = plan || {};
    var opts = options || {};
    var arrival = isoDay(source.arrivalDate);
    var departure = isoDay(source.departureDate) || arrival;
    var dates = enumerate(arrival, departure);
    var byDate = {};
    (source.days || []).forEach(function (day) {
      var key = isoDay(day && day.date);
      if (key && !byDate[key]) byDate[key] = day;
    });
    if (!dates.length) {
      dates = Object.keys(byDate).sort();
    }
    var guests = source.guests || [];
    var today = isoDay(opts.today);
    var days = dates.map(function (date) {
      var stored = byDate[date] || { date: date, blocks: [] };
      return {
        date: date,
        heading: (weekday(date) + ' ' + dayMon(date)).trim(),
        today: !!today && date === today,
        stops: stopRows(stored, guests, opts.places || []),
      };
    });
    if (days.length && !days.some(function (day) { return day.today; })) days[0].open = true;
    days.forEach(function (day) { day.open = day.today || !!day.open; });
    var group = String(source.groupName || 'Tour').trim() || 'Tour';
    var year = (arrival || departure || (dates[0] || '')).slice(0, 4);
    var startLabel = dayMon(arrival || dates[0] || '');
    var endLabel = dayMon(departure || dates[dates.length - 1] || '');
    var span = startLabel && endLabel && startLabel !== endLabel ? (startLabel + '–' + endLabel) : (startLabel || endLabel);
    var title = [year, group, span].filter(Boolean).join(' – ');
    var folderGroup = group.replace(/[\\/]/g, '-').trim();
    return {
      year: year,
      group: group,
      title: title,
      folder: 'Bananas4Beading/' + year + '/' + folderGroup,
      days: days,
    };
  }

  function asText(model) {
    var lines = [model.title, ''];
    model.days.forEach(function (day) {
      lines.push(day.heading);
      if (!day.stops.length) lines.push('Nothing on this day');
      day.stops.forEach(function (stop) {
        var when = stop.time || 'Time not set';
        lines.push(when + '  ' + stop.cue.emoji + ' ' + stop.place);
        if (stop.guests.length) lines.push('     ' + stop.guests.join(', '));
        if (stop.map) lines.push('     ' + stop.map);
      });
      lines.push('');
    });
    return lines.join('\n').replace(/\n+$/, '\n');
  }

  function asHtml(model) {
    var days = model.days.map(function (day) {
      var stops = day.stops.length
        ? day.stops.map(function (stop) {
          var guests = stop.guests.length ? '<br>' + esc(stop.guests.join(', ')) : '';
          var map = stop.map ? '<br><a href="' + esc(stop.map) + '">Map</a>' : '';
          return '<p><b>' + esc(stop.time || 'Time not set') + '</b> ' + esc(stop.cue.emoji + ' ' + stop.place) + guests + map + '</p>';
        }).join('')
        : '<p>Nothing on this day</p>';
      return '<h2>' + esc(day.heading) + '</h2>' + stops;
    }).join('');
    return '<h1>' + esc(model.title) + '</h1>' + days;
  }

  function build(plan, options) {
    var model = weekModel(plan, options);
    return {
      year: model.year,
      group: model.group,
      title: model.title,
      html: asHtml(model),
      text: asText(model),
      folder: model.folder,
      days: model.days,
    };
  }

  function render(plan, options) {
    var note = build(plan, options);
    var days = note.days.map(function (day) {
      var stops = day.stops.length
        ? day.stops.map(function (stop) {
          var guests = stop.guests.length ? '<p class="phone-week-guests">' + esc(stop.guests.join(', ')) + '</p>' : '';
          var map = stop.map
            ? '<a class="phone-week-nav" href="' + esc(stop.map) + '" data-phone-scheme="' + esc(stop.scheme) + '">Navigate</a>'
            : '';
          return '<article class="phone-week-stop stop-tone-' + esc(stop.cue.id) + '"><p class="phone-week-time">' + esc(stop.time || '—') + '</p><p class="phone-week-place"><span class="stop-cue type-icon-badge type-' + esc(stop.cue.tone) + '">' + esc(stop.cue.emoji) + ' <span class="stop-cue-label">' + esc(stop.cue.label) + '</span></span> ' + esc(stop.place) + '</p>' + guests + map + '</article>';
        }).join('')
        : '<p class="phone-week-empty">Nothing on this day</p>';
      return '<details class="phone-week-day' + (day.today ? ' is-today' : '') + '"' + (day.open ? ' open' : '') + '><summary>' + esc(day.heading) + (day.today ? ' · Today' : '') + '</summary>' + stops + '</details>';
    }).join('');
    return '<div class="phone-week"><p class="phone-week-title">' + esc(note.title) + '</p><div class="phone-week-actions"><button type="button" class="phone-week-send" id="btnSendWeekToNotes">Send week to Notes</button><button type="button" class="phone-week-copy" id="btnCopyWeek">Copy</button></div>' + days + '</div>';
  }

  root.WeekNote = {
    build: build,
    render: render,
    mapLink: mapLink,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
