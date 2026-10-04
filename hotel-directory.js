/*
 * Hotel directory for hotels.html.
 *
 * Built only from bookings, plans, the hotel list, and places already stored.
 * Address and the short note are saved on planner_places (address, notes).
 * The website is saved on that place's contact detail when the contact method
 * is empty or already "website". No new database column.
 */
(function (root) {
  'use strict';

  var PREVIEW = 3;

  function foldName(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  function compactHotelName(name) {
    return foldName(name).replace(/[^a-z0-9]+/g, '');
  }

  /**
   * Same hotel when the only difference is spacing or punctuation (Park hotel / Parkhotel),
   * or the longer Smržovka form the stay list already treats as Park hotel.
   * A shared prefix is not enough: Hilton Prague and Hilton Prague Old Town stay separate.
   */
  function sameHotelName(a, b) {
    var fa = foldName(a);
    var fb = foldName(b);
    if (!fa || !fb) return false;
    if (fa === fb) return true;
    var ca = compactHotelName(a);
    var cb = compactHotelName(b);
    if (!ca || !cb) return false;
    if (ca === cb) return true;
    var shorter = ca.length <= cb.length ? ca : cb;
    var longer = ca.length <= cb.length ? cb : ca;
    if (shorter.length < 8 || !longer.startsWith(shorter)) return false;
    return longer.slice(shorter.length) === 'smrzovka';
  }

  function isPlaceholderHotel(name) {
    var n = foldName(name);
    if (!n) return true;
    if (n === 'day trip') return true;
    if (n === 'still to be decided') return true;
    if (n === 'still not booked') return true;
    if (n === 'just for me') return true;
    if (n.indexOf('name not in notes') !== -1) return true;
    if (n.indexOf('not named') !== -1) return true;
    return false;
  }

  function stayStatus(stay) {
    var value = String((stay && stay.bookingStatus) || '').trim().toLowerCase();
    if (value === 'cancelled' || value === 'companion' || value === 'duplicate' || value === 'unconfirmed') return value;
    return '';
  }

  function countsAsUse(stay) {
    return stayStatus(stay) === '';
  }

  function parseISODateUTC(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
    if (!m) return null;
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }

  function formatDMY(iso) {
    var d = parseISODateUTC(iso);
    if (!d) return '';
    return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
  }

  function yearFromIso(iso) {
    var d = parseISODateUTC(iso);
    return d ? String(d.getUTCFullYear()) : '';
  }

  function nightsBetween(arrival, departure) {
    var a = parseISODateUTC(arrival);
    var b = parseISODateUTC(departure);
    if (!a || !b) return null;
    var diff = Math.round((b.getTime() - a.getTime()) / 86400000);
    if (diff < 0 || diff > 60) return null;
    return diff;
  }

  function parseNights(value) {
    var s = String(value == null ? '' : value).trim();
    var m = /^(\d+)(?:\s*nights?)?$/i.exec(s);
    if (!m) return null;
    var n = Number(m[1]);
    if (!isFinite(n) || n < 0 || n > 60) return null;
    return n;
  }

  function stayNights(stay) {
    var explicit = parseNights(stay && stay.explicitNights);
    if (explicit != null) return explicit;
    if (stay && stay.role === 'tour') return nightsBetween(stay.arrivalDate, stay.departureDate);
    return null;
  }

  function roleLabel(role) {
    if (role === 'prague') return 'Prague pick-up hotel';
    if (role === 'tour') return 'Tour-area hotel';
    return 'Other stay';
  }

  function isHotelPlace(place) {
    if (!place) return false;
    if (String(place.place_type || '').toLowerCase() === 'hotel') return true;
    var list = Array.isArray(place.place_types) ? place.place_types : [];
    return list.some(function (t) { return String(t).toLowerCase() === 'hotel'; });
  }

  function rankPlace(place) {
    var id = String((place && place.client_id) || '');
    if (/^ht\d+$/.test(id)) return 0;
    if (/^hdir-/.test(id)) return 1;
    return 2;
  }

  function writePlace(nameList, places) {
    var matches = (places || []).filter(function (place) {
      return isHotelPlace(place) && nameList.some(function (name) { return sameHotelName(name, place.name); });
    });
    matches.sort(function (a, b) { return rankPlace(a) - rankPlace(b); });
    return matches[0] || null;
  }

  function looksLikeWebsite(value) {
    var t = String(value || '').trim();
    if (!t) return false;
    if (/maps\.apple\.com|google\.[^/]+\/maps|maps\.app\.goo\.gl|openstreetmap\.org/i.test(t)) return false;
    if (/^https?:\/\//i.test(t)) return true;
    if (/^www\./i.test(t)) return true;
    return false;
  }

  function websiteFromPlace(place) {
    if (!place) return '';
    var method = String(place.contact_method || '').trim();
    var detail = String(place.contact_detail || '').trim();
    if (method === 'website') return detail;
    if (!method && looksLikeWebsite(detail)) return detail;
    return '';
  }

  function safeHref(value) {
    var t = String(value || '').trim();
    if (/^https?:\/\//i.test(t)) return t;
    if (/^www\./i.test(t)) return 'https://' + t;
    return '';
  }

  function clusterNames(rawNames) {
    var names = [];
    (rawNames || []).forEach(function (raw) {
      var t = String(raw || '').trim();
      if (!t || isPlaceholderHotel(t)) return;
      if (names.indexOf(t) === -1) names.push(t);
    });
    var parent = names.map(function (_, i) { return i; });
    function find(i) {
      while (parent[i] !== i) i = parent[i];
      return i;
    }
    function unite(i, j) {
      var a = find(i);
      var b = find(j);
      if (a !== b) parent[a] = b;
    }
    for (var i = 0; i < names.length; i++) {
      for (var j = i + 1; j < names.length; j++) {
        if (sameHotelName(names[i], names[j])) unite(i, j);
      }
    }
    var buckets = new Map();
    names.forEach(function (name, index) {
      var rootId = find(index);
      if (!buckets.has(rootId)) buckets.set(rootId, []);
      buckets.get(rootId).push(name);
    });
    return Array.from(buckets.values());
  }

  function chooseDisplayName(nameList, catalogue, groupStays) {
    var catFolds = {};
    (catalogue || []).forEach(function (hotel) {
      if (hotel && hotel.name && !isPlaceholderHotel(hotel.name)) catFolds[foldName(hotel.name)] = true;
    });
    var counts = {};
    (groupStays || []).forEach(function (stay) {
      counts[stay.hotelName] = (counts[stay.hotelName] || 0) + 1;
    });
    var catNames = nameList.filter(function (name) { return catFolds[foldName(name)]; });
    var pool = catNames.length ? catNames : nameList.slice();
    pool.sort(function (a, b) {
      var byCount = (counts[b] || 0) - (counts[a] || 0);
      if (byCount) return byCount;
      if (catNames.length) return a.length - b.length || a.localeCompare(b);
      return b.length - a.length || a.localeCompare(b);
    });
    return pool[0] || nameList[0] || '';
  }

  function uniqueFolded(values) {
    var out = [];
    (values || []).forEach(function (value) {
      var t = String(value || '').trim();
      if (!t) return;
      if (!out.some(function (existing) { return foldName(existing) === foldName(t); })) out.push(t);
    });
    return out;
  }

  function storedAddress(nameList, places, groupStays, write) {
    var fromWrite = write && String(write.address || '').trim();
    if (fromWrite) return { address: fromWrite, conflict: false };
    var pool = [];
    (places || []).forEach(function (place) {
      if (!nameList.some(function (name) { return sameHotelName(name, place.name); })) return;
      var address = String(place.address || '').trim();
      if (address) pool.push(address);
    });
    (groupStays || []).forEach(function (stay) {
      var address = String(stay.recordedAddress || '').trim();
      if (address) pool.push(address);
    });
    var unique = uniqueFolded(pool);
    if (unique.length === 1) return { address: unique[0], conflict: false };
    return { address: '', conflict: unique.length > 1 };
  }

  function deviceWebsiteFor(nameList, deviceWebsites) {
    var map = deviceWebsites || {};
    for (var i = 0; i < nameList.length; i++) {
      var value = map[foldName(nameList[i])];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (value && typeof value === 'object' && String(value.website || '').trim()) return String(value.website).trim();
    }
    return '';
  }

  function guestList(stay) {
    var names = [];
    (stay && stay.guests || []).forEach(function (guest) {
      var t = String(guest || '').trim();
      if (!t) return;
      if (!names.some(function (existing) { return foldName(existing) === foldName(t); })) names.push(t);
    });
    return names;
  }

  function plural(n, singular, pluralWord) {
    return String(n) + ' ' + (Number(n) === 1 ? singular : pluralWord);
  }

  function yearsLabel(years) {
    if (!years.length) return '';
    var nums = years.map(Number).filter(function (n) { return isFinite(n); }).sort(function (a, b) { return a - b; });
    if (!nums.length) return '';
    if (nums.length === 1) return String(nums[0]);
    var span = nums[nums.length - 1] - nums[0] + 1;
    if (span === nums.length) return nums[0] + '–' + nums[nums.length - 1];
    return nums.length + ' years, ' + nums[0] + '–' + nums[nums.length - 1];
  }

  function whenLabel(stay) {
    var a = formatDMY(stay.arrivalDate);
    var b = formatDMY(stay.departureDate);
    if (!a && !b) return 'Dates not set';
    return (a || '—') + ' – ' + (b || '—');
  }

  /** One booking counted once for a hotel, even if the plan also stored a longer name. */
  function collapseSameBooking(groupStays) {
    var seen = {};
    var out = [];
    (groupStays || []).forEach(function (stay) {
      var id = String((stay && (stay.bookingId || stay.bookingKey || stay.key)) || '') + '|' + String((stay && stay.role) || 'tour');
      if (!id || !seen[id]) {
        if (id) seen[id] = stay;
        out.push(stay);
        return;
      }
      var kept = seen[id];
      if (!kept.booked && stay.booked) kept.booked = true;
      if (!guestList(kept).length && guestList(stay).length) kept.guests = stay.guests;
      if (!String(kept.recordedAddress || '').trim() && stay.recordedAddress) kept.recordedAddress = stay.recordedAddress;
      if (!String(kept.explicitNights || '').trim() && stay.explicitNights) kept.explicitNights = stay.explicitNights;
      if (!kept.arrivalDate && stay.arrivalDate) kept.arrivalDate = stay.arrivalDate;
      if (!kept.departureDate && stay.departureDate) kept.departureDate = stay.departureDate;
    });
    return out;
  }

  function stayKey(stay, index) {
    if (stay && stay.key) return String(stay.key);
    return [stay && stay.bookingId, stay && stay.role, stay && stay.hotelName, index].join('|');
  }

  function buildDirectory(input) {
    var source = input || {};
    var stays = (source.stays || []).filter(function (stay) {
      return stay && String(stay.hotelName || '').trim() && !isPlaceholderHotel(stay.hotelName);
    });
    var catalogue = (source.catalogue || []).filter(function (hotel) {
      return hotel && String(hotel.name || '').trim() && !isPlaceholderHotel(hotel.name);
    });
    var places = source.places || [];
    var rawNames = [];
    stays.forEach(function (stay) { rawNames.push(stay.hotelName); });
    catalogue.forEach(function (hotel) { rawNames.push(hotel.name); });
    var groups = clusterNames(rawNames);
    var used = {};
    var hotels = groups.map(function (nameList) {
      var groupStays = [];
      stays.forEach(function (stay, index) {
        var key = stayKey(stay, index);
        if (used[key]) return;
        if (!nameList.some(function (name) { return sameHotelName(name, stay.hotelName); })) return;
        used[key] = true;
        groupStays.push(Object.assign({}, stay, { guests: (stay.guests || []).slice() }));
      });
      groupStays = collapseSameBooking(groupStays);
      groupStays.sort(function (a, b) {
        return String(b.arrivalDate || '').localeCompare(String(a.arrivalDate || ''))
          || String(a.groupName || '').localeCompare(String(b.groupName || ''));
      });
      var displayName = chooseDisplayName(nameList, catalogue, groupStays);
      var place = writePlace(nameList, places);
      var addressInfo = storedAddress(nameList, places, groupStays, place);
      var website = websiteFromPlace(place);
      var websiteOnDevice = false;
      if (!website) {
        website = deviceWebsiteFor(nameList.concat([displayName]), source.deviceWebsites);
        websiteOnDevice = !!website;
      }
      var note = place ? String(place.notes || '').trim() : '';
      var counted = groupStays.filter(countsAsUse);
      var years = [];
      counted.forEach(function (stay) {
        var year = yearFromIso(stay.arrivalDate) || yearFromIso(stay.departureDate);
        if (year && years.indexOf(year) === -1) years.push(year);
      });
      years.sort();
      var groupsNamed = [];
      counted.forEach(function (stay) {
        var group = String(stay.groupName || '').trim();
        if (group && !groupsNamed.some(function (existing) { return foldName(existing) === foldName(group); })) groupsNamed.push(group);
      });
      var people = [];
      groupStays.forEach(function (stay) {
        if (stayStatus(stay) !== '' && stayStatus(stay) !== 'companion') return;
        guestList(stay).forEach(function (name) {
          if (!people.some(function (existing) { return foldName(existing) === foldName(name); })) people.push(name);
        });
      });
      var nightsKnown = 0;
      var nightsMissing = 0;
      counted.forEach(function (stay) {
        var nights = stayNights(stay);
        if (nights == null) nightsMissing += 1;
        else nightsKnown += nights;
      });
      var bookedCount = counted.filter(function (stay) { return !!stay.booked; }).length;
      var aliases = nameList.filter(function (name) { return foldName(name) !== foldName(displayName); });
      aliases.sort(function (a, b) { return a.localeCompare(b); });
      return {
        key: foldName(displayName),
        name: displayName,
        aliases: aliases,
        address: addressInfo.address,
        addressConflict: addressInfo.conflict,
        website: website,
        websiteOnDevice: websiteOnDevice,
        note: note,
        place: place,
        times: counted.length,
        years: years,
        yearsLabel: yearsLabel(years),
        groupCount: groupsNamed.length,
        groups: groupsNamed,
        people: people,
        peopleCount: people.length,
        nightsKnown: nightsKnown,
        nightsMissing: nightsMissing,
        bookedCount: bookedCount,
        cancelled: groupStays.filter(function (stay) { return stayStatus(stay) === 'cancelled'; }).length,
        companion: groupStays.filter(function (stay) { return stayStatus(stay) === 'companion'; }).length,
        duplicate: groupStays.filter(function (stay) { return stayStatus(stay) === 'duplicate'; }).length,
        unconfirmed: groupStays.filter(function (stay) { return stayStatus(stay) === 'unconfirmed'; }).length,
        stays: groupStays.map(function (stay) {
          var nights = stayNights(stay);
          var guests = guestList(stay);
          return {
            bookingId: stay.bookingId || '',
            bookingKey: stay.bookingKey || '',
            groupName: stay.groupName || 'Untitled group',
            role: stay.role || 'tour',
            roleLabel: roleLabel(stay.role),
            whenLabel: whenLabel(stay),
            year: yearFromIso(stay.arrivalDate) || yearFromIso(stay.departureDate),
            nights: nights,
            guests: guests,
            headcount: String(stay.headcount || '').trim(),
            otherHotelNights: stay.role === 'tour' ? String(stay.otherHotelNights || '').trim() : '',
            recordedAddress: String(stay.recordedAddress || '').trim(),
            booked: !!stay.booked,
            status: stayStatus(stay),
            href: stay.bookingId ? ('booking-form.html?booking=' + encodeURIComponent(String(stay.bookingId)) + '&layout=layout') : ''
          };
        })
      };
    });
    hotels.sort(function (a, b) {
      return b.times - a.times || a.name.localeCompare(b.name);
    });
    return hotels;
  }

  function clientIdFor(name, places) {
    var slug = foldName(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'hotel';
    var id = 'hdir-' + slug;
    var clash = (places || []).some(function (place) {
      return String(place.client_id || '') === id && !sameHotelName(place.name, name);
    });
    if (!clash) return id;
    var hash = 0;
    var folded = foldName(name);
    for (var i = 0; i < folded.length; i++) hash = (hash * 31 + folded.charCodeAt(i)) >>> 0;
    return id + '-' + hash.toString(36);
  }

  function contactSlotFree(place) {
    if (!place) return true;
    var method = String(place.contact_method || '').trim();
    return !method || method === 'website';
  }

  /**
   * What to write for address, website, and note.
   * Does not invent a place until there is something to save.
   */
  function savePlan(hotel, fields, places) {
    var address = String((fields && fields.address) || '').trim();
    var website = String((fields && fields.website) || '').trim();
    var note = String((fields && fields.note) || '').trim();
    var place = hotel && hotel.place;
    var slotFree = contactSlotFree(place);
    if (!place && !address && !website && !note) {
      return { action: 'none', message: 'Nothing to save yet.', deviceWebsite: null };
    }
    var contactPatch = null;
    if (slotFree) {
      contactPatch = {
        contact_method: website ? 'website' : null,
        contact_detail: website || null
      };
    }
    var deviceWebsite = slotFree ? '' : website;
    var message = 'Saved';
    if (!slotFree && website) {
      message = 'Address and note saved. The website is saved on this device, because this hotel already has a contact stored.';
    }
    if (!place) {
      var clientId = clientIdFor(hotel.name, places || []);
      return {
        action: 'insert',
        clientId: clientId,
        insert: {
          client_id: clientId,
          name: hotel.name,
          place_type: 'hotel',
          place_types: ['hotel'],
          address: address || null,
          notes: note || null,
          contact_method: website ? 'website' : null,
          contact_detail: website || null,
          sort_order: 200,
          updated_at: new Date().toISOString()
        },
        deviceWebsite: '',
        message: 'Saved'
      };
    }
    var patch = {
      address: address || null,
      notes: note || null,
      updated_at: new Date().toISOString()
    };
    if (contactPatch) {
      patch.contact_method = contactPatch.contact_method;
      patch.contact_detail = contactPatch.contact_detail;
    }
    return {
      action: 'update',
      clientId: place.client_id,
      patch: patch,
      deviceWebsite: deviceWebsite,
      message: message
    };
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function statusLabel(status) {
    if (status === 'cancelled') return 'Cancelled — not counted';
    if (status === 'companion') return 'Companion — not counted again';
    if (status === 'duplicate') return 'Duplicate — not counted again';
    if (status === 'unconfirmed') return 'Unconfirmed — not counted';
    return '';
  }

  function statsLine(hotel) {
    if (!hotel.times) return 'Not used on a booking yet.';
    var parts = [
      plural(hotel.times, 'time', 'times'),
      hotel.yearsLabel,
      plural(hotel.groupCount, 'group', 'groups')
    ];
    if (hotel.nightsMissing === hotel.times) parts.push('Nights not recorded');
    else parts.push(plural(hotel.nightsKnown, 'night', 'nights'));
    if (hotel.nightsKnown > 0 && hotel.nightsMissing) parts.push('Nights not recorded on ' + plural(hotel.nightsMissing, 'stay', 'stays'));
    if (hotel.peopleCount) parts.push(plural(hotel.peopleCount, 'person named', 'people named'));
    else parts.push('No guest names recorded');
    parts.push('Booked on ' + hotel.bookedCount + ' of ' + hotel.times + ' ' + (hotel.times === 1 ? 'stay' : 'stays'));
    return parts.filter(Boolean).join(' · ');
  }

  function asideLine(hotel) {
    var bits = [];
    if (hotel.cancelled) bits.push(plural(hotel.cancelled, 'cancelled stay', 'cancelled stays'));
    if (hotel.companion) bits.push(plural(hotel.companion, 'companion group', 'companion groups'));
    if (hotel.duplicate) bits.push(plural(hotel.duplicate, 'duplicate', 'duplicates'));
    if (hotel.unconfirmed) bits.push(plural(hotel.unconfirmed, 'unconfirmed stay', 'unconfirmed stays'));
    if (!bits.length) return '';
    return 'Also listed below, and not included in the times used: ' + bits.join(', ') + '.';
  }

  function useHtml(stay, profileAddress) {
    var guests = stay.guests.length
      ? esc(stay.guests.join(', '))
      : '<span class="muted">No guest names recorded</span>';
    var nights = stay.nights == null
      ? '<span class="muted">Nights not recorded</span>'
      : esc(plural(stay.nights, 'night', 'nights'));
    var head = '';
    if (stay.headcount && String(stay.guests.length) !== stay.headcount) {
      head = '<div class="muted">' + esc(stay.headcount) + ' people on the booking</div>';
    }
    var other = stay.otherHotelNights
      ? '<div class="muted">Other hotel nights recorded: ' + esc(stay.otherHotelNights) + '</div>'
      : '';
    var address = '';
    if (stay.recordedAddress && foldName(stay.recordedAddress) !== foldName(profileAddress || '')) {
      address = '<div class="muted">Address recorded on this stay: ' + esc(stay.recordedAddress) + '</div>';
    }
    var status = statusLabel(stay.status);
    var statusHtml = status ? '<div class="use-status">' + esc(status) + '</div>' : '';
    var booked = stay.booked
      ? '<span class="booked-flag on">Booked</span>'
      : '<span class="booked-flag">Not booked yet</span>';
    var link = stay.href ? '<a href="' + esc(stay.href) + '">Open booking</a>' : '';
    return '<li class="use' + (stay.status === 'cancelled' ? ' is-cancelled' : '') + '">'
      + '<div class="use-group">' + esc(stay.groupName) + '</div>'
      + '<div class="use-when">' + esc(stay.whenLabel) + '</div>'
      + '<div class="use-meta">' + esc(stay.roleLabel) + ' · ' + nights + ' · ' + booked + '</div>'
      + statusHtml
      + '<div class="who">Who stayed: ' + guests + '</div>'
      + head
      + other
      + address
      + (link ? '<div class="use-link">' + link + '</div>' : '')
      + '</li>';
  }

  function renderDirectoryHtml(hotels, query) {
    var q = foldName(query || '');
    var rows = (hotels || []).filter(function (hotel) {
      if (!q) return true;
      if (foldName(hotel.name).indexOf(q) !== -1) return true;
      return (hotel.aliases || []).some(function (name) { return foldName(name).indexOf(q) !== -1; });
    });
    if (!hotels || !hotels.length) {
      return '<p class="empty">No hotels are stored on bookings or the hotel list yet.</p>';
    }
    if (!rows.length) return '<p class="empty">No hotels match that search.</p>';
    return rows.map(function (hotel) {
      var alias = hotel.aliases && hotel.aliases.length
        ? '<p class="alias">Also recorded as ' + esc(hotel.aliases.join(', ')) + '</p>'
        : '';
      var conflict = hotel.addressConflict
        ? '<p class="hint-empty">More than one address is stored. They are listed with the stays.</p>'
        : '';
      var device = hotel.websiteOnDevice
        ? '<p class="hint-empty">Website saved on this device.</p>'
        : '';
      var websiteHref = safeHref(hotel.website);
      var websiteLink = websiteHref
        ? '<a class="profile-link" href="' + esc(websiteHref) + '" target="_blank" rel="noopener">Open website</a>'
        : '';
      var addressHref = /^https?:\/\//i.test(hotel.address) ? hotel.address : '';
      var addressLink = addressHref
        ? '<a class="profile-link" href="' + esc(addressHref) + '" target="_blank" rel="noopener">Open address</a>'
        : '';
      var preview = hotel.stays.slice(0, PREVIEW).map(function (stay) {
        return useHtml(stay, hotel.address);
      }).join('');
      var rest = hotel.stays.slice(PREVIEW);
      var earlier = rest.length
        ? '<details class="earlier"><summary>Earlier stays (' + rest.length + ')</summary><ul class="use-list">'
          + rest.map(function (stay) { return useHtml(stay, hotel.address); }).join('')
          + '</ul></details>'
        : '';
      var stayBlock = hotel.stays.length
        ? '<h4 class="use-heading">When and who stayed</h4><ul class="use-list">' + preview + '</ul>' + earlier
        : '<p class="muted">Not used on a booking yet.</p>';
      var aside = asideLine(hotel);
      return '<article class="hotel-block" data-hotel-key="' + esc(hotel.key) + '">'
        + '<h3>' + esc(hotel.name) + '</h3>'
        + alias
        + '<p class="hotel-stats">' + esc(statsLine(hotel)) + '</p>'
        + (aside ? '<p class="hint-empty">' + esc(aside) + '</p>' : '')
        + '<div class="profile-grid">'
        + '<div class="field"><label>Address</label>'
        + '<input type="text" data-profile="address" autocomplete="off" value="' + esc(hotel.address) + '">'
        + addressLink
        + conflict
        + '</div>'
        + '<div class="field"><label>Website</label>'
        + '<input type="text" data-profile="website" autocomplete="off" inputmode="url" value="' + esc(hotel.website) + '">'
        + websiteLink
        + device
        + '</div>'
        + '<div class="field note-field"><label>Note</label>'
        + '<textarea data-profile="note" rows="2">' + esc(hotel.note) + '</textarea>'
        + '</div>'
        + '</div>'
        + '<div class="save-row"><button type="button" class="btn" data-action="save-hotel">Save</button>'
        + '<span class="muted" data-save-status></span></div>'
        + stayBlock
        + '</article>';
    }).join('');
  }

  function filterHotels(hotels, query) {
    var q = foldName(query || '');
    if (!q) return (hotels || []).slice();
    return (hotels || []).filter(function (hotel) {
      if (foldName(hotel.name).indexOf(q) !== -1) return true;
      return (hotel.aliases || []).some(function (name) { return foldName(name).indexOf(q) !== -1; });
    });
  }

  root.HotelDirectory = {
    foldName: foldName,
    sameHotelName: sameHotelName,
    isPlaceholderHotel: isPlaceholderHotel,
    stayNights: stayNights,
    buildDirectory: buildDirectory,
    savePlan: savePlan,
    renderDirectoryHtml: renderDirectoryHtml,
    filterHotels: filterHotels,
    looksLikeWebsite: looksLikeWebsite,
    clientIdFor: clientIdFor
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
