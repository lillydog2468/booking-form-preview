/*
 * Small label that follows a finger or pointer while a place or appointment
 * is dragged. It sits up and to the right of the point so the finger does
 * not cover the name, and flips when that would leave the screen.
 */
(function (root) {
  'use strict';

  var GAP_X = 30;
  var GAP_Y = 40;
  var MARGIN = 8;

  function place(opts) {
    var x = Number(opts && opts.x) || 0;
    var y = Number(opts && opts.y) || 0;
    var width = Math.max(0, Number(opts && opts.width) || 0);
    var height = Math.max(0, Number(opts && opts.height) || 0);
    var viewW = Math.max(0, Number(opts && opts.viewW) || 0);
    var viewH = Math.max(0, Number(opts && opts.viewH) || 0);
    var left = x + GAP_X;
    var top = y - GAP_Y - height;
    if (viewW && left + width > viewW - MARGIN) left = x - GAP_X - width;
    if (left < MARGIN) left = MARGIN;
    if (top < MARGIN) top = y + GAP_Y;
    if (viewH && top + height > viewH - MARGIN) top = Math.max(MARGIN, viewH - MARGIN - height);
    return { left: Math.round(left), top: Math.round(top) };
  }

  function fill(el, info) {
    var data = info || {};
    el.replaceChildren();
    if (data.icon) {
      var icon = document.createElement('span');
      icon.className = 'drag-label-icon';
      icon.textContent = String(data.icon);
      el.appendChild(icon);
    }
    var name = document.createElement('span');
    name.className = 'drag-label-name';
    name.textContent = String(data.name || 'Place');
    el.appendChild(name);
    if (data.time) {
      var time = document.createElement('span');
      time.className = 'drag-label-time';
      time.textContent = String(data.time);
      el.appendChild(time);
    }
  }

  function create(info) {
    var el = document.createElement('div');
    el.className = 'drag-label';
    el.setAttribute('role', 'presentation');
    fill(el, info);
    document.body.appendChild(el);
    return el;
  }

  function move(el, x, y) {
    if (!el) return;
    var rect = el.getBoundingClientRect();
    var box = place({
      x: x,
      y: y,
      width: rect.width,
      height: rect.height,
      viewW: window.innerWidth,
      viewH: window.innerHeight,
    });
    el.style.left = box.left + 'px';
    el.style.top = box.top + 'px';
  }

  function remove(el) {
    if (el && el.remove) el.remove();
  }

  root.DragLabel = {
    GAP_X: GAP_X,
    GAP_Y: GAP_Y,
    place: place,
    create: create,
    move: move,
    remove: remove,
  };
}(typeof window !== 'undefined' ? window : globalThis));
