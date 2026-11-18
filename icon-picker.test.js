const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, 'icon-picker.js'), 'utf8');
const editor = fs.readFileSync(path.join(__dirname, 'place-editor.js'), 'utf8');
const planner = fs.readFileSync(path.join(__dirname, 'tour-planner.js'), 'utf8');

function load() {
  const ctx = {};
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.IconPicker;
}

test('Oliver Glass shows the scissors he already has, in a grid Safari can paint', () => {
  const P = load();
  const oliver = { id: '8', name: 'Oliver Glass', icon: '✂️' };
  const html = P.html({ value: oliver.icon, inputAttr: 'data-pe-icon' });
  assert.match(html, /Change icon/);
  assert.match(html, /class="icon-current-glyph"[^>]*>✂️</);
  assert.match(html, /data-icon-choice="✂️"/);
  assert.match(html, /data-icon-choice="💎"/);
  assert.match(html, /Use category icon/);
  assert.match(html, /Type your own/);
  assert.match(html, /Ctrl\+Cmd\+Space/);
  assert.equal(html.includes('<datalist'), false);
  assert.equal(html.includes('<select'), false);
  assert.ok(P.allIcons().length >= 60);
  assert.equal(editor.includes('IconPicker.html'), true);
  assert.equal(planner.includes('IconPicker.html'), true);
  assert.equal(editor.includes('autocomplete="off"') || html.includes('autocomplete="off"'), true);
});
