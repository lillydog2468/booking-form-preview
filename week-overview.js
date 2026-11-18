/*
 * Whole-week overview for the tour planner.
 * Days are columns on one shared clock. Stop height is a visual estimate
 * (a stored durationMinutes, otherwise a category length). Nothing here
 * writes a plan or talks to the network. The page applies a drag by setting
 * the stop time and day through the existing save path.
 */
(function (root) {
  'use strict';

  var START_MIN = 8 * 60;
  var END_MIN = 18 * 60;
  var MIN_BLOCK = 44;
  var TAIL_PX = 72;
  var PLACE_FLOOR_MIN = 9 * 60 + 15;
  var LEAVE_HOTEL_MIN = 9 * 60;
  var SNAP_MIN = 15;
  var PX_PER_MIN = 1.15;
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function minutesOf(value) {
    var match = /^(\d{1,2}):(\d{2})/.exec(String(value == null ? '' : value).trim());
    if (!match) return null;
    var hour = Number(match[1]);
    var minute = Number(match[2]);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
  }

  function formatMinutes(mins) {
    var n = Number(mins);
    if (!Number.isFinite(n)) return '';
    n = Math.round(n);
    n = ((n % (24 * 60)) + (24 * 60)) % (24 * 60);
    var hour = Math.floor(n / 60);
    var minute = n % 60;
    return (hour < 10 ? '0' : '') + hour + ':' + (minute < 10 ? '0' : '') + minute;
  }

  function snapMinutes(mins, step) {
    var n = Number(mins);
    if (!Number.isFinite(n)) return null;
    var size = Number(step);
    if (!Number.isFinite(size) || size <= 0) size = SNAP_MIN;
    var snapped = Math.round(n / size) * size;
    if (snapped < 0) snapped = 0;
    if (snapped > 23 * 60 + 45) snapped = 23 * 60 + 45;
    return snapped;
  }

  /**
   * Clock minutes for a pointer offset inside a day column.
   * y is pixels from the top of the timed area. Result is snapped and kept
   * inside the visible range, including the closing time.
   */
  function minutesFromOffset(y, start, px, end) {
    var scale = Number(px);
    if (!Number.isFinite(scale) || scale <= 0) scale = PX_PER_MIN;
    var origin = Number(start);
    var limit = Number(end);
    if (!Number.isFinite(origin)) origin = START_MIN;
    if (!Number.isFinite(limit)) limit = END_MIN;
    var raw = origin + (Number(y) || 0) / scale;
    var snapped = snapMinutes(raw, SNAP_MIN);
    if (snapped == null) snapped = origin;
    if (snapped < origin) snapped = snapMinutes(origin, SNAP_MIN);
    if (snapped > limit) snapped = snapMinutes(limit, SNAP_MIN);
    if (snapped > limit) snapped = Math.floor(limit / SNAP_MIN) * SNAP_MIN;
    return snapped;
  }

  /**
   * Day 1 can start at 8:00 (Prague pick-ups). Later days cannot place a
   * stop before 9:15, and nothing new is planned after 16:00.
   */
  function clampPlannedMinutes(mins, dayIndex) {
    var floor = Number(dayIndex) > 0 ? PLACE_FLOOR_MIN : START_MIN;
    var n = snapMinutes(mins, SNAP_MIN);
    if (n == null) return floor;
    if (n < floor) n = floor;
    if (n > END_MIN) n = END_MIN;
    return n;
  }

  function durationOf(stop) {
    var explicit = Number(stop && stop.durationMinutes);
    if (Number.isFinite(explicit) && explicit >= 15) return Math.min(8 * 60, Math.round(explicit));
    var type = String(stop && stop.type || '').toLowerCase();
    var title = String(stop && (stop.title || stop.name) || '').toLowerCase();
    if (type === 'handover' || type === 'pickup' || type === 'dropoff') return 25;
    if (type === 'travel') return 45;
    if (type === 'snack') return 30;
    if (type === 'hotel') return 40;
    if (type === 'meal' || type === 'restaurant' || /lunch|dinner|restaurant|café|cafe/.test(title)) return 75;
    if (type === 'museum' || type === 'experience' || type === 'viewpoint') return 75;
    return 60;
  }

  function realStop(stop) {
    if (!stop || typeof stop !== 'object' || Array.isArray(stop)) return false;
    var id = stop.id == null ? '' : String(stop.id).trim();
    var title = stop.title == null ? '' : String(stop.title).trim();
    if (!title && stop.name != null) title = String(stop.name).trim();
    var type = stop.type == null ? '' : String(stop.type).trim();
    return !!(id || title || type);
  }

  function weekBounds() {
    return { start: START_MIN, end: END_MIN };
  }

  function assignLanes(items) {
    var clusters = [];
    var current = null;
    items.forEach(function (item) {
      if (!current || item.start >= current.end) {
        current = { items: [item], end: item.end };
        clusters.push(current);
        return;
      }
      current.items.push(item);
      if (item.end > current.end) current.end = item.end;
    });
    clusters.forEach(function (cluster) {
      var ends = [];
      cluster.items.forEach(function (item) {
        var lane = 0;
        while (lane < ends.length && ends[lane] > item.start) lane += 1;
        ends[lane] = item.end;
        item.lane = lane;
      });
      var count = Math.max(1, ends.length);
      cluster.items.forEach(function (item) { item.lanes = count; });
    });
  }

  function textHeight(label, lanes) {
    var perLine = Math.max(12, Math.floor(32 / Math.max(1, Number(lanes) || 1)));
    var lines = Math.ceil(String(label || '').trim().length / perLine);
    if (!lines || lines < 1) lines = 1;
    if (lines > 6) lines = 6;
    return 20 + lines * 16;
  }

  function layoutDay(stops, range) {
    var timed = [];
    var untimed = [];
    var early = [];
    var late = [];
    var origin = range && Number.isFinite(range.start) ? range.start : START_MIN;
    var limit = range && Number.isFinite(range.end) ? range.end : END_MIN;
    (stops || []).forEach(function (stop) {
      if (!realStop(stop)) return;
      var at = minutesOf(stop.time);
      if (at == null) {
        untimed.push(stop);
        return;
      }
      if (at < origin) {
        early.push(stop);
        return;
      }
      if (at > limit) {
        late.push(stop);
        return;
      }
      var duration = durationOf(stop);
      timed.push({ stop: stop, start: at, end: at + duration, duration: duration });
    });
    timed.sort(function (a, b) {
      if (a.start !== b.start) return a.start - b.start;
      return String(a.stop.id || '').localeCompare(String(b.stop.id || ''));
    });
    assignLanes(timed);
    var px = range && Number(range.px);
    if (!Number.isFinite(px) || px <= 0) px = PX_PER_MIN;
    return {
      blocks: timed.map(function (item) {
        var label = String(item.stop.title || item.stop.name || '').trim();
        var needed = Math.max(MIN_BLOCK, textHeight(label, item.lanes));
        var natural = Math.max(needed, item.duration * px);
        var top = (item.start - origin) * px;
        var height = natural;
        if (item.start >= limit) {
          top = Math.max(0, (limit - origin) * px);
          height = needed;
        } else {
          var room = (limit - item.start) * px;
          if (room > 0) height = Math.max(needed, Math.min(natural, Math.max(room, needed)));
        }
        return {
          stop: item.stop,
          start: item.start,
          duration: item.duration,
          lane: item.lane,
          lanes: item.lanes,
          top: top,
          height: height,
        };
      }),
      untimed: untimed,
      early: early,
      late: late,
    };
  }

  function isoParts(iso) {
    var match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '').trim());
    if (!match) return null;
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var dt = new Date(Date.UTC(year, month - 1, day));
    if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
    return dt;
  }

  function dayHeading(iso, index) {
    var dt = isoParts(iso);
    if (!dt) return { weekday: 'Day ' + (index + 1), dateLabel: 'Date not set' };
    return {
      weekday: WEEKDAYS[dt.getUTCDay()],
      dateLabel: dt.getUTCDate() + ' ' + MONTHS[dt.getUTCMonth()],
    };
  }

  function defaultCue(stop) {
    if (root.PlaceCategories && PlaceCategories.stopCue) return PlaceCategories.stopCue(stop || {});
    return { id: 'other', emoji: '📍', label: 'Place', tone: 'other' };
  }

  function build(plan, options) {
    var opts = options || {};
    var px = Number(opts.px);
    if (!Number.isFinite(px) || px <= 0) px = PX_PER_MIN;
    var days = plan && Array.isArray(plan.days) ? plan.days : [];
    var flat = [];
    days.forEach(function (day) {
      if (!day || !Array.isArray(day.blocks)) return;
      day.blocks.forEach(function (stop) {
        if (realStop(stop)) flat.push(stop);
      });
    });
    var bounds = weekBounds(flat);
    var range = { start: bounds.start, end: bounds.end, px: px };
    var height = (bounds.end - bounds.start) * px;
    var hours = [];
    var hour;
    for (hour = bounds.start; hour <= bounds.end; hour += 60) {
      hours.push({ label: formatMinutes(hour), top: (hour - bounds.start) * px });
    }
    var labelOf = typeof opts.label === 'function' ? opts.label : function (stop) {
      return String(stop && (stop.title || stop.name) || '').trim();
    };
    var cueOf = typeof opts.cue === 'function' ? opts.cue : defaultCue;
    var guestsOf = typeof opts.guests === 'function' ? opts.guests : function () { return ''; };
    var hotelOf = typeof opts.hotel === 'function' ? opts.hotel : function () { return null; };
    var today = String(opts.today || '');
    var focus = opts.focusDay;
    var columns = days.map(function (day, index) {
      if (focus != null && Number(focus) !== index) return null;
      if (!day || typeof day !== 'object' || Array.isArray(day)) {
        return {
          index: index,
          missing: true,
          weekday: 'Day ' + (index + 1),
          dateLabel: 'Missing',
          today: false,
          blocks: [],
          untimed: [],
          early: [],
          late: [],
          marker: null,
          night: '',
          from: '',
        };
      }
      var laid = layoutDay(day.blocks || [], range);
      var heading = dayHeading(day.date, index);
      var stay = hotelOf(day.date, index) || {};
      var night = String(stay.night || '').trim();
      var from = String(stay.from || '').trim();
        var marker = index === 0
        ? { label: 'Prague pick-up', time: '08:00', top: 0, kind: 'pickup' }
        : { label: 'Leave hotel', time: '09:00', top: (LEAVE_HOTEL_MIN - bounds.start) * px, kind: 'leave' };
      function edgeStop(stop) {
        var cue = cueOf(stop) || defaultCue(stop);
        var tone = String(cue.id || cue.tone || 'other').replace(/[^a-z0-9-]/g, '') || 'other';
        return {
          id: stop.id,
          time: formatMinutes(minutesOf(stop.time)),
          label: labelOf(stop) || cue.label || 'Stop',
          emoji: cue.emoji || '',
          tone: tone,
        };
      }
      return {
        index: index,
        missing: false,
        date: day.date || '',
        weekday: heading.weekday,
        dateLabel: heading.dateLabel,
        today: !!(day.date && day.date === today),
        night: night,
        from: from && from !== night ? from : '',
        blocks: laid.blocks.map(function (block) {
          var cue = cueOf(block.stop) || defaultCue(block.stop);
          var tone = String(cue.id || cue.tone || 'other').replace(/[^a-z0-9-]/g, '') || 'other';
          return {
            id: block.stop.id,
            time: formatMinutes(block.start),
            label: labelOf(block.stop) || cue.label || 'Stop',
            guests: String(guestsOf(block.stop) || '').trim(),
            emoji: cue.emoji || '',
            tone: tone,
            approx: !!block.stop.timeApprox,
            top: block.top,
            height: block.height,
            lane: block.lane,
            lanes: block.lanes,
          };
        }),
        untimed: laid.untimed.map(function (stop) {
          var cue = cueOf(stop) || defaultCue(stop);
          var tone = String(cue.id || cue.tone || 'other').replace(/[^a-z0-9-]/g, '') || 'other';
          return {
            id: stop.id,
            label: labelOf(stop) || cue.label || 'Stop',
            emoji: cue.emoji || '',
            tone: tone,
          };
        }),
        early: (laid.early || []).map(edgeStop),
        late: (laid.late || []).map(edgeStop),
        marker: marker,
      };
    }).filter(Boolean);
    return {
      start: bounds.start,
      end: bounds.end,
      px: px,
      height: height,
      hours: hours,
      days: columns,
      focusDay: focus == null ? null : Number(focus),
    };
  }

  function blockHtml(block) {
    var width = 100 / block.lanes;
    var left = block.lane * width;
    var style = 'top:' + roundPx(block.top) + 'px;min-height:' + roundPx(block.height) + 'px;height:auto;left:calc(' + left + '% + 2px);width:calc(' + width + '% - 4px);';
    var guests = block.guests ? '<span class="ov-guests">' + esc(block.guests) + '</span>' : '';
    var approx = block.approx ? '<span class="ov-approx" title="Approximate time">≈</span>' : '';
    return '<div class="ov-stop stop-tone-' + esc(block.tone) + '" role="button" tabindex="0" data-ov-stop="' + esc(block.id) + '" style="' + style + '" title="' + esc(block.time + ' ' + block.label) + '">'
      + '<span class="ov-time">' + approx + esc(block.time) + '</span>'
      + '<span class="ov-name">' + (block.emoji ? '<span class="ov-emoji" aria-hidden="true">' + esc(block.emoji) + '</span>' : '') + esc(block.label) + '</span>'
      + guests
      + '<span class="ov-x" role="button" tabindex="-1" data-ov-remove="' + esc(block.id) + '" aria-label="Remove ' + esc(block.label) + '">×</span>'
      + '</div>';
  }

  function pinHtml(stop, edge, offset) {
    var style = edge === 'bottom'
      ? 'bottom:' + offset + 'px'
      : 'top:' + offset + 'px';
    return '<div class="ov-stop ov-pin stop-tone-' + esc(stop.tone) + '" role="button" tabindex="0" data-ov-stop="' + esc(stop.id) + '" style="' + style + '" title="' + esc(stop.time + ' ' + stop.label) + '">'
      + '<span class="ov-time">' + esc(stop.time) + '</span>'
      + '<span class="ov-name">' + (stop.emoji ? '<span class="ov-emoji" aria-hidden="true">' + esc(stop.emoji) + '</span>' : '') + esc(stop.label) + '</span>'
      + '<span class="ov-x" role="button" tabindex="-1" data-ov-remove="' + esc(stop.id) + '" aria-label="Remove ' + esc(stop.label) + '">×</span>'
      + '</div>';
  }

  function roundPx(n) {
    return Math.round(n * 100) / 100;
  }

  function render(model) {
    var view = model || { start: START_MIN, end: END_MIN, px: PX_PER_MIN, height: (END_MIN - START_MIN) * PX_PER_MIN, hours: [], days: [] };
    var hours = (view.hours || []).map(function (hour) {
      return '<span class="ov-hour" style="top:' + roundPx(hour.top) + 'px">' + esc(hour.label) + '</span>';
    }).join('');
    var lines = (view.hours || []).map(function (hour, index) {
      if (index === 0) return '';
      return '<span class="ov-line" style="top:' + roundPx(hour.top) + 'px"></span>';
    }).join('');
    var half = '';
    var tick = view.start + 30;
    while (tick < view.end) {
      half += '<span class="ov-line ov-line-half" style="top:' + roundPx((tick - view.start) * view.px) + 'px"></span>';
      tick += 60;
    }
    lines += half;
    var days = (view.days || []).map(function (day) {
      var today = day.today ? ' is-today' : '';
      var from = day.from ? '<p class="ov-from">From · ' + esc(day.from) + '</p>' : '';
      var night = day.night ? '<p class="ov-night">Night · ' + esc(day.night) + '</p>' : '<p class="ov-night ov-night-empty"></p>';
      var blocks = (day.blocks || []).map(blockHtml).join('');
      var untimed = (day.untimed || []).map(function (stop) {
        return '<div class="ov-stop ov-untimed-stop stop-tone-' + esc(stop.tone) + '" role="button" tabindex="0" data-ov-stop="' + esc(stop.id) + '">'
          + '<span class="ov-time">No time</span>'
          + '<span class="ov-name">' + (stop.emoji ? '<span class="ov-emoji" aria-hidden="true">' + esc(stop.emoji) + '</span>' : '') + esc(stop.label) + '</span>'
          + '<span class="ov-x" role="button" tabindex="-1" data-ov-remove="' + esc(stop.id) + '" aria-label="Remove ' + esc(stop.label) + '">×</span>'
          + '</div>';
      }).join('');
      var untimedRow = '<div class="ov-untimed">' + (untimed || '') + '</div>';
      var marker = '';
      if (!day.missing && day.marker) {
        var markText = esc(day.marker.time) + ' ' + esc(day.marker.label);
        marker = day.marker.kind === 'pickup'
          ? '<button type="button" class="ov-mark ov-mark-btn" data-ov-marker="pickup" style="top:' + roundPx(day.marker.top) + 'px">' + markText + '</button>'
          : '<div class="ov-mark" style="top:' + roundPx(day.marker.top) + 'px"><span>' + markText + '</span></div>';
      }
      var pins = (day.early || []).map(function (stop, pinIndex) {
        return pinHtml(stop, 'top', 2 + pinIndex * 28);
      }).join('') + (day.late || []).map(function (stop, pinIndex) {
        return pinHtml(stop, 'bottom', 2 + pinIndex * 28);
      }).join('');
      var col = day.missing
        ? '<div class="ov-col is-missing">Missing day</div>'
        : '<div class="ov-col" data-ov-col="' + day.index + '" data-ov-floor="' + (day.index > 0 ? PLACE_FLOOR_MIN : START_MIN) + '" style="height:' + roundPx(view.height + TAIL_PX) + 'px">' + lines + marker + blocks + pins + '</div>';
      return '<section class="ov-day' + today + '" data-ov-day="' + day.index + '" aria-label="' + esc(day.weekday + ' ' + day.dateLabel) + '">'
        + '<header class="ov-head"><p class="ov-dow">' + (day.today ? 'Today · ' : '') + esc(day.weekday) + '</p><p class="ov-date">' + esc(day.dateLabel) + '</p>' + from + night + untimedRow + '</header>'
        + col
        + '</section>';
    }).join('');
    var empty = days ? '' : '<p class="ov-empty">No days on this tour yet.</p>';
    return '<div class="ov-grid" data-ov-start="' + view.start + '" data-ov-end="' + view.end + '" data-ov-px="' + view.px + '" style="--ov-height:' + roundPx(view.height) + 'px">'
      + '<div class="ov-hours" aria-hidden="true"><div class="ov-hours-spacer"></div><div class="ov-hours-body">' + hours + '</div></div>'
      + '<div class="ov-days">' + (days || empty) + '</div>'
      + '</div>';
  }

  root.WeekOverview = {
    START_MIN: START_MIN,
    END_MIN: END_MIN,
    PLACE_FLOOR_MIN: PLACE_FLOOR_MIN,
    LEAVE_HOTEL_MIN: LEAVE_HOTEL_MIN,
    SNAP_MIN: SNAP_MIN,
    PX_PER_MIN: PX_PER_MIN,
    MIN_BLOCK: MIN_BLOCK,
    TAIL_PX: TAIL_PX,
    textHeight: textHeight,
    minutesOf: minutesOf,
    formatMinutes: formatMinutes,
    snapMinutes: snapMinutes,
    minutesFromOffset: minutesFromOffset,
    clampPlannedMinutes: clampPlannedMinutes,
    durationOf: durationOf,
    weekBounds: weekBounds,
    layoutDay: layoutDay,
    build: build,
    render: render,
  };
}(typeof window !== 'undefined' ? window : globalThis));
