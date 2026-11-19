const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

require('./split-pane.js');

const S = globalThis.SplitPane;

test('the places column stays inside the week and a double-click width is the default', () => {
  assert.equal(S.clamp(380, 1440, 12), 380);
  assert.equal(S.clamp(80, 1440, 12), S.MIN_PLACES);
  assert.equal(S.clamp(2000, 1000, 12), 1000 - 12 - S.MIN_WEEK);
  assert.equal(S.DEFAULT_PX, 380);
  assert.equal(S.pointerKind({ coarse: true, maxTouchPoints: 5 }), 'touch');
  assert.equal(S.pointerKind({ coarse: false, maxTouchPoints: 0 }), 'mouse');
  assert.notEqual(S.storageKey('touch'), S.storageKey('mouse'));
});

test('each device keeps its own places width', () => {
  const bag = new Map();
  const storage = {
    getItem: function (key) { return bag.has(key) ? bag.get(key) : null; },
    setItem: function (key, value) { bag.set(key, String(value)); },
    removeItem: function (key) { bag.delete(key); },
  };
  const touch = S.storageKey('touch');
  const mouse = S.storageKey('mouse');
  S.write(storage, touch, 260);
  S.write(storage, mouse, 460);
  assert.equal(S.read(storage, touch), 260);
  assert.equal(S.read(storage, mouse), 460);
  S.clear(storage, touch);
  assert.equal(S.read(storage, touch), null);
  assert.equal(S.read(storage, mouse), 460);
});

test('the wide planner has a drag handle and the phone hides it', () => {
  const html = fs.readFileSync(path.join(__dirname, 'booking2.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, 'planner2.css'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, 'planner2.js'), 'utf8');
  assert.match(html, /id="p2Split"/);
  assert.match(html, /split-pane\.js/);
  assert.match(css, /col-resize/);
  assert.match(css, /--p2-places/);
  assert.match(css, /max-width:\s*760px\)[\s\S]*\.p2-split\s*\{\s*display:\s*none/);
  assert.match(app, /pointerdown/);
  assert.match(app, /dblclick/);
  assert.match(app, /SplitPane/);
});
