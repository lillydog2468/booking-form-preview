/*
 * Shared save status and live refresh for a planner_plans row.
 * The cloud row is the shared copy. A device only says "saved" after a write
 * returns that row. Realtime needs planner_plans in the supabase_realtime
 * publication; this file does not apply that SQL.
 */
(function (root) {
  'use strict';

  var NEWER = 'Newer version saved on another device — updated';
  var UNSAVED = 'Not saved to cloud — tap to retry';

  function deviceLabel() {
    var ua = (root.navigator && root.navigator.userAgent) || '';
    var platform = (root.navigator && root.navigator.platform) || '';
    var touch = root.navigator && root.navigator.maxTouchPoints > 1;
    if (/iPad/i.test(ua) || (platform === 'MacIntel' && touch)) return 'iPad';
    if (/iPhone|iPod/i.test(ua)) return 'iPhone';
    return 'Mac';
  }

  function pragueTime(iso) {
    var date = new Date(iso || Date.now());
    if (!isFinite(date.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Prague',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(date);
    } catch (err) {
      var h = String(date.getUTCHours()).padStart(2, '0');
      var m = String(date.getUTCMinutes()).padStart(2, '0');
      return h + ':' + m;
    }
  }

  function currentLine(iso, device) {
    var when = pragueTime(iso);
    var from = device || deviceLabel();
    return 'Last saved ' + when + ' (Prague) from ' + from + ' — this is the current version';
  }

  function stamp(plan) {
    if (!plan || typeof plan !== 'object') return plan;
    plan.lastSavedFrom = deviceLabel();
    plan.lastSavedAt = new Date().toISOString();
    return plan;
  }

  function blockKey(block) {
    if (!block || typeof block !== 'object') return '';
    return [
      block.id || '',
      block.time || '',
      block.title || block.hotelName || '',
      block.placeId || block.place_id || '',
      block.type || '',
    ].join('|');
  }

  function scheduleKey(plan) {
    var days = plan && Array.isArray(plan.days) ? plan.days : [];
    return JSON.stringify(days.map(function (day) {
      var blocks = day && Array.isArray(day.blocks) ? day.blocks : [];
      return {
        date: day && day.date || '',
        blocks: blocks.map(blockKey),
      };
    }));
  }

  function sameSchedule(a, b) {
    return scheduleKey(a) === scheduleKey(b);
  }

  function watch(sb, bookingId, hooks) {
    var id = String(bookingId || '').trim();
    if (!sb || !/^\d+$/.test(id) || !hooks) return function () {};
    var channel = null;
    if (typeof sb.channel === 'function') {
      channel = sb.channel('planner-plan-' + id);
      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'planner_plans',
        filter: 'booking_id=eq.' + id,
      }, function (message) {
        var row = message && (message.new || message.record);
        if (row && hooks.onRow) hooks.onRow(row);
      });
      if (typeof channel.subscribe === 'function') channel.subscribe();
    }
    var timer = setInterval(function () {
      if (root.document && root.document.visibilityState === 'hidden') return;
      if (hooks.poll) hooks.poll();
    }, 15000);
    function onVisible() {
      if (!root.document || root.document.visibilityState === 'visible') {
        if (hooks.poll) hooks.poll();
      }
    }
    if (root.document) root.document.addEventListener('visibilitychange', onVisible);
    if (root.addEventListener) root.addEventListener('focus', onVisible);
    return function stop() {
      clearInterval(timer);
      if (root.document) root.document.removeEventListener('visibilitychange', onVisible);
      if (root.removeEventListener) root.removeEventListener('focus', onVisible);
      if (channel && typeof sb.removeChannel === 'function') sb.removeChannel(channel);
    };
  }

  root.PlanSync = {
    NEWER: NEWER,
    UNSAVED: UNSAVED,
    deviceLabel: deviceLabel,
    pragueTime: pragueTime,
    currentLine: currentLine,
    stamp: stamp,
    sameSchedule: sameSchedule,
    watch: watch,
  };
}(typeof window !== 'undefined' ? window : globalThis));
