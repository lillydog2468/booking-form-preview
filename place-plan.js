/*
 * Choose free times for places Keith has ticked.
 * Past plans teach the usual day, time, duration, and which places share a day.
 * Day one still has its 8:00 Prague pick-up. A place is never before 9:15
 * and never runs past 16:00. Existing stops stay. Nothing here uses the network.
 */
(function (root) {
  'use strict';

  var DAY_START = 9 * 60 + 15;
  var DAY_END = 16 * 60;
  var PICKUP = 8 * 60;
  var STEP = 15;

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function minutes(value) {
    var match = /^(\d{1,2}):(\d{2})/.exec(text(value));
    if (!match) return null;
    var hour = Number(match[1]);
    var minute = Number(match[2]);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
  }

  function format(mins) {
    var hour = Math.floor(mins / 60);
    var minute = mins % 60;
    return (hour < 10 ? '0' : '') + hour + ':' + (minute < 10 ? '0' : '') + minute;
  }

  function toggle(ids, id) {
    var list = (ids || []).map(String);
    var key = String(id);
    var at = list.indexOf(key);
    if (at === -1) list.push(key);
    else list.splice(at, 1);
    return list;
  }

  function selectionCount(ids) {
    return (ids || []).length;
  }

  function isHandover(stop) {
    if (!stop) return false;
    var type = text(stop.type).toLowerCase();
    return type === 'handover' || type === 'pickup' || type === 'dropoff' || type === 'travel'
      || stop.handoverKind === 'pickup' || stop.handoverKind === 'dropoff'
      || text(stop.autoStop).indexOf('prague') === 0 || text(stop.autoStop).indexOf('airport') === 0;
  }

  function isLunch(place, profile) {
    var type = text(place && (place.type || place.place_type)).toLowerCase();
    var name = text(place && (place.name || place.title)).toLowerCase();
    if (type === 'restaurant' || type === 'meal' || /lunch|dinner|restaurant|café|cafe/.test(name)) return true;
    if (profile && profile.visits && profile.lunch * 2 >= profile.visits) return true;
    return false;
  }

  function durationOf(place, profile) {
    if (profile && profile.duration) return profile.duration;
    var type = text(place && (place.type || place.place_type)).toLowerCase();
    var name = text(place && place.name).toLowerCase();
    if (type === 'snack') return 30;
    if (isLunch(place, profile)) return 75;
    if (type === 'museum' || type === 'experience' || type === 'viewpoint') return 75;
    if (type === 'travel') return 45;
    return 60;
  }

  function median(values) {
    var list = (values || []).filter(function (n) { return Number.isFinite(n); }).slice().sort(function (a, b) { return a - b; });
    if (!list.length) return null;
    var mid = Math.floor(list.length / 2);
    if (list.length % 2) return list[mid];
    return Math.round((list[mid - 1] + list[mid]) / 2);
  }

  function snap(mins) {
    return Math.round(mins / STEP) * STEP;
  }

  function learn(history) {
    var byId = {};
    function profile(id) {
      var key = String(id);
      if (!byId[key]) byId[key] = { days: [], times: [], durations: [], with: {}, before: {}, lunch: 0, visits: 0 };
      return byId[key];
    }
    (history || []).forEach(function (plan) {
      (plan && plan.days || []).forEach(function (day, dayIndex) {
        var stops = (day && day.blocks || []).filter(function (stop) {
          return stop && text(stop.placeId) && !isHandover(stop) && minutes(stop.time) != null;
        }).slice().sort(function (a, b) { return minutes(a.time) - minutes(b.time); });
        stops.forEach(function (stop, index) {
          var id = text(stop.placeId);
          var row = profile(id);
          var at = minutes(stop.time);
          row.days.push(dayIndex);
          row.times.push(at);
          row.visits += 1;
          if (isLunch(stop, null) || (at >= 11 * 60 + 30 && at <= 14 * 60)) row.lunch += 1;
          var next = stops[index + 1];
          var span = next ? minutes(next.time) - at : null;
          if (span != null && span >= 15 && span <= 150) row.durations.push(span);
          else if (Number(stop.durationMinutes) >= 15) row.durations.push(Number(stop.durationMinutes));
          stops.forEach(function (other) {
            var otherId = text(other.placeId);
            if (!otherId || otherId === id) return;
            row.with[otherId] = (row.with[otherId] || 0) + 1;
          });
          if (index > 0) {
            var prev = text(stops[index - 1].placeId);
            if (prev) row.before[prev] = (row.before[prev] || 0) + 1;
          }
        });
      });
    });
    Object.keys(byId).forEach(function (id) {
      var row = byId[id];
      row.day = median(row.days);
      row.time = median(row.times);
      row.duration = median(row.durations);
      if (row.duration) row.duration = Math.max(15, Math.min(120, snap(row.duration)));
    });
    return { byId: byId };
  }

  function clampStart(start, dur) {
    var latest = DAY_END - dur;
    if (latest < DAY_START) return null;
    var at = snap(start);
    if (at < DAY_START) at = DAY_START;
    if (at > latest) at = latest;
    return at;
  }

  function overlaps(intervals, start, dur) {
    var end = start + dur;
    return intervals.some(function (span) { return start < span.end && end > span.start; });
  }

  function findSlot(intervals, prefer, dur) {
    var first = clampStart(prefer, dur);
    if (first == null) return null;
    if (!overlaps(intervals, first, dur)) return first;
    var delta;
    for (delta = STEP; delta < 12 * 60; delta += STEP) {
      var earlier = first - delta;
      var later = first + delta;
      if (earlier >= DAY_START && earlier + dur <= DAY_END && !overlaps(intervals, earlier, dur)) return earlier;
      if (later + dur <= DAY_END && later >= DAY_START && !overlaps(intervals, later, dur)) return later;
    }
    return null;
  }

  function intervalsOf(day) {
    return (day && day.blocks || []).map(function (stop) {
      var start = minutes(stop && stop.time);
      if (start == null) return null;
      var dur = Number(stop && stop.durationMinutes);
      if (!Number.isFinite(dur) || dur < 15) dur = isHandover(stop) ? 25 : durationOf(stop, null);
      return { start: start, end: start + dur };
    }).filter(Boolean);
  }

  function onPlan(plan) {
    var ids = {};
    (plan && plan.days || []).forEach(function (day) {
      (day && day.blocks || []).forEach(function (stop) {
        var id = text(stop && stop.placeId);
        if (id) ids[id] = true;
      });
    });
    return ids;
  }

  function orderPlaces(chosen, model) {
    var rows = chosen.map(function (place) {
      var id = String(place.id);
      var profile = model.byId[id];
      var dur = durationOf(place, profile);
      var lunch = isLunch(place, profile);
      var time = profile && profile.time != null ? profile.time : (lunch ? 12 * 60 + 30 : DAY_START);
      var day = profile && profile.day != null ? profile.day : null;
      return { place: place, id: id, profile: profile, dur: dur, time: time, day: day, lunch: lunch };
    });
    rows.forEach(function (row) {
      if (row.day != null) return;
      var company = rows.filter(function (other) {
        return other !== row && other.day != null && row.profile && row.profile.with[other.id];
      }).sort(function (a, b) { return (row.profile.with[b.id] || 0) - (row.profile.with[a.id] || 0); });
      if (company.length) row.day = company[0].day;
    });
    var spare = 0;
    rows.forEach(function (row) {
      if (row.day == null) {
        row.day = spare;
        spare += 1;
      }
    });
    rows.sort(function (a, b) {
      if (a.day !== b.day) return a.day - b.day;
      if (a.time !== b.time) return a.time - b.time;
      var aBefore = a.profile && a.profile.before[b.id] || 0;
      var bBefore = b.profile && b.profile.before[a.id] || 0;
      if (aBefore !== bBefore) return bBefore - aBefore;
      return text(a.place.name).localeCompare(text(b.place.name));
    });
    return rows;
  }

  function makeStop(place, at, dur) {
    return {
      id: 's_' + Math.random().toString(36).slice(2, 9),
      time: format(at),
      timeApprox: false,
      type: place.type || place.place_type || 'other',
      title: place.name || 'Place',
      notes: '',
      address: place.address || '',
      placeId: String(place.id || ''),
      durationMinutes: dur,
    };
  }

  function sortDay(day) {
    day.blocks.sort(function (a, b) {
      return (minutes(a && a.time) == null ? 9999 : minutes(a.time)) - (minutes(b && b.time) == null ? 9999 : minutes(b.time));
    });
  }

  function stripVisits(plan) {
    (plan && plan.days || []).forEach(function (day) {
      if (!day || !Array.isArray(day.blocks)) return;
      day.blocks = day.blocks.filter(isHandover);
    });
  }

  function place(plan, places, ids, history, options) {
    var opts = options || {};
    if (opts.replaceVisits) stripVisits(plan);
    var wanted = {};
    (ids || []).forEach(function (id) { wanted[String(id)] = true; });
    var chosen = (places || []).filter(function (place) { return place && wanted[String(place.id)]; });
    var model = learn(history || []);
    var rows = orderPlaces(chosen, model);
    var days = plan && plan.days || [];
    var present = onPlan(plan);
    var placed = [];
    var unplaced = [];
    rows.forEach(function (row) {
      var name = text(row.place.name) || 'Place';
      if (present[row.id]) {
        unplaced.push({ id: row.id, name: name, reason: 'Already on this week' });
        return;
      }
      var dayCount = days.length;
      if (!dayCount) {
        unplaced.push({ id: row.id, name: name, reason: 'This week has no days' });
        return;
      }
      var preferDay = Math.max(0, Math.min(dayCount - 1, Math.round(row.day)));
      var order = [preferDay];
      var step;
      for (step = 1; step < dayCount; step += 1) {
        if (preferDay + step < dayCount) order.push(preferDay + step);
        if (preferDay - step >= 0) order.push(preferDay - step);
      }
      var at = null;
      var dayIndex = null;
      order.forEach(function (index) {
        if (at != null) return;
        var day = days[index];
        if (!day || typeof day !== 'object') return;
        if (!Array.isArray(day.blocks)) day.blocks = [];
        var slot = findSlot(intervalsOf(day), row.time, row.dur);
        if (slot == null) return;
        at = slot;
        dayIndex = index;
      });
      if (at == null) {
        unplaced.push({ id: row.id, name: name, reason: 'No free time before 4pm' });
        return;
      }
      days[dayIndex].blocks.push(makeStop(row.place, at, row.dur));
      sortDay(days[dayIndex]);
      present[row.id] = true;
      placed.push({ id: row.id, name: name, dayIndex: dayIndex, time: format(at), duration: row.dur });
    });
    return { placed: placed, unplaced: unplaced };
  }

  function summary(result) {
    var src = result || { placed: [], unplaced: [] };
    var count = src.placed.length;
    var line = count + (count === 1 ? ' place added' : ' places added');
    if (!src.unplaced.length) return line + '. Drag any of them to fine-tune.';
    var rest = src.unplaced.map(function (row) { return row.name + ' — ' + row.reason; }).join('; ');
    return line + '. Not placed: ' + rest + '.';
  }

  root.PlacePlan = {
    DAY_START: DAY_START,
    DAY_END: DAY_END,
    PICKUP: PICKUP,
    toggle: toggle,
    selectionCount: selectionCount,
    learn: learn,
    place: place,
    summary: summary,
    isHandover: isHandover,
  };
}(typeof window !== 'undefined' ? window : globalThis));
