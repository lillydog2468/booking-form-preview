const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const html = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');

function sliceFn(name) {
  const start = html.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing ' + name);
  const next = html.indexOf('\n  function ', start + 1);
  return html.slice(start, next > start ? next : start + 800);
}

test('month buttons toggle and several months stay on, in calendar order', () => {
  const toggle = sliceFn('toggleTabCalendarMonth');
  assert.match(toggle, /getTabCalendarMonthsMask\(tabId\) \^ \(1 << mi\)/);
  assert.equal(toggle.includes('startedNew'), false);
  assert.match(toggle, /rememberCalendarMonths\(next\)/);

  const render = sliceFn('renderYearCalendar');
  assert.match(render, /if \(!isTabCalendarMonthSelected\(tabId, monthIndex\)\) continue;/);
  assert.match(render, /savedCalendarMonths\(\)/);
  assert.match(render, /monthsMaskForRangeInYearUTC\(currentRange, year\)/);

  const filters = html.slice(html.indexOf('id="t${t}_monthFilters"'), html.indexOf('id="t${t}_yearCalendar"'));
  assert.match(filters, /setTabCalendarMonths\('\$\{t\}', 'none'\)/);
  assert.match(filters, /setTabCalendarMonths\('\$\{t\}', 'all'\)/);
  assert.match(filters, /aria-pressed="false"/);
  const sep = filters.indexOf("toggleTabCalendarMonth('${t}', 8)");
  const oct = filters.indexOf("toggleTabCalendarMonth('${t}', 9)");
  assert.ok(sep > 0 && oct > sep);
});

test('the month choice is remembered, and a chosen month looks pressed', () => {
  assert.match(html, /const LAYOUT_CALENDAR_MONTHS_KEY = 'layout_calendar_months'/);
  assert.match(html, /localStorage\.setItem\(LAYOUT_CALENDAR_MONTHS_KEY/);
  assert.match(html, /localStorage\.getItem\(LAYOUT_CALENDAR_MONTHS_KEY\)/);
  assert.match(html, /btn\.setAttribute\('aria-pressed', on \? 'true' : 'false'\)/);
  assert.match(html, /\.month-pill\.active \{[^}]*box-shadow: inset/);
  assert.match(html, /\.year-cal-months \{[^}]*flex-direction: column;/);
  assert.match(html, /@media \(max-width: 600px\) \{[\s\S]*?\.month-pill \{[\s\S]*?min-height: 44px;/);
});
