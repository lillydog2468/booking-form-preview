const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const planner = fs.readFileSync(path.join(__dirname, 'tour-planner.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'tour-planner.css'), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing function ' + name);
  let i = source.indexOf('{', start);
  let depth = 0;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('unclosed function ' + name);
}

test('Messaged and Booked are short inline ticks', () => {
  const html = extractFunction(planner, 'renderBookingTicksHtml');
  assert.equal(html.includes('Message sent'), false);
  assert.match(html, />\s*Messaged\s*</);
  assert.match(html, />\s*Booked\s*</);
  assert.match(html, /data-tick-message/);
  assert.match(html, /data-tick-booked/);
  const timeline = planner.slice(planner.indexOf('function renderTimeline('), planner.indexOf('function renderDayTabs('));
  assert.match(timeline, /class="stop-kicker"/);
  assert.match(timeline, /renderBookingTicksHtml\(s\)/);
  assert.equal(timeline.includes('tick-skip'), false);
  const tickCss = css.slice(css.indexOf('/* Booking ticks'), css.indexOf('.address-row'));
  assert.match(tickCss, /min-height: 32px/);
  assert.match(tickCss, /font-size: 12px/);
  assert.equal(tickCss.includes('min-height: 44px'), false);
  assert.equal(tickCss.includes('min-height: 48px'), false);
  assert.match(tickCss, /\.view-phone \.tick[\s\S]*min-height: 36px/);
  assert.match(tickCss, /\.view-phone \.tick input[\s\S]*min-height: 16px/);
});
