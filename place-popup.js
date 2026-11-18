/*
 * What a place event shows: its own number, a separate contact, and Navigate.
 * A number in contact_detail counts even when contact_method is not "phone".
 */
(function (root) {
  'use strict';

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isPhone(value) {
    var raw = text(value);
    if (!raw || /@|https?:|www\./i.test(raw)) return false;
    var digits = raw.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return false;
    return /^[+0-9(][\d\s().+/-]{6,}$/.test(raw);
  }

  function dial(value) {
    var raw = text(value);
    var plus = raw.charAt(0) === '+';
    var digits = raw.replace(/\D/g, '');
    return (plus ? '+' : '') + digits;
  }

  function telHref(value) {
    return isPhone(value) ? 'tel:' + dial(value) : '';
  }

  function smsHref(value) {
    return isPhone(value) ? 'sms:' + dial(value) : '';
  }

  function numberOf(place, key, alt) {
    if (!place) return '';
    return text(place[key] != null ? place[key] : place[alt]);
  }

  function pinOf(place) {
    if (!place) return null;
    var lat = Number(place.pin_lat != null ? place.pin_lat : place.pinLat);
    var lng = Number(place.pin_lng != null ? place.pin_lng : place.pinLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat: lat, lng: lng };
  }

  function prefersApple(nav) {
    var info = nav || (typeof navigator !== 'undefined' ? navigator : {});
    var ua = String(info.userAgent || '');
    var platform = String(info.platform || '');
    return /iPad|iPhone|iPod|Macintosh/i.test(ua) || platform === 'MacIntel';
  }

  function navigateHref(place, nav) {
    if (!place) return '';
    var pin = pinOf(place);
    var apple = prefersApple(nav);
    if (pin) {
      var point = pin.lat + ',' + pin.lng;
      if (apple) return 'https://maps.apple.com/?daddr=' + point + '&dirflg=d';
      return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(point) + '&travelmode=driving';
    }
    var query = [text(place.name), text(place.address)].filter(Boolean).join(', ');
    if (!query) return '';
    if (apple) return 'https://maps.apple.com/?daddr=' + encodeURIComponent(query) + '&dirflg=d';
    return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(query) + '&travelmode=driving';
  }

  function popupHtml(place) {
    if (!place) return '';
    var detail = numberOf(place, 'contact_detail', 'contactDetail');
    var method = numberOf(place, 'contact_method', 'contactMethod');
    var notes = text(place.notes);
    var contactName = numberOf(place, 'contact_name', 'contactName');
    var contactPhone = numberOf(place, 'contact_phone', 'contactPhone');
    var ownPhone = isPhone(detail);
    var personPhone = isPhone(contactPhone);
    var html = '<div class="place-pop">';
    if (ownPhone) {
      html += '<p class="place-pop-line"><a href="' + telHref(detail) + '">' + escapeHtml(detail) + '</a>';
      if (method === 'message') html += ' <a href="' + smsHref(detail) + '">Message</a>';
      html += '</p>';
    } else if (!personPhone) {
      html += '<p class="place-pop-muted">No phone</p>';
    }
    if (notes) html += '<p class="place-pop-note">' + escapeHtml(notes) + '</p>';
    if (contactName || contactPhone) {
      html += '<p class="place-pop-line">Contact ' + escapeHtml(contactName);
      if (personPhone) html += ' <a href="' + telHref(contactPhone) + '">' + escapeHtml(contactPhone) + '</a>';
      html += '</p>';
    } else {
      html += '<button type="button" class="place-pop-add" data-add-contact>+ Add contact</button>'
        + '<form class="place-pop-form" data-contact-form hidden>'
        + '<label>Name<input data-contact-name type="text"></label>'
        + '<label>Phone<input data-contact-phone type="tel"></label>'
        + '<button type="submit">Save contact</button></form>';
    }
    var href = navigateHref(place);
    if (href) html += '<a class="place-pop-nav" href="' + escapeHtml(href) + '" target="_blank" rel="noopener">Navigate</a>';
    html += '</div>';
    return html;
  }

  function contactPatch(name, phone) {
    return {
      contact_name: text(name) || null,
      contact_phone: text(phone) || null,
    };
  }

  root.PlacePopup = {
    isPhone: isPhone,
    telHref: telHref,
    smsHref: smsHref,
    pinOf: pinOf,
    prefersApple: prefersApple,
    navigateHref: navigateHref,
    popupHtml: popupHtml,
    contactPatch: contactPatch,
  };
})(typeof window !== 'undefined' ? window : globalThis);
